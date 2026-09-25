from flask import Flask, send_from_directory, jsonify, request
import yaml
import json
import os
import argparse

import get_grc_block_info as gbi


app = Flask(
    __name__,
    static_folder="../frontend/dist",
    static_url_path=""
)


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
    with open('grc_block_info.json', 'r') as f:        
        blocks = json.load(f)
    return blocks

# Flowgraph Run endpoint
@app.route("/run-flow", methods=["POST"])
def run_flow():
    flow_data = request.get_json()
    print("Received flow data:", flow_data)  # for debug
    # Here you could do actual processing instead of just printing
    return jsonify({"message": f"Flow received with {len(flow_data.get('nodes', []))} nodes"})
    
# Flowgraph Generate endpoint
@app.route("/api/generate", methods=["POST"])
def generate():
    flow = request.json
    # TODO: convert flow to GNU Radio Python
    return jsonify({"status": "ok"})

## Catch-all for React Router (optional)
#@app.route("/<path:path>")
#def catch_all(path):
#    if os.path.exists(os.path.join(app.static_folder, path)):
#        return send_from_directory(app.static_folder, path)
#    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5050)
    args = parser.parse_args()
    app.run(debug=True, port=args.port)
