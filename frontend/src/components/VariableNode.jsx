// VariableNode.jsx
import React from "react";
import { grcFormat } from "../utils/format";

export default function VariableNode({ data, selected }) {
  const value = data.params?.value ?? "0";
  const shown = value !== "" && isFinite(Number(value)) ? grcFormat(Number(value)) : value;

  return (
    <div
      style={{
        padding: 10,
        border: `2px solid ${selected ? "#0066cc" : "#003366"}`,
        borderRadius: 4,
        background: "#e6e6fa",
        minWidth: 80,
        textAlign: "center",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: "bold" }}>Variable</div>
      <div style={{ marginTop: 6 }}>
        <strong>ID:</strong> {data.name}
      </div>
      <div>
        <strong>Value:</strong> {shown}
      </div>
    </div>
  );
}
