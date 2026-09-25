// Shared styles for Modal and dialogs built on it
export const modalStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  dialog: {
    background: "#fff",
    borderRadius: 6,
    padding: 16,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
    fontFamily: "sans-serif",
    fontSize: 13,
    maxWidth: "calc(100vw - 32px)",
  },
  title: {
    fontWeight: "bold",
    fontSize: 15,
    marginBottom: 8,
  },
  buttons: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  button: {
    padding: "4px 12px",
    border: "1px solid #999",
    borderRadius: 4,
    background: "#f5f5f5",
    cursor: "pointer",
  },
  primary: {
    background: "#0066cc",
    borderColor: "#0066cc",
    color: "#fff",
  },
};
