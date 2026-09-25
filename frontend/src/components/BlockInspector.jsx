// BlockInspector.jsx
// Editable properties for the selected block, built from its definition.
import React from "react";
import { defaultParams, paramHide, paramList } from "../blocks/blockModel";

export default function BlockInspector({ node, def, onChange }) {
  if (!def) {
    return <div style={{ color: "#c00" }}>Unknown block: {node.data.blockId}</div>;
  }

  const params = { ...defaultParams(def), ...node.data.params };
  const setParam = (key, value) => onChange({ params: { ...node.data.params, [key]: value } });
  const editable = paramList(def).filter((p) => paramHide(p, def, params) !== "all");

  return (
    <div style={{ fontSize: 12 }}>
      <div style={styles.header}>
        {def.label} <span style={{ color: "#666" }}>({def.id})</span>
      </div>

      <table style={styles.table}>
        <tbody>
          <Row label="ID">
            <input
              style={styles.input}
              value={node.data.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </Row>
          {editable.map((p) => (
            <Row key={p.id} label={p.label ?? p.id}>
              <ParamInput param={p} value={params[p.id]} onChange={(v) => setParam(p.id, v)} />
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <tr>
      <td style={styles.label}>{label}</td>
      <td>{children}</td>
    </tr>
  );
}

function ParamInput({ param, value, onChange }) {
  let options = param.options;
  let labels = param.option_labels;
  if (!options && param.dtype === "bool") {
    options = ["True", "False"];
    labels = ["Yes", "No"];
  }

  if (options) {
    // Keep a custom value selectable if it isn't one of the options
    const opts = options.map(String);
    const extra = opts.includes(value) ? [] : [value];
    return (
      <select style={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o, i) => (
          <option key={o} value={o}>{labels?.[i] ?? o}</option>
        ))}
        {extra.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return <input style={styles.input} value={value} onChange={(e) => onChange(e.target.value)} />;
}

const styles = {
  header: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  table: {
    borderCollapse: "collapse",
    width: "100%",
  },
  label: {
    width: "1%",
    paddingRight: 8,
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    fontSize: 12,
  },
};
