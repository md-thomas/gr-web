from flask import Flask, send_from_directory, jsonify, request
import yaml
import json
import os
import argparse
import atexit
import socket
import sys

import get_grc_block_info as gbi
import grc_file
import runner

try:
    from gnuradio import gr
    GRC_VERSION = gr.version()
except ImportError:
    GRC_VERSION = "unknown"

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
BLOCK_INFO_FILE = os.path.join(BACKEND_DIR, "grc_block_info.json")
# Flowgraphs are opened from and saved under this folder (see --dir)
DEFAULT_ROOT = os.environ.get("GR_WEB_DIR", "~/gr-web")


app = Flask(
    __name__,
    static_folder="../frontend/dist",
    static_url_path=""
)


def set_flowgraph_root(path, create=True):
    root = os.path.realpath(os.path.expanduser(path))
    if create:
        os.makedirs(root, exist_ok=True)
    app.config["FLOWGRAPH_ROOT"] = root


set_flowgraph_root(DEFAULT_ROOT, create=False)


class PathError(ValueError):
    pass


def resolve_path(rel_path, grc_file_required=False):
    """
    Resolve a path relative to the flowgraph root, refusing anything that ends
    up outside it (absolute paths, "..", symlinks pointing elsewhere).
    """
    root = app.config["FLOWGRAPH_ROOT"]
    rel_path = (rel_path or "").strip().lstrip("/")
    full = os.path.realpath(os.path.join(root, rel_path))
    if os.path.commonpath([root, full]) != root:
        raise PathError(f"Path is outside the flowgraph folder: {rel_path}")
    if grc_file_required and not full.endswith(".grc"):
        raise PathError("File name must end in .grc")
    return full


def rel_to_root(full):
    rel = os.path.relpath(full, app.config["FLOWGRAPH_ROOT"])
    return "" if rel == "." else rel


def error(message, status=400):
    return jsonify({"status": "error", "message": message}), status


def load_block_defs():
    with open(BLOCK_INFO_FILE, 'r') as f:
        return grc_file.index_blocks(json.load(f))


# Default endpoint
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

# Get Blocks endpoint
@app.route("/api/blocks", methods=["GET"])
def get_blocks():
    """
    Load GNU RAdio Block YAML files and return a list of JSON-compatible dicts.
    """
    with open(BLOCK_INFO_FILE, 'r') as f:
        blocks = json.load(f)
    return blocks

# Running flowgraphs, one per .grc file
flowgraph_runs = runner.RunManager()
atexit.register(flowgraph_runs.stop_all)


def saved_grc_path(body):
    """Resolve and check the path of a saved .grc file from a request body."""
    path = resolve_path(body.get("path"), grc_file_required=True)
    if not os.path.isfile(path):
        raise PathError(f"File not found: {rel_to_root(path)} (save it first)")
    return path

# Generate Python from a saved .grc: {path}
@app.route("/api/generate", methods=["POST"])
def generate():
    try:
        path = saved_grc_path(request.get_json() or {})
        script, output = runner.generate(path)
    except (PathError, runner.RunError) as e:
        return error(str(e))
    return jsonify({"status": "ok", "script": script, "output": output})

# Generate and run a saved .grc: {path}. 409 if that file is already running.
@app.route("/api/run", methods=["POST"])
def run_flowgraph():
    try:
        path = saved_grc_path(request.get_json() or {})
    except PathError as e:
        return error(str(e))
    rel_path = rel_to_root(path)
    try:
        output = flowgraph_runs.start(path, rel_path)
    except runner.RunError as e:
        status = 409 if "already running" in str(e) else 400
        return error(str(e), status)
    return jsonify({"status": "ok", "output": output, **flowgraph_runs.get(rel_path).status()})

# Stop a running flowgraph: {path}
@app.route("/api/run/stop", methods=["POST"])
def stop_flowgraph():
    path = (request.get_json() or {}).get("path")
    if not flowgraph_runs.stop(path):
        return error(f"{path} is not running", 409)
    return jsonify({"status": "ok"})

# Run state and output lines numbered >= since: ?path=<.grc>&since=<n>
@app.route("/api/run/status", methods=["GET"])
def run_status():
    run = flowgraph_runs.get(request.args.get("path"))
    if run is None:
        return error("No run for that flowgraph", 404)
    return jsonify(run.status(request.args.get("since", 0, type=int)))

# Paths of the flowgraphs that are running
@app.route("/api/runs", methods=["GET"])
def list_runs():
    return jsonify({"running": flowgraph_runs.running()})

