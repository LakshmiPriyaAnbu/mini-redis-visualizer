// The actual in-memory key-value store: a JavaScript Map keyed by string,
// each entry tracking a data type, its value, and an optional TTL expiry
// timestamp. `type` is one of 'string' | 'list' | 'hash' | 'set' — real
// Redis enforces one data type per key, and commands.js uses peekType() to
// return a WRONGTYPE error the same way real Redis does.
class MiniRedisStore {
  constructor() {
    this.map = new Map();
  }

  set(key, value) {
    const existing = this.map.get(key);
    this.map.set(key, {
      value,
      type: 'string',
      expiresAt: null,
      createdAt: existing ? existing.createdAt : Date.now(),
    });
  }

  get(key) {
    this.sweep();
    return this.map.get(key) || null;
  }

  has(key) {
    this.sweep();
    return this.map.has(key);
  }

  del(key) {
    return this.map.delete(key);
  }

  expire(key, seconds) {
    const entry = this.map.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + seconds * 1000;
    return true;
  }

  ttl(key) {
    const entry = this.map.get(key);
    if (!entry) return -2;
    if (entry.expiresAt == null) return -1;
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  // Type-agnostic on purpose: EXPIRE/TTL/DEL/EXISTS/KEYS/FLUSHALL below all
  // work the same regardless of what a key holds — only commands that read
  // or write the *value* need to care about `type`.
  keys() {
    this.sweep();
    return [...this.map.keys()];
  }

  flushAll() {
    this.map.clear();
  }

  // Read-only type check, used by commands.js to decide whether a command
  // is allowed to run against a key — does not touch access metadata.
  peekType(key) {
    this.sweep();
    const entry = this.map.get(key);
    return entry ? entry.type : null;
  }

  // Returns the existing entry as-is (preserving its TTL/createdAt) if the
  // key already exists, or creates a fresh one otherwise. This is what lets
  // LPUSH/RPUSH/HSET/SADD on an already-TTL'd key leave that TTL alone —
  // only SET/EXPIRE/DEL are allowed to touch expiresAt.
  _getOrCreate(key, type, makeEmptyValue) {
    let entry = this.map.get(key);
    if (!entry) {
      entry = { value: makeEmptyValue(), type, expiresAt: null, createdAt: Date.now() };
      this.map.set(key, entry);
    }
    return entry;
  }

  // ---- Lists ----
  lpush(key, items) {
    const entry = this._getOrCreate(key, 'list', () => []);
    items.forEach((item) => entry.value.unshift(item));
    return entry.value.length;
  }

  rpush(key, items) {
    const entry = this._getOrCreate(key, 'list', () => []);
    entry.value.push(...items);
    return entry.value.length;
  }

  lpop(key) {
    const entry = this.map.get(key);
    if (!entry || entry.value.length === 0) return null;
    const item = entry.value.shift();
    if (entry.value.length === 0) this.map.delete(key);
    return item;
  }

  rpop(key) {
    const entry = this.map.get(key);
    if (!entry || entry.value.length === 0) return null;
    const item = entry.value.pop();
    if (entry.value.length === 0) this.map.delete(key);
    return item;
  }

  // ---- Hashes ----
  hset(key, field, value) {
    const entry = this._getOrCreate(key, 'hash', () => ({}));
    const isNewField = !(field in entry.value);
    entry.value[field] = value;
    return isNewField ? 1 : 0;
  }

  hget(key, field) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    return entry.value[field];
  }

  // ---- Sets ----
  sadd(key, members) {
    const entry = this._getOrCreate(key, 'set', () => new Set());
    let added = 0;
    members.forEach((member) => {
      if (!entry.value.has(member)) {
        entry.value.add(member);
        added += 1;
      }
    });
    return added;
  }

  smembers(key) {
    const entry = this.map.get(key);
    return entry ? [...entry.value] : [];
  }

  // Removes any keys whose TTL has elapsed. Returns the list of expired keys
  // so callers (the TTL sweep interval) can report them.
  sweep() {
    const now = Date.now();
    const expired = [];
    for (const [key, entry] of this.map.entries()) {
      if (entry.expiresAt != null && entry.expiresAt <= now) {
        expired.push(key);
      }
    }
    expired.forEach((key) => this.map.delete(key));
    return expired;
  }

  _displayValue(entry) {
    switch (entry.type) {
      case 'list':
        return `[${entry.value.join(', ')}]`;
      case 'hash':
        return `{${Object.entries(entry.value).map(([field, value]) => `${field}: ${value}`).join(', ')}}`;
      case 'set':
        return `{${[...entry.value].join(', ')}}`;
      default:
        return entry.value;
    }
  }

  // Snapshot of the store shaped for the frontend's Live Memory Store table.
  serialize() {
    this.sweep();
    const now = Date.now();
    return [...this.map.entries()].map(([key, entry]) => ({
      key,
      type: entry.type,
      value: this._displayValue(entry),
      ttl: entry.expiresAt == null ? null : Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)),
      createdAt: entry.createdAt,
    }));
  }
}

module.exports = { MiniRedisStore };
