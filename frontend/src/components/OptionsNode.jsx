import React from "react";

export default function OptionsNode({ data }) {
  return (
    <div
      style={{
        padding: 10,
        backgroundColor: "#e6e6fa",
        border: "1px solid #aaa",
        borderRadius: 4,
        width: 200,
        fontSize: 12,
      }}
    >
      <strong>{data.label}</strong>
      <div>Title: {data.title}</div>
      <div>Author: {data.author}</div>
      <div>Output Language: {data.output_language}</div>
      <div>Generate Options: {data.generate_options}</div>
    </div>
  );
}
