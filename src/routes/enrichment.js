const express = require('express');
const router  = express.Router();
const { runEnrichmentBatch, getEnrichmentStatus } = require('../services/enrichmentService');
const { logger } = require('../utils/logger');

router.post('/start', (req, res) => {
  const limit = Math.min(parseInt(req.body?.limit || 20), 50);
  runEnrichmentBatch(limit).catch(err =>
    logger.error('[ENRICH] Erro no batch:', err.message)
  );
  res.json({ status: 'started', limit });
});

router.get('/status', (req, res) => {
  res.json(getEnrichmentStatus());
});

module.exports = router;
