import React from "react";

export default function OptionsNode({ data }) {
  return (
    <div
      style={{
        padding: 10,
        backgroundColor: "#e6e6fa",
        border: "1px solid #aaa",
        borderRadius: 4,
        width: 150,
        fontSize: 12,
      }}
    >
      <strong>{data.label}</strong>
      <div><strong>Title:</strong> {data.title}</div>
      <div><strong>Author:</strong> {data.author}</div>
      <div><strong>Output Language:</strong> {data.output_language}</div>
      <div><strong>Generate Options:</strong> {data.generate_options}</div>
    </div>
  );
}
