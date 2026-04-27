const express = require('express');
const fs = require('fs');
const path = require('path');
const { PIXEL_GIF } = require('../services/gmailSender');
const { updateCadenceRow } = require('../services/sheetsClient');
const { logger } = require('../utils/logger');

const { updateCell, COL } = require('../services/sheetsClient');

const router = express.Router();
const TRACK_FILE = path.join(__dirname, '../data/tracking.json');

// ── Helpers de persistência do tracking ──────────────────────────────────────
function readTracking() {
  try {
    if (!fs.existsSync(TRACK_FILE)) return {};
    return JSON.parse(fs.readFileSync(TRACK_FILE, 'utf8')) || {};
  } catch { return {}; }
}

function writeTracking(data) {
  fs.mkdirSync(path.dirname(TRACK_FILE), { recursive: true });
  fs.writeFileSync(TRACK_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function recordOpen(emailHash, etapa) {
  const data = readTracking();
  if (!data[emailHash]) data[emailHash] = { opens: [], replies: [] };
  data[emailHash].opens.push({ etapa: parseInt(etapa) || 0, at: new Date().toISOString() });
  writeTracking(data);
}

// ─── GET /track/open ──────────────────────────────────────────────────────────
// Pixel de tracking — retorna GIF 1x1 transparente e registra abertura
router.get('/open', async (req, res) => {
  const { id, etapa } = req.query;

  // Retorna o pixel SEMPRE, independente de erro
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(PIXEL_GIF);

  // Processa tracking em background sem bloquear a resposta
  if (id) {
    try {
      recordOpen(id, etapa || 0);

      // Tenta decodificar o e-mail e atualizar a planilha
      const email = Buffer.from(id, 'base64url').toString('utf8');
      if (email.includes('@')) {
        await updateCadenceRow(email, { emailAberto: 'sim' }).catch(() => {});
        logger.info(`[TRACK] Abertura registrada — ${email} (etapa ${etapa || 0})`);
      }
    } catch { /* silencioso — não pode quebrar o pixel */ }
  }
});

// ─── GET /track/stats ─────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const data = readTracking();

    let totalOpens = 0;
    const emailsAbertos = new Set();

    Object.entries(data).forEach(([hash, record]) => {
      if (record.opens && record.opens.length > 0) {
        totalOpens += record.opens.length;
        emailsAbertos.add(hash);
      }
    });

    // Busca stats da planilha para totais de cadência
    const { pullFromSheets } = require('../services/sheetsClient');
    const contacts = await pullFromSheets();

    const totalLeads     = contacts.length;
    const emCadencia     = contacts.filter(c => c.cadenciaStatus === 'ativa').length;
    const concluidos     = contacts.filter(c => c.cadenciaStatus === 'concluida').length;
    const responderam    = contacts.filter(c => c.emailRespondido === 'sim').length;
    const abriram        = contacts.filter(c => c.emailAberto === 'sim').length;

    res.json({
      totalLeads,
      emCadencia,
      concluidos,
      abriram,
      responderam,
      taxaAbertura:  totalLeads > 0 ? ((abriram / totalLeads) * 100).toFixed(1) + '%' : '0%',
      taxaResposta:  totalLeads > 0 ? ((responderam / totalLeads) * 100).toFixed(1) + '%' : '0%',
      totalEventsRegistrados: totalOpens,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[TRACK] Erro ao buscar stats:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /track/stats/:email ──────────────────────────────────────────────────
router.get('/stats/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const hash  = Buffer.from(email).toString('base64url');
    const data  = readTracking();
    const record = data[hash] || { opens: [], replies: [] };

    const { pullFromSheets } = require('../services/sheetsClient');
    const contacts = await pullFromSheets();
    const contact  = contacts.find(c => c.email.toLowerCase() === email.toLowerCase());

    res.json({
      email,
      opens:           record.opens,
      totalOpens:      record.opens.length,
      emailAberto:     contact?.emailAberto     || '',
      emailRespondido: contact?.emailRespondido || '',
      dataResposta:    contact?.dataResposta    || '',
      cadenciaStatus:  contact?.cadenciaStatus  || '',
      cadenciaEtapa:   contact?.cadenciaEtapa   || '0',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /track/open/:rowIndex ────────────────────────────────────────────────
// Rota de tracking por rowIndex (usada pelo cadenceAutoJob)
router.get('/open/:rowIndex', async (req, res) => {
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(PIXEL_GIF);

  try {
    const rowIndex = parseInt(req.params.rowIndex);
    if (!isNaN(rowIndex) && rowIndex > 1) {
      await updateCell(rowIndex, COL.ABERTO, 'sim').catch(() => {});
      logger.info(`[TRACK] Email aberto via rowIndex ${rowIndex}`);
    }
  } catch { /* silencioso */ }
});

// ─── GET /track/click/:rowIndex ───────────────────────────────────────────────
// Registra clique no CTA e redireciona para Instagram
router.get('/click/:rowIndex', async (req, res) => {
  res.redirect('https://instagram.com/pedrocgaaranha');

  try {
    const rowIndex = parseInt(req.params.rowIndex);
    if (!isNaN(rowIndex) && rowIndex > 1) {
      await updateCell(rowIndex, COL.CTA_CLICADO, 'sim').catch(() => {});
      logger.info(`[TRACK] CTA clicado via rowIndex ${rowIndex}`);
    }
  } catch { /* silencioso */ }
});

module.exports = router;
