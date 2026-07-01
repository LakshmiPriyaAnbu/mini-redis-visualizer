# mini-redis-visualizer
A Redis-inspired in-memory key-value store built with Node.js and Angular to visualize caching, command parsing, TTL expiry, and live memory state.

## Structure

- `server/` — Express API with a real in-memory `Map` store, TTL sweep, and a `SET`/`GET`/`DEL`/`EXISTS`/`EXPIRE`/`TTL`/`KEYS`/`FLUSHALL` command parser.
- `client/` — Angular 19 app: Form Mode / Command Mode playground, live memory table, command history, and a plain-English explanation panel.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:4200. See `.claude/skills/run/SKILL.md` for details.
