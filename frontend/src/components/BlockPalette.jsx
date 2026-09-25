// BlockPalette.jsx
// Category tree of GRC blocks. Drag a block onto the canvas or double-click it.
import React, { useMemo, useState } from "react";

export const BLOCK_DRAG_TYPE = "application/grc-block";

export default function BlockPalette({ tree, error, onAdd }) {
  const [search, setSearch] = useState("");

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !tree) return null;
    const found = new Map();
    const walk = (node) => {
      for (const [key, value] of Object.entries(node)) {
        if (key !== "_blocks") walk(value);
        else for (const b of value) {
          if (b.label.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)) found.set(b.id, b);
        }
      }
    };
    walk(tree);
    return [...found.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [tree, search]);

  if (error) return <div style={{ color: "#c00" }}>Failed to load blocks: {error}</div>;
  if (!tree) return <div style={{ color: "#666" }}>Loading blocks…</div>;

  return (
    <div>
      <input
        type="search"
        placeholder="Search blocks"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={styles.search}
      />
      {matches
        ? matches.map((b) => <BlockItem key={b.id} block={b} onAdd={onAdd} />)
        : <Category node={tree} onAdd={onAdd} />}
    </div>
  );
}

function Category({ node, onAdd }) {
  return (
    <>
      {Object.entries(node).map(([key, value]) =>
        key === "_blocks" ? (
          value.map((b) => <BlockItem key={b.id} block={b} onAdd={onAdd} />)
        ) : (
          <details key={key} style={styles.category}>
            <summary style={styles.summary}>{key}</summary>
            <Category node={value} onAdd={onAdd} />
          </details>
        )
      )}
    </>
  );
}

function BlockItem({ block, onAdd }) {
  return (
    <div
      draggable
      title={block.id}
      onDragStart={(event) => event.dataTransfer.setData(BLOCK_DRAG_TYPE, block.id)}
      onDoubleClick={() => onAdd(block.id)}
      style={styles.block}
    >
      {block.label}
    </div>
  );
}

const styles = {
  search: {
    width: "100%",
    boxSizing: "border-box",
    margin: "6px 0",
    padding: "3px 6px",
    fontSize: 12,
  },
  category: {
    marginLeft: 6,
    fontSize: 12,
  },
  summary: {
    cursor: "pointer",
    padding: "2px 0",
    fontWeight: "bold",
  },
  block: {
    padding: "3px 8px",
    margin: "2px 0 2px 8px",
    background: "#ddd",
    cursor: "grab",
    fontSize: 12,
  },
};
