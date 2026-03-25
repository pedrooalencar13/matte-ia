'use strict';
const cron         = require('node-cron');
const { google }   = require('googleapis');
const Anthropic    = require('@anthropic-ai/sdk');
const sheetsClient = require('../services/sheetsClient');
const fs           = require('fs');
const path         = require('path');

const REPLIES_FILE = path.join(process.cwd(), 'data', 'replies.json');
const LOG_FILE     = path.join(process.cwd(), 'logs', 'reply_checker.log');

// ── Índices de colunas (0-based) ──────────────────────────────────────────────
const COL_EMAIL       = 3;   // D
const COL_CAD_STATUS  = 15;  // P
const COL_RESPONDIDO  = 19;  // T
const COL_DT_RESPOSTA = 20;  // U

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(e) {}
}

function loadReplies() {
  try { return JSON.parse(fs.readFileSync(REPLIES_FILE, 'utf8')); }
  catch(e) { return { replies: [], processedIds: [], lastCheck: null }; }
}

function saveReplies(data) {
  try {
    fs.mkdirSync(path.dirname(REPLIES_FILE), { recursive: true });
    fs.mkdirSync(path.dirname(LOG_FILE),     { recursive: true });
    fs.writeFileSync(REPLIES_FILE, JSON.stringify(data, null, 2));
  } catch(e) { log('Erro ao salvar replies: ' + e.message); }
}

function getGmailClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data)
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  if (payload.parts) {
    for (const part of payload.parts) {
      const b = extractBody(part);
      if (b) return b;
    }
  }
  return '';
}

function cleanBody(raw) {
  return raw.split('\n')
    .filter(l => {
      const t = l.trim();
      return !t.startsWith('>') && !t.startsWith('On ') &&
             !t.startsWith('Em ') && !t.match(/^-{3,}/) && t !== '--';
    })
    .join('\n').trim();
}

// ── Gerar follow-up com Claude ────────────────────────────────────────────────
async function gerarFollowUp(replyData, leadData, sentHistory, anthropic) {
  log(`Gerando follow-up para: ${replyData.email}`);
  const tomExemplos = sentHistory.slice(0, 20).map(e => e.snippet).filter(Boolean).join('\n---\n');

  const prompt = `Você é Pedro Aranha, especialista em gestão de tráfego pago para escritórios de advocacia.

## DADOS COMPLETOS DO LEAD
- Nome: ${leadData.nome || replyData.from}
- Empresa/Escritório: ${leadData.empresa || 'não informado'}
- Faturamento mensal: ${leadData.faturamento || 'não informado'}
- Qualificação: ${leadData.qualificacao || 'não informado'}
- Especialidade jurídica: ${leadData.medium || 'não informado'}
- Cidade: ${leadData.cidade || 'não informado'}
- Urgência declarada: ${leadData.urgencia || 'não informada'}
- Etapa da cadência: ${leadData.cadenciaEtapa || '0'} de 6
- Data do primeiro contato: ${leadData.created || 'não registrada'}

## RESPOSTA DO LEAD
Assunto: ${replyData.subject}
Data: ${replyData.dateFormatted}
${replyData.bodyClean}

## SEU ESTILO DE ESCRITA (últimos e-mails enviados)
${tomExemplos || '(sem histórico disponível)'}

## MISSÃO
Analise a resposta do lead. Escreva um follow-up PERFEITO que:
1. Responda diretamente ao que ele disse (mostre que leu com atenção)
2. Avance para o próximo passo natural (reunião, call, proposta)
3. Use o mesmo tom e estilo dos seus e-mails anteriores
4. Seja humano, caloroso e consultivo — máximo 3 parágrafos
5. Termine com CTA claro: WhatsApp (11) 99515-7048 ou sugestão de horário

Formato da resposta — PRIMEIRA LINHA: assunto do e-mail. SEGUNDA LINHA: ===ASSUNTO===. RESTANTE: corpo do e-mail.`;

  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 700,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto  = r.content[0].text;
  const partes = texto.split('===ASSUNTO===');
  return partes.length === 2
    ? { assunto: partes[0].trim(), corpo: partes[1].trim() }
    : { assunto: `Re: ${replyData.subject}`, corpo: texto.trim() };
}

