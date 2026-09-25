// Backend calls for generating and running saved flowgraphs.
// Paths are relative to the server's flowgraph folder.
import { postJson, request } from "./api";

// -> { script, output }: grcc writes the Python script next to the .grc
export const generateScript = (path) => postJson("/api/generate", { path });

// -> { output, state, lines, next }; rejects with status 409 if one is already running
export const runFlowgraph = (path) => postJson("/api/run", { path });

export const stopFlowgraph = () => postJson("/api/run/stop", {});

// -> { state: "idle" | "running" | "exited" | "killed", returncode, path, lines, next }
export const runStatus = (since = 0) => request(`/api/run/status?since=${since}`);
