// Helpers that interpret a block definition from /api/blocks
// (see backend/grc_block_info.json) against a node's parameter values.
import { evalTemplate, coerce, Unresolved } from "./expr";
import { grcFormat } from "../utils/format";

// Port colors, matching GRC
const PORT_COLORS = {
  complex: "#3399FF",
  float: "#FF8C69",
  int: "#00FF99",
  short: "#FFFF66",
  byte: "#FF66FF",
  message: "#C0C0C0",
};

// UHD/SoapySDR wire formats that map onto the standard types
const DTYPE_ALIASES = { fc32: "complex", f32: "float" };

export const portColor = (dtype) => PORT_COLORS[DTYPE_ALIASES[dtype] ?? dtype] ?? "#DDDDDD";

// Some blocks store parameters as {} instead of a list
export const paramList = (def) => (Array.isArray(def.parameters) ? def.parameters : []);

export function defaultParams(def) {
  const params = {};
  for (const p of paramList(def)) {
    const d = p.default ?? p.options?.[0] ?? "";
    params[p.id] = String(d);
  }
  return params;
}

function makeScope(def, params) {
  const byId = Object.fromEntries(paramList(def).map((p) => [p.id, p]));
  return {
    lookup(name) {
      if (!(name in params)) throw new Unresolved(`unknown name ${name}`);
      const raw = params[name];
      const p = byId[name];
      if (!p?.option_attributes) return coerce(raw);
      return {
        value: coerce(raw),
        attr(attrName) {
          const values = p.option_attributes[attrName];
          const idx = (p.options || []).indexOf(raw);
          if (!values || idx < 0) throw new Unresolved(`${name}.${attrName}`);
          return coerce(values[idx]);
        },
      };
    },
  };
}

// Evaluate a template field, returning `fallback` if it can't be resolved
function resolve(template, def, params, fallback) {
  try {
    const v = evalTemplate(template, makeScope(def, params));
    return v === undefined ? fallback : v;
  } catch (e) {
    if (e instanceof Unresolved) return fallback;
    throw e;
  }
}

// 'none' = shown on the block, 'part' = properties only, 'all' = hidden
export function paramHide(p, def, params) {
  const h = resolve(p.hide ?? "none", def, params, "none");
  return h === "part" || h === "all" ? h : "none";
}

// Resolve ports for "inputs" or "outputs", expanding multiplicity and
// dropping hidden ports. Keys follow GRC: stream ports are numbered,
// message ports use their id.
export function resolvePorts(def, params, direction) {
  const ports = [];
  let streamIdx = 0;
  for (const port of def[direction] || []) {
    const isMsg = port.domain === "message";
    const count = isMsg ? 1 : Number(resolve(port.multiplicity ?? 1, def, params, 1));
    if (resolve(port.hide ?? false, def, params, false) === true) continue;

    const dtype = isMsg ? "message" : String(resolve(port.dtype ?? "", def, params, ""));
    const vlen = Number(resolve(port.vlen ?? 1, def, params, 1));
    for (let n = 0; n < (Number.isFinite(count) ? count : 1); n++) {
      const key = isMsg ? port.id : String(streamIdx++);
      ports.push({ key, label: port.label ?? (isMsg ? port.id : null), domain: port.domain, dtype, vlen, optional: !!port.optional });
    }
  }
  // Default stream labels: "in"/"out", numbered when there are several
  const base = direction === "inputs" ? "in" : "out";
  const streams = ports.filter((p) => p.domain !== "message");
  streams.forEach((p, i) => { p.label ??= streams.length > 1 ? `${base}${i}` : base; });
  return ports;
}

// Human-friendly value for display on a block
export function displayValue(p, raw) {
  const idx = p.options?.indexOf(raw) ?? -1;
  if (idx >= 0 && p.option_labels) return p.option_labels[idx];
  if (raw !== "" && isFinite(Number(raw)) && Math.abs(Number(raw)) >= 1e3) return grcFormat(Number(raw));
  return raw;
}

// GRC-style instance name, e.g. analog_sig_source_x_0
export function uniqueName(blockId, takenNames) {
  let n = 0;
  while (takenNames.has(`${blockId}_${n}`)) n++;
  return `${blockId}_${n}`;
}
