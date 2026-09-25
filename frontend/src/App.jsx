import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
} from "reactflow";
import "reactflow/dist/style.css";
import { BlockLibraryProvider } from "./blocks/BlockLibrary";
import { useBlockLibrary } from "./blocks/useBlockLibrary";
import { nodeTypes, nodeTypeFor } from "./blocks/registry";
import { uniqueName } from "./blocks/blockModel";
import BlockPalette, { BLOCK_DRAG_TYPE } from "./components/BlockPalette";
import BlockInspector from "./components/BlockInspector";
import FileDialog from "./components/FileDialog";
import StatusPanel from "./components/StatusPanel";
import { ConfirmDialog } from "./components/Modal";
import { baseName, dirName, openFlowgraph, saveFlowgraph } from "./files";
import { generateScript, runFlowgraph, runStatus, stopFlowgraph } from "./run";

const MAX_STATUS_ENTRIES = 2000;
const RUN_POLL_MS = 500;

export default function App() {
  return (
    <BlockLibraryProvider>
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </BlockLibraryProvider>
  );
}

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

// FlowCanvas
function FlowCanvas() {
  const { tree, byId, error } = useBlockLibrary();
  const [startNodes] = useState(initialNodes);
  const [nodes, setNodes, onNodesChange] = useNodesState(startNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // Current file (relative to the server's flowgraph folder) and unsaved-change tracking
  const [currentPath, setCurrentPath] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => flowSnapshot(startNodes, []));
  const snapshot = useMemo(() => flowSnapshot(nodes, edges), [nodes, edges]);
  const dirty = snapshot !== savedSnapshot;
  const [fileDialog, setFileDialog] = useState(null); // "open" | "save" | null
  const [pendingDiscard, setPendingDiscard] = useState(null); // action to run after confirming

  const [clipboard, setClipboard] = useState(null);
  const [statusLog, setStatusLog] = useState([]);
  const addStatus = useCallback((kind, texts) => {
    const time = new Date().toLocaleTimeString();
    setStatusLog((log) => [...log, ...texts.map((text) => ({ text, kind, time }))].slice(-MAX_STATUS_ENTRIES));
  }, []);
  const logStatus = (text, isError = false) => addStatus(isError ? "error" : "info", [text]);
  const logOutput = useCallback((lines) => { if (lines.length) addStatus("output", lines); }, [addStatus]);

  // Flowgraph process: whether one is running, and the next output line to fetch
  const [running, setRunning] = useState(false);
  const outputSinceRef = useRef(0);
  const saveResolverRef = useRef(null); // resolves the promise from askSavePath
  const pasteOffsetRef = useRef(0);

  const reactFlowWrapper = useRef(null);
  const nodeCounterRef = useRef(0);

  const selectedNodes = nodes.filter((n) => n.selected);

  // Keep a ref to the latest nodes so callbacks can compute unique names
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const takenNames = () => new Set(nodesRef.current.map((n) => n.data.name));

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

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const loadFlow = (newNodes, newEdges, path) => {
    setNodes(newNodes);
    setEdges(newEdges);
    setCurrentPath(path);
    setSavedSnapshot(flowSnapshot(newNodes, newEdges));
    setClipboard(null);
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 50);
  };

  // Run an action that replaces the flowgraph, asking first if there are unsaved changes
  const discardGuard = (action) => (dirty ? setPendingDiscard(() => action) : action());

  const newFlowgraph = () => discardGuard(() => {
    loadFlow(initialNodes(), [], null);
    logStatus("New flowgraph");
  });

  const openPath = (path) => {
    setFileDialog(null);
    openFlowgraph(path)
      .then((data) => {
        const { nodes: newNodes, edges: newEdges, skipped } = flowFromGrc(data);
        loadFlow(newNodes, newEdges, data.path);
        logStatus(`Opened ${data.path}`);
        skipped.forEach((c) => logStatus(`Skipped connection to a missing block: ${c}`, true));
      })
      .catch((err) => logStatus(`Open failed: ${err.message}`, true));
  };

  // Resolves to the saved path, or null if saving failed
  const savePath = (path, overwrite) => {
    setFileDialog(null);
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
    setFileDialog("save");
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
      setRunning(data.state === "running");
    } catch (err) {
      logStatus(`Run failed: ${err.message}`, true);
    }
  };

  const kill = () => {
    stopFlowgraph()
      .then(() => logStatus("Stopping flowgraph…"))
      .catch((err) => logStatus(`Kill failed: ${err.message}`, true));
  };

  // Poll output while a flowgraph runs
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      runStatus(outputSinceRef.current)
        .then((data) => {
          outputSinceRef.current = data.next;
          logOutput(data.lines);
          if (data.state !== "running") {
            setRunning(false);
            const killed = data.state === "killed";
            addStatus(killed || data.returncode === 0 ? "info" : "error",
              [killed ? "Flowgraph killed" : `Flowgraph exited with code ${data.returncode}`]);
          }
        })
        .catch(() => {}); // try again on the next tick
    }, RUN_POLL_MS);
    return () => clearInterval(timer);
  }, [running, logOutput, addStatus]);

  // Reattach to a flowgraph that was already running (e.g. after a page reload)
  useEffect(() => {
    runStatus(0)
      .then((data) => {
        if (data.state !== "running") return;
        addStatus("info", [`${data.path} is running`]);
        outputSinceRef.current = 0;
        setRunning(true);
      })
      .catch(() => {});
  }, [addStatus]);

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
  // removes connected edges). Copy/paste is handled here.
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
    [selectedNodes, clipboard, setNodes]
  );

  return (
    <div style={styles.app}>
      <div style={styles.toolbar}>
        Web GRC
        <button style={styles.toolbarButton} onClick={newFlowgraph}>New</button>
        <button style={styles.toolbarButton} onClick={() => discardGuard(() => setFileDialog("open"))}>Open…</button>
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

      <div style={styles.main}>
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
            nodeTypes={nodeTypes}
            defaultEdgeOptions={EDGE_OPTIONS}
            deleteKeyCode={["Delete", "Backspace"]}
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        <div style={styles.blocks}>
          <strong>Blocks</strong>
          <BlockPalette tree={tree} error={error} onAdd={handleBlockDoubleClick} />
        </div>
      </div>

      <div style={styles.bottom}>
        <StatusPanel entries={statusLog} style={styles.panel} onClear={() => setStatusLog([])} />

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

      {fileDialog && (
        <FileDialog
          mode={fileDialog}
          initialDir={currentPath ? dirName(currentPath) : ""}
          initialName={
            fileDialog === "save"
              ? (currentPath ? baseName(currentPath) : `${nodes.find((n) => n.data.blockId === "options")?.data.name ?? "untitled"}.grc`)
              : ""
          }
          onConfirm={(path, { overwrite }) =>
            fileDialog === "open" ? openPath(path) : savePath(path, overwrite).then(finishSaveDialog)
          }
          onCancel={() => { setFileDialog(null); finishSaveDialog(null); }}
        />
      )}

      {pendingDiscard && (
        <ConfirmDialog
          title="Unsaved changes"
          message="The current flowgraph has unsaved changes. Discard them?"
          confirmLabel="Discard"
          onConfirm={() => { const action = pendingDiscard; setPendingDiscard(null); action(); }}
          onCancel={() => setPendingDiscard(null)}
        />
      )}
    </div>
  );
}

const styles = {
  app: {
    display: "grid",
    gridTemplateRows: "40px 1fr 200px",
    height: "98vh",
    overflow: "hidden",
    fontFamily: "sans-serif",
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
    gridTemplateColumns: "1fr 240px",
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
    borderLeft: "1px solid #ccc",
    padding: 10,
    overflowY: "auto",
    minHeight: 0,
  },
  bottom: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    borderTop: "1px solid #999",
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
