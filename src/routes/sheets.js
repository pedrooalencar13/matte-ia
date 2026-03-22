const express = require('express');
const { pullFromSheets, pushToSheets } = require('../services/sheetsClient');
const { readLeads, writeLeads } = require('./leads');
const { logger } = require('../utils/logger');

const router = express.Router();

// ─── POST /sheets/push ────────────────────────────────────────────────────────
// Envia todos os leads com status "novo" para a Google Sheets
router.post('/push', async (req, res) => {
  try {
    const leads = readLeads();
    const novos = leads.filter(l => l.status === 'novo');

    if (novos.length === 0) {
      return res.json({ pushed: 0, skipped: 0, message: 'Nenhum lead novo para enviar' });
    }

    const result = await pushToSheets(novos);

    // Marca os leads como "enviado" no cache local
    const updated = leads.map(l =>
      l.status === 'novo' ? { ...l, status: 'enviado', sentAt: new Date().toISOString() } : l
    );
    writeLeads(updated);

    logger.success(`[SHEETS] ${result.pushed} leads enviados para a planilha`);
    res.json({
      pushed: result.pushed,
      skipped: result.skipped,
      message: `${result.pushed} leads adicionados a planilha`,
    });
  } catch (err) {
    logger.error('[SHEETS] Erro ao fazer push:', err.message);
    res.status(500).json({ error: 'Erro ao enviar para Google Sheets', detail: err.message });
  }
});

// ─── GET /sheets/pull ─────────────────────────────────────────────────────────
// Puxa todos os contatos da planilha
router.get('/pull', async (req, res) => {
  try {
    const contacts = await pullFromSheets();
    res.json({
      contacts,
      total: contacts.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[SHEETS] Erro ao fazer pull:', err.message);
    res.status(500).json({ error: 'Erro ao ler Google Sheets', detail: err.message });
  }
});

module.exports = router;
