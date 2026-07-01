const express = require('express');
const cors = require('cors');
const { MiniRedisStore } = require('./store');
const { createRouter } = require('./routes');

const PORT = process.env.PORT || 4000;
const SWEEP_INTERVAL_MS = 1000;

const store = new MiniRedisStore();

// Background TTL sweep: evicts expired keys once a second, independent of
// whether anyone is polling — mirrors real Redis's active expiry cycle.
setInterval(() => store.sweep(), SWEEP_INTERVAL_MS);

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', createRouter(store));

app.listen(PORT, () => {
  console.log(`MiniRedis API listening on :${PORT}`);
});
