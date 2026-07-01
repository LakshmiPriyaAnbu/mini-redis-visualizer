# mini-redis-visualizer
A Redis-inspired in-memory key-value store built with Node.js and Angular to visualize caching, command parsing, TTL expiry, and live memory state.

**Live demo:** https://mini-redis-visualizer.onrender.com

(Hosted on Render's free tier, which sleeps after ~15 minutes of inactivity — the first request after a quiet period can take 30-50s to wake it back up.)

## Structure

- `server/` — Express API with a real in-memory `Map` store, TTL sweep, and a `SET`/`GET`/`DEL`/`EXISTS`/`EXPIRE`/`TTL`/`KEYS`/`FLUSHALL` command parser.
- `client/` — Angular 19 app: Form Mode / Command Mode playground, live memory table, command history, and a plain-English explanation panel.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:4200. See `.claude/skills/run/SKILL.md` for details.

## Deploying

`render.yaml` deploys this as a single Render web service: it builds the Angular
client, then Express serves both the built UI and the `/api` routes from one
process/port — so the live in-memory store and TTL sweep behave the same in
production as they do locally. On [render.com](https://render.com), go to
**New +** → **Blueprint**, connect this GitHub repo, and Render will read
`render.yaml` and deploy it automatically. Or run the app anywhere else that
can run a long-lived Node process with `npm install && npm run build` as the
build step and `npm start` as the start command.
