// GenericBlockNode.jsx
// Renders any GRC block from its definition: ports from inputs/outputs,
// visible parameters from parameters.
import React, { useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals } from "reactflow";
import { useBlockDef } from "../blocks/useBlockLibrary";
import { defaultParams, displayValue, paramHide, paramList, portColor, resolvePorts } from "../blocks/blockModel";

const PORT_SPACING = 22;

export default function GenericBlockNode({ id, data, selected }) {
  const def = useBlockDef(data.blockId);
  const updateNodeInternals = useUpdateNodeInternals();

  const params = def ? { ...defaultParams(def), ...data.params } : {};
  const inputs = def ? resolvePorts(def, params, "inputs") : [];
  const outputs = def ? resolvePorts(def, params, "outputs") : [];

  // React Flow caches handle positions; refresh them when ports change
  const portSignature = [...inputs, ...outputs].map((p) => p.key).join(",");
  useEffect(() => updateNodeInternals(id), [id, portSignature, updateNodeInternals]);

  if (!def) {
    return <div style={{ ...styles.node, borderColor: "#c00" }}>Unknown block: {data.blockId}</div>;
  }

  const shownParams = paramList(def).filter((p) => paramHide(p, def, params) === "none");
  const minHeight = Math.max(inputs.length, outputs.length, 1) * PORT_SPACING + 16;

  return (
    <div style={{ ...styles.node, minHeight, borderColor: selected ? "#0066cc" : "#003366" }}>
      <div style={styles.title}>{def.label}</div>
      {shownParams.map((p) => (
        <div key={p.id} style={styles.param}>
          <strong>{p.label ?? p.id}:</strong> {displayValue(p, params[p.id])}
        </div>
      ))}

      {inputs.map((port, i) => (
        <Port key={`in-${port.key}`} port={port} type="target" index={i} count={inputs.length} />
      ))}
      {outputs.map((port, i) => (
        <Port key={`out-${port.key}`} port={port} type="source" index={i} count={outputs.length} />
      ))}
    </div>
  );
}

function Port({ port, type, index, count }) {
  const isInput = type === "target";
  return (
    <Handle
      type={type}
      position={isInput ? Position.Left : Position.Right}
      id={port.key}
      title={`${port.label} (${port.dtype}${port.vlen > 1 ? ` x${port.vlen}` : ""})`}
      style={{
        ...styles.handle,
        background: portColor(port.dtype),
        borderStyle: port.optional ? "dashed" : "solid",
        top: `${((index + 1) / (count + 1)) * 100}%`,
        ...(isInput
          ? { left: 0, transform: "translate(-100%, -50%)" }
          : { left: "auto", right: 0, transform: "translate(100%, -50%)" }),
      }}
    >
      {port.label}
    </Handle>
  );
}

const styles = {
  node: {
    padding: "6px 10px",
    border: "2px solid #003366",
    borderRadius: 4,
    background: "#e6e6fa",
    minWidth: 120,
    maxWidth: 240,
    fontSize: 10,
    position: "relative",
    boxSizing: "border-box",
  },
  title: {
    fontWeight: "bold",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 4,
  },
  param: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  handle: {
    width: "auto",
    minWidth: 22,
    height: 15,
    padding: "0 3px",
    border: "2px solid #000",
    borderRadius: 4,
    color: "#000",
    fontSize: 9,
    lineHeight: "11px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "crosshair",
    userSelect: "none",
  },
};
