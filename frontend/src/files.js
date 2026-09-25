// Backend calls for browsing, opening and saving flowgraphs. All paths are
// relative to the server's flowgraph folder (./start.sh --dir, default ~/gr-web).

import { postJson, request } from "./api";

// -> { root, path, dirs: [name], files: [{ name, size, modified }] }
export const listFiles = (path = "") => request(`/api/files?path=${encodeURIComponent(path)}`);

export const makeFolder = (path) => postJson("/api/files/mkdir", { path });

// -> { path, blocks: [{ blockId, name, params, grcStates, position }], connections: [...] }
export const openFlowgraph = (path) => request(`/api/flowgraph?path=${encodeURIComponent(path)}`);

// Rejects with status 409 if the file exists and overwrite is false
export const saveFlowgraph = (path, flow, overwrite = false) => postJson("/api/flowgraph", { path, flow, overwrite });

export const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name);
export const dirName = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
export const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);
