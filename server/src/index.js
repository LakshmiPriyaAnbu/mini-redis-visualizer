const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
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

// When the Angular client has been built (`npm run build`), serve it from
// this same process/port — lets one deployed service host both the API and
// the UI instead of needing a separate static host.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist', 'client', 'browser');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`MiniRedis API listening on :${PORT}`);
});
