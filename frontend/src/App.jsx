import React, { useCallback, useEffect, useRef, useState } from "react";
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

export default function App() {
  return (
    <BlockLibraryProvider>
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </BlockLibraryProvider>
  );
}

// Node data: { blockId, name, params } where params only holds values that
// differ from the block's defaults (or were set explicitly)
function makeNode(blockId, position, takenNames, { name, params = {}, ...extra } = {}) {
  return {
    id: `${blockId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: nodeTypeFor(blockId),
    position,
    data: { blockId, name: name ?? uniqueName(blockId, takenNames), params },
    ...extra,
  };
}

const initialNodes = () => [
  makeNode("options", { x: 0, y: 10 }, new Set(), {
    name: "top_block",
    params: { title: "Not titled yet" },
    deletable: false,
  }),
  makeNode("variable", { x: 180, y: 10 }, new Set(), {
    name: "samp_rate",
    params: { value: "32000" },
  }),
];

const isTyping = (event) => ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);

// FlowCanvas
function FlowCanvas() {
  const { tree, byId, error } = useBlockLibrary();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { screenToFlowPosition } = useReactFlow();

  const [clipboard, setClipboard] = useState(null);
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

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, style: { stroke: "#000", strokeWidth: 2 }, markerEnd: { type: "arrowclosed", width: 12, height: 12, color: "#000" } }, eds)),
    [setEdges]
  );

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
            { params: { ...n.data.params }, selected: true }
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
        <button
          style={styles.toolbarButton}
          onClick={() => {
            const flowData = { nodes, edges };
            console.log("New Flowgraph:", JSON.stringify(flowData, null, 2));
          }}
        >
          New
        </button>
        <button
          style={styles.toolbarButton}
          onClick={() => {
            const flowData = { nodes, edges };
            console.log("Load Flowgraph:", JSON.stringify(flowData, null, 2));
          }}
        >
          Load
        </button>
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
        <button
          style={styles.toolbarButton}
          onClick={() => {
            const flowData = { nodes, edges };
            console.log("Generated Flow JSON:", JSON.stringify(flowData, null, 2));
          }}
        >
          Generate
        </button>
        <button
          style={styles.toolbarButton}
          onClick={() => {
            const flowData = { nodes, edges };
            console.log("Run Flowgraph:", JSON.stringify(flowData, null, 2));
            fetch("/run-flow", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(flowData),
            })
              .then((res) => res.json())
              .then((data) => {
                console.log("Backend response:", data);
                alert(`Backend says: ${data.message}`);
              })
              .catch((err) => console.error("Error sending flow to backend:", err));
          }}
        >
          Run
        </button>
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
        <div style={styles.panel}>
          <strong>Status</strong>
        </div>

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
