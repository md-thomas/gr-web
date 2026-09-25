# gr-web frontend

React + [React Flow](https://reactflow.dev) (v11) flowgraph editor, built with Vite.

## Development

    npm install
    npm run dev       # dev server with hot reload
    npm run build     # production build into dist/, served by the Flask backend
    npm run lint

The dev server proxies `/api` to the backend at
`http://localhost:5050`; set `BACKEND_URL` to point elsewhere
(e.g. `BACKEND_URL=http://localhost:8080 npm run dev`).

## How blocks work

Blocks are data-driven: nothing is hand-written per GNU Radio block. The block
library is fetched from `/api/blocks` (generated from GNU Radio's block YAML,
see `backend/README.md`), and a single generic node renders any block from its
definition. Updating GNU Radio only requires regenerating the backend's block
JSON.

- **`src/blocks/registry.js`** – maps block ids to node components. Every block
  uses `GenericBlockNode` unless it has an entry in `blockOverrides`:

      export const blockOverrides = {
        options: OptionsNode,
        variable: VariableNode,
      };

  To give a block a custom look, write a component and add it here.
- **`src/components/GenericBlockNode.jsx`** – draws a block: title, the
  parameters GRC would show on the block, and ports colored by type
  (dashed = optional, grey = message).
- **`src/blocks/blockModel.js`** – interprets a block definition against a
  node's parameter values: defaults, port resolution (types, multiplicity,
  hidden ports), parameter visibility, display formatting, and GRC-style
  instance names (`analog_sig_source_x_0`).
- **`src/blocks/expr.js`** – a small, safe evaluator for the Python subset used
  in block YAML templates (`${ 'part' if vlen == 1 else 'none' }`,
  `${ type.size }`, `${ num_inputs }`, ...). Expressions it can't handle fall
  back to defaults rather than failing.
- **`src/blocks/BlockLibrary.jsx`** / **`useBlockLibrary.js`** – loads
  `/api/blocks` and provides it via context (`useBlockLibrary`, `useBlockDef`).
- **`src/components/BlockPalette.jsx`** – searchable category tree; drag a
  block onto the canvas or double-click to add it.
- **`src/components/BlockInspector.jsx`** – the Block Properties panel; edits
  the selected block's ID and parameters.

## Tabs

Each open flowgraph is a tab (`src/App.jsx`), and each tab is a complete
`src/FlowEditor.jsx`: toolbar, canvas, status output and properties. All tabs
stay mounted, so a flowgraph in a background tab keeps running and collecting
output.

- New and **+** open a new tab; Open opens the file in a new tab (reusing the
  current tab if it's an untouched new one), or switches to it if it's already
  open.
- Tabs show `*` for unsaved changes and a green `●` while running.
- Closing a tab (× or middle-click) asks first if it has unsaved changes or is
  running; closing a running tab kills its flowgraph.
- Copy/paste works between tabs.
- Open tabs survive a page refresh (`src/session.js`): each tab's blocks,
  wires, file, unsaved changes and view are kept in the browser's
  localStorage, and tabs whose flowgraph is still running reattach to it (a
  running flowgraph with no tab gets one). Status messages aren't kept, but a
  running flowgraph's output is fetched again from the server. The tabs are
  per browser: another browser or a private window starts fresh, and if the
  `.grc` changes on disk the restored tab still shows its own copy.

## Files

New / Open… / Save / Save As… work on `.grc` files in the server's flowgraph
folder (`./start.sh --dir`, default `~/gr-web`). A file can only be open in one
tab at a time.

- **`src/files.js`** – backend calls for listing folders and opening/saving.
- **`src/components/FileDialog.jsx`** – folder browser used by Open and Save As
  (breadcrumbs, New Folder, asks before replacing an existing file).
- **`src/components/Modal.jsx`** – modal and confirm dialogs.

Save writes to the current file without asking; Save As asks before replacing
a different file. The toolbar shows the current file, with `*` when there are
unsaved changes. Unsaved changes are kept across page refreshes (see Tabs).

## Generate / Run / Kill

- **Generate** saves (if there are unsaved changes; asking where if the
  flowgraph has never been saved), then runs `grcc` on the server, which writes
  the `.py` next to the `.grc`.
- **Run** does the same and starts the flowgraph. Its output streams into the
  Status panel (polled every 500 ms); the toolbar shows "● running" and Run is
  disabled until it finishes.
- **Kill** stops it.

Each tab runs its own flowgraph, so several can run at once. `grcc` validation
errors and Python tracebacks appear in that tab's Status panel.

- **`src/run.js`** – backend calls for generate/run/stop/status.
- **`src/components/StatusPanel.jsx`** – status messages and flowgraph output;
  stays scrolled to the bottom unless you scroll up.

## Flowgraph data

Each React Flow node stores:

    data: {
      blockId: "analog_sig_source_x",   // GRC block id
      name: "analog_sig_source_x_0",    // instance name (GRC "ID")
      params: { type: "float" },        // only values changed from the defaults
      grcStates: { state: "disabled" }  // optional, kept from an opened .grc
    }

Handle ids follow GRC port keys: stream ports are numbered (`"0"`, `"1"`, ...)
and message ports use their id (`"cmd"`), so edges map directly onto `.grc`
connections.

## Keyboard

- Delete / Backspace – delete selected blocks and edges (the Options block can't be deleted)
- Ctrl+C / Ctrl+V (Cmd on macOS) – copy and paste blocks
