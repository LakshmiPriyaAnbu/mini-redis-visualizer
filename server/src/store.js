// The actual in-memory key-value store: a JavaScript Map keyed by string,
// each entry tracking an optional TTL expiry timestamp.
class MiniRedisStore {
  constructor() {
    this.map = new Map();
  }

  set(key, value) {
    const existing = this.map.get(key);
    this.map.set(key, {
      value,
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

  keys() {
    this.sweep();
    return [...this.map.keys()];
  }

  flushAll() {
    this.map.clear();
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

  // Snapshot of the store shaped for the frontend's Live Memory Store table.
  serialize() {
    this.sweep();
    const now = Date.now();
    return [...this.map.entries()].map(([key, entry]) => ({
      key,
      value: entry.value,
      ttl: entry.expiresAt == null ? null : Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)),
      createdAt: entry.createdAt,
    }));
  }
}

module.exports = { MiniRedisStore };
