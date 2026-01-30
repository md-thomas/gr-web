// ThrottleNode.jsx
import React, { useState } from "react";
import { Handle, Position } from "reactflow";
import { grcFormat } from "../utils/format";

export default function ThrottleNode({ data }) {
  const [sampleRate, setSampleRate] = useState(data.sampleRate || 32000);
  const [limit, setLimit] = useState(data.limit || 0);

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
        minWidth: 110,
        width: 80,
        textAlign: "center",
        position: "relative",
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: 12 }}>Throttle</div>

      <div
        style={{
          display: "flex",          // put children in a row
          alignItems: "center",     // vertically center label and input
          marginTop: 8,
          gap: 4,                   // optional: space between label and input
        }}
      >
        <label style={{ fontSize: 10, minWidth: 20 }}><strong>Sample Rate:</strong></label>
        <input
          type="text"
          value={grcFormat(data.sampleRate)}
          onChange={(e) => setSampleRate(e.target.value)}
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
        <label style={{ fontSize: 10, minWidth: 20 }}><strong>Limit:</strong></label>
        <input
          type="text"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          style={{ fontSize: 12, flex: 1, width: 10 }} // flex:1 makes input take remaining space
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
