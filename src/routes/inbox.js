const express = require('express');
const { scanAndClassify, getStats, getDrafts } = require('../services/inboxManager');
const { logger } = require('../utils/logger');

const router = express.Router();

// ─── GET /inbox/scan ──────────────────────────────────────────────────────────
router.get('/scan', async (req, res) => {
  try {
    logger.info('[INBOX] Scan manual solicitado');
    const result = await scanAndClassify();
    res.json({ success: true, ...result });
  } catch(e) {
    logger.error('[INBOX] Erro no scan:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /inbox/stats ─────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  res.json(getStats());
});

// ─── GET /inbox/drafts ────────────────────────────────────────────────────────
router.get('/drafts', (req, res) => {
  res.json({ drafts: getDrafts() });
});

module.exports = router;
