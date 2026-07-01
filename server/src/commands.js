// Parses and executes a single Redis-like command line against a MiniRedisStore.
// Returns { status, text, explanation, toast } — the explanation and toast are
// plain-English descriptions of what happened, computed here (not the client)
// since the server is the only place that actually knows what changed.
function executeCommand(store, raw) {
  const parts = raw ? raw.trim().split(/\s+/) : [];
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

  switch (cmd) {
    case '':
      return err('ERR empty command', 'Nothing to run — type a command like SET user Priya.', 'Empty command');

    case 'SET': {
      if (parts.length < 3) {
        return err('ERR wrong number of arguments. Try: SET key value', 'SET needs both a key and a value.', 'Missing arguments');
      }
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
      const entry = store.get(parts[1]);
      if (entry) {
        return ok(`"${entry.value}"`, `MiniRedis searched the Map for "${parts[1]}" and returned its value.`, 'Key found');
      }
      return err('(nil)', `"${parts[1]}" is not in memory, so MiniRedis returned (nil).`, 'Key not found');
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
      const text = keys.length ? keys.map((k, i) => `${i + 1}) "${k}"`).join('\n') : '(empty)';
      return ok(text, `MiniRedis returned every key currently held in the Map (${keys.length} total).`, 'Listed keys');
    }

    case 'FLUSHALL': {
      store.flushAll();
      return ok('OK', 'MiniRedis cleared every key from the in-memory Map. The store is now empty.', 'All keys cleared', 'warn');
    }

    default:
      return err(
        `ERR unknown command '${cmd}'. Try: SET key value`,
        `'${cmd}' isn't a supported command. Try SET, GET, DEL, EXISTS, EXPIRE, TTL, KEYS or FLUSHALL.`,
        'Invalid command'
      );
  }
}

module.exports = { executeCommand };
