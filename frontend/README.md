# gr-web frontend

React + [React Flow](https://reactflow.dev) (v11) flowgraph editor, built with Vite.

## Development

    npm install
    npm run dev       # dev server with hot reload
    npm run build     # production build into dist/, served by the Flask backend
    npm run lint

The dev server proxies `/api` and `/run-flow` to the backend at
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

## Flowgraph data

Each React Flow node stores:

    data: {
      blockId: "analog_sig_source_x",   // GRC block id
      name: "analog_sig_source_x_0",    // instance name (GRC "ID")
      params: { type: "float" }         // only values changed from the defaults
    }

Handle ids follow GRC port keys: stream ports are numbered (`"0"`, `"1"`, ...)
and message ports use their id (`"cmd"`), so edges map directly onto `.grc`
connections.

## Keyboard

- Delete / Backspace – delete selected blocks and edges (the Options block can't be deleted)
- Ctrl+C / Ctrl+V (Cmd on macOS) – copy and paste blocks
