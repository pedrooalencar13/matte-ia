const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { runScraper, getStatus, stopScraper } = require('../services/scraper');
const { logger } = require('../utils/logger');

const router = express.Router();

// ─── POST /scraper/start ──────────────────────────────────────────────────────
router.post('/start', async (req, res) => {
  const status = getStatus();
  if (status.running) {
    return res.status(409).json({
      error: 'Scraper ja esta rodando',
      jobId: status.jobId,
    });
  }

  const { terms, cities, limit } = req.body || {};
  const combinations = (terms || []).length * (cities || []).length || 'padrao';

  logger.info('[SCRAPER] Iniciando job via API...');

  // Inicia em background — não bloqueia a resposta
  runScraper({ terms, cities, limit }).catch(err => {
    logger.error('[SCRAPER] Erro no job:', err.message);
  });

  const newStatus = getStatus();
  res.json({
    status: 'started',
    jobId: newStatus.jobId,
    message: `Scraping iniciado — ${combinations} combinacoes de busca`,
  });
});

// ─── GET /scraper/status ──────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json(getStatus());
});

// ─── POST /scraper/stop ───────────────────────────────────────────────────────
router.post('/stop', (req, res) => {
  stopScraper();
  res.json({ message: 'Job interrompido' });
});

module.exports = router;
