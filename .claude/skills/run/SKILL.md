---
name: run
description: Launch the MiniRedis Visualizer (Express API + Angular client) for local development or manual verification.
---

# Running MiniRedis Visualizer

This is an npm workspaces monorepo with two packages:

- `server/` — Express backend. Holds the real in-memory MiniRedis store (a `Map`) with a TTL sweep, a command parser (`SET`, `GET`, `DEL`, `EXISTS`, `EXPIRE`, `TTL`, `KEYS`, `FLUSHALL`), and a small REST API under `/api`.
- `client/` — Angular 19 standalone-component app implementing the MiniRedis Visualizer UI (Form Mode / Command Mode playground, live memory table, command history, architecture explainer, concept cards).

## First-time setup

From the repo root:

```
npm install
```

This installs the root, `server`, and `client` workspaces in one pass (npm workspaces).

## Start both apps together (recommended)

```
npm run dev
```

- Express API: http://localhost:4000 (health check at `/api/health`)
- Angular dev server: http://localhost:4200 (proxies `/api/*` to the Express server — see `client/proxy.conf.json`)

Open http://localhost:4200 in a browser to use the app. The Angular UI polls `GET /api/store` every second, matching the design's "auto-refreshing every 1s" behavior.

## Start individually

```
npm run dev -w server     # Express only, with --watch reload, on :4000
npm start -w client       # Angular only, on :4200 (expects the API already running for full functionality)
```

## Verifying it works

1. Run `npm run dev` and wait for both `[SERVER]` (`MiniRedis API listening on :4000`) and `[CLIENT]` (`Application bundle generation complete`) log lines.
2. `curl -s localhost:4000/api/health` should return `{"ok":true}`.
3. `curl -s -X POST localhost:4000/api/command -H 'content-type: application/json' -d '{"command":"SET demo hello"}'` should return a JSON result with `status: "success"`.
4. In the browser at :4200, use Command Mode to run `SET demo hello` then `TTL demo` — the Live Memory Store table and Command History should update within ~1s.

## Running as a single combined service (production / hosting)

```
npm run build   # builds the Angular client to client/dist/client/browser
npm start       # starts Express, which now also serves the built client
```

`server/src/index.js` detects the built client and serves it (static files +
SPA fallback) from the same Express process, on `PORT` (default 4000). This
is the mode Render (see `render.yaml`) and most Node hosts run — one process,
one port, one URL, so the live in-memory store and TTL sweep work exactly as
they do in local dev (no separate stateless function runtime involved).
