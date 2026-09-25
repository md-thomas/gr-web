import React from "react";
import { useBlockDef } from "../blocks/useBlockLibrary";
import { defaultParams, displayValue, paramList } from "../blocks/blockModel";

const SHOWN = ["title", "author", "output_language", "generate_options"];

export default function OptionsNode({ data }) {
  const def = useBlockDef(data.blockId);
  const params = def ? { ...defaultParams(def), ...data.params } : data.params || {};
  const shown = def ? paramList(def).filter((p) => SHOWN.includes(p.id)) : [];

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
      <strong>Options</strong>
      {shown.map((p) => (
        <div key={p.id}>
          <strong>{p.label}:</strong> {displayValue(p, params[p.id])}
        </div>
      ))}
    </div>
  );
}
