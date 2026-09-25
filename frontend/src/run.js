// Backend calls for generating and running saved flowgraphs. Paths are
// relative to the server's flowgraph folder; each file can run once at a time.
import { postJson, request } from "./api";

// -> { script, output }: grcc writes the Python script next to the .grc
export const generateScript = (path) => postJson("/api/generate", { path });

// -> { output, state, lines, next }; rejects with status 409 if that file is already running
export const runFlowgraph = (path) => postJson("/api/run", { path });

export const stopFlowgraph = (path) => postJson("/api/run/stop", { path });

// -> { state: "running" | "exited" | "killed", returncode, path, lines, next }
export const runStatus = (path, since = 0) =>
  request(`/api/run/status?path=${encodeURIComponent(path)}&since=${since}`);

// -> { running: [path] }
export const listRuns = () => request("/api/runs");
