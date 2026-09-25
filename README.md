# gr-web

A browser-based version of GNU Radio Companion (GRC): build flowgraphs from the
installed GNU Radio blocks in a web page, backed by a Flask server.

## Quick start

    ./start.sh                     # http://localhost:5050, and from other computers
    ./start.sh 8080                # custom port
    ./start.sh --dir ~/gnuradio    # where flowgraphs are opened/saved (default ~/gr-web)
    ./start.sh --host 127.0.0.1    # this machine only
    ./start.sh --host 127.0.0.1 --debug   # auto-reload while developing the backend

`start.sh` builds the frontend if `frontend/dist` doesn't exist yet, then starts
the backend, which prints the addresses to open it from.

**Network access:** by default the server listens on all interfaces, so any
computer that can reach the port can use it, and can therefore run programs on
this machine as you (running a flowgraph executes its Run Command). Only do
this on a network you trust, never expose the port to the internet, and use
`--host 127.0.0.1` (this machine only) or `--host <one LAN address>` to limit
it. If a firewall is on, allow the port from your LAN, e.g.
`sudo ufw allow from 192.168.4.0/22 to any port 5050 proto tcp`. After changing frontend code, rebuild with `npm run build` in
`frontend/` (or use the dev server, below).

## Layout

- `frontend/` – React + React Flow editor (see [frontend/README.md](frontend/README.md))
    - build: `npm run build`
    - dev server with hot reload: `npm run dev` (proxies API calls to the backend on port 5050)
- `backend/` – Flask server and GNU Radio block library (see [backend/README.md](backend/README.md))
    - run directly: `python backend/app.py --port 5050 --dir ~/gr-web`

## Status

Working: block palette from the installed GNU Radio blocks, placing and wiring
blocks, editing parameters, copy/paste/delete, New / Open / Save / Save As for
`.grc` files in the server's flowgraph folder (`--dir`, default `~/gr-web`),
Generate / Run / Kill, and tabs, so several flowgraphs can be open and running
at once. Open tabs, including unsaved changes, survive a page refresh. Undo/redo,
and Declutter to lay out a flowgraph automatically. Files are compatible with GNU Radio Companion in both directions.

Flowgraphs run on the server, as the user running `start.sh`: QT GUI windows
open on the server's display (so on your desktop when running locally), and
SDR hardware needs the same permissions as when using GRC. Output appears in
the Status panel.
