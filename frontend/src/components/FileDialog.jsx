// FileDialog.jsx
// Browse the server's flowgraph folder to open or save a .grc file.
import React, { useCallback, useEffect, useState } from "react";
import Modal, { ConfirmDialog } from "./Modal";
import { modalStyles } from "./modalStyles";
import { dirName, joinPath, listFiles, makeFolder } from "../files";

// List a folder, falling back to the root if it has gone away
const listWithFallback = (path) => listFiles(path).catch((err) => {
  if (path) return listFiles("");
  throw err;
});

// mode: "open" | "save". onConfirm(path, { overwrite }) receives a path
// relative to the flowgraph folder.
export default function FileDialog({ mode, initialDir = "", initialName = "", onConfirm, onCancel }) {
  const [dir, setDir] = useState(initialDir);
  const [listing, setListing] = useState(null);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState(null);
  const [newFolder, setNewFolder] = useState(null); // name being typed, or null
  const [confirmReplace, setConfirmReplace] = useState(null); // path, or null

  const load = useCallback((path) => {
    listWithFallback(path)
      .then((data) => { setError(null); setListing(data); setDir(data.path); })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => load(initialDir), [load, initialDir]);

  const fileName = () => {
    const n = name.trim();
    return n && !n.endsWith(".grc") ? `${n}.grc` : n;
  };

  const confirm = (chosen = fileName()) => {
    if (!chosen) return;
    if (chosen.includes("/")) {
      setError("File name can't contain /");
      return;
    }
    const path = joinPath(dir, chosen);
    if (mode === "save" && listing?.files.some((f) => f.name === chosen)) {
      setConfirmReplace(path);
      return;
    }
    onConfirm(path, { overwrite: false });
  };

  const createFolder = () => {
    const folder = (newFolder || "").trim();
    if (!folder) { setNewFolder(null); return; }
    makeFolder(joinPath(dir, folder))
      .then(() => { setNewFolder(null); load(joinPath(dir, folder)); })
      .catch((err) => setError(err.message));
  };

  const crumbs = dir ? dir.split("/") : [];
  const title = mode === "open" ? "Open Flowgraph" : "Save Flowgraph As";

  if (confirmReplace) {
    return (
      <ConfirmDialog
        title="Replace file?"
        message={`${confirmReplace} already exists. Replace it?`}
        confirmLabel="Replace"
        onConfirm={() => onConfirm(confirmReplace, { overwrite: true })}
        onCancel={() => setConfirmReplace(null)}
      />
    );
  }

  return (
    <Modal title={title} onClose={onCancel} width={520}>
      <div style={styles.crumbs}>
        <span style={styles.crumb} onClick={() => load("")} title={listing?.root}>
          {listing?.root ?? "…"}
        </span>
        {crumbs.map((c, i) => (
          <span key={i}>
            {" / "}
            <span style={styles.crumb} onClick={() => load(crumbs.slice(0, i + 1).join("/"))}>{c}</span>
          </span>
        ))}
      </div>

      <div style={styles.list}>
        {dir && (
          <div style={styles.row} onClick={() => load(dirName(dir))}>
            📁 ..
          </div>
        )}
        {listing?.dirs.map((d) => (
          <div key={`d-${d}`} style={styles.row} onClick={() => load(joinPath(dir, d))}>
            📁 {d}
          </div>
        ))}
        {listing?.files.map((f) => (
          <div
            key={`f-${f.name}`}
            style={{ ...styles.row, ...(f.name === fileName() ? styles.selected : {}) }}
            onClick={() => setName(f.name)}
            onDoubleClick={() => confirm(f.name)}
          >
            📄 {f.name}
            <span style={styles.meta}>{new Date(f.modified * 1000).toLocaleString()}</span>
          </div>
        ))}
        {listing && listing.dirs.length === 0 && listing.files.length === 0 && (
          <div style={{ color: "#666", padding: 6 }}>No .grc files here</div>
        )}
      </div>

      {newFolder !== null ? (
        <div style={styles.inline}>
          <input
            autoFocus
            placeholder="Folder name"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") { e.preventDefault(); setNewFolder(null); } }}
            style={styles.input}
          />
          <button style={modalStyles.button} onClick={createFolder}>Create</button>
        </div>
      ) : (
        <div style={styles.inline}>
          <button style={modalStyles.button} onClick={() => setNewFolder("")}>New Folder</button>
        </div>
      )}

      <div style={styles.inline}>
        <label style={{ whiteSpace: "nowrap" }}>File name:</label>
        <input
          autoFocus={mode === "save"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}
          placeholder="flowgraph.grc"
          style={styles.input}
        />
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={modalStyles.buttons}>
        <button style={modalStyles.button} onClick={onCancel}>Cancel</button>
        <button
          style={{ ...modalStyles.button, ...modalStyles.primary }}
          onClick={() => confirm()}
          disabled={!fileName()}
        >
          {mode === "open" ? "Open" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

const styles = {
  crumbs: {
    fontSize: 12,
    marginBottom: 6,
    wordBreak: "break-all",
  },
  crumb: {
    color: "#0066cc",
    cursor: "pointer",
  },
  list: {
    border: "1px solid #ccc",
    height: 240,
    overflowY: "auto",
    marginBottom: 8,
  },
  row: {
    padding: "3px 6px",
    cursor: "pointer",
    display: "flex",
    gap: 6,
    userSelect: "none",
  },
  selected: {
    background: "#cce0ff",
  },
  meta: {
    marginLeft: "auto",
    color: "#888",
    fontSize: 11,
  },
  inline: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    fontSize: 13,
    padding: "3px 6px",
  },
  error: {
    color: "#c00",
    marginBottom: 8,
  },
};
