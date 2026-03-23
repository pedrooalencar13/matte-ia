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

module.exports = router;
