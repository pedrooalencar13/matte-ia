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
// Puxa todos os contatos da planilha com meta-dados para o dashboard
router.get('/pull', async (req, res) => {
  try {
    const contacts = await pullFromSheets();
    const meta = {
      total:       contacts.length,
      emCadencia:  contacts.filter(c => c.cadenciaStatus === 'ativa').length,
      abriram:     contacts.filter(c => c.emailAberto === 'sim').length,
      responderam: contacts.filter(c => c.emailRespondido === 'sim').length,
      concluidos:  contacts.filter(c => c.cadenciaStatus === 'concluida').length,
      pausados:    contacts.filter(c => c.cadenciaStatus === 'pausada').length,
      respondeu:   contacts.filter(c => c.cadenciaStatus === 'respondeu').length,
      ultimoSync:  new Date().toISOString(),
    };
    logger.info(`[SHEETS] Pull: ${contacts.length} contatos, ${meta.emCadencia} em cadência`);
    res.json({ contacts, meta });
  } catch (err) {
    logger.error('[SHEETS] Erro ao fazer pull:', err.message);
    res.status(500).json({ error: 'Erro ao ler Google Sheets', detail: err.message });
  }
});

module.exports = router;
