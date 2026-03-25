/**
 * replyCheckerJob.js
 * Verifica respostas de leads no Gmail a cada 15 minutos.
 * - Lê todos os e-mails da planilha via readAll()
 * - Busca mensagens na inbox enviadas por esses e-mails nos últimos 2 dias
 * - Persiste resultados em data/replies.json
 * - Atualiza planilha: col T (respondido=sim), col U (data), col P (status=respondeu)
 */

const cron   = require('node-cron');
const { google } = require('googleapis');
const fs     = require('fs');
const path   = require('path');
const { readAll, updateCell } = require('../services/sheetsClient');
const { logger } = require('../utils/logger');

const REPLIES_FILE = path.join(__dirname, '../../data/replies.json');
const COL_EMAIL    = 3;   // D = índice 3
const COL_STATUS   = 15;  // P
const COL_RESPONDIDO = 19; // T
const COL_DT_RESPOSTA = 20; // U

// Garantir diretório
const dir = path.dirname(REPLIES_FILE);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function loadReplies() {
  try { return JSON.parse(fs.readFileSync(REPLIES_FILE, 'utf-8')); }
  catch(e) { return []; }
}

function saveReplies(data) {
  fs.writeFileSync(REPLIES_FILE, JSON.stringify(data, null, 2));
}

function getOAuth2Client() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return oauth2;
}

/**
 * Extrai texto plain de um payload de mensagem do Gmail (recursivo)
 */
function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return '';
}

/**
 * Função principal: escaneia Gmail e atualiza planilha
 */
async function checkReplies() {
  if (!process.env.GMAIL_CLIENT_ID) {
    logger.warn('[REPLY] Gmail OAuth2 não configurado. Checagem ignorada.');
    return { checked: 0, found: 0 };
  }

  try {
    const rows = await readAll();
    if (!rows.length) {
      logger.info('[REPLY] Planilha vazia.');
      return { checked: 0, found: 0 };
    }

    // Monta mapa email→rowIndex (rowIndex = linha real na planilha, começa em 2)
    const emailMap = {};
    rows.forEach((row, i) => {
      const email = (row[COL_EMAIL] || '').toLowerCase().trim();
      if (email && email.includes('@')) {
        emailMap[email] = i + 2; // +2: header ocupa linha 1
      }
    });

    const allEmails = Object.keys(emailMap);
    if (!allEmails.length) {
      logger.info('[REPLY] Nenhum e-mail na planilha.');
      return { checked: 0, found: 0 };
    }

    logger.info(`[REPLY] Checando respostas de ${allEmails.length} leads...`);

    const gmail     = google.gmail({ version: 'v1', auth: getOAuth2Client() });
    const replies   = loadReplies();
    const seenIds   = new Set(replies.map(r => r.gmailId));

    // Data de corte: 48h atrás (em segundos epoch)
    const cutoff = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000);

    // Busca todas as mensagens recebidas nos últimos 2 dias da inbox
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `in:inbox after:${cutoff}`,
      maxResults: 100,
    });

    const messages = listRes.data.messages || [];
    logger.info(`[REPLY] ${messages.length} mensagens recentes encontradas na inbox`);

    let found = 0;
    const updated = [...replies];

    for (const m of messages) {
      if (seenIds.has(m.id)) continue;

      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: m.id,
          format: 'full',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });

        const headers  = detail.data.payload?.headers || [];
        const getHdr   = (name) => headers.find(h => h.name === name)?.value || '';
        const fromRaw  = getHdr('From');
        // Extrai e-mail do campo From: "Nome <email@domain.com>" ou "email@domain.com"
        const fromMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/([^\s]+@[^\s]+)/);
        const fromEmail = fromMatch ? fromMatch[1].toLowerCase().trim() : '';

        if (!fromEmail || !emailMap[fromEmail]) continue;

        const rowNum = emailMap[fromEmail];
        const row    = rows[rowNum - 2]; // -2 para voltar ao índice do array

        // Verifica se já está marcado como respondeu na planilha
        const jaRespondeu = (row[COL_RESPONDIDO] || '') === 'sim';

        const replyEntry = {
          gmailId:     m.id,
          email:       fromEmail,
          from:        fromRaw,
          subject:     getHdr('Subject'),
          date:        getHdr('Date'),
          snippet:     detail.data.snippet || '',
          body:        extractBody(detail.data.payload).slice(0, 2000),
          rowNum,
          receivedAt:  new Date().toISOString(),
          lida:        false,
          respondida:  false,
        };

        updated.push(replyEntry);
        seenIds.add(m.id);
        found++;

        logger.success(`[REPLY] Resposta de ${fromEmail}: "${replyEntry.subject}"`);

        // Atualiza planilha se ainda não foi marcado
        if (!jaRespondeu) {
          const dateIso = new Date(replyEntry.date || Date.now()).toISOString();
          try {
            await updateCell(rowNum, COL_RESPONDIDO,  'sim');
            await updateCell(rowNum, COL_DT_RESPOSTA, dateIso);
            await updateCell(rowNum, COL_STATUS,      'respondeu');
            logger.info(`[REPLY] Planilha atualizada: linha ${rowNum} → respondeu`);
          } catch(err) {
            logger.warn(`[REPLY] Erro ao atualizar planilha para ${fromEmail}: ${err.message}`);
          }
        }
      } catch(e) {
        logger.warn(`[REPLY] Erro ao processar mensagem ${m.id}: ${e.message}`);
      }
    }

    saveReplies(updated);
    logger.info(`[REPLY] Checagem concluída: ${found} respostas novas`);
    return { checked: messages.length, found };

  } catch(err) {
    logger.error('[REPLY] Erro geral na checagem:', err.message);
    return { checked: 0, found: 0, error: err.message };
  }
}

// ── Cron: a cada 15 minutos ──────────────────────────────────────────────────
cron.schedule('*/15 * * * *', async () => {
  logger.info('[CRON-REPLY] Verificando respostas de leads...');
  const result = await checkReplies();
  logger.info(`[CRON-REPLY] Resultado: ${result.found} novas de ${result.checked} mensagens`);
});

logger.info('[CRON-REPLY] Agendado: a cada 15 minutos (*/15 * * * *)');

module.exports = { checkReplies };
