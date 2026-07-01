const express = require('express');
const { executeCommand } = require('./commands');

function createRouter(store) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  router.get('/store', (req, res) => {
    res.json({ keys: store.serialize() });
  });

  router.post('/command', (req, res) => {
    const raw = typeof req.body?.command === 'string' ? req.body.command : '';
    const result = executeCommand(store, raw);
    res.json({ command: raw, ...result });
  });

  return router;
}

module.exports = { createRouter };
