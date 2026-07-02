const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { MiniRedisStore } = require('../src/store');

describe('MiniRedisStore — strings', () => {
  test('set/get round trip', () => {
    const store = new MiniRedisStore();
    store.set('name', 'Priya');
    const entry = store.get('name');
    assert.equal(entry.value, 'Priya');
    assert.equal(entry.type, 'string');
    assert.equal(entry.expiresAt, null);
    assert.equal(typeof entry.createdAt, 'number');
  });

  test('get on a missing key returns null', () => {
    const store = new MiniRedisStore();
    assert.equal(store.get('nope'), null);
  });

  test('has() reflects presence', () => {
    const store = new MiniRedisStore();
    assert.equal(store.has('x'), false);
    store.set('x', '1');
    assert.equal(store.has('x'), true);
  });

  test('del() removes a key and reports whether it existed', () => {
    const store = new MiniRedisStore();
    store.set('x', '1');
    assert.equal(store.del('x'), true);
    assert.equal(store.del('x'), false);
  });
});

describe('MiniRedisStore — TTL', () => {
  test('ttl() is -2 for a missing key, -1 for no expiry, else seconds remaining', () => {
    const store = new MiniRedisStore();
    assert.equal(store.ttl('missing'), -2);
    store.set('nolimit', 'v');
    assert.equal(store.ttl('nolimit'), -1);
    store.set('soon', 'v');
    store.expire('soon', 30);
    const remaining = store.ttl('soon');
    assert.ok(remaining > 0 && remaining <= 30, `expected 0 < ttl <= 30, got ${remaining}`);
  });

  test('expire() returns false for a missing key', () => {
    const store = new MiniRedisStore();
    assert.equal(store.expire('missing', 10), false);
  });

  test('sweep() removes keys whose TTL has elapsed', () => {
    const store = new MiniRedisStore();
    store.set('gone', 'v');
    store.expire('gone', 0);
    store.set('stays', 'v');
    const expired = store.sweep();
    assert.deepEqual(expired, ['gone']);
    assert.equal(store.has('stays'), true);
    assert.equal(store.map.has('gone'), false);
  });
});

describe('MiniRedisStore — data types', () => {
  test('peekType is null for a missing key and the type for an existing one', () => {
    const store = new MiniRedisStore();
    assert.equal(store.peekType('missing'), null);
    store.set('s', 'v');
    assert.equal(store.peekType('s'), 'string');
  });

  test('lpush/rpush order and length', () => {
    const store = new MiniRedisStore();
    assert.equal(store.lpush('l', ['a']), 1);
    assert.equal(store.lpush('l', ['b', 'c']), 3);
    assert.deepEqual(store.map.get('l').value, ['c', 'b', 'a']);
    assert.equal(store.rpush('l', ['z']), 4);
    assert.deepEqual(store.map.get('l').value, ['c', 'b', 'a', 'z']);
  });

  test('lpop/rpop remove and delete the key once empty', () => {
    const store = new MiniRedisStore();
    store.rpush('l', ['a', 'b']);
    assert.equal(store.lpop('l'), 'a');
    assert.equal(store.rpop('l'), 'b');
    assert.equal(store.lpop('l'), null);
    assert.equal(store.map.has('l'), false);
  });

  test('hset/hget track new-vs-existing fields', () => {
    const store = new MiniRedisStore();
    assert.equal(store.hset('h', 'name', 'Priya'), 1);
    assert.equal(store.hset('h', 'name', 'Priya2'), 0);
    assert.equal(store.hget('h', 'name'), 'Priya2');
    assert.equal(store.hget('h', 'missing'), undefined);
  });

  test('sadd/smembers dedupe members', () => {
    const store = new MiniRedisStore();
    assert.equal(store.sadd('s', ['a', 'b', 'a']), 2);
    assert.deepEqual(store.smembers('s').sort(), ['a', 'b']);
  });
});

describe('MiniRedisStore — counters', () => {
  test('incrby creates a missing key starting from 0', () => {
    const store = new MiniRedisStore();
    assert.equal(store.incrby('counter', 1), 1);
    assert.equal(store.incrby('counter', 1), 2);
    assert.equal(store.incrby('counter', -1), 1);
  });

  test('incrby returns null for a non-integer current value', () => {
    const store = new MiniRedisStore();
    store.set('word', 'abc');
    assert.equal(store.incrby('word', 1), null);
  });

  test('incrby preserves an existing TTL', () => {
    const store = new MiniRedisStore();
    store.set('counter', '5');
    store.expire('counter', 30);
    store.incrby('counter', 1);
    assert.equal(store.map.get('counter').expiresAt !== null, true);
  });
});
