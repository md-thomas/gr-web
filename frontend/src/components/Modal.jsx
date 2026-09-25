// Modal.jsx
// Simple modal dialog, plus a yes/no ConfirmDialog built on it.
import React, { useEffect } from "react";
import { modalStyles as styles } from "./modalStyles";

export default function Modal({ title, children, onClose, width = 420 }) {
  useEffect(() => {
    // Inputs can preventDefault() to handle Escape themselves
    const onKey = (e) => { if (e.key === "Escape" && !e.defaultPrevented) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...styles.dialog, width }} role="dialog" aria-label={title}>
        <div style={styles.title}>{title}</div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "OK", onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div style={{ margin: "8px 0 16px" }}>{message}</div>
      <div style={styles.buttons}>
        <button style={styles.button} onClick={onCancel}>Cancel</button>
        <button style={{ ...styles.button, ...styles.primary }} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
