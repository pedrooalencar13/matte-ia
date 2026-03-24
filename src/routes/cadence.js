const express = require('express');
const { pullFromSheets, updateCadenceRow } = require('../services/sheetsClient');
const { logger } = require('../utils/logger');

const router = express.Router();

// ─── GET /cadence/status ──────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const contacts = await pullFromSheets();
    const stats = { ativa: 0, pausada: 0, concluida: 0, respondeu: 0, semCadencia: 0 };
    contacts.forEach(c => {
      const s = c.cadenciaStatus || '';
      if (stats[s] !== undefined) stats[s]++;
      else stats.semCadencia++;
    });
    res.json({ ...stats, total: contacts.length });
  } catch (err) {
    logger.error('[CADENCE] Erro ao buscar status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /cadence/pause/:email ───────────────────────────────────────────────
router.post('/pause/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const ok = await updateCadenceRow(email, { cadenciaStatus: 'pausada' });
    if (!ok) return res.status(404).json({ error: 'Lead não encontrado' });
    logger.info(`[CADENCE] Cadência pausada para ${email}`);
    res.json({ message: `Cadência pausada para ${email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /cadence/resume/:email ──────────────────────────────────────────────
router.post('/resume/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const ok = await updateCadenceRow(email, {
      cadenciaStatus: 'ativa',
      cadenciaProximo: new Date().toISOString(),
    });
    if (!ok) return res.status(404).json({ error: 'Lead não encontrado' });
    logger.info(`[CADENCE] Cadência retomada para ${email}`);
    res.json({ message: `Cadência retomada para ${email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /cadence/reset/:email ───────────────────────────────────────────────
router.post('/reset/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const ok = await updateCadenceRow(email, {
      cadenciaStatus: 'ativa',
      cadenciaEtapa: '0',
      cadenciaProximo: new Date().toISOString(),
      emailAberto: '',
      emailRespondido: '',
      dataResposta: '',
    });
    if (!ok) return res.status(404).json({ error: 'Lead não encontrado' });
    logger.info(`[CADENCE] Cadência reiniciada para ${email}`);
    res.json({ message: `Cadência reiniciada do zero para ${email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /cadence/activate-all ───────────────────────────────────────────────
// Ativa a cadência para todos os leads que ainda não têm cadência configurada
router.post('/activate-all', async (req, res) => {
  try {
    const contacts = await pullFromSheets();
    const semCadencia = contacts.filter(c => !c.cadenciaStatus || c.cadenciaStatus === '');
    let activated = 0;
    for (const c of semCadencia) {
      if (!c.email) continue;
      await updateCadenceRow(c.email, {
        cadenciaStatus:  'ativa',
        cadenciaEtapa:   '0',
        cadenciaProximo: new Date().toISOString(),
      });
      activated++;
    }
    logger.info(`[CADENCE] activate-all: ${activated} leads ativados`);
    res.json({ activated, message: `${activated} leads ativados na cadência` });
  } catch (err) {
    logger.error('[CADENCE] Erro no activate-all:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /cadence/history/:email ──────────────────────────────────────────────
router.get('/history/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const contacts = await pullFromSheets();
    const contact = contacts.find(c => c.email.toLowerCase() === email.toLowerCase());
    if (!contact) return res.status(404).json({ error: 'Lead não encontrado' });

    res.json({
      email: contact.email,
      nome: contact.nome,
      cadenciaStatus:  contact.cadenciaStatus,
      cadenciaEtapa:   parseInt(contact.cadenciaEtapa) || 0,
      cadenciaProximo: contact.cadenciaProximo,
      emailAberto:     contact.emailAberto,
      emailRespondido: contact.emailRespondido,
      dataResposta:    contact.dataResposta,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
