from flask import Flask, send_from_directory, jsonify, request
import os

app = Flask(
    __name__,
    static_folder="../frontend/dist",
    static_url_path=""
)

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/run-flow", methods=["POST"])
def run_flow():
    flow_data = request.get_json()
    print("Received flow data:", flow_data)  # for debug
    # Here you could do actual processing instead of just printing
    return jsonify({"message": f"Flow received with {len(flow_data.get('nodes', []))} nodes"})
    
# Example API endpoint
@app.route("/api/generate", methods=["POST"])
def generate():
    flow = request.json
    # TODO: convert flow to GNU Radio Python
    return jsonify({"status": "ok"})

# Catch-all for React Router (optional)
@app.route("/<path:path>")
def catch_all(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")




if __name__ == "__main__":
    app.run(debug=True)
