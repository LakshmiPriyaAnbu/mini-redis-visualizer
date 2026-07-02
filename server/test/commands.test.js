const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { MiniRedisStore } = require('../src/store');
const { executeCommand } = require('../src/commands');

function run(store, raw) {
  return executeCommand(store, raw);
}

describe('executeCommand — SET/GET', () => {
  test('SET then GET round trip', () => {
    const store = new MiniRedisStore();
    assert.equal(run(store, 'SET name Priya').text, 'OK');
    const result = run(store, 'GET name');
    assert.equal(result.status, 'success');
    assert.equal(result.text, '"Priya"');
  });

  test('GET on a missing key returns (nil)', () => {
    const store = new MiniRedisStore();
    const result = run(store, 'GET missing');
    assert.equal(result.status, 'error');
    assert.equal(result.text, '(nil)');
  });

  test('SET with too few arguments errors', () => {
    const store = new MiniRedisStore();
    assert.equal(run(store, 'SET onlykey').status, 'error');
  });
});

describe('executeCommand — DEL', () => {
  test('DEL removes an existing key and reports 1', () => {
    const store = new MiniRedisStore();
    run(store, 'SET x 1');
    const result = run(store, 'DEL x');
    assert.equal(result.status, 'success');
    assert.equal(result.text, '1');
    assert.equal(store.has('x'), false);
  });

  test('DEL on a missing key reports 0 as an error-style reply', () => {
    const store = new MiniRedisStore();
    const result = run(store, 'DEL missing');
    assert.equal(result.text, '0');
  });
});

describe('executeCommand — EXPIRE/TTL and expiry', () => {
  test('EXPIRE sets a TTL that TTL then reports back', () => {
    const store = new MiniRedisStore();
    run(store, 'SET x 1');
    assert.equal(run(store, 'EXPIRE x 30').text, '1');
    const ttlResult = run(store, 'TTL x');
    const ttl = parseInt(ttlResult.text, 10);
    assert.ok(ttl > 0 && ttl <= 30);
  });

  test('TTL is -1 with no expiry and -2 for a missing key', () => {
    const store = new MiniRedisStore();
    run(store, 'SET x 1');
    assert.equal(run(store, 'TTL x').text, '-1');
    assert.equal(run(store, 'TTL missing').text, '-2');
  });

  test('a key with an elapsed TTL is gone after sweep (active expiry)', () => {
    const store = new MiniRedisStore();
    run(store, 'SET x 1');
    run(store, 'EXPIRE x 0');
    store.sweep();
    assert.equal(run(store, 'GET x').text, '(nil)');
  });
});

describe('executeCommand — WRONGTYPE', () => {
  test('GET on a list key is WRONGTYPE', () => {
    const store = new MiniRedisStore();
    run(store, 'LPUSH mylist a');
    const result = run(store, 'GET mylist');
    assert.equal(result.status, 'error');
    assert.match(result.text, /^WRONGTYPE/);
  });

  test('LPUSH on a string key is WRONGTYPE', () => {
    const store = new MiniRedisStore();
    run(store, 'SET mystr hello');
    const result = run(store, 'LPUSH mystr a');
    assert.match(result.text, /^WRONGTYPE/);
  });

  test('SET is exempt — it may overwrite any existing type', () => {
    const store = new MiniRedisStore();
    run(store, 'LPUSH mylist a');
    assert.equal(run(store, 'SET mylist hello').status, 'success');
    assert.equal(store.peekType('mylist'), 'string');
  });
});

describe('executeCommand — lists', () => {
  test('LPUSH/RPUSH/LPOP/RPOP', () => {
    const store = new MiniRedisStore();
    assert.equal(run(store, 'RPUSH queue a').text, '1');
    assert.equal(run(store, 'RPUSH queue b').text, '2');
    assert.equal(run(store, 'LPUSH queue z').text, '3');
    assert.equal(run(store, 'LPOP queue').text, '"z"');
    assert.equal(run(store, 'RPOP queue').text, '"b"');
  });

  test('LPOP on an empty/missing list is (nil)', () => {
    const store = new MiniRedisStore();
    const result = run(store, 'LPOP missing');
    assert.equal(result.status, 'error');
    assert.equal(result.text, '(nil)');
  });
});

describe('executeCommand — hashes', () => {
  test('HSET/HGET', () => {
    const store = new MiniRedisStore();
    assert.equal(run(store, 'HSET user name Priya').text, '1');
    assert.equal(run(store, 'HSET user name Priya').text, '0');
    assert.equal(run(store, 'HGET user name').text, '"Priya"');
    assert.equal(run(store, 'HGET user missing').text, '(nil)');
  });
});

describe('executeCommand — sets', () => {
  test('SADD/SMEMBERS', () => {
    const store = new MiniRedisStore();
    assert.equal(run(store, 'SADD tags redis node redis').text, '2');
    const members = run(store, 'SMEMBERS tags').text;
    assert.match(members, /"redis"/);
    assert.match(members, /"node"/);
  });
});

describe('executeCommand — FLUSHALL', () => {
  test('FLUSHALL empties the store', () => {
    const store = new MiniRedisStore();
    run(store, 'SET a 1');
    run(store, 'SET b 2');
    const result = run(store, 'FLUSHALL');
    assert.equal(result.status, 'success');
    assert.equal(run(store, 'KEYS').text, '(empty)');
  });
});

describe('executeCommand — INCR/DECR', () => {
  test('INCR starts a missing key at 1', () => {
    const store = new MiniRedisStore();
    assert.equal(run(store, 'INCR counter').text, '1');
    assert.equal(run(store, 'INCR counter').text, '2');
  });

  test('DECR decrements', () => {
    const store = new MiniRedisStore();
    run(store, 'SET counter 5');
    assert.equal(run(store, 'DECR counter').text, '4');
  });

  test('INCR on a non-integer value errors', () => {
    const store = new MiniRedisStore();
    run(store, 'SET word abc');
    const result = run(store, 'INCR word');
    assert.equal(result.status, 'error');
    assert.match(result.text, /not an integer/);
  });

  test('INCR on a non-string type is WRONGTYPE', () => {
    const store = new MiniRedisStore();
    run(store, 'LPUSH mylist a');
    const result = run(store, 'INCR mylist');
    assert.match(result.text, /^WRONGTYPE/);
  });
});

describe('executeCommand — unknown command', () => {
  test('an unrecognized command returns an ERR reply', () => {
    const store = new MiniRedisStore();
    const result = run(store, 'NOTACOMMAND');
    assert.equal(result.status, 'error');
    assert.match(result.text, /^ERR unknown command/);
  });
});
