// Open tabs are kept in the browser's localStorage so a page refresh restores
// them, including unsaved changes. Storage can be unavailable or full (private
// windows, blocked site data), so every access is guarded and failures only
// mean the tabs aren't restored.

const INDEX_KEY = "gr-web:session";
const DOC_PREFIX = "gr-web:doc:";

function read(key) {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable or full: tabs just won't survive a refresh
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// -> { tabs: [{ id, untitled, doc }], activeId } or null. Drops tabs whose
// document is missing, and documents no tab refers to.
export function loadSession() {
  const index = read(INDEX_KEY);
  if (!index || !Array.isArray(index.tabs)) return null;
  const tabs = index.tabs
    .map((t) => ({ ...t, doc: read(DOC_PREFIX + t.id) }))
    .filter((t) => t.doc && Array.isArray(t.doc.nodes));

  try {
    const ids = new Set(tabs.map((t) => t.id));
    Object.keys(localStorage)
      .filter((k) => k.startsWith(DOC_PREFIX) && !ids.has(k.slice(DOC_PREFIX.length)))
      .forEach(remove);
  } catch {
    // ignore
  }

  if (tabs.length === 0) return null;
  const activeId = tabs.some((t) => t.id === index.activeId) ? index.activeId : tabs[0].id;
  return { tabs, activeId };
}

// tabs: [{ id, untitled }]
export const saveSessionIndex = (tabs, activeId) => write(INDEX_KEY, { tabs, activeId });

// doc: { nodes, edges, path, savedSnapshot, viewport }
export function saveDoc(tabId, { nodes, edges, ...rest }) {
  write(DOC_PREFIX + tabId, {
    ...rest,
    // Only what defines the flowgraph; React Flow recomputes the rest
    nodes: nodes.map(({ id, type, position, data, deletable }) => ({ id, type, position, data, deletable })),
    edges: edges.map(({ id, source, sourceHandle, target, targetHandle }) => ({ id, source, sourceHandle, target, targetHandle })),
  });
}

export const removeDoc = (tabId) => remove(DOC_PREFIX + tabId);

// Panel sizes, shared by all tabs
const LAYOUT_KEY = "gr-web:layout";

export const DEFAULT_LAYOUT = {
  bottomHeight: 200, // px, Status + Block Properties
  paletteWidth: 240, // px, Blocks panel
  statusFraction: 0.5, // share of the bottom width given to Status
};

export function loadLayout() {
  const saved = read(LAYOUT_KEY) || {};
  const layout = { ...DEFAULT_LAYOUT };
  for (const key of Object.keys(layout)) {
    if (typeof saved[key] === "number" && Number.isFinite(saved[key])) layout[key] = saved[key];
  }
  return layout;
}

export const saveLayout = (layout) => write(LAYOUT_KEY, layout);
