const express = require('express');
const {
  pullFromSheets, updateCadenceRow,
  updateCadenciaEtapa, updateCadenciaStatus, updateCell, COL,
} = require('../services/sheetsClient');
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
    const agora = new Date();
    const templates = require('../data/emailTemplates');
    const pendentes = contacts.filter(c => {
      if (c.cadenciaStatus !== 'ativa')        return false;
      if (c.emailRespondido === 'sim')          return false;
      if (!c.email || !c.email.includes('@'))   return false;
      const etapa = parseInt(c.cadenciaEtapa || 0);
      if (etapa >= templates.length)            return false;
      if (!c.cadenciaProximo)                   return true;
      return new Date(c.cadenciaProximo) <= agora;
    }).length;
    res.json({ ...stats, pendentes, total: contacts.length });
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

// ─── GET /cadence/template/:etapa ────────────────────────────────────────────
// Retorna template de email por etapa (1-10)
router.get('/template/:etapa', (req, res) => {
  const templates = require('../data/emailTemplates');
  const etapa = parseInt(req.params.etapa);
  if (etapa > templates.length) {
    return res.json({ concluida: true, message: 'Cadência concluída', totalEtapas: templates.length });
  }
  if (isNaN(etapa) || etapa < 1) {
    return res.status(400).json({ error: 'Etapa inválida' });
  }
  const t = templates[etapa - 1];
  res.json({ id: t.id, assunto: t.assunto, corpo: t.corpo, etapa, totalEtapas: templates.length });
});

// ─── POST /cadence/add-batch ──────────────────────────────────────────────────
// Ativa cadência para uma lista de contatos por rowIndex
router.post('/add-batch', async (req, res) => {
  const { rowIndexes } = req.body;
  if (!Array.isArray(rowIndexes) || rowIndexes.length === 0)
    return res.json({ added: 0, skipped: 0 });

  try {
    const contacts = await pullFromSheets();
    const rowSet   = new Set(rowIndexes.map(Number));
    const targets  = contacts.filter(c => rowSet.has(c.rowIndex));
    let added = 0, skipped = 0;

    for (const c of targets) {
      if (c.cadenciaStatus === 'ativa') { skipped++; continue; }
      const etapa   = parseInt(c.cadenciaEtapa || '0');
      const proximo = c.cadenciaProximo || new Date().toISOString();
      await updateCadenciaEtapa(c.rowIndex, etapa, proximo);
      await updateCadenciaStatus(c.rowIndex, 'ativa');
      added++;
      logger.info(`[CADENCE] Cadência ativada — rowIndex ${c.rowIndex} (${c.email})`);
    }

    res.json({ added, skipped });
  } catch(err) {
    logger.error('[CADENCE] Erro no add-batch:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /cadence/pause-batch ────────────────────────────────────────────────
// Pausa cadência para uma lista de contatos por rowIndex
router.post('/pause-batch', async (req, res) => {
  const { rowIndexes } = req.body;
  if (!Array.isArray(rowIndexes) || rowIndexes.length === 0)
    return res.json({ paused: 0 });

  try {
    let paused = 0;
    for (const rowIndex of rowIndexes) {
      await updateCadenciaStatus(Number(rowIndex), 'pausada');
      paused++;
    }
    logger.info(`[CADENCE] pause-batch: ${paused} contatos pausados`);
    res.json({ paused });
  } catch(err) {
    logger.error('[CADENCE] Erro no pause-batch:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /cadence/remove ─────────────────────────────────────────────────────
router.post('/remove', async (req, res) => {
  const { rowIndex } = req.body;
  if (!rowIndex) return res.status(400).json({ error: 'rowIndex obrigatório' });
  try {
    await updateCadenciaStatus(Number(rowIndex), 'removido');
    logger.info(`[CADENCE] Contato linha ${rowIndex} removido da cadência`);
    res.json({ success: true, rowIndex });
  } catch(e) {
    logger.error('[CADENCE] Erro ao remover:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /cadence/check-bounces ─────────────────────────────────────────────
router.post('/check-bounces', (req, res) => {
  const { checkBounces } = require('../services/bounceChecker');
  res.json({ status: 'started' });
  checkBounces().catch(e => logger.error('[BOUNCE] Erro manual:', e.message));
});

// ─── POST /cadence/run ────────────────────────────────────────────────────────
// Dispara cadência automática manualmente (retorna imediatamente, roda em bg)
router.post('/run', (req, res) => {
  const { runCadenceJob } = require('../services/cadenceAutoJob');
  res.json({ status: 'started', message: 'Cadência iniciada em background' });
  runCadenceJob().catch(e => logger.error('[CADENCE] Erro no run manual:', e.message));
});

// ─── GET /cadence/auto-status ─────────────────────────────────────────────────
// Estado do job de cadência automática (separado do /status que usa a planilha)
router.get('/auto-status', (req, res) => {
  const { getCadenceState } = require('../services/cadenceAutoJob');
  res.json(getCadenceState());
});

module.exports = router;
