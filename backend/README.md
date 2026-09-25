# gr-web backend

Flask server that serves the built frontend and exposes the GNU Radio block
library and flowgraph endpoints.

## Running

From the project root:

    ./start.sh          # port 5050
    ./start.sh 8080     # custom port

Or directly, from this directory (the block JSON is loaded by relative path):

    python app.py --port 5050

Then open http://localhost:5050. The frontend must be built first
(`npm run build` in `frontend/`); `start.sh` does this if `frontend/dist` is missing.

Requirements: `flask`, `pyyaml`.

## Endpoints

| Method | Path            | Description                                             |
|--------|-----------------|---------------------------------------------------------|
| GET    | `/`             | Serves `../frontend/dist/index.html`                    |
| GET    | `/api/blocks`   | Returns the block tree from `grc_block_info.json`       |
| POST   | `/run-flow`     | Accepts `{nodes, edges}`; currently only logs it        |
| POST   | `/api/generate` | Placeholder, not yet called by the frontend             |

Nothing is saved on the server yet: there is no `.grc` output or code
generation. The frontend's node format is described in `frontend/README.md`.

## Block library

`grc_block_info.json` is a static snapshot of the installed GNU Radio blocks,
generated from the `*.block.yml` and `*.tree.yml` files in
`/usr/share/gnuradio/grc/blocks`:

    python get_grc_block_info.py > grc_block_info.json

Regenerate it after upgrading GNU Radio. Blocks flagged `hide` are skipped.

The output is a nested category tree. Each level can hold subcategories and a
`_blocks` list:

    {
      "Core": {
        "Audio": {
          "_blocks": [
            {
              "id": "...", "label": "...", "category": "...",
              "parameters": [...], "inputs": [...], "outputs": [...],
              "asserts": [...], "templates": {...}, "cpp_templates": {...},
              "documentation": ..., "file_format": ..., "flags": [...],
              "file": "<source .block.yml>"
            }
          ]
        }
      }
    }

## Files

- `app.py` – Flask app and API routes
- `get_grc_block_info.py` – builds `grc_block_info.json` from GNU Radio's YAML files
- `grc_block_info.json` – generated block library served by `/api/blocks`
- `explore_grc_platform.py` – scratch script exploring GRC's `Platform` class as
  an alternative way to load blocks (requires GNU Radio's Python bindings)
