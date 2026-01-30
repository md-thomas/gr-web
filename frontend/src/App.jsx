import React, { useCallback, useRef, useState } from "react";
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
} from "reactflow";
import "reactflow/dist/style.css";
import ThrottleNode from "./components/ThrottleNode";
import OptionsNode from "./components/OptionsNode";
import VariableNode from "./components/VariableNode";

const nodeTypes = { 
  optionsNode: OptionsNode,
  variableNode: VariableNode,
  throttleNode: ThrottleNode,
};

// Initial node on canvas
const initialNodes = [
  {
    id: "options",
    position: { x: 0, y: 10 },  // always top-left
    type: "optionsNode",        // we'll define a custom ReactFlow node
    data: {
      label: "Options",
      title: "Not titled yet",
      author: "",
      output_language: "Python",
      generate_options: "QT GUI"
    },
    selectable: false,          // optional: can't accidentally delete
  },
  {
    id: "variable-1",
    type: "variableNode",       // Our new VariableNode
    position: { x: 180, y: 10 }, // top-left corner
    data: { label: "Variable", id: "samp_rate", value: 32e3 },
  },
];

// Blocks available in the palette
const availableBlocks = ["Variable", "Throttle", "Source", "Sink"];

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}

// FlowCanvas
function FlowCanvas() {  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [selectedEdges, setSelectedEdges] = useState([]);

  const [clipboard, setClipboard] = useState(null);
  const pasteOffsetRef = useRef(0);

  const reactFlowWrapper = useRef(null);
  const [nodeCounter, setNodeCounter] = useState(0);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, style: { stroke: "#000", strokeWidth: 2 }, markerEnd: { type: "arrowclosed", width: 12, height: 12, color: "#000" } }, eds)),
    [setEdges]
  );

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const id = `${type}-${Date.now()}`;
      const nodeType = type === "Throttle" ? "throttleNode" : "default";

      setNodes((nds) => [...nds, { id, type: nodeType, position, data: { label: type, sampleRate: 32000 } }]);
    },
    [setNodes]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleBlockDoubleClick = (blockName) => {
    const id = `${blockName}-${Date.now()}`;
    const reactFlow = reactFlowWrapper.current.querySelector(".react-flow__renderer");
    const viewport = { x: 0, y: 0, zoom: 1 };

    if (reactFlow && reactFlow._reactInternals) {
      try {
        // Use internal API as fallback (optional)
        const instance = reactFlowWrapper.current;
        // Center new node in canvas view
        viewport.x = instance.scrollLeft || 0;
        viewport.y = instance.scrollTop || 0;
      } catch (e) {}
    }

    const canvasWidth = reactFlowWrapper.current.clientWidth || 800;
    const canvasHeight = reactFlowWrapper.current.clientHeight || 600;

    const position = {
      x: viewport.x + canvasWidth / 2 + nodeCounter * 20,
      y: viewport.y + canvasHeight / 2 + nodeCounter * 20,
    };

    const nodeType = blockName === "Throttle" ? "throttleNode"
               : blockName === "Variable" ? "variableNode"
               : "default";

    setNodes((nds) => [
      ...nds,
      { id, type: nodeType, position, data: { label: blockName, sampleRate: 32000 } },
    ]);
    setNodeCounter((c) => c + 1);
  };

  // const handleKeyDown = useCallback(
  //   (event) => {
  //     if (["Delete", "Del", "Backspace"].includes(event.key)) {
  //       setNodes((nds) => nds.filter((n) => !selectedNodes.some((sel) => sel.id === n.id)));
  //       setEdges((eds) => eds.filter((e) => !selectedEdges.some((sel) => sel.id === e.id)));
  //       event.preventDefault();
  //     }
  //   },
  //   [selectedNodes, selectedEdges]
  // );

  const handleKeyDown = useCallback(
    (event) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const ctrl = isMac ? event.metaKey : event.ctrlKey;

      // DELETE
      if (["Delete", "Del", "Backspace"].includes(event.key)) {
        setNodes((nds) =>
          nds.filter((n) => !selectedNodes.some((sel) => sel.id === n.id))
        );
        setEdges((eds) =>
          eds.filter((e) => !selectedEdges.some((sel) => sel.id === e.id))
        );
        event.preventDefault();
        return;
      }

      // COPY      
      if (ctrl && event.key.toLowerCase() === "c") {
        if (selectedNodes.length === 0) return;

      const copyable = selectedNodes.filter(
        (n) => n.type !== "optionsNode"
      );

      if (copyable.length === 0) return;
        setClipboard(
          selectedNodes.map((n) => ({
            ...n,
            id: undefined, // we'll regenerate IDs on paste
          }))
        );
        pasteOffsetRef.current = 0;
        event.preventDefault();
        return;
      }

      // PASTE
      if (ctrl && event.key.toLowerCase() === "v") {
        if (!clipboard) return;

        pasteOffsetRef.current += 20;

        const pastedNodes = clipboard.map((n) => ({
          ...n,
          id: `${n.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          position: {
            x: n.position.x + pasteOffsetRef.current,
            y: n.position.y + pasteOffsetRef.current,
          },
          selected: false,
        }));

        setNodes((nds) => [...nds, ...pastedNodes]);
        event.preventDefault();
      }
    },
    [selectedNodes, selectedEdges, clipboard, setNodes, setEdges]
  );


  function BlockInspector({ node }) {
    return (
      <div style={{ fontSize: 12 }}>
        <div>
          <strong>Name:</strong> {node.data?.label}
        </div>

        <div>
          <strong>Type:</strong> {node.type}
        </div>

        <hr style={{ margin: "8px 0" }} />

        <strong>Parameters</strong>

        {Object.entries(node.data || {}).map(([key, value]) => {
          if (key === "label") return null;

          return (
            <div key={key} style={{ marginTop: 4 }}>
              <strong>{key}:</strong> {String(value)}
            </div>
          );
        })}
      </div>
    );
  }
  

  const resetFlow = () => {
    setNodes([
      {
        id: "variable-1",
        type: "variableNode",
        position: { x: 20, y: 20 },
        data: { name: "samp_rate", value: 1e6 },
      },
    ]);
    setEdges([]);
  };


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
            onSelectionChange={(e) => {
              setSelectedNodes(e.nodes);
              setSelectedEdges(e.edges);
            }}
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        <div style={styles.blocks}>
          <strong>Blocks</strong>
          {availableBlocks.map((b) => (
            <div
              key={b}
              draggable
              onDragStart={(event) => event.dataTransfer.setData("application/reactflow", b)}
              onDoubleClick={() => handleBlockDoubleClick(b)}
              style={styles.blockItem}
            >
              {b}
            </div>
          ))}
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
              <BlockInspector node={selectedNodes[0]} />
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
    gridTemplateRows: "40px 1fr 120px", 
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
    gridTemplateColumns: "1fr 220px", 
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
  },
  blockItem: { 
    padding: "4px 8px", 
    margin: "4px 0", 
    background: "#ddd", 
    cursor: "grab",
  },
  bottom: { 
    display: "grid", 
    gridTemplateColumns: "1fr 1fr", 
    borderTop: "1px solid #999",
    boxSizing: "border-box",
    height: "100%",
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
  exportButton: {
    marginLeft: 20,
    padding: "4px 8px",
    background: "#0066cc",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
  generateButton: {
    marginLeft: 20,
    padding: "4px 8px",
    background: "#28a745",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
};
