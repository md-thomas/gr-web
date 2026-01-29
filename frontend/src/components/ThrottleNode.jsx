// ThrottleNode.jsx
import React, { useState } from "react";
import { Handle, Position } from "reactflow";

export default function ThrottleNode({ data }) {
  const [sampleRate, setSampleRate] = useState(data.sampleRate || 32000);

  // New port dimensions
  const handleStyle = {
    width: 25,       // wider
    height: 15,      // shorter
    background: "#3399FF",
    border: "2px solid #000",
    borderRadius: 4,
    color: "#000",
    fontSize: 10,
    // fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "all", // ensures ReactFlow can still connect edges
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
        width: 80,
        textAlign: "center",
        position: "relative",
      }}
    >
      <div style={{ fontWeight: "bold" }}>Throttle</div>

      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 10 }}>Sample Rate:</label>
        <input
          type="number"
          value={sampleRate}
          onChange={(e) => setSampleRate(Number(e.target.value))}
          style={{ width: "100%", fontSize: 12, marginTop: 2 }}
        />
      </div>

      {/* Input port */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{
          ...handleStyle,
          left: -handleStyle.width, // stick out left
          top: "50%",
          transform: "translateY(-50%)",
          position: "absolute",
        }}
      >
        in
      </Handle>

      {/* Output port */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{
          ...handleStyle,
          right: -handleStyle.width, // stick out right
          top: "50%",
          transform: "translateY(-50%)",
          position: "absolute",
        }}
      >
        out
      </Handle>
    </div>
  );
}
