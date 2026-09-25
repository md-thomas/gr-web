// StatusPanel.jsx
// Status messages and flowgraph output. Sticks to the bottom as new lines
// arrive, unless the user has scrolled up to read earlier output.
import React, { useLayoutEffect, useRef } from "react";

// entries: [{ text, kind: "info" | "error" | "output", time }]
export default function StatusPanel({ entries, style, onClear }) {
  const ref = useRef(null);
  const stickRef = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const onScroll = () => {
    const el = ref.current;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
  };

  return (
    <div ref={ref} style={style} onScroll={onScroll}>
      <div style={styles.header}>
        <strong>Status</strong>
        {entries.length > 0 && (
          <button style={styles.clear} onClick={onClear}>Clear</button>
        )}
      </div>
      {entries.map((entry, i) =>
        entry.kind === "output" ? (
          <pre key={i} style={styles.output}>{entry.text}</pre>
        ) : (
          <div key={i} style={{ marginTop: 4, color: entry.kind === "error" ? "#c00" : "#000", whiteSpace: "pre-wrap" }}>
            <span style={{ color: "#666" }}>[{entry.time}]</span> {entry.text}
          </div>
        )
      )}
    </div>
  );
}

const styles = {
  header: {
    display: "flex",
    alignItems: "center",
    position: "sticky",
    top: -8,
    background: "#fff",
    paddingBottom: 2,
  },
  clear: {
    marginLeft: "auto",
    fontSize: 11,
    padding: "0 6px",
    cursor: "pointer",
  },
  output: {
    margin: 0,
    fontFamily: "monospace",
    fontSize: 11,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
};
