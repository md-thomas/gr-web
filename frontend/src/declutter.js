// Automatic layout ("Declutter") using ELK's layered algorithm, which is made
// for left-to-right dataflow diagrams. ELK is told about each port and where
// it sits on its block, so it can order blocks to avoid crossing wires and
// line ports up to keep wires straight.
//
// Blocks without ports (Options, variables, GUI widgets, notes, ...) aren't
// part of the flow; they're placed in rows across the top, as is usual in GRC.

// Spacing (flow coordinates, px)
const LAYER_GAP = 60; // between columns, in addition to ports sticking out
const NODE_GAP = 40; // between blocks in a column
const COMPONENT_GAP = 60; // between unconnected parts of the flowgraph
const TOP_ROW_GAP = 20; // between blocks in the top rows
const TOP_ROW_MIN_WIDTH = 900; // top rows wrap at max(this, flow width)
const TOP_TO_FLOW_GAP = 60;

let elkPromise = null;

// ELK is large, so it's loaded the first time Declutter is used
function loadElk() {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then(({ default: ELK }) => new ELK());
  return elkPromise;
}

const portId = (nodeId, dir, key) => `${nodeId}\u0000${dir}\u0000${key}`;

// Top-row order: Options first, then variables, then everything else, each
// group keeping its current reading order (top to bottom, left to right)
function topRowRank(block) {
  if (block.blockId === "options") return 0;
  if (block.blockId?.startsWith("variable")) return 1;
  return 2;
}

// Place blocks left to right in rows no wider than maxWidth
function placeInRows(blocks, maxWidth) {
  const positions = new Map();
  let x = 0, y = 0, rowHeight = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.width > maxWidth) {
      x = 0;
      y += rowHeight + TOP_ROW_GAP;
      rowHeight = 0;
    }
    positions.set(b.id, { x, y });
    x += b.width + TOP_ROW_GAP;
    rowHeight = Math.max(rowHeight, b.height);
  }
  return { positions, height: blocks.length ? y + rowHeight : 0 };
}

// Order blocks so the biggest connected part of the flowgraph comes first
// (ELK stacks separate parts in this order), keeping the order within each part
function largestPartFirst(blocks, edges) {
  const parent = new Map(blocks.map((b) => [b.id, b.id]));
  const find = (id) => {
    while (parent.get(id) !== id) id = parent.get(id);
    return id;
  };
  for (const e of edges) {
    if (parent.has(e.source) && parent.has(e.target)) parent.set(find(e.source), find(e.target));
  }
  const size = new Map();
  for (const b of blocks) size.set(find(b.id), (size.get(find(b.id)) ?? 0) + 1);
  const firstIndex = new Map();
  blocks.forEach((b, i) => { if (!firstIndex.has(find(b.id))) firstIndex.set(find(b.id), i); });
  return [...blocks].sort((a, b) => {
    const pa = find(a.id), pb = find(b.id);
    return size.get(pb) - size.get(pa) || firstIndex.get(pa) - firstIndex.get(pb);
  });
}

// blocks: [{ id, blockId, x, y, width, height, handles: [{ key, dir: "in"|"out", left, right, y }] }]
//   measured in flow coordinates; handle left/right/y are relative to the
//   block's top-left corner (left can be negative: ports stick out)
// edges: React Flow edges
// Returns Map(block id -> { x, y }) for every block.
export async function declutter(blocks, edges) {
  const elk = await loadElk();

  const portless = blocks.filter((b) => b.handles.length === 0);
  const flow = largestPartFirst(blocks.filter((b) => b.handles.length > 0), edges);

  // Flow blocks: pad each one by how far its ports stick out, so ELK leaves
  // room for them, and put ports at their real positions
  const pads = new Map();
  const ports = new Set();
  const children = flow.map((b) => {
    const leftPad = Math.max(0, ...b.handles.map((h) => -h.left));
    const rightPad = Math.max(0, ...b.handles.map((h) => h.right - b.width));
    pads.set(b.id, leftPad);
    return {
      id: b.id,
      width: leftPad + b.width + rightPad,
      height: b.height,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: b.handles.map((h) => {
        const id = portId(b.id, h.dir, h.key);
        ports.add(id);
        return {
          id,
          x: h.dir === "in" ? leftPad + h.left : leftPad + h.right,
          y: h.y,
          width: 1,
          height: 1,
          layoutOptions: { "elk.port.side": h.dir === "in" ? "WEST" : "EAST" },
        };
      }),
    };
  });

  const flowIds = new Set(flow.map((b) => b.id));
  const elkEdges = edges
    .filter((e) => flowIds.has(e.source) && flowIds.has(e.target))
    .map((e) => {
      // Fall back to the block itself if a port has disappeared
      const source = portId(e.source, "out", e.sourceHandle);
      const target = portId(e.target, "in", e.targetHandle);
      return {
        id: e.id,
        sources: [ports.has(source) ? source : e.source],
        targets: [ports.has(target) ? target : e.target],
      };
    });

  const positions = new Map();
  let flowWidth = 0, flowResult = null;
  if (flow.length) {
    flowResult = await elk.layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "SPLINES",
        "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_GAP),
        "elk.spacing.nodeNode": String(NODE_GAP),
        "elk.spacing.componentComponent": String(COMPONENT_GAP),
        "elk.separateConnectedComponents": "true",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
        // Keep blocks in their current relative order when it doesn't matter,
        // and stack separate parts in the order given (biggest first)
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.considerModelOrder.components": "MODEL_ORDER",
      },
      children,
      edges: elkEdges,
    });
    flowWidth = flowResult.width ?? 0;
  }

  // Portless blocks in rows at the top, the flow below them
  const readingOrder = (a, b) => topRowRank(a) - topRowRank(b) || a.y - b.y || a.x - b.x;
  const top = placeInRows([...portless].sort(readingOrder), Math.max(TOP_ROW_MIN_WIDTH, flowWidth));
  top.positions.forEach((p, id) => positions.set(id, p));

  const flowTop = top.height ? top.height + TOP_TO_FLOW_GAP : 0;
  for (const child of flowResult?.children ?? []) {
    positions.set(child.id, { x: child.x + pads.get(child.id), y: flowTop + child.y });
  }
  return positions;
}
