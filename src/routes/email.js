const express = require('express');
const { sendEmail, sendBulkEmails, getBulkStatus } = require('../services/gmailSender');
const { logger } = require('../utils/logger');

const router = express.Router();

// ─── POST /email/send ─────────────────────────────────────────────────────────
router.post('/send', async (req, res) => {
  const { to, subject, body } = req.body || {};
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Campos obrigatórios: to, subject, body' });
  }
  try {
    const msgId = await sendEmail({ to, subject, body });
    logger.success(`[EMAIL] E-mail enviado para ${to} — msgId: ${msgId}`);
    res.json({ sent: true, messageId: msgId });
  } catch (err) {
    logger.error('[EMAIL] Erro ao enviar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /email/bulk ─────────────────────────────────────────────────────────
// Inicia envio em massa em background — retorna jobId imediatamente
router.post('/bulk', async (req, res) => {
  const { emails } = req.body || {};
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'Forneça um array "emails" com pelo menos 1 item' });
  }

  const status = getBulkStatus();
  if (status.running) {
    return res.status(409).json({ error: 'Já existe um envio em massa em andamento', jobId: status.jobId });
  }

  logger.info(`[EMAIL] Iniciando envio em massa — ${emails.length} e-mails`);

  // Executa em background
  sendBulkEmails(emails).catch(err => {
    logger.error('[EMAIL] Erro no bulk:', err.message);
  });

  // Aguarda o jobId ser atribuído (o sendBulkEmails seta em < 50ms)
  await new Promise(r => setTimeout(r, 100));
  const newStatus = getBulkStatus();

  res.json({
    status: 'started',
    jobId: newStatus.jobId,
    total: emails.length,
    message: `Enviando ${emails.length} e-mails em background`,
  });
});

// ─── GET /email/status ────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json(getBulkStatus());
});

// ─── GET /email/test ──────────────────────────────────────────────────────────
// Testa se as credenciais Gmail OAuth2 estão configuradas e válidas
router.get('/test', async (req, res) => {
  try {
    const { google } = require('googleapis');
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
      return res.status(500).json({
        status: 'error',
        gmail_configured: false,
        token_valid: false,
        hint: 'Configure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET e GMAIL_REFRESH_TOKEN no Railway',
      });
    }
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const { token } = await oauth2Client.getAccessToken();
    res.json({
      status: 'ok',
      gmail_configured: true,
      token_valid: !!token,
      user: process.env.GMAIL_USER,
    });
  } catch(e) {
    logger.error('[EMAIL] Erro no teste OAuth2:', e.message);
    res.status(500).json({
      status: 'error',
      gmail_configured: false,
      token_valid: false,
      error: e.message,
      hint: 'Verifique GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET e GMAIL_REFRESH_TOKEN no Railway',
    });
  }
});

module.exports = router;
