# Architecture — a beginner's tour of this codebase

This document explains how MiniRedis Visualizer is put together, file by
file, assuming no prior context. If you've never touched this repo before,
start here.

## The one-sentence mental model

There are two programs running: a small **Node.js/Express server** that
holds a real key-value store in memory (a JavaScript `Map`, just like real
Redis holds data in RAM), and an **Angular web app** that shows you that
store live in a browser and lets you poke at it — either by filling in a
form, or by typing Redis-style commands into a fake terminal. The browser
talks to the server over plain HTTP (`fetch`/`XMLHttpRequest` under the
hood, via Angular's `HttpClient`).

```
 ┌─────────────────────────┐        HTTP (JSON)        ┌───────────────────────────┐
 │   Angular app (browser) │  ───────────────────────▶ │   Express server (Node)   │
 │   "the UI you click on" │  ◀─────────────────────── │   "the actual database"   │
 └─────────────────────────┘                            └───────────────────────────┘
                                                                     │
                                                          holds a real JS Map
                                                          in server memory,
                                                          with a timer that
                                                          deletes expired keys
                                                          once a second
```

Nothing is saved to disk anywhere. If the server restarts, the store is
empty again — exactly like Redis run without persistence turned on.

## Folder layout

```
mini-redis-visualizer/
├── server/                  ← the backend (Node.js + Express)
│   ├── package.json
│   └── src/
│       ├── store.js         ← the actual in-memory database
│       ├── commands.js      ← turns a command string like "SET x y" into an action
│       ├── routes.js        ← the HTTP endpoints (the "API")
│       └── index.js         ← starts everything up
│
├── client/                  ← the frontend (Angular)
│   ├── package.json
│   ├── angular.json         ← Angular CLI's build configuration
│   ├── proxy.conf.json      ← dev-only: forwards /api calls to :4000
│   └── src/
│       ├── index.html       ← the single HTML page the browser loads
│       ├── main.ts          ← boots the Angular app into that HTML page
│       ├── styles.css       ← global CSS (fonts, colors, resets, animations)
│       └── app/
│           ├── app.component.ts/html/css   ← the root component, lays out the page
│           ├── app.config.ts               ← app-wide setup (enables HttpClient)
│           ├── core/                       ← shared logic, no UI
│           │   ├── models.ts               ← TypeScript shapes for our data
│           │   ├── redis-api.service.ts    ← the only file that calls the server
│           │   └── app-state.service.ts    ← all app state + business logic lives here
│           └── components/                 ← one folder per visual section
│               ├── header/                 ← top bar with logo + live key count
│               ├── hero/                   ← big headline + feature badges
│               ├── playground/             ← the Form Mode / Command Mode UI
│               ├── explanation-panel/      ← "What just happened?" box
│               ├── memory-store/           ← the live key/value table
│               ├── command-history/        ← the running log of commands
│               ├── architecture/           ← the dark "How it works" band
│               ├── concepts/               ← the 5 "Redis, in five ideas" cards
│               ├── footer/                 ← page footer
│               └── toast-container/        ← the little pop-up notifications
│
├── render.yaml               ← tells Render.com how to build & run this in production
├── package.json               ← the root: npm workspaces + `npm run dev` / `npm start`
└── .claude/skills/run/SKILL.md ← instructions for launching the app (for Claude Code)
```

`package.json` at the repo root uses **npm workspaces** to treat `server/`
and `client/` as two sub-projects that share one `npm install`.

---

## How the server actually works

Read these four files in this order — each one builds on the last.

### 1. `server/src/store.js` — the database itself

This is the whole "database." It's a class wrapping one JavaScript `Map`:

```js
class MiniRedisStore {
  constructor() {
    this.map = new Map();   // key (string) -> { value, expiresAt, createdAt }
  }
  set(key, value) { ... }
  get(key) { ... }
  del(key) { ... }
  expire(key, seconds) { ... }   // sets entry.expiresAt = Date.now() + seconds*1000
  ttl(key) { ... }               // returns seconds remaining, or -1/-2
  sweep() { ... }                // deletes any entry whose expiresAt has passed
  serialize() { ... }            // turns the Map into a plain array for the API
}
```

The important trick for TTL (time-to-live): a key with an expiry doesn't get
deleted the instant it's set to expire. Instead, `sweep()` is called once a
second (see `index.js`) and walks every entry, deleting the ones whose time
is up. This is the same "active expiry" idea real Redis uses.

### 2. `server/src/commands.js` — understanding a typed command

This file has exactly one function: `executeCommand(store, "SET foo bar")`.
It splits the string on whitespace, uppercases the first word, and runs a
`switch` on it (`SET`, `GET`, `DEL`, `EXISTS`, `EXPIRE`, `TTL`, `KEYS`,
`FLUSHALL`). Each branch calls the matching method on the `store` from step
1, and returns an object like:

```js
{
  status: 'success',                       // or 'error'
  text: 'OK',                              // what a real redis-cli would print
  explanation: 'You stored a key "foo"...' // plain-English, shown in the UI
  toast: { type: 'success', message: 'Key stored successfully' }
}
```

Notice `explanation` and `toast` are computed **here**, on the server — not
guessed at by the frontend. The server is the only place that actually knows
what happened (did the key already exist? was it deleted?), so it's the only
place that can honestly describe it.

### 3. `server/src/routes.js` — the API surface

This turns `commands.js` and `store.js` into HTTP endpoints using Express:

- `GET /api/health` → `{ ok: true }` (just proves the server is up)
- `GET /api/store` → the full current key list, as JSON
- `POST /api/command` with body `{ "command": "SET foo bar" }` → runs it and
  returns the result object shown above

That's the entire API. Three endpoints.

### 4. `server/src/index.js` — wiring it all together

This is what actually runs when you type `node server/src/index.js`:

1. Creates one `MiniRedisStore` (step 1) — this lives for as long as the
   server process is alive.
2. Calls `store.sweep()` every 1000ms with `setInterval` — the background
   TTL eviction loop.
3. Creates an Express `app`, mounts the routes from step 3 under `/api`.
4. **Production trick:** if it finds a built Angular app at
   `client/dist/client/browser` (i.e. someone already ran `npm run build`),
   it also serves that folder as static files, and sends `index.html` for
   any other URL. This is what lets one single process serve both the
   website and the API on Render — see "Deploying" in the README.
5. `app.listen(PORT)` — starts accepting requests.

---

## How the client (Angular) actually works

### The state pattern this app uses

Instead of passing data through many layers of components, almost
everything lives in **one shared service**:
`client/src/app/core/app-state.service.ts`. Any component can inject it and
read/write the same live state. This is simple enough for an app this size
and avoids prop-drilling through 10 components.

It uses Angular **signals** (`signal(...)`, `computed(...)`) — think of a
signal as a box holding a value that automatically tells every part of the
UI reading it to re-render when it changes. `readonly mode = signal('form')`
means "there's a current mode, start it at `'form'`, and re-render anything
that displays it whenever it changes."

### 1. `core/models.ts` — the shapes of our data

Plain TypeScript `interface`s: `StoreEntry` (one row from the server),
`CommandResult` (one API response), `HistoryEntry`, `Toast`, etc. No logic,
just names for the JSON shapes flowing around, so TypeScript can catch typos.

### 2. `core/redis-api.service.ts` — the only file that talks to the server

Two methods:

```ts
getStore(): Observable<StoreEntry[]>          // GET /api/store
runCommand(command: string): Observable<CommandResult>  // POST /api/command
```

Every other file in the client goes through this — nothing else makes raw
HTTP calls. That means if the API ever moves or changes shape, this is the
only file that needs to change.

### 3. `core/app-state.service.ts` — the brain of the app

This is the biggest file, worth reading top to bottom. What it holds:

- **Raw state**: `mode`, `storeRows`, `history`, `toasts`, `explanation`,
  `cmdResult`, plus the Form Mode fields (`formKey`, `formValue`, etc.) and
  the Command Mode field (`cmdInput`).
- **Computed/derived state**: things like `rows` (the raw store entries
  reshaped with colors/labels for the table), `keyCount`, `isEmpty`,
  `historyRows` (reversed, newest first). These recompute automatically
  whenever their inputs change — you never manually "refresh" them.
- **Polling**: in the constructor, `interval(1000).subscribe(() =>
  this.refreshStore())` — every second it re-fetches `/api/store` and
  compares the new key list to the old one. If a key that had a TTL just
  disappeared and *wasn't* something the user just deleted on purpose, it
  shows the "expired and removed" toast. That's how the app knows the
  difference between "you deleted this" and "this timed out."
- **Actions**: methods like `saveForm()`, `flushAll()`, `exec(raw)`,
  `deleteKey(key)` — these are what the UI calls when you click a button.
  They call `redis-api.service.ts`, then update the local signals with the
  result (push to history, show a toast, update the explanation panel).

If you want to trace "what happens when I click Save to Cache", start at
`saveForm()` in this file.

### 4. The components — one folder per visible section

Every folder under `components/` follows the same three-file pattern:

- `*.component.ts` — a small class, usually just
  `constructor(public state: AppStateService) {}` so the template can read
  `state.xyz()` directly.
- `*.component.html` — the template. Uses Angular's built-in `@if` / `@for`
  blocks (no extra imports needed) instead of the older `*ngIf`/`*ngFor`.
- `*.component.css` — styles scoped to just that component (Angular
  automatically prevents them leaking into other components).

Which component does what:

| Component | What it shows |
|---|---|
| `header` | Logo, title, and the live "N keys" pill (reads `state.keyCount()`) |
| `hero` | Big headline + the row of feature badges (static content) |
| `playground` | The Form Mode / Command Mode tab switcher and both modes' UI — the most interactive component |
| `explanation-panel` | The "What just happened?" box, reads `state.explanation()` |
| `memory-store` | The live table, reads `state.rows()`, has the delete (✕) button per row |
| `command-history` | The scrolling list of past commands, reads `state.historyRows()` |
| `architecture` | The dark "How it works" band — static content describing the 5-step flow |
| `concepts` | The 5 "Redis, in five ideas" teaching cards — static content |
| `footer` | Page footer — static content |
| `toast-container` | Renders `state.toastsView()` as pop-ups fixed to the bottom-right |

`app.component.html` is the top-level template that arranges all of these
into the page layout (two-column grids for playground/explanation and
store/history, then the stacked sections below).

### 5. How a click actually reaches the server — full trace

Example: you're in Command Mode, type `SET user Priya`, and click **Run**.

1. `playground.component.html`'s Run button calls `state.runCmd()`.
2. `app-state.service.ts`'s `runCmd()` reads `cmdInput()`, calls
   `this.exec(raw)`.
3. `exec()` calls `this.api.runCommand(trimmed)` —
   `core/redis-api.service.ts` — which does
   `POST http://localhost:4200/api/command` (or straight to the deployed
   URL in production, since it's one origin there).
4. In dev, Angular's dev server proxy (`client/proxy.conf.json`) forwards
   that `/api/*` request to `http://localhost:4000`, where Express is
   listening.
5. `server/src/routes.js` receives it, calls `executeCommand(store, "SET
   user Priya")` from `commands.js`.
6. `commands.js` calls `store.set('user', 'Priya')` from `store.js` — the
   `Map` is mutated right there, in server memory.
7. The result JSON (`{status, text, explanation, toast}`) travels back
   through the same chain.
8. Back in `exec()`, the app updates `cmdResult`, pushes a `history` entry,
   sets the `explanation`, fires the `toast`, and calls `refreshStore()` to
   pull the fresh table immediately (rather than waiting up to 1s for the
   next poll tick).
9. Because all of those are signals, every component reading them
   (`memory-store`, `command-history`, `explanation-panel`,
   `toast-container`) re-renders automatically — no one had to be told to.

Every other action in the app (Form Mode save, Flush All, row delete, TTL
countdown) follows this same shape: UI event → a method on
`AppStateService` → `RedisApiService` → Express route → `commands.js` →
`store.js`, and the response flows back up through signals into the DOM.

---

## How it's built and deployed

- **Local development** (`npm run dev`): runs Express on `:4000` and
  Angular's *dev server* (with hot-reload) on `:4200` at the same time,
  using `concurrently`. The Angular dev server proxies `/api` calls to
  Express so the browser only ever talks to one origin, `:4200`.
- **Production** (`npm run build && npm start`, which is what `render.yaml`
  tells Render to do): `npm run build` compiles the Angular app into static
  HTML/JS/CSS files under `client/dist/client/browser`. `npm start` then
  just runs `server/src/index.js`, which — as described above — notices
  that folder exists and serves it directly. One process, one port, one
  URL, and the in-memory store / TTL timer keep behaving exactly like they
  do locally (unlike a "serverless" deploy, where the process doesn't stay
  alive between requests and the `Map` would keep resetting).

## Where to make a change

- **Add a new Redis-like command** (e.g. `INCR`) → add a `case 'INCR':` in
  `server/src/commands.js`, add any needed method to
  `server/src/store.js`. Nothing on the client needs to change — it already
  displays whatever `text`/`explanation`/`toast` the server sends back.
- **Change what the table/history looks like** → edit
  `client/src/app/components/memory-store/` or `command-history/` (template
  + CSS only; the data shape comes from `app-state.service.ts`).
- **Change the copy/wording of an explanation** → edit the matching `case`
  in `server/src/commands.js` (for command mode) or `saveForm()` /
  `flushAll()` in `app-state.service.ts` (for form mode, since those bypass
  the generic command explanation to show custom wording).
- **Add a brand-new page section** → make a new folder under
  `client/src/app/components/`, following the same three-file pattern, then
  add `<app-your-thing>` to `app.component.html` and import it in
  `app.component.ts`.
