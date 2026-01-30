// VariableNode.jsx
import React, { useState } from "react";
import { Handle, Position } from "reactflow";
import { grcFormat } from "../utils/format";

export default function VariableNode({ data }) {
  const [varId, setVarId] = useState(data.id || "var");
  const [value, setValue] = useState(data.value || 32000);

  const handleStyle = {
    width: 35,
    height: 15,
    background: "#8A2BE2", // light purple
    border: "2px solid #000",
    borderRadius: 4,
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "all",
    cursor: "pointer",
    userSelect: "none",
  };

  return (
    <div
      style={{
        padding: 10,
        border: "2px solid #003366",
        borderRadius: 4,
        background: "#e6e6fa",
        minWidth: 80,
        width: 100,
        textAlign: "center",
        position: "relative",
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: 12 }}>Variable</div>

      <div
        style={{
          display: "flex",          // put children in a row
          alignItems: "center",     // vertically center label and input
          marginTop: 8,
          gap: 4,                   // optional: space between label and input
        }}
      >
        <label style={{ fontSize: 10, minWidth: 20 }}><strong>ID:</strong></label>
        <input
          type="text"
          value={varId}
          onChange={(e) => setVarId(e.target.value)}
          style={{ fontSize: 12, flex: 1, width: 10 }} // flex:1 makes input take remaining space
        />
      </div>

      <div
        style={{
          display: "flex",          // put children in a row
          alignItems: "center",     // vertically center label and input
          marginTop: 8,
          gap: 4,                   // optional: space between label and input
        }}
      >
        <label style={{ fontSize: 10, minWidth: 20 }}><strong>Value:</strong></label>
        <input
          type="text"
          value={grcFormat(value)}
          onChange={(e) => setValue(e.target.value)}
          style={{ fontSize: 12, flex: 1, width: 10 }} // flex:1 makes input take remaining space
        />
      </div>

    </div>
  );
}
