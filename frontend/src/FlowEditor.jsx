// FlowEditor.jsx
// One flowgraph: toolbar, canvas, block palette, status and properties.
// Each tab in App is a FlowEditor; all stay mounted so hidden tabs keep their
// state and keep following their running flowgraph's output.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { useNodesState, useEdgesState, useReactFlow, addEdge, reconnectEdge } from "reactflow";
import { useBlockLibrary } from "./blocks/useBlockLibrary";
import { nodeTypes, nodeTypeFor } from "./blocks/registry";
import { uniqueName } from "./blocks/blockModel";
import BlockPalette, { BLOCK_DRAG_TYPE } from "./components/BlockPalette";
import BlockInspector from "./components/BlockInspector";
import FileDialog from "./components/FileDialog";
import StatusPanel from "./components/StatusPanel";
import Splitter from "./components/Splitter";
import { baseName, dirName, saveFlowgraph } from "./files";
import { generateScript, runFlowgraph, runStatus, stopFlowgraph } from "./run";
import { DEFAULT_LAYOUT, saveDoc } from "./session";

const MAX_STATUS_ENTRIES = 2000;
const RUN_POLL_MS = 500;
const PERSIST_DELAY_MS = 300;

// Panel size limits (px); the canvas keeps at least MIN_CANVAS in each direction
const MIN_BOTTOM = 60;
const MIN_PALETTE = 140;
const MIN_CANVAS = 200;
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// Node data: { blockId, name, params, grcStates? } where params only holds
// values that differ from the block's defaults (or were set explicitly), and
// grcStates keeps GRC block states (enabled/disabled, ...) from an opened file
function makeNode(blockId, position, takenNames, { name, params = {}, grcStates, ...extra } = {}) {
  return {
    id: `${blockId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: nodeTypeFor(blockId),
    position,
    data: { blockId, name: name ?? uniqueName(blockId, takenNames), params, ...(grcStates && { grcStates }) },
    ...(blockId === "options" && { deletable: false }),
    ...extra,
  };
}

const initialNodes = () => [
  makeNode("options", { x: 0, y: 10 }, new Set(), {
    name: "default",
    params: { title: "Not titled yet" },
  }),
  makeNode("variable", { x: 180, y: 10 }, new Set(), {
    name: "samp_rate",
    params: { value: "32000" },
  }),
];

// Build React Flow nodes/edges from an opened .grc (see files.openFlowgraph)
function flowFromGrc({ blocks, connections }) {
  const names = new Set();
  const nodes = blocks.map((b) => {
    names.add(b.name);
    return makeNode(b.blockId, b.position, names, { name: b.name, params: b.params, grcStates: b.grcStates });
  });
  const idByName = Object.fromEntries(nodes.map((n) => [n.data.name, n.id]));
  const edges = [];
  const skipped = [];
  connections.forEach((c, i) => {
    const source = idByName[c.source], target = idByName[c.target];
    if (!source || !target) { skipped.push(`${c.source} -> ${c.target}`); return; }
    edges.push({ id: `e${i}-${source}-${target}`, source, sourceHandle: c.sourcePort, target, targetHandle: c.targetPort });
  });
  return { nodes, edges, skipped };
}

// Starting state for an editor: a new flowgraph, an opened file, or a tab
// restored from the browser after a page refresh (see session.js).
// savedSnapshot is null when the starting state is itself what's saved.
function initialState(initial) {
  const time = new Date().toLocaleTimeString();
  let state;
  if (initial.kind === "file") {
    const { nodes, edges, skipped } = flowFromGrc(initial.data);
    state = {
      nodes, edges, path: initial.data.path, savedSnapshot: null,
      log: [
        { kind: "info", time, text: `Opened ${initial.data.path}` },
        ...skipped.map((c) => ({ kind: "error", time, text: `Skipped connection to a missing block: ${c}` })),
      ],
    };
  } else if (initial.kind === "restore") {
    const { nodes, edges, path, savedSnapshot, viewport } = initial.doc;
    state = { nodes, edges, path, savedSnapshot, viewport, log: [] };
  } else {
    state = { nodes: initialNodes(), edges: [], path: null, savedSnapshot: null, log: [] };
  }
  if (initial.attachRun) state.log.push({ kind: "info", time, text: `${state.path} is running` });
  return state;
}

// What gets saved, for detecting unsaved changes (ignores selection etc.)
const flowSnapshot = (nodes, edges) =>
  JSON.stringify([
    nodes.map((n) => [n.id, n.position.x, n.position.y, n.data]),
    edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle]),
  ]);

const EDGE_OPTIONS = {
  style: { stroke: "#000", strokeWidth: 2 },
  markerEnd: { type: "arrowclosed", width: 12, height: 12, color: "#000" },
};

const isTyping = (event) => ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);

// Props:
//   tabId, initial ({ kind: "new" }, { kind: "file", data } or { kind: "restore", doc },
//                   plus attachRun if its flowgraph is already running)
//   active       - whether this tab is shown
//   tabBar       - element rendered between the toolbar and the canvas
//   onMeta(tabId, { path, dirty, running, runPath }) - reports state to App
//   onNew(), onOpen() - App actions for the toolbar
//   clipboard, setClipboard - shared across tabs
//   isOpenElsewhere(path, tabId) - true if another tab has that file open
//   layout, onLayoutChange(layout) - panel sizes, shared by all tabs (session.js)
export default function FlowEditor({
  tabId, initial, active, tabBar, onMeta, onNew, onOpen, clipboard, setClipboard, isOpenElsewhere,
  layout, onLayoutChange,
}) {
  const { tree, byId, error } = useBlockLibrary();
  const [start] = useState(() => initialState(initial));
  const [nodes, setNodes, onNodesChange] = useNodesState(start.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(start.edges);
  const { screenToFlowPosition, getViewport } = useReactFlow();

  // Current file (relative to the server's flowgraph folder) and unsaved-change tracking
  const [currentPath, setCurrentPath] = useState(start.path);
  const [savedSnapshot, setSavedSnapshot] = useState(() => start.savedSnapshot ?? flowSnapshot(start.nodes, start.edges));
  const snapshot = useMemo(() => flowSnapshot(nodes, edges), [nodes, edges]);
  const dirty = snapshot !== savedSnapshot;
  const [saveDialog, setSaveDialog] = useState(false);

  const [statusLog, setStatusLog] = useState(start.log);
  const addStatus = useCallback((kind, texts) => {
    const time = new Date().toLocaleTimeString();
    setStatusLog((log) => [...log, ...texts.map((text) => ({ text, kind, time }))].slice(-MAX_STATUS_ENTRIES));
  }, []);
  const logStatus = (text, isError = false) => addStatus(isError ? "error" : "info", [text]);
  const logOutput = useCallback((lines) => { if (lines.length) addStatus("output", lines); }, [addStatus]);

  // Flowgraph process: the path it was started from (the tab may be saved
  // under another name while it runs) and the next output line to fetch
  const [runPath, setRunPath] = useState(initial.attachRun ? start.path : null);
  const running = runPath !== null;
  const outputSinceRef = useRef(0);
  const saveResolverRef = useRef(null); // resolves the promise from askSavePath
  const pasteOffsetRef = useRef(0);

  const reactFlowWrapper = useRef(null);
  const nodeCounterRef = useRef(0);

  // Resizable panels: sizes are relative to the layout when a drag started
  const editorRef = useRef(null);
  const bottomRef = useRef(null);
  const dragStartRef = useRef(layout);
  const startResize = () => { dragStartRef.current = layout; };
  const resizeBottom = (dy) => onLayoutChange({
    ...dragStartRef.current,
    bottomHeight: clamp(dragStartRef.current.bottomHeight - dy, MIN_BOTTOM, editorRef.current.clientHeight - MIN_CANVAS),
  });
  const resizePalette = (dx) => onLayoutChange({
    ...dragStartRef.current,
    paletteWidth: clamp(dragStartRef.current.paletteWidth - dx, MIN_PALETTE, editorRef.current.clientWidth - MIN_CANVAS),
  });
  const resizeStatus = (dx) => onLayoutChange({
    ...dragStartRef.current,
    statusFraction: clamp(dragStartRef.current.statusFraction + dx / bottomRef.current.clientWidth, 0.1, 0.9),
  });
  const resetLayout = (key) => onLayoutChange({ ...layout, [key]: DEFAULT_LAYOUT[key] });

  const selectedNodes = nodes.filter((n) => n.selected);

  // Keep a ref to the latest nodes so callbacks can compute unique names
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const takenNames = () => new Set(nodesRef.current.map((n) => n.data.name));

  // Tell App what the tab bar needs to show
  useEffect(() => {
    onMeta(tabId, { path: currentPath, dirty, running, runPath });
  }, [onMeta, tabId, currentPath, dirty, running, runPath]);

  const addBlock = useCallback(
    (blockId, position) => {
      setNodes((nds) => [...nds, makeNode(blockId, position, new Set(nds.map((n) => n.data.name)))]);
    },
    [setNodes]
  );

  const updateNodeData = useCallback(
    (id, patch) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes]
  );

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  // Dragging a wire's end onto another port moves the wire there. Dropping it
  // anywhere else leaves the wire as it was; wires are only deleted with the
  // Delete key.
  const onReconnect = useCallback(
    (oldEdge, connection) => setEdges((eds) => reconnectEdge(oldEdge, connection, eds)),
    [setEdges]
  );

  // Keep this tab in the browser so a page refresh restores it (session.js)
  const persistTimerRef = useRef(null);
  const docRef = useRef(null);
  useEffect(() => {
    docRef.current = { nodes, edges, path: currentPath, savedSnapshot };
  }, [nodes, edges, currentPath, savedSnapshot]);

  const writeDoc = useCallback(() => {
    persistTimerRef.current = null;
    if (docRef.current) saveDoc(tabId, { ...docRef.current, viewport: getViewport() });
  }, [tabId, getViewport]);
  const persist = useCallback(() => {
    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(writeDoc, PERSIST_DELAY_MS);
  }, [writeDoc]);

  useEffect(() => { persist(); }, [persist, nodes, edges, currentPath, savedSnapshot]);

  // Save straight away when the page is refreshed or closed (this also
  // catches viewport changes that don't fire onMoveEnd, like the initial fit)
  useEffect(() => {
    const flush = () => {
      clearTimeout(persistTimerRef.current);
      writeDoc();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      clearTimeout(persistTimerRef.current); // closed tab: App removes its document
    };
  }, [writeDoc]);

  // Resolves to the saved path, or null if saving failed
  const savePath = (path, overwrite) => {
    setSaveDialog(false);
    if (isOpenElsewhere(path, tabId)) {
      logStatus(`Save failed: ${path} is open in another tab`, true);
      return Promise.resolve(null);
    }
    const saved = flowSnapshot(nodes, edges);
    return saveFlowgraph(path, { nodes, edges }, overwrite)
      .then((data) => {
        setCurrentPath(data.path);
        setSavedSnapshot(saved);
        logStatus(`Saved ${data.fullPath}`);
        return data.path;
      })
      .catch((err) => {
        logStatus(`Save failed: ${err.message}`, true);
        return null;
      });
  };

  // Open the Save As dialog; resolves to the saved path, or null if cancelled
  const askSavePath = () => new Promise((resolve) => {
    saveResolverRef.current = resolve;
    setSaveDialog(true);
  });
  const finishSaveDialog = (result) => {
    const resolve = saveResolverRef.current;
    saveResolverRef.current = null;
    resolve?.(result);
  };

  // Save to the current file, or ask where if it hasn't been saved yet
  const save = () => (currentPath ? savePath(currentPath, true) : askSavePath());
  const saveIfChanged = () => (currentPath && !dirty ? Promise.resolve(currentPath) : save());

  // Generate: save, then have grcc write the Python script next to the .grc
  const generate = async () => {
    const path = await saveIfChanged();
    if (!path) return;
    try {
      const data = await generateScript(path);
      logStatus(`Generated ${data.script}`);
    } catch (err) {
      logStatus(`Generate failed: ${err.message}`, true);
    }
  };

  // Run: save, generate, and start the flowgraph; output is polled below
  const run = async () => {
    const path = await saveIfChanged();
    if (!path) return;
    logStatus(`Generating and running ${path}…`);
    try {
      const data = await runFlowgraph(path);
      logOutput(data.lines);
      outputSinceRef.current = data.next;
      if (data.state === "running") setRunPath(path);
    } catch (err) {
      logStatus(`Run failed: ${err.message}`, true);
    }
  };

  const kill = () => {
    stopFlowgraph(runPath)
      .then(() => logStatus("Stopping flowgraph…"))
      .catch((err) => logStatus(`Kill failed: ${err.message}`, true));
  };

  // Poll output while the flowgraph runs (also while this tab is hidden)
  useEffect(() => {
    if (!runPath) return;
    const timer = setInterval(() => {
      runStatus(runPath, outputSinceRef.current)
        .then((data) => {
          outputSinceRef.current = data.next;
          logOutput(data.lines);
          if (data.state !== "running") {
            setRunPath(null);
            const killed = data.state === "killed";
            addStatus(killed || data.returncode === 0 ? "info" : "error",
              [killed ? "Flowgraph killed" : `Flowgraph exited with code ${data.returncode}`]);
          }
        })
        .catch(() => {}); // try again on the next tick
    }, RUN_POLL_MS);
    return () => clearInterval(timer);
  }, [runPath, logOutput, addStatus]);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const blockId = event.dataTransfer.getData(BLOCK_DRAG_TYPE);
      if (!blockId) return;
      addBlock(blockId, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addBlock, screenToFlowPosition]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Double-click in the palette: add near the center of the visible canvas
  const handleBlockDoubleClick = (blockId) => {
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });
    const offset = (nodeCounterRef.current++ % 10) * 20;
    addBlock(blockId, { x: center.x + offset, y: center.y + offset });
  };

  // Delete/Backspace is handled by React Flow (respects deletable: false and
  // removes connected edges). Copy/paste is handled here; the clipboard is
  // shared between tabs.
  const handleKeyDown = useCallback(
    (event) => {
      if (isTyping(event)) return;
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const ctrl = isMac ? event.metaKey : event.ctrlKey;

      // COPY
      if (ctrl && event.key.toLowerCase() === "c") {
        const copyable = selectedNodes.filter((n) => n.data.blockId !== "options");
        if (copyable.length === 0) return;
        setClipboard(copyable);
        pasteOffsetRef.current = 0;
        event.preventDefault();
        return;
      }

      // PASTE
      if (ctrl && event.key.toLowerCase() === "v") {
        if (!clipboard) return;
        pasteOffsetRef.current += 20;

        const names = takenNames();
        const pastedNodes = clipboard.map((n) => {
          const node = makeNode(
            n.data.blockId,
            { x: n.position.x + pasteOffsetRef.current, y: n.position.y + pasteOffsetRef.current },
            names,
            { params: { ...n.data.params }, grcStates: n.data.grcStates, selected: true }
          );
          names.add(node.data.name);
          return node;
        });

        setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...pastedNodes]);
        event.preventDefault();
      }
    },
    [selectedNodes, clipboard, setClipboard, setNodes]
  );

  return (
    <div
      ref={editorRef}
      style={{
        ...styles.editor,
        ...(active ? styles.active : {}),
        // Stored sizes may be too big for a smaller window, so cap them too
        gridTemplateRows: `40px auto minmax(0, 1fr) auto min(${layout.bottomHeight}px, 60vh)`,
      }}
      data-tab={tabId}
      data-active={active}
      inert={active ? undefined : ""}
    >
      <div style={styles.toolbar}>
        Web GRC
        <button style={styles.toolbarButton} onClick={onNew}>New</button>
        <button style={styles.toolbarButton} onClick={onOpen}>Open…</button>
        <button style={styles.toolbarButton} onClick={save}>Save</button>
        <button style={styles.toolbarButton} onClick={askSavePath}>Save As…</button>
        <button
          style={styles.toolbarButton}
          onClick={() => {
            const flowData = { nodes, edges };
            const json = JSON.stringify(flowData, null, 2);
            // download JSON
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "flow.json";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export
        </button>
        <button style={styles.toolbarButton} onClick={generate}>Generate</button>
        <button
          style={{ ...styles.toolbarButton, ...(running ? styles.disabledButton : {}) }}
          onClick={run}
          disabled={running}
        >
          Run
        </button>
        <button
          style={{ ...styles.toolbarButton, ...(running ? styles.killButton : styles.disabledButton) }}
          onClick={kill}
          disabled={!running}
        >
          Kill
        </button>
        <span style={styles.fileName} title={currentPath ?? ""}>
          {running && <span style={styles.runningBadge}>● running</span>}
          {currentPath ?? "untitled"}{dirty ? " *" : ""}
        </span>
      </div>

      {tabBar}

      <div style={{ ...styles.main, gridTemplateColumns: `minmax(0, 1fr) auto min(${layout.paletteWidth}px, 60vw)` }}>
        <div
          ref={reactFlowWrapper}
          tabIndex={0}
          style={styles.canvasWrapper}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onKeyDown={handleKeyDown}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={EDGE_OPTIONS}
            deleteKeyCode={["Delete", "Backspace"]}
            fitView={initial.kind === "file"}
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            defaultViewport={start.viewport}
            onMoveEnd={persist}
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        <Splitter
          orientation="vertical"
          title="Resize the Blocks panel"
          onDragStart={startResize}
          onDrag={resizePalette}
          onReset={() => resetLayout("paletteWidth")}
        />

        <div style={styles.blocks}>
          <strong>Blocks</strong>
          <BlockPalette tree={tree} error={error} onAdd={handleBlockDoubleClick} />
        </div>
      </div>

      <Splitter
        orientation="horizontal"
        title="Resize the bottom panels"
        onDragStart={startResize}
        onDrag={resizeBottom}
        onReset={() => resetLayout("bottomHeight")}
      />

      <div
        ref={bottomRef}
        style={{ ...styles.bottom, gridTemplateColumns: `minmax(0, ${layout.statusFraction}fr) auto minmax(0, ${1 - layout.statusFraction}fr)` }}
      >
        <StatusPanel entries={statusLog} style={styles.panel} onClear={() => setStatusLog([])} />

        <Splitter
          orientation="vertical"
          title="Resize Status and Block Properties"
          onDragStart={startResize}
          onDrag={resizeStatus}
          onReset={() => resetLayout("statusFraction")}
        />

        <div style={styles.panel}>
          <strong>Block Properties</strong>
          <div style={{ marginTop: 8 }}>
            {selectedNodes.length === 0 && (
              <div style={{ color: "#666" }}>No block selected</div>
            )}

            {selectedNodes.length === 1 && (
              <BlockInspector
                node={selectedNodes[0]}
                def={byId[selectedNodes[0].data.blockId]}
                onChange={(patch) => updateNodeData(selectedNodes[0].id, patch)}
              />
            )}

            {selectedNodes.length > 1 && (
              <div style={{ color: "#666" }}>
                Multiple blocks selected ({selectedNodes.length})
              </div>
            )}
          </div>
        </div>
      </div>

      {saveDialog && (
        <FileDialog
          mode="save"
          initialDir={currentPath ? dirName(currentPath) : ""}
          initialName={
            currentPath
              ? baseName(currentPath)
              : `${nodes.find((n) => n.data.blockId === "options")?.data.name ?? "untitled"}.grc`
          }
          onConfirm={(path, { overwrite }) => savePath(path, overwrite).then(finishSaveDialog)}
          onCancel={() => { setSaveDialog(false); finishSaveDialog(null); }}
        />
      )}
    </div>
  );
}

const styles = {
  editor: {
    position: "absolute",
    inset: 0,
    display: "grid",
    overflow: "hidden",
    background: "#fff",
    zIndex: 0,
  },
  // Inactive tabs stay laid out underneath (so React Flow keeps its
  // measurements) and are covered by the opaque active tab
  active: {
    zIndex: 1,
  },
  toolbar: {
    background: "#003366",
    color: "#fff",
    padding: "8px 12px",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    overflow: "hidden",
  },
  fileName: {
    marginLeft: "auto",
    paddingLeft: 20,
    fontWeight: "normal",
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  main: {
    display: "grid",
    height: "100%",
    minHeight: 0,
  },
  canvasWrapper: {
    background: "#eee",
    width: "100%",
    height: "100%",
    minHeight: 0,
  },
  blocks: {
    background: "#f5f5f5",
    padding: 10,
    overflowY: "auto",
    minHeight: 0,
  },
  bottom: {
    display: "grid",
    boxSizing: "border-box",
    height: "100%",
    minHeight: 0,
    background: "#f9f9f9",
  },
  panel: {
    padding: 8,
    fontSize: 12,
    border: "1px solid #bbb",
    background: "#fff",
    overflowY: "auto",
    overflowX: "hidden",
    boxSizing: "border-box",
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "default",
  },
  killButton: {
    background: "#cc2222",
  },
  runningBadge: {
    color: "#7CFC00",
    marginRight: 12,
  },
  toolbarButton: {
    marginLeft: 20,
    padding: "4px 8px",
    background: "#0066cc",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
};
