from flask import Flask, send_from_directory, jsonify, request
import yaml
import json
import os

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
@app.route("/api/get_blocks", methods=["GET"])
def get_blocks():
    """
    Load GNU RAdio Block YAML files and return a list of JSON-compatible dicts.
    """
    blocks = gbi.get_block_info() 
    return jsonify(blocks)
    
    # blocks = list()
    # GRC_BLOCKS_DIR = "/usr/share/gnuradio/grc/blocks"
    # if not os.path.isdir(GRC_BLOCKS_DIR):
    #     raise FileNotFoundError(f"GRC blocks directory not found: {GRC_BLOCKS_DIR}")

    # for filename in sorted(os.listdir(GRC_BLOCKS_DIR)):
    #     if not filename.endswith((".yml", ".yaml")):
    #         continue

    #     path = os.path.join(GRC_BLOCKS_DIR, filename)

    #     try:
    #         with open(path, "r") as f:
    #             block_data = yaml.safe_load(f)

    #         if not block_data:
    #             continue
            
    #         category = block_data.get("category")
    #         if not category:
    #             continue
    #         label = block_data.get("label")
    #         print(f"{category} | {label}")
    #         blocks.append({
    #             "file": filename,
    #             "id": block_data.get("id"),
    #             "label": block_data.get("label", block_data.get("id")),
    #             "category": block_data.get("category"),
    #             "flags": block_data.get("flags", []),
    #             "parameters": block_data.get("parameters", {}),
    #             "inputs": block_data.get("inputs", []),
    #             "outputs": block_data.get("outputs", []),
    #             "asserts": block_data.get("asserts", []),
    #             "templates": block_data.get("templates", []),
    #             "cpp_templates": block_data.get("cpp_templates", []),
    #             "documentation": block_data.get("documentation", None),
    #             "file_format": block_data.get("file_format", None),
    #             # "raw": block_data,   # full original YAML if you want it
    #         })

    #     except Exception as e:
    #         print(f"Failed to load {filename}: {e}")
    #         return []

    # return jsonify(blocks)

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
    app.run(debug=True)
