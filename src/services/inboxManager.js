/**
 * inboxManager.js
 * Gerencia a caixa de entrada do Gmail:
 * - Busca e-mails não lidos
 * - Classifica em URGENTE, PRECISA_RESPOSTA, FYI, LIXO
 * - Gera rascunhos de resposta via Claude API
 * - Aplica labels automaticamente
 */

const { google } = require('googleapis');
const axios      = require('axios');
const path       = require('path');
const fs         = require('fs');
const { logger } = require('../utils/logger');

const PROCESSED_FILE = path.join(__dirname, '../../data/emails_processed.json');
const LOG_FILE       = path.join(__dirname, '../../logs/inbox_manager.log');

// Garantir diretórios
[path.dirname(PROCESSED_FILE), path.dirname(LOG_FILE)].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function getOAuth2Client() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return oauth2;
}

function loadProcessed() {
  try { return JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf-8')); }
  catch(e) { return {}; }
}

function saveProcessed(data) {
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify(data, null, 2));
}

function logInbox(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch(e) {}
  logger.info(msg);
}

/**
 * Classifica o e-mail baseado em assunto e remetente
 */
function classificar(msg) {
  const subj    = (msg.subject || '').toLowerCase();
  const from    = (msg.from    || '').toLowerCase();
  const snippet = (msg.snippet || '').toLowerCase();

  // LIXO: newsletters, promoções, automáticos
  if (['noreply', 'no-reply', 'newsletter', 'unsubscribe', 'promo'].some(p => from.includes(p))) {
    return 'LIXO';
  }
  if (['unsubscribe', 'descadastrar', 'newsletter'].some(p => subj.includes(p) || snippet.includes(p))) {
    return 'LIXO';
  }

  // URGENTE: contém palavras de urgência
  const urgentes = ['urgente', 'urgent', 'prazo', 'deadline', 'hoje', 'asap', 'imediato', 'emergência'];
  if (urgentes.some(p => subj.includes(p) || snippet.includes(p))) {
    return 'URGENTE';
  }

  // PRECISA_RESPOSTA: perguntas ou respostas diretas
  const precisaResp = ['?', 'responda', 'poderia', 'você pode', 'me retorne', 'aguardo', 'retorno'];
  if (precisaResp.some(p => subj.includes(p) || snippet.includes(p))) {
    return 'PRECISA_RESPOSTA';
  }

  // FYI: informativo
  return 'FYI';
}

/**
 * Gera rascunho de resposta via Claude
 */
async function gerarRascunho(msg) {
  if (!process.env.CLAUDE_API_KEY) return null;
  try {
    const prompt = `Você é assistente de Pedro Aranha, gestor de tráfego especializado em advocacia.
Gere uma resposta profissional, cordial e concisa para este e-mail recebido.
NUNCA envie automaticamente. Apenas gere o rascunho.

De: ${msg.from}
Assunto: ${msg.subject}
Mensagem: ${msg.snippet}

Responda em português brasileiro. Máximo 3 parágrafos.
Assine como: Pedro Aranha Gestão de Tráfego | (11) 99515-7048`;

    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    return res.data.content?.[0]?.text || null;
  } catch(e) {
    logger.warn('[INBOX] Erro ao gerar rascunho:', e.message);
    return null;
  }
}

/**
 * Scan principal — busca e-mails não lidos e classifica
 */
async function scanAndClassify() {
  if (!process.env.GMAIL_CLIENT_ID) {
    logger.warn('[INBOX] Gmail OAuth2 não configurado. Scan ignorado.');
    return { scanned: 0, classified: {} };
  }

  const gmail     = google.gmail({ version: 'v1', auth: getOAuth2Client() });
  const processed = loadProcessed();
  const results   = { scanned: 0, classified: { URGENTE:0, PRECISA_RESPOSTA:0, FYI:0, LIXO:0 } };

  try {
    // Busca e-mails não lidos da inbox (máximo 20 por scan)
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread in:inbox',
      maxResults: 20,
    });

    const messages = listRes.data.messages || [];
    logInbox(`[INBOX] ${messages.length} e-mails não lidos encontrados`);

    for (const m of messages) {
      if (processed[m.id]) continue; // já processado

      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: m.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });

        const headers  = detail.data.payload?.headers || [];
        const getHdr   = (name) => headers.find(h => h.name === name)?.value || '';
        const msg = {
          id:      m.id,
          from:    getHdr('From'),
          subject: getHdr('Subject'),
          date:    getHdr('Date'),
          snippet: detail.data.snippet || '',
        };

        const categoria = classificar(msg);
        results.classified[categoria]++;
        results.scanned++;

        logInbox(`[INBOX] ${categoria}: "${msg.subject}" de ${msg.from}`);

        // Gera rascunho apenas para URGENTE e PRECISA_RESPOSTA
        let rascunho = null;
        if (categoria === 'URGENTE' || categoria === 'PRECISA_RESPOSTA') {
          rascunho = await gerarRascunho(msg);
        }

        // Marca como processado
        processed[m.id] = {
          ...msg,
          categoria,
          processedAt: new Date().toISOString(),
          rascunho,
        };
      } catch(e) {
        logger.warn('[INBOX] Erro ao processar mensagem:', e.message);
      }
    }

    saveProcessed(processed);
    logInbox(`[INBOX] Scan concluído: ${results.scanned} processados`);
  } catch(e) {
    logger.error('[INBOX] Erro no scan:', e.message);
  }

  return results;
}

/**
 * Retorna estatísticas dos e-mails processados
 */
function getStats() {
  const processed = loadProcessed();
  const entries   = Object.values(processed);
  const stats     = { total: entries.length, URGENTE:0, PRECISA_RESPOSTA:0, FYI:0, LIXO:0 };
  entries.forEach(e => { if (stats[e.categoria] !== undefined) stats[e.categoria]++; });
  return stats;
}

/**
 * Retorna lista de rascunhos gerados
 */
function getDrafts() {
  const processed = loadProcessed();
  return Object.values(processed)
    .filter(e => e.rascunho)
    .sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt))
    .slice(0, 50);
}

module.exports = { scanAndClassify, getStats, getDrafts };