// ── Verificação principal ─────────────────────────────────────────────────────
async function checkReplies() {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REFRESH_TOKEN) {
    log('Gmail não configurado — pulando verificação');
    return { checked: 0, newReplies: 0 };
  }

  log('=== Iniciando verificação de respostas ===');
  const stored    = loadReplies();
  const gmail     = getGmailClient();
  const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

  // Carregar leads da planilha (inclui header em sheetRows[0])
  let sheetRows = [], sheetEmails = [];
  try {
    await new Promise(r => setTimeout(r, 1000));
    sheetRows   = await sheetsClient.readAll();
    // slice(1) descarta o cabeçalho
    sheetEmails = sheetRows.slice(1)
      .map(r => (r[COL_EMAIL] || '').trim().toLowerCase())
      .filter(e => e.includes('@'));
    log(`${sheetEmails.length} leads carregados da planilha`);
  } catch(e) {
    log('Erro ao ler planilha: ' + e.message);
    return { checked: 0, newReplies: 0 };
  }

  // Histórico de enviados para análise de tom
  let sentHistory = [];
  try {
    const sentRes = await gmail.users.messages.list({ userId: 'me', q: 'in:sent', maxResults: 20 });
    for (const m of (sentRes.data.messages || [])) {
      const d = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' });
      sentHistory.push({ snippet: d.data.snippet || '' });
      await new Promise(r => setTimeout(r, 100));
    }
  } catch(e) { log('Aviso: não foi possível carregar enviados: ' + e.message); }

  // Buscar e-mails recebidos nas últimas 72h
  const after   = Math.floor((Date.now() - 72 * 60 * 60 * 1000) / 1000);
  const listRes = await gmail.users.messages.list({
    userId: 'me', q: `in:inbox after:${after}`, maxResults: 30,
  });
  const messages = listRes.data.messages || [];
  log(`${messages.length} e-mails para verificar`);

  let newReplies = 0;
  const updatedReplies = [...(stored.replies || [])];

  for (const msg of messages) {
    if ((stored.processedIds || []).includes(msg.id)) continue;
    try {
      await new Promise(r => setTimeout(r, 300));
      const detail  = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      const headers = detail.data.payload?.headers || [];
      const getHdr  = name => headers.find(h => h.name === name)?.value || '';

      const fromHeader = getHdr('From');
      const subject    = getHdr('Subject') || '(sem assunto)';
      const date       = getHdr('Date')    || '';

      const fromMatch = fromHeader.match(/[\w.+\-]+@[\w.\-]+\.\w+/);
      if (!fromMatch) { stored.processedIds.push(msg.id); continue; }
      const fromEmail = fromMatch[0].toLowerCase();

      if (!sheetEmails.includes(fromEmail))                      { stored.processedIds.push(msg.id); continue; }
      if (updatedReplies.some(r => r.id === msg.id))             { stored.processedIds.push(msg.id); continue; }

      log(`Resposta de lead encontrada: ${fromEmail}`);

      const bodyRaw   = extractBody(detail.data.payload);
      const bodyClean = cleanBody(bodyRaw).slice(0, 800);

      // Buscar dados do lead na planilha (sheetRows[0] é cabeçalho, dados a partir de [1])
      let leadData = {}, leadRowIndex = -1;
      for (let i = 1; i < sheetRows.length; i++) {
        if ((sheetRows[i][COL_EMAIL] || '').trim().toLowerCase() === fromEmail) {
          leadRowIndex = i; // índice no array (1-based, sendo 0 o header)
          leadData = {
            nome:          `${sheetRows[i][0]||''} ${sheetRows[i][1]||''}`.trim(),
            empresa:        sheetRows[i][4]  || '',
            created:        sheetRows[i][5]  || '',
            cidade:         sheetRows[i][6]  || '',
            medium:         sheetRows[i][9]  || '',
            faturamento:    sheetRows[i][12] || '',
            urgencia:       sheetRows[i][13] || '',
            qualificacao:   sheetRows[i][14] || '',
            cadenciaStatus: sheetRows[i][15] || '',
            cadenciaEtapa:  sheetRows[i][16] || '0',
          };
          break;
        }
      }

      const dateISO = new Date(date).toISOString();
      const replyObj = {
        id:              msg.id,
        email:           fromEmail,
        from:            fromHeader,
        subject,
        bodyClean,
        body:            bodyClean,
        fullBody:        bodyRaw.slice(0, 3000),
        date:            dateISO,
        dateFormatted:   new Date(date).toLocaleString('pt-BR',
          { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
        threadId:        detail.data.threadId,
        leadData,
        lido:            false,
        respondido:      false,
        followUpGerado:  false,
        followUpAssunto: '',
        followUpCorpo:   '',
      };

      // Gerar follow-up com Claude
      try {
        const fu = await gerarFollowUp(replyObj, leadData, sentHistory, anthropic);
        replyObj.followUpGerado  = true;
        replyObj.followUpAssunto = fu.assunto;
        replyObj.followUpCorpo   = fu.corpo;
        log(`Follow-up gerado: "${fu.assunto}"`);
      } catch(e) {
        log(`Aviso: não foi possível gerar follow-up: ${e.message}`);
      }

      // Atualizar planilha (leadRowIndex é index 1-based no array com header em 0)
      // Linha na planilha = leadRowIndex + 1 (header ocupa linha 1 da sheet, dados a partir de 2)
      if (leadRowIndex >= 0) {
        const planilhaRow = leadRowIndex + 1;
        try {
          await new Promise(r => setTimeout(r, 500));
          await sheetsClient.updateCell(planilhaRow, COL_RESPONDIDO,  'sim');
          await new Promise(r => setTimeout(r, 300));
          await sheetsClient.updateCell(planilhaRow, COL_DT_RESPOSTA, dateISO);
          await new Promise(r => setTimeout(r, 300));
          await sheetsClient.updateCell(planilhaRow, COL_CAD_STATUS,  'respondeu');
          log(`Planilha atualizada: ${fromEmail} (linha ${planilhaRow}) → respondeu`);
        } catch(e) { log(`Aviso: não foi possível atualizar planilha: ${e.message}`); }
      }

      updatedReplies.unshift(replyObj);
      newReplies++;
      stored.processedIds.push(msg.id);
    } catch(e) {
      log(`Erro ao processar ${msg.id}: ${e.message}`);
      stored.processedIds.push(msg.id);
    }
  }

  stored.replies      = updatedReplies.slice(0, 300);
  stored.lastCheck    = new Date().toISOString();
  stored.processedIds = (stored.processedIds || []).slice(-1000);
  saveReplies(stored);
  log(`=== Concluído: ${newReplies} nova(s) resposta(s) ===`);
  return { checked: messages.length, newReplies, total: updatedReplies.length, lastCheck: stored.lastCheck };
}

// ── Cron: a cada 15 minutos ───────────────────────────────────────────────────
cron.schedule('*/15 * * * *', async () => {
  try { await checkReplies(); }
  catch(e) { log('Erro no cron: ' + e.message); }
}, { timezone: 'America/Sao_Paulo' });

log('[CRON-REPLY] Agendado: a cada 15 minutos');

module.exports = { checkReplies, gerarFollowUp };
