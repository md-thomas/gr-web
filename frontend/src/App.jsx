import React, { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import { BlockLibraryProvider } from "./blocks/BlockLibrary";
import FlowEditor from "./FlowEditor";
import FileDialog from "./components/FileDialog";
import { ConfirmDialog } from "./components/Modal";
import { baseName, dirName, openFlowgraph } from "./files";
import { listRuns, stopFlowgraph } from "./run";
import { loadLayout, loadSession, removeDoc, saveLayout, saveSessionIndex } from "./session";

const newTabId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Lowest "untitled N" number not used by another tab
function nextUntitled(tabs) {
  const used = new Set(tabs.map((t) => t.untitled).filter((n) => n != null));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

// A tab that can be replaced when opening a file: never saved, unchanged, not running
const isBlank = (meta) => meta && !meta.path && !meta.dirty && !meta.running;

const newFlowgraphTab = (untitled = 1) => ({ id: newTabId(), initial: { kind: "new" }, untitled });

// Tabs to start with: those restored from the browser (see session.js), plus
// one for each running flowgraph that isn't among them. Restored tabs whose
// flowgraph is running reattach to it.
async function startingTabs() {
  const session = loadSession();
  const { running } = await listRuns().catch(() => ({ running: [] }));
  const tabs = (session?.tabs ?? []).map(({ id, untitled, doc }) => ({
    id,
    untitled,
    initial: { kind: "restore", doc, attachRun: running.includes(doc.path) },
  }));
  const openPaths = new Set(tabs.map((t) => t.initial.doc.path));
  for (const path of running.filter((p) => !openPaths.has(p))) {
    try {
      tabs.push({ id: newTabId(), untitled: null, initial: { kind: "file", data: await openFlowgraph(path), attachRun: true } });
    } catch {
      // the file may have been deleted
    }
  }
  if (tabs.length === 0) tabs.push(newFlowgraphTab());
  return { tabs, activeId: session?.activeId ?? tabs[0].id };
}

export default function App() {
  const [start, setStart] = useState(null);
  useEffect(() => { startingTabs().then(setStart); }, []);

  return (
    <BlockLibraryProvider>
      {start ? <TabbedEditors start={start} /> : <div style={styles.loading}>Loading…</div>}
    </BlockLibraryProvider>
  );
}

// Tabs of FlowEditors. Every editor stays mounted, so flowgraphs in
// background tabs keep running and collecting output.
function TabbedEditors({ start }) {
  const [tabs, setTabs] = useState(start.tabs);
  const [activeId, setActiveId] = useState(start.activeId);
  const [metas, setMetas] = useState({}); // tab id -> { path, dirty, running, runPath }
  const [clipboard, setClipboard] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [pendingClose, setPendingClose] = useState(null); // tab id waiting for confirmation
  const [layout, setLayout] = useState(loadLayout); // panel sizes, shared by all tabs
  useEffect(() => { saveLayout(layout); }, [layout]);

  // Latest values for callbacks that outlive a render
  const metasRef = useRef(metas);
  const activeIdRef = useRef(activeId);
  useEffect(() => { metasRef.current = metas; }, [metas]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Remember the open tabs for the next page load
  useEffect(() => {
    saveSessionIndex(tabs.map(({ id, untitled }) => ({ id, untitled })), activeId);
  }, [tabs, activeId]);

  const onMeta = useCallback((id, meta) => {
    setMetas((m) => {
      const old = m[id];
      if (old && old.path === meta.path && old.dirty === meta.dirty && old.running === meta.running && old.runPath === meta.runPath) {
        return m;
      }
      return { ...m, [id]: meta };
    });
  }, []);

  const isOpenElsewhere = useCallback(
    (path, tabId) => Object.entries(metasRef.current).some(([id, m]) => id !== tabId && m.path === path),
    []
  );

  // Add a tab and show it; replaceBlank reuses the current tab if it's an untouched new one
  const addTab = useCallback((initial, replaceBlank = false) => {
    const id = newTabId();
    setTabs((ts) => {
      const tab = { id, initial, untitled: initial.kind === "new" ? nextUntitled(ts) : null };
      const idx = ts.findIndex((t) => t.id === activeIdRef.current);
      if (replaceBlank && idx >= 0 && isBlank(metasRef.current[activeIdRef.current])) {
        const copy = [...ts];
        copy[idx] = tab;
        return copy;
      }
      return [...ts, tab];
    });
    setActiveId(id);
  }, []);

  const newFlowgraph = () => addTab({ kind: "new" });

  // Open a file in a new tab (or switch to it if it's already open).
  // Errors propagate so the file dialog can show them.
  const openPath = async (path) => {
    const existing = tabs.find((t) => metas[t.id]?.path === path);
    if (existing) {
      setActiveId(existing.id);
      setOpenDialog(false);
      return;
    }
    const data = await openFlowgraph(path);
    const { running } = await listRuns().catch(() => ({ running: [] }));
    addTab({ kind: "file", data, attachRun: running.includes(data.path) }, true);
    setOpenDialog(false);
  };

  const closeTab = (id) => {
    const meta = metas[id];
    if (meta?.running) stopFlowgraph(meta.runPath).catch(() => {});
    const idx = tabs.findIndex((t) => t.id === id);
    let rest = tabs.filter((t) => t.id !== id);
    if (rest.length === 0) rest = [newFlowgraphTab()];
    removeDoc(id);
    setTabs(rest);
    setMetas((m) => {
      const others = { ...m };
      delete others[id];
      return others;
    });
    if (activeId === id) setActiveId(rest[Math.min(idx, rest.length - 1)].id);
  };

  const requestClose = (id) => {
    const meta = metas[id] || {};
    if (meta.running || meta.dirty) setPendingClose(id);
    else closeTab(id);
  };

  const tabTitle = (tab) => {
    const path = metas[tab.id]?.path;
    return path ? baseName(path) : `untitled ${tab.untitled}`;
  };

  const closeMessage = (id) => {
    const meta = metas[id] || {};
    const name = tabTitle(tabs.find((t) => t.id === id));
    if (meta.running && meta.dirty) return `${name} is running and has unsaved changes. Kill it and discard the changes?`;
    if (meta.running) return `${name} is running. Kill it and close the tab?`;
    return `${name} has unsaved changes. Discard them and close the tab?`;
  };

  const tabBar = (
    <div style={styles.tabBar} role="tablist">
      {tabs.map((tab) => {
        const meta = metas[tab.id] || {};
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            title={meta.path ?? ""}
            style={{ ...styles.tab, ...(isActive ? styles.activeTab : {}) }}
            onClick={() => setActiveId(tab.id)}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); requestClose(tab.id); } }}
          >
            {meta.running && <span style={styles.runningDot} title="Running">●</span>}
            <span style={styles.tabTitle}>{tabTitle(tab)}{meta.dirty ? " *" : ""}</span>
            <span
              style={styles.close}
              title="Close"
              onClick={(e) => { e.stopPropagation(); requestClose(tab.id); }}
            >
              ×
            </span>
          </div>
        );
      })}
      <button style={styles.newTab} onClick={newFlowgraph} title="New flowgraph">+</button>
    </div>
  );

  const activePath = metas[activeId]?.path;

  return (
    <div style={styles.app}>
      {tabs.map((tab) => (
        <ReactFlowProvider key={tab.id}>
          <FlowEditor
            tabId={tab.id}
            initial={tab.initial}
            active={tab.id === activeId}
            tabBar={tab.id === activeId ? tabBar : null}
            onMeta={onMeta}
            onNew={newFlowgraph}
            onOpen={() => setOpenDialog(true)}
            clipboard={clipboard}
            setClipboard={setClipboard}
            isOpenElsewhere={isOpenElsewhere}
            layout={layout}
            onLayoutChange={setLayout}
          />
        </ReactFlowProvider>
      ))}

      {openDialog && (
        <FileDialog
          mode="open"
          initialDir={activePath ? dirName(activePath) : ""}
          onConfirm={(path) => openPath(path)}
          onCancel={() => setOpenDialog(false)}
        />
      )}

      {pendingClose && (
        <ConfirmDialog
          title="Close tab"
          message={closeMessage(pendingClose)}
          confirmLabel={metas[pendingClose]?.running ? "Kill and Close" : "Discard and Close"}
          onConfirm={() => { const id = pendingClose; setPendingClose(null); closeTab(id); }}
          onCancel={() => setPendingClose(null)}
        />
      )}
    </div>
  );
}

