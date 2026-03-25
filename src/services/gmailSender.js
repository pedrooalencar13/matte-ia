const { google } = require('googleapis');
const { logger } = require('../utils/logger');
const fs   = require('fs');
const path = require('path');

const AUDIT_LOG  = path.join(process.cwd(), 'logs', 'email_audit.log');
const VALID_SOURCES = ['manual_individual', 'manual_bulk'];

function auditLog(entry) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    fs.appendFileSync(AUDIT_LOG, line);
  } catch(e) { logger.warn('[AUDIT] Falha ao gravar log:', e.message); }
}

// Pixel de tracking: GIF 1x1 transparente em base64
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// ── Estado do job de envio em massa ──────────────────────────────────────────
let bulkJob = {
  running: false,
  jobId: null,
  total: 0,
  sent: 0,
  failed: 0,
  errors: [],
};

function getBulkStatus() {
  return { ...bulkJob };
}

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  );
  client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return client;
}

/**
 * Constrói um e-mail MIME raw em base64url.
 * Suporta texto plano + HTML com pixel de tracking embutido.
 */
function buildRawMessage({ to, from, subject, textBody, htmlBody }) {
  const boundary = `matte_${Date.now()}`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;

  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(textBody || htmlBody || '').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody).toString('base64'),
    '',
    `--${boundary}--`,
  ];

  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

/**
 * Converte texto plano em HTML simples respeitando quebras de linha.
 */
function textToHtml(text, trackingPixelUrl) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const pixel = trackingPixelUrl
    ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;opacity:0" alt="">`
    : '';

  return `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#222;max-width:600px">
<p>${escaped}</p>
${pixel}
</body></html>`;
}

/**
 * Envia um único e-mail via Gmail API.
 * @param {object} opts - { to, subject, body, trackingPixelUrl?, source }
 *   source DEVE ser 'manual_individual' ou 'manual_bulk' — qualquer outro valor é bloqueado.
 * @returns {string} messageId do Gmail
 */
async function sendEmail({ to, subject, body, trackingPixelUrl, source }) {
  if (!VALID_SOURCES.includes(source)) {
    const msg = `[BLOQUEADO] Tentativa de envio com source inválido: "${source}" para ${to}`;
    logger.error(msg);
    auditLog({ action: 'BLOCKED', source, to, subject });
    throw new Error(`Envio bloqueado: source inválido ("${source}"). Use manual_individual ou manual_bulk.`);
  }

  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REFRESH_TOKEN) {
    throw new Error('Credenciais Gmail OAuth2 não configuradas (GMAIL_CLIENT_ID, GMAIL_REFRESH_TOKEN)');
  }

  const auth  = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });
  const from  = process.env.GMAIL_USER || 'pedrooalencar13@gmail.com';

  const htmlBody = textToHtml(body, trackingPixelUrl);
  const raw = buildRawMessage({ to, from, subject, textBody: body, htmlBody });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  auditLog({ action: 'SENT', source, to, subject, messageId: res.data.id });
  return res.data.id;
}

/**
 * Envia e-mails em massa com delay entre cada um.
 * @param {Array} emails - [{ to, subject, body, name? }]
 * @returns {object} relatório { total, sent, failed, errors }
 */
async function sendBulkEmails(emails) {
  if (!emails || emails.length === 0) return { total: 0, sent: 0, failed: 0, errors: [] };

  const MAX_BATCH = 50;
  const batch = emails.slice(0, MAX_BATCH);
  const { v4: uuidv4 } = require('uuid');
  const jobId = uuidv4().substring(0, 8);

  bulkJob = {
    running: true,
    jobId,
    total: batch.length,
    sent: 0,
    failed: 0,
    errors: [],
  };

  const DELAY_MS = 2000;
  const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://matte-ia-production.up.railway.app';

  logger.info(`[GMAIL] Iniciando envio em massa — job ${jobId} — ${batch.length} e-mails`);

  for (let i = 0; i < batch.length; i++) {
    if (!bulkJob.running) break;

    const item = batch[i];
    const emailHash = Buffer.from(item.to || '').toString('base64url');
    const etapa = item.etapa || 0;
    const trackingUrl = `${backendUrl}/track/open?id=${emailHash}&etapa=${etapa}`;

    try {
      const msgId = await sendEmail({
        to: item.to,
        subject: item.subject,
        body: item.body,
        trackingPixelUrl: trackingUrl,
        source: 'manual_bulk',
      });

      bulkJob.sent++;
      logger.success(`[GMAIL] ✓ ${item.to} (${bulkJob.sent}/${batch.length}) — msgId: ${msgId}`);
    } catch (err) {
      bulkJob.failed++;
      bulkJob.errors.push({ to: item.to, error: err.message });
      logger.error(`[GMAIL] ✗ ${item.to}: ${err.message}`);
    }

    if (i < batch.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  bulkJob.running = false;
  logger.info(`[GMAIL] Job ${jobId} concluído — ${bulkJob.sent} enviados, ${bulkJob.failed} erros`);

  return {
    total: bulkJob.total,
    sent: bulkJob.sent,
    failed: bulkJob.failed,
    errors: bulkJob.errors,
    jobId,
  };
}

/**
 * Busca e-mails recebidos de um determinado endereço (para detectar respostas).
 */
async function checkRepliesFrom(emailAddresses) {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REFRESH_TOKEN) return [];
  if (!emailAddresses || emailAddresses.length === 0) return [];

  try {
    const auth  = getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    // Monta query: "from:(email1 OR email2 OR ...)" com data de corte de 30 dias
    const fromQuery = emailAddresses.slice(0, 20).map(e => `from:${e}`).join(' OR ');
    const query = `(${fromQuery}) newer_than:30d`;

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });

    const messages = res.data.messages || [];
    const replies = [];

    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Date'],
        });
        const fromHeader = full.data.payload?.headers?.find(h => h.name === 'From')?.value || '';
        const dateHeader = full.data.payload?.headers?.find(h => h.name === 'Date')?.value || '';
        const emailMatch = fromHeader.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
          replies.push({ email: emailMatch[0].toLowerCase(), date: dateHeader });
        }
      } catch { /* ignora msgs individuais com erro */ }
    }

    return replies;
  } catch (err) {
    logger.warn('[GMAIL] Erro ao checar respostas:', err.message);
    return [];
  }
}

module.exports = { sendEmail, sendBulkEmails, getBulkStatus, checkRepliesFrom, PIXEL_GIF };
