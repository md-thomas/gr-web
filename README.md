# gr-web

A browser-based version of GNU Radio Companion (GRC): build flowgraphs from the
installed GNU Radio blocks in a web page, backed by a Flask server.

## Quick start

    ./start.sh          # http://localhost:5050
    ./start.sh 8080     # custom port

`start.sh` builds the frontend if `frontend/dist` doesn't exist yet, then starts
the backend. After changing frontend code, rebuild with `npm run build` in
`frontend/` (or use the dev server, below).

## Layout

- `frontend/` – React + React Flow editor (see [frontend/README.md](frontend/README.md))
    - build: `npm run build`
    - dev server with hot reload: `npm run dev` (proxies API calls to the backend on port 5050)
- `backend/` – Flask server and GNU Radio block library (see [backend/README.md](backend/README.md))
    - run directly: `python app.py --port 5050` (from inside `backend/`)

## Status

Working: block palette from the installed GNU Radio blocks, placing and wiring
blocks, editing parameters, copy/paste/delete, exporting the flowgraph as JSON.

Not yet: saving/loading `.grc` files, code generation, running flowgraphs. The
Generate, New and Load buttons only log to the browser console, and Run only
sends the flowgraph to the backend, which logs it.
