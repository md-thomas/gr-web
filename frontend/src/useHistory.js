// Undo/redo for one flowgraph. Call checkpoint() just before applying a
// change; it records the flowgraph as it is now. Consecutive checkpoints with
// the same key within COALESCE_MS are merged, so typing into one field is one
// undo step.
import { useCallback, useRef, useState } from "react";

const LIMIT = 100; // undo steps kept
const COALESCE_MS = 1000;

// Selection and drag state aren't part of the flowgraph
const strip = (nodes) => nodes.map((node) => ({ ...node, selected: false, dragging: false }));

// nodesRef/edgesRef hold the latest nodes and edges; snapshotOf(nodes, edges)
// gives a string that changes whenever the flowgraph does
export default function useHistory({ nodesRef, edgesRef, setNodes, setEdges, snapshotOf }) {
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const lastRef = useRef({ key: null, time: 0 });
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });

  const sync = () => setCounts({ undo: pastRef.current.length, redo: futureRef.current.length });

  const current = useCallback(() => ({
    nodes: strip(nodesRef.current),
    edges: edgesRef.current,
    snapshot: snapshotOf(nodesRef.current, edgesRef.current),
  }), [nodesRef, edgesRef, snapshotOf]);

  const checkpoint = useCallback((key = null) => {
    const now = Date.now();
    const last = lastRef.current;
    if (key && last.key === key && now - last.time < COALESCE_MS) {
      last.time = now;
      return;
    }
    lastRef.current = { key, time: now };

    const entry = current();
    const top = pastRef.current[pastRef.current.length - 1];
    if (top && top.snapshot === entry.snapshot) return; // nothing changed since the last one
    pastRef.current.push(entry);
    if (pastRef.current.length > LIMIT) pastRef.current.shift();
    futureRef.current = [];
    sync();
  }, [current]);

  // Move one step from one stack to the other, skipping entries identical to
  // the current flowgraph (e.g. a block that was clicked but not moved)
  const step = useCallback((fromRef, toRef) => {
    const now = current();
    while (fromRef.current.length && fromRef.current[fromRef.current.length - 1].snapshot === now.snapshot) {
      fromRef.current.pop();
    }
    const entry = fromRef.current.pop();
    if (entry) {
      toRef.current.push(now);
      nodesRef.current = entry.nodes;
      edgesRef.current = entry.edges;
      setNodes(entry.nodes);
      setEdges(entry.edges);
    }
    lastRef.current = { key: null, time: 0 };
    sync();
  }, [current, nodesRef, edgesRef, setNodes, setEdges]);

  const undo = useCallback(() => step(pastRef, futureRef), [step]);
  const redo = useCallback(() => step(futureRef, pastRef), [step]);

  return { checkpoint, undo, redo, canUndo: counts.undo > 0, canRedo: counts.redo > 0 };
}
