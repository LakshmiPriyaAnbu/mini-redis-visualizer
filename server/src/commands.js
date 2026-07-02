// Numbered-list reply format shared by KEYS and SMEMBERS, e.g.:
//   1) "a"
//   2) "b"
function formatList(items) {
  return items.length ? items.map((item, i) => `${i + 1}) "${item}"`).join('\n') : '(empty)';
}

// Splits a command line into tokens, honoring "double-quoted phrases" as a
// single token — e.g. `LPUSH tasks "Learn Redis"` yields ['LPUSH', 'tasks',
// 'Learn Redis'], not four space-split words. Without this, a multi-word
// list/set item typed via the Data Types builder would silently split into
// several items.
function tokenize(raw) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = re.exec(raw || '')) !== null) {
    out.push(match[1] !== undefined ? match[1] : match[2]);
  }
  return out;
}

// Parses and executes a single Redis-like command line against a MiniRedisStore.
// Returns { status, text, explanation, toast } — the explanation and toast are
// plain-English descriptions of what happened, computed here (not the client)
// since the server is the only place that actually knows what changed.
function executeCommand(store, raw) {
  const parts = tokenize(raw ? raw.trim() : '');
  const cmd = (parts[0] || '').toUpperCase();

  const err = (text, explanation, toastMessage) => ({
    status: 'error',
    text,
    explanation,
    toast: { type: 'error', message: toastMessage || 'Invalid command' },
  });
  const ok = (text, explanation, toastMessage, toastType = 'success') => ({
    status: 'success',
    text,
    explanation,
    toast: { type: toastType, message: toastMessage },
  });

  // Every key holds exactly one data type at a time, just like real Redis.
  // Type-sensitive commands call this first; `currentType` is null for a
  // missing key, which must fall through to auto-vivify/not-found handling
  // rather than ever reporting WRONGTYPE against a key that doesn't exist.
  const typeMismatch = (key, actualType, wantedType) =>
    err(
      'WRONGTYPE Operation against a key holding the wrong kind of value',
      `"${key}" is a ${actualType}, not a ${wantedType}, so this command can't be used on it.`,
      'Wrong type'
    );

  switch (cmd) {
    case '':
      return err('ERR empty command', 'Nothing to run — type a command like SET user Priya.', 'Empty command');

    case 'SET': {
      if (parts.length < 3) {
        return err('ERR wrong number of arguments. Try: SET key value', 'SET needs both a key and a value.', 'Missing arguments');
      }
      // No type check here on purpose: real Redis lets SET overwrite a key
      // of any existing type (list/hash/set) with a plain string.
      const key = parts[1];
      const value = parts.slice(2).join(' ');
      store.set(key, value);
      return ok(
        'OK',
        `You stored a key "${key}" with the value "${value}". MiniRedis saved it in an in-memory JavaScript Map for O(1) lookups.`,
        'Key stored successfully'
      );
    }

    case 'GET': {
      if (!parts[1]) return err('ERR missing key. Try: GET key', 'GET needs a key to look up.', 'Missing key');
      const key = parts[1];
      const currentType = store.peekType(key);
      if (currentType && currentType !== 'string') return typeMismatch(key, currentType, 'string');
      const entry = store.get(key);
      if (entry) {
        return ok(`"${entry.value}"`, `MiniRedis searched the Map for "${key}" and returned its value.`, 'Key found');
      }
      return err('(nil)', `"${key}" is not in memory, so MiniRedis returned (nil).`, 'Key not found');
    }

    case 'DEL': {
      if (!parts[1]) return err('ERR missing key. Try: DEL key', 'DEL needs a key to remove.', 'Missing key');
      const removed = store.del(parts[1]);
      if (removed) {
        return ok('1', `MiniRedis removed "${parts[1]}" from the Map.`, 'Key deleted');
      }
      return err('0', `"${parts[1]}" was not in memory, so nothing was deleted.`, 'Key not found');
    }

    case 'EXISTS': {
      if (!parts[1]) return err('ERR missing key. Try: EXISTS key', 'EXISTS needs a key to check.', 'Missing key');
      const n = store.has(parts[1]) ? 1 : 0;
      return ok(
        String(n),
        `MiniRedis checked whether "${parts[1]}" exists in memory — ${n ? 'it does (1).' : 'it does not (0).'}`,
        'Checked existence'
      );
    }

    case 'EXPIRE': {
      if (parts.length < 3) {
        return err('ERR wrong number of arguments. Try: EXPIRE key seconds', 'EXPIRE needs a key and a number of seconds.', 'Missing arguments');
      }
      const seconds = parseInt(parts[2], 10);
      if (Number.isNaN(seconds)) {
        return err('ERR value is not an integer', 'The seconds value must be a whole number.', 'TTL must be a number');
      }
      if (store.expire(parts[1], seconds)) {
        return ok(
          '1',
          `You set a ${seconds}s TTL on "${parts[1]}". MiniRedis stored an expiry timestamp; the countdown ticks every second and the key is auto-evicted at zero.`,
          'TTL set'
        );
      }
      return err('0', `"${parts[1]}" does not exist, so no expiry was set.`, 'Key not found');
    }

    case 'TTL': {
      if (!parts[1]) return err('ERR missing key. Try: TTL key', 'TTL needs a key.', 'Missing key');
      const ttl = store.ttl(parts[1]);
      if (ttl === -2) return ok('-2', `MiniRedis returned -2 — "${parts[1]}" does not exist.`, 'Key not found');
      if (ttl === -1) return ok('-1', `MiniRedis returned -1 — "${parts[1]}" exists but has no expiry set.`, 'No expiry');
      return ok(String(ttl), `MiniRedis returned the seconds remaining before "${parts[1]}" is automatically evicted.`, 'TTL read');
    }

    case 'KEYS': {
      const keys = store.keys();
      return ok(formatList(keys), `MiniRedis returned every key currently held in the Map (${keys.length} total).`, 'Listed keys');
    }

    case 'FLUSHALL': {
      store.flushAll();
      return ok('OK', 'MiniRedis cleared every key from the in-memory Map. The store is now empty.', 'All keys cleared', 'warn');
    }

    // ---- Lists ----
    case 'LPUSH':
    case 'RPUSH': {
      if (parts.length < 3) {
        return err(
          `ERR wrong number of arguments. Try: ${cmd} key item [item2 ...]`,
          `${cmd} needs a key and at least one item to push.`,
          'Missing arguments'
        );
      }
      const key = parts[1];
      const items = parts.slice(2);
      const currentType = store.peekType(key);
      if (currentType && currentType !== 'list') return typeMismatch(key, currentType, 'list');
      const len = cmd === 'LPUSH' ? store.lpush(key, items) : store.rpush(key, items);
      const end = cmd === 'LPUSH' ? 'head' : 'tail';
      return ok(
        String(len),
        `You pushed ${items.length} item(s) onto the ${end} of list "${key}". It now has ${len} item(s) — MiniRedis stores lists as a plain JavaScript array under the key.`,
        'Pushed to list'
      );
    }

    case 'LPOP':
    case 'RPOP': {
      if (!parts[1]) return err(`ERR missing key. Try: ${cmd} key`, `${cmd} needs a key.`, 'Missing key');
      const key = parts[1];
      const currentType = store.peekType(key);
      if (currentType && currentType !== 'list') return typeMismatch(key, currentType, 'list');
      const item = cmd === 'LPOP' ? store.lpop(key) : store.rpop(key);
      if (item == null) return err('(nil)', `"${key}" doesn't exist or its list is empty, so MiniRedis returned (nil).`, 'List empty');
      const end = cmd === 'LPOP' ? 'head' : 'tail';
      return ok(`"${item}"`, `MiniRedis removed and returned the ${end} item of list "${key}". If that was the last item, the key is gone entirely.`, 'Popped from list');
    }

    // ---- Hashes ----
    case 'HSET': {
      if (parts.length < 4) {
        return err('ERR wrong number of arguments. Try: HSET key field value', 'HSET needs a key, a field, and a value.', 'Missing arguments');
      }
      const key = parts[1];
      const field = parts[2];
      const value = parts.slice(3).join(' ');
      const currentType = store.peekType(key);
      if (currentType && currentType !== 'hash') return typeMismatch(key, currentType, 'hash');
      const isNewField = store.hset(key, field, value);
      return ok(
        String(isNewField),
        `You set field "${field}" to "${value}" on hash "${key}". MiniRedis stores hashes as a plain object nested under the key.`,
        'Field saved'
      );
    }

    case 'HGET': {
      if (parts.length < 3) return err('ERR wrong number of arguments. Try: HGET key field', 'HGET needs a key and a field.', 'Missing arguments');
      const key = parts[1];
      const field = parts[2];
      const currentType = store.peekType(key);
      if (currentType && currentType !== 'hash') return typeMismatch(key, currentType, 'hash');
      const value = store.hget(key, field);
      if (value === undefined) return err('(nil)', `Hash "${key}" doesn't exist or has no field "${field}", so MiniRedis returned (nil).`, 'Field not found');
      return ok(`"${value}"`, `MiniRedis looked up field "${field}" on hash "${key}" and returned its value.`, 'Field found');
    }

    // ---- Sets ----
    case 'SADD': {
      if (parts.length < 3) {
        return err(
          'ERR wrong number of arguments. Try: SADD key member [member2 ...]',
          'SADD needs a key and at least one member.',
          'Missing arguments'
        );
      }
      const key = parts[1];
      const members = parts.slice(2);
      const currentType = store.peekType(key);
      if (currentType && currentType !== 'set') return typeMismatch(key, currentType, 'set');
      const added = store.sadd(key, members);
      return ok(
        String(added),
        `You added ${added} new member(s) to set "${key}" (duplicates are ignored). MiniRedis stores sets as a JavaScript Set under the key.`,
        'Added to set'
      );
    }

    case 'SMEMBERS': {
      if (!parts[1]) return err('ERR missing key. Try: SMEMBERS key', 'SMEMBERS needs a key.', 'Missing key');
      const key = parts[1];
      const currentType = store.peekType(key);
      if (currentType && currentType !== 'set') return typeMismatch(key, currentType, 'set');
      const members = store.smembers(key);
      return ok(formatList(members), `MiniRedis returned every member currently in set "${key}" (${members.length} total).`, 'Listed members');
    }

    // ---- Counters ----
    case 'INCR':
    case 'DECR': {
      if (!parts[1]) return err(`ERR missing key. Try: ${cmd} key`, `${cmd} needs a key.`, 'Missing key');
      const key = parts[1];
      const currentType = store.peekType(key);
      if (currentType && currentType !== 'string') return typeMismatch(key, currentType, 'string');
      const next = store.incrby(key, cmd === 'INCR' ? 1 : -1);
      if (next === null) {
        return err(
          'ERR value is not an integer or out of range',
          `"${key}" doesn't hold a valid integer, so it can't be ${cmd === 'INCR' ? 'incremented' : 'decremented'}.`,
          'Not a number'
        );
      }
      return ok(
        String(next),
        `MiniRedis ${cmd === 'INCR' ? 'incremented' : 'decremented'} "${key}" to ${next}. Redis counters like this are atomic — they back view counts, rate limiters and live metrics.`,
        cmd === 'INCR' ? 'Incremented' : 'Decremented'
      );
    }

    default:
      return err(
        `ERR unknown command '${cmd}'. Try: SET key value`,
        `'${cmd}' isn't a supported command. Try SET, GET, DEL, EXISTS, EXPIRE, TTL, KEYS, FLUSHALL, LPUSH, RPUSH, LPOP, RPOP, HSET, HGET, SADD, SMEMBERS, INCR or DECR.`,
        'Invalid command'
      );
  }
}

module.exports = { executeCommand };
