# gr-web backend

Flask server that serves the built frontend and exposes the GNU Radio block
library and flowgraph endpoints.

## Running

From the project root:

    ./start.sh                          # port 5050, flowgraphs in ~/gr-web
    ./start.sh 8080                     # custom port
    ./start.sh --dir ~/gnuradio         # custom flowgraph folder

Or directly:

    python app.py --port 5050 --dir ~/gr-web

The flowgraph folder can also be set with the `GR_WEB_DIR` environment
variable; `--dir` takes precedence. It is created if it doesn't exist.

Then open http://localhost:5050. The frontend must be built first
(`npm run build` in `frontend/`); `start.sh` does this if `frontend/dist` is missing.

Requirements: `flask`, `pyyaml`.

## Endpoints

| Method | Path            | Description                                             |
|--------|-----------------|---------------------------------------------------------|
| GET    | `/`             | Serves `../frontend/dist/index.html`                    |
| GET    | `/api/blocks`   | Returns the block tree from `grc_block_info.json`       |
| GET    | `/api/files?path=`      | Lists sub-folders and `.grc` files in a folder  |
| POST   | `/api/files/mkdir`      | Creates a folder: `{path}`                      |
| GET    | `/api/flowgraph?path=`  | Opens a `.grc` file as `{blocks, connections}`  |
| POST   | `/api/flowgraph`        | Saves `{path, flow: {nodes, edges}, overwrite}` as `.grc`; 409 if it exists and `overwrite` is false |
| POST   | `/api/generate`         | Runs `grcc` on a saved `.grc`: `{path}` -> `{script, output}` |
| POST   | `/api/run`              | Generates and starts a saved `.grc`: `{path}`; 409 if one is already running |
| POST   | `/api/run/stop`         | Stops the running flowgraph                     |
| GET    | `/api/run/status?since=`| Run state and output lines numbered `>= since`  |

All `path` values are relative to the flowgraph folder. Paths that resolve
outside it (absolute paths, `..`, symlinks pointing elsewhere) are rejected, and
such symlinks are hidden from listings, so the web page can't read or write
anything else on the server.

## .grc files

`grc_file.py` converts between the frontend's flowgraph format and GRC's
YAML `.grc` format (GNU Radio 3.8+; the older XML format isn't supported).

- Parameters the user didn't change are filled in from the block defaults,
  plus the ones GRC adds itself (`comment`, `alias`, `affinity`,
  `minoutbuf`/`maxoutbuf`), so the file matches what GRC writes.
- Opening keeps each block's GRC states (enabled/disabled/bypassed, rotation),
  and parameters GRC wrote, so a file opened and saved again is unchanged.
- Unknown blocks, invalid or duplicate IDs, and connections to missing blocks
  return HTTP 400 with a message, shown in the Status panel.
- The files open in GNU Radio Companion and compile with `grcc -o <outdir> <file>.grc`.

The frontend's node format is described in `frontend/README.md`.

## Generating and running

`runner.py` runs `grcc -o <folder of the .grc> <file>.grc`, which writes the
Python script next to the `.grc` (hier blocks go where GRC puts them). Run then
starts the script using the flowgraph's Run Command option (default
`{python} -u {filename}`, with `{python}` being the server's interpreter), like
GRC does.

- One flowgraph runs at a time.
- stdout and stderr are collected (last 5000 lines); the frontend polls
  `/api/run/status` with the number of the next line it needs.
- stdin is kept open, so "Prompt for Exit" flowgraphs keep running until killed.
- Kill sends SIGTERM to the flowgraph's process group, then SIGKILL after 3 s.
  The running flowgraph is also stopped when the server exits normally.
- The flowgraph runs as the server's user, with the server's environment:
  QT GUI windows open on the server's display.

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
- `grc_file.py` – converts between frontend flowgraphs and `.grc` files
- `runner.py` – generates Python with `grcc` and runs flowgraphs
- `get_grc_block_info.py` – builds `grc_block_info.json` from GNU Radio's YAML files
- `grc_block_info.json` – generated block library served by `/api/blocks`
- `explore_grc_platform.py` – scratch script exploring GRC's `Platform` class as
  an alternative way to load blocks (requires GNU Radio's Python bindings)
