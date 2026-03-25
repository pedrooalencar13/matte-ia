const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { checkReplies } = require('../jobs/replyCheckerJob');
const { logger }       = require('../utils/logger');

const router       = express.Router();
const REPLIES_FILE = path.join(__dirname, '../../data/replies.json');

function loadReplies() {
  try { return JSON.parse(fs.readFileSync(REPLIES_FILE, 'utf-8')); }
  catch(e) { return []; }
}

function saveReplies(data) {
  fs.writeFileSync(REPLIES_FILE, JSON.stringify(data, null, 2));
}

// ─── GET /replies ──────────────────────────────────────────────────────────────
// Retorna lista de respostas, mais recentes primeiro
router.get('/', (req, res) => {
  const replies  = loadReplies();
  const naoLidas = replies.filter(r => !r.lida).length;
  res.json({
    replies: replies.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt)),
    naoLidas,
  });
});

// ─── POST /replies/check ───────────────────────────────────────────────────────
// Dispara verificação manual imediata
router.post('/check', async (req, res) => {
  try {
    logger.info('[REPLIES] Verificação manual solicitada');
    const result = await checkReplies();
    res.json({ success: true, ...result });
  } catch(e) {
    logger.error('[REPLIES] Erro na verificação manual:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /replies/:id/read ────────────────────────────────────────────────────
router.post('/:id/read', (req, res) => {
  const replies = loadReplies();
  const idx     = replies.findIndex(r => r.gmailId === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Resposta não encontrada' });
  replies[idx].lida = true;
  saveReplies(replies);
  res.json({ ok: true, reply: replies[idx] });
});

// ─── POST /replies/:id/answered ───────────────────────────────────────────────
router.post('/:id/answered', (req, res) => {
  const replies = loadReplies();
  const idx     = replies.findIndex(r => r.gmailId === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Resposta não encontrada' });
  replies[idx].lida       = true;
  replies[idx].respondida = true;
  saveReplies(replies);
  res.json({ ok: true, reply: replies[idx] });
});

module.exports = router;