const styles = {
  loading: {
    padding: 20,
    fontFamily: "sans-serif",
    color: "#666",
  },
  app: {
    position: "relative",
    height: "98vh",
    overflow: "hidden",
    fontFamily: "sans-serif",
  },
  tabBar: {
    display: "flex",
    alignItems: "flex-end",
    gap: 2,
    padding: "4px 6px 0",
    background: "#d6dde6",
    borderBottom: "1px solid #999",
    overflowX: "auto",
    overflowY: "hidden",
    whiteSpace: "nowrap",
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px 4px 10px",
    background: "#e9edf2",
    border: "1px solid #aab",
    borderBottom: "none",
    borderRadius: "5px 5px 0 0",
    fontSize: 12,
    cursor: "pointer",
    userSelect: "none",
    maxWidth: 220,
  },
  activeTab: {
    background: "#fff",
    fontWeight: "bold",
    marginBottom: -1,
    paddingBottom: 5,
  },
  tabTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  runningDot: {
    color: "#1a9e1a",
  },
  close: {
    color: "#666",
    fontSize: 14,
    lineHeight: "12px",
    padding: "0 2px",
    borderRadius: 3,
  },
  newTab: {
    marginLeft: 4,
    marginBottom: 3,
    padding: "0 8px",
    fontSize: 14,
    border: "1px solid #aab",
    borderRadius: 4,
    background: "#e9edf2",
    cursor: "pointer",
  },
};