# List a folder under the flowgraph root: ?path=<relative folder>
@app.route("/api/files", methods=["GET"])
def list_files():
    try:
        folder = resolve_path(request.args.get("path"))
    except PathError as e:
        return error(str(e))
    if not os.path.isdir(folder):
        return error(f"Folder not found: {rel_to_root(folder)}", 404)

    dirs, files = [], []
    for entry in sorted(os.scandir(folder), key=lambda e: e.name.lower()):
        if entry.name.startswith("."):
            continue
        # Hide symlinks that lead outside the root
        root = app.config["FLOWGRAPH_ROOT"]
        if os.path.commonpath([root, os.path.realpath(entry.path)]) != root:
            continue
        if entry.is_dir():
            dirs.append(entry.name)
        elif entry.name.endswith(".grc"):
            stat = entry.stat()
            files.append({"name": entry.name, "size": stat.st_size, "modified": stat.st_mtime})
    return jsonify({"root": app.config["FLOWGRAPH_ROOT"], "path": rel_to_root(folder), "dirs": dirs, "files": files})

# Create a folder: {path}
@app.route("/api/files/mkdir", methods=["POST"])
def make_folder():
    try:
        folder = resolve_path((request.get_json() or {}).get("path"))
    except PathError as e:
        return error(str(e))
    if os.path.exists(folder):
        return error(f"Already exists: {rel_to_root(folder)}", 409)
    os.makedirs(folder)
    return jsonify({"status": "ok", "path": rel_to_root(folder)})

# Open a .grc file: ?path=<relative file>
@app.route("/api/flowgraph", methods=["GET"])
def open_flowgraph():
    try:
        path = resolve_path(request.args.get("path"), grc_file_required=True)
    except PathError as e:
        return error(str(e))
    if not os.path.isfile(path):
        return error(f"File not found: {rel_to_root(path)}", 404)
    with open(path, 'r') as f:
        text = f.read()
    try:
        flowgraph = grc_file.parse_grc(text)
    except grc_file.FlowgraphError as e:
        return error(str(e))
    except (KeyError, TypeError, ValueError) as e:
        return error(f"Unsupported .grc contents: {e}")
    return jsonify({"status": "ok", "path": rel_to_root(path), **flowgraph})

# Save a flowgraph as .grc: {path, flow: {nodes, edges}, overwrite}
# Returns 409 if the file exists and overwrite is false.
@app.route("/api/flowgraph", methods=["POST"])
def save_flowgraph():
    body = request.get_json() or {}
    try:
        path = resolve_path(body.get("path"), grc_file_required=True)
    except PathError as e:
        return error(str(e))
    if os.path.exists(path) and not body.get("overwrite"):
        return error(f"{rel_to_root(path)} already exists", 409)
    if not os.path.isdir(os.path.dirname(path)):
        return error(f"Folder not found: {rel_to_root(os.path.dirname(path))}", 404)

    try:
        _, grc = grc_file.build_grc(body.get("flow") or {}, load_block_defs(), GRC_VERSION)
    except grc_file.FlowgraphError as e:
        return error(str(e))

    with open(path, 'w') as f:
        f.write(grc_file.dump_grc(grc))
    return jsonify({"status": "ok", "path": rel_to_root(path), "fullPath": path})

## Catch-all for React Router (optional)
#@app.route("/<path:path>")
#def catch_all(path):
#    if os.path.exists(os.path.join(app.static_folder, path)):
#        return send_from_directory(app.static_folder, path)
#    return send_from_directory(app.static_folder, "index.html")


LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")


def lan_addresses():
    """This machine's IPv4 addresses other than loopback, for printing URLs."""
    addresses = set()
    try:
        # Connecting a UDP socket sends nothing; it just picks the outgoing interface
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 9))
            addresses.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addresses.add(info[4][0])
    except OSError:
        pass
    return sorted(a for a in addresses if not a.startswith("127."))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5050)
    parser.add_argument("--host", default=os.environ.get("GR_WEB_HOST", "0.0.0.0"),
                        help="address to listen on (default: 0.0.0.0, all interfaces, or $GR_WEB_HOST); "
                             "use 127.0.0.1 to allow this machine only")
    parser.add_argument("--dir", default=DEFAULT_ROOT,
                        help="folder flowgraphs are opened from and saved to (default: ~/gr-web, or $GR_WEB_DIR)")
    parser.add_argument("--debug", action="store_true",
                        help="Flask debug mode (auto-reload and in-browser debugger); only with --host 127.0.0.1")
    args = parser.parse_args()

    # The debugger can run arbitrary Python, so never expose it to the network
    if args.debug and args.host not in LOOPBACK_HOSTS:
        sys.exit("--debug is only allowed with --host 127.0.0.1: the Flask debugger can run code")

    set_flowgraph_root(args.dir)
    print(f"Flowgraph folder: {app.config['FLOWGRAPH_ROOT']}")
    if args.host in ("0.0.0.0", "::"):
        urls = [f"http://{a}:{args.port}" for a in ["localhost", *lan_addresses()]]
        print("Open gr-web at: " + "  ".join(urls))
        print("Anyone who can reach this port can open, save and run flowgraphs as this user.")
    app.run(host=args.host, port=args.port, debug=args.debug)
