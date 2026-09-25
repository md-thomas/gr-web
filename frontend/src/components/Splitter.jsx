// Splitter.jsx
// Drag handle between two panels. Reports how far it has been dragged since
// the drag started; double-click calls onReset.
import React, { useState } from "react";

const THICKNESS = 5;

// orientation: "horizontal" (a bar between rows, dragged up/down) or
// "vertical" (a bar between columns, dragged left/right)
export default function Splitter({ orientation, onDragStart, onDrag, onReset, title }) {
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const horizontal = orientation === "horizontal";
  const cursor = horizontal ? "row-resize" : "col-resize";

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const origin = horizontal ? e.clientY : e.clientX;
    onDragStart?.();
    setDragging(true);

    // Keep the resize cursor and stop text selection while dragging
    const body = document.body.style;
    const saved = { cursor: body.cursor, userSelect: body.userSelect };
    body.cursor = cursor;
    body.userSelect = "none";

    const move = (ev) => onDrag((horizontal ? ev.clientY : ev.clientX) - origin);
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      body.cursor = saved.cursor;
      body.userSelect = saved.userSelect;
      setDragging(false);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <div
      role="separator"
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      title={title ? `${title} (double-click to reset)` : "Drag to resize (double-click to reset)"}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        cursor,
        touchAction: "none",
        background: dragging || hover ? "#6f9fd8" : "#c8ced6",
        ...(horizontal ? { height: THICKNESS } : { width: THICKNESS }),
      }}
    />
  );
}
