# mini-redis-visualizer
A Redis-inspired in-memory key-value store built with Node.js and Angular to visualize caching, command parsing, TTL expiry, and live memory state.

**Live demo:** https://mini-redis-visualizer.onrender.com

(Hosted on Render's free tier, which sleeps after ~15 minutes of inactivity — the first request after a quiet period can take 30-50s to wake it back up.)

## Structure

- `server/` — Express API with a real in-memory `Map` store, TTL sweep, and a command parser supporting strings (`SET`/`GET`/`DEL`/`EXISTS`/`EXPIRE`/`TTL`/`KEYS`/`FLUSHALL`), lists (`LPUSH`/`RPUSH`/`LPOP`/`RPOP`), hashes (`HSET`/`HGET`), and sets (`SADD`/`SMEMBERS`) — with real Redis-style `WRONGTYPE` errors when a command is used against the wrong kind of key.
- `client/` — Angular 19 app: Form Mode / Command Mode / Data Types playground, a live memory table (each row's type shown as a colored badge under its key), command history with JSON export, and a plain-English explanation panel.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:4200. See `.claude/skills/run/SKILL.md` for details.

## Testing it yourself (manual verification guide)

Everything below can be done either on the [live demo](https://mini-redis-visualizer.onrender.com)
or on `http://localhost:4200` after running `npm run dev`. Each step says
exactly what to type/click and what you should see.

### 1. Sanity check the API is alive

```
curl https://mini-redis-visualizer.onrender.com/api/health
```
Expect: `{"ok":true}`

### 2. Form Mode — add a key with no expiry

1. On the page, make sure the **Form Mode** tab is selected (it's the default).
2. In the **Key** field, type: `user:1`
3. In the **Value** field, type: `Priya`
4. Leave **Expiry (TTL)** as `No expiry (∞)`.
5. Click **Save to Cache**.

Expect:
- A green "Key stored successfully" toast appears bottom-right.
- The **Live Memory Store** table now shows a row: `user:1 | Priya | ∞ | Active`.
- **Command History** shows a new entry `SET user:1 Priya → OK`.
- The **"What just happened?"** panel explains what MiniRedis just did.
- A "Generated commands" box appears under the form showing `$ SET user:1 Priya`.

### 3. Form Mode — add a key with a TTL

1. Key: `otp`, Value: `123456`.
2. Expiry (TTL): choose `10 seconds`.
3. Click **Save to Cache**.

Expect:
- Table shows a second row `otp | 123456 | 10s | Active`, and the TTL column
  counts down every second.
- Once the countdown reaches ≤10s it always shows the amber **Expiring** status
  (that's this app's threshold, not a bug — it's inherent to a 10s TTL).
- After it hits 0, the row disappears from the table on its own and an amber
  "Key `"otp"` expired and removed" toast appears — this proves the TTL sweep
  is real (running on the server, not just cosmetic).

### 4. Command Mode — run the core Redis-like commands

Click the **Command Mode** tab. Type each command into the terminal input,
press **Run** (or hit Enter), and check the `reply` box:

| Type this | Expect the reply |
|---|---|
| `SET name Priya` | `OK` |
| `GET name` | `"Priya"` |
| `EXISTS name` | `1` |
| `TTL name` | `-1` (exists, no expiry) |
| `EXPIRE name 5` | `1`, and within ~5s the key disappears from the table with an "expired" toast |
| `KEYS` | a numbered list of every key currently stored |
| `DEL name` | `1` (deleted) — the row vanishes from the table immediately |
| `FLUSHALL` | `OK`, and the table goes back to the empty "No keys in memory yet" state |

You can also just click the example chips (`SET name Priya`, `GET name`, etc.)
under the input to fill it in without typing.

### 5. Command Mode — data types (Lists, Hashes, Sets)

Still in Command Mode, run these in order:

| Type this | Expect the reply |
|---|---|
| `LPUSH queue job1` | `1` (new list length) |
| `LPUSH queue job2 job3` | `3` — the Live Memory Store shows a small blue `LIST` badge under the `queue` key, Value shows `[job3, job2, job1]` (multi-item `LPUSH` reverses order onto the head, matching real Redis) |
| `RPOP queue` | `"job1"` |
| `HSET user name Priya` | `1` (field was new) — the key gets a teal `HASH` badge |
| `HSET user name Priya` | `0` (same field, already existed) |
| `HGET user name` | `"Priya"` |
| `HGET user missingfield` | `(nil)` |
| `SADD tags redis node redis` | `2` (the duplicate `redis` isn't counted twice) — the key gets an amber `SET` badge |
| `SMEMBERS tags` | a numbered list of the set's members |
| `LPUSH tasks "Learn Redis"` | `1` — the quoted phrase is stored as **one** list item, not two (try the matching example chip in Command Mode) |

Then confirm type-safety (real Redis calls this a `WRONGTYPE` error):

| Type this | Expect |
|---|---|
| `GET queue` (queue is a list) | `WRONGTYPE Operation against a key holding the wrong kind of value` |
| `SET queue hello` | `OK` — `SET` is allowed to overwrite *any* key with a plain string; the badge flips to `STRING` |
| `LPUSH queue x` (queue is now a string) | `WRONGTYPE ...` again, since it's no longer a list |

And confirm `TTL`/`EXPIRE`/`DEL` work identically on non-string types: `RPUSH
mylist a`, then `EXPIRE mylist 5`, then `TTL mylist` should return ~5, and the
row should auto-remove itself with an "expired" toast a few seconds later —
same as a string key. Separately, `RPUSH poptest z` then `LPOP poptest`
(which empties and deletes the list) should show **no** "expired" toast,
since that was an explicit action, not a timeout.

### 6. Data Types tab — build structures without typing commands

Click the **Data Types** tab (next to Command Mode).

1. With **List** selected (the default), type `tasks` in Key and `Learn
   Redis` in Value, then press **Enter** — this runs `RPUSH` (the Enter-key
   default for lists), and a "Current structure" box appears showing
   `tasks → [Learn Redis]`.
2. Type `Write tests` in Value and click the **LPUSH** button (the red
   primary one). Expect the preview to update to `tasks → [Write tests,
   Learn Redis]`.
3. Switch to **Hash**: a **Field** input appears (only for Hash). Key
   `user:1`, Field `name`, Value `Priya`, click **HSET**. Expect
   `user:1 → {name: Priya}`.
4. Switch to **Set**: the last input's label changes to **Member**. Key
   `skills`, Member `Swift`, click **SADD**. Expect `skills → {Swift}`.
5. In every case, check the **Live Memory Store** table: each key now shows
   a small colored badge under its name — `LIST` (blue), `HASH` (teal), or
   `SET` (amber) — instead of a separate column.

### 7. Command History — Export

Once at least one command has run, an **Export** button appears next to the
history count. Click it: expect a `.json` file to download (check your
browser's downloads) and a "History exported" toast.

### 8. Error cases — confirm bad input is handled, not crashed

| Type this | Expect |
|---|---|
| `GET missingkey` | `(nil)`, error-style red reply, "Key not found" toast |
| `SET onlyonearg` | `ERR wrong number of arguments...`, "Missing arguments" toast |
| `EXPIRE missingkey 10` | `0`, "Key not found" toast |
| `EXPIRE name notanumber` | `ERR value is not an integer` |
| `NOTACOMMAND` | `ERR unknown command 'NOTACOMMAND'...`, "Invalid command" toast |
| Leave the Form Mode Key field empty and click **Save to Cache** | Red inline error "Key is required." — nothing is saved |
| Form Mode: Expiry → `Custom…`, leave Custom seconds blank, save | Red inline error about a positive number required |

None of these should ever show a blank screen, a browser console error dialog,
or leave the UI stuck — that's the thing to watch for, not just the reply text.

### 9. Row delete button

With at least one key in the table, click the **✕** button on the right of
any row. Expect: that row disappears immediately, a Command History entry
`DEL <key> → 1` appears, and no "expired" toast fires for it (that toast is
reserved for keys that actually time out on their own, not ones you deleted).

### 10. Live auto-refresh, across two tabs

Open the app in two browser tabs side by side. Run a command in one tab
(e.g. `SET shared hello`). Within ~1 second, the **other** tab's Live Memory
Store table updates too — this confirms the store genuinely lives on the
server (a shared `Map`), not just in that one tab's local browser memory.

## Deploying

`render.yaml` deploys this as a single Render web service: it builds the Angular
client, then Express serves both the built UI and the `/api` routes from one
process/port — so the live in-memory store and TTL sweep behave the same in
production as they do locally. On [render.com](https://render.com), go to
**New +** → **Blueprint**, connect this GitHub repo, and Render will read
`render.yaml` and deploy it automatically. Or run the app anywhere else that
can run a long-lived Node process with `npm install && npm run build` as the
build step and `npm start` as the start command.
