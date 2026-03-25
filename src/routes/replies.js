'use strict';
const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const path     = require('path');
const { checkReplies } = require('../jobs/replyCheckerJob');

const REPLIES_FILE = path.join(process.cwd(), 'data', 'replies.json');

function load() {
  try { return JSON.parse(fs.readFileSync(REPLIES_FILE, 'utf8')); }
  catch(e) { return { replies: [], lastCheck: null, processedIds: [] }; }
}

function save(data) {
  fs.mkdirSync(path.dirname(REPLIES_FILE), { recursive: true });
  fs.writeFileSync(REPLIES_FILE, JSON.stringify(data, null, 2));
}

// ── GET /replies ──────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const data = load();
  res.json({
    replies:     data.replies || [],
    lastCheck:   data.lastCheck,
    total:       (data.replies || []).length,
    naoLidas:    (data.replies || []).filter(r => !r.lido).length,
    comFollowUp: (data.replies || []).filter(r => r.followUpGerado && !r.respondido).length,
  });
});

// ── POST /replies/check ───────────────────────────────────────────────────────
router.post('/check', async (req, res) => {
  try {
    const result = await checkReplies();
    res.json({ success: true, ...result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /replies/:id/read ────────────────────────────────────────────────────
router.post('/:id/read', (req, res) => {
  const data  = load();
  const reply = (data.replies || []).find(r => r.id === req.params.id);
  if (!reply) return res.status(404).json({ error: 'Não encontrado' });
  reply.lido = true;
  save(data);
  res.json({ success: true });
});

// ── POST /replies/:id/answered ────────────────────────────────────────────────
router.post('/:id/answered', (req, res) => {
  const data  = load();
  const reply = (data.replies || []).find(r => r.id === req.params.id);
  if (!reply) return res.status(404).json({ error: 'Não encontrado' });
  reply.respondido = true;
  reply.lido       = true;
  save(data);
  res.json({ success: true });
});

// ── POST /replies/:id/regenerate ──────────────────────────────────────────────
router.post('/:id/regenerate', async (req, res) => {
  const data  = load();
  const reply = (data.replies || []).find(r => r.id === req.params.id);
  if (!reply) return res.status(404).json({ error: 'Não encontrado' });

  try {
    const Anthropic     = require('@anthropic-ai/sdk');
    const { google }    = require('googleapis');
    const { gerarFollowUp } = require('../jobs/replyCheckerJob');

    const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

    const oauth2 = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    // Histórico de enviados para análise de tom
    const sentHistory = [];
    try {
      const sentRes = await gmail.users.messages.list({ userId: 'me', q: 'in:sent', maxResults: 10 });
      for (const m of (sentRes.data.messages || [])) {
        const d = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' });
        sentHistory.push({ snippet: d.data.snippet || '' });
      }
    } catch(e) { /* continua sem histórico */ }

    const fu = await gerarFollowUp(reply, reply.leadData || {}, sentHistory, anthropic);
    reply.followUpGerado  = true;
    reply.followUpAssunto = fu.assunto;
    reply.followUpCorpo   = fu.corpo;
    save(data);
    res.json({ success: true, followUpAssunto: fu.assunto, followUpCorpo: fu.corpo });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
