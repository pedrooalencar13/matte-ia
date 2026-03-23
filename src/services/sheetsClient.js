const { google } = require('googleapis');
const { logger } = require('../utils/logger');

// ── Mapeamento de colunas (0-indexed) ────────────────────────────────────────
// A=0  First Name
// B=1  Last Name
// C=2  Phone
// D=3  Email
// E=4  Business Name
// F=5  Created        ← deixar vazio (preenchido pelo sistema)
// G=6  Last Activity  ← cidade
// H=7  Tags
// I=8  utm_source
// J=9  utm_medium     ← especialidade
// K=10 utm_campaign   ← 'advogados' (ativa template fixo no frontend)
// L=11 utm_content    ← site
// M=12 faturamento
// N=13 urgencia
// O=14 qualificacao
// P=15 cadencia_status    ← 'ativa' | 'pausada' | 'concluida' | 'respondeu'
// Q=16 cadencia_etapa     ← 0-5
// R=17 cadencia_proximo   ← ISO date do próximo envio
// S=18 email_aberto       ← 'sim' | ''
// T=19 email_respondido   ← 'sim' | ''
// U=20 data_resposta      ← ISO date

const COL = {
  NOME:       0,
  SOBRENOME:  1,
  TELEFONE:   2,
  EMAIL:      3,
  EMPRESA:    4,
  CREATED:    5,
  ACTIVITY:   6,  // cidade
  TAGS:       7,
  SOURCE:     8,
  MEDIUM:     9,  // especialidade
  CAMPAIGN:   10,
  CONTENT:    11, // site
  FAT:        12,
  URG:        13,
  QUALIF:     14,
  // Cadence + tracking
  CAD_STATUS: 15,
  CAD_ETAPA:  16,
  CAD_PROXIMO:17,
  ABERTO:     18,
  RESPONDIDO: 19,
  DT_RESPOSTA:20,
};

const SHEET_RANGE_READ  = 'A2:U';
const SHEET_RANGE_WRITE = 'A1';

// ── Auth ──────────────────────────────────────────────────────────────────────
function getAuth() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

async function getSheetsClient() {
  const auth = getAuth();
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

function tab() {
  return process.env.SHEET_TAB || 'Página1';
}

// ── Leitura ───────────────────────────────────────────────────────────────────
async function pullFromSheets() {
  const sheets  = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab()}!${SHEET_RANGE_READ}`,
  });

  const rows = res.data.values || [];

  const contacts = rows.map((row, i) => ({
    rowIndex:         i + 2, // linha real na planilha (começa em 2 pois linha 1 é header)
    nome:             row[COL.NOME]        || '',
    sobrenome:        row[COL.SOBRENOME]   || '',
    telefone:         row[COL.TELEFONE]    || '',
    email:            row[COL.EMAIL]       || '',
    empresa:          row[COL.EMPRESA]     || '',
    cidade:           row[COL.ACTIVITY]    || '',
    tags:             row[COL.TAGS]        || '',
    source:           row[COL.SOURCE]      || '',
    medium:           row[COL.MEDIUM]      || '',   // especialidade
    campaign:         row[COL.CAMPAIGN]    || '',
    site:             row[COL.CONTENT]     || '',
    faturamento:      row[COL.FAT]         || '',
    urgencia:         row[COL.URG]         || '',
    qualificacao:     row[COL.QUALIF]      || '',
    cadenciaStatus:   row[COL.CAD_STATUS]  || '',
    cadenciaEtapa:    row[COL.CAD_ETAPA]   || '0',
    cadenciaProximo:  row[COL.CAD_PROXIMO] || '',
    emailAberto:      row[COL.ABERTO]      || '',
    emailRespondido:  row[COL.RESPONDIDO]  || '',
    dataResposta:     row[COL.DT_RESPOSTA] || '',
  })).filter(c => c.email && c.email.includes('@'));

  logger.info(`[SHEETS] ${contacts.length} contatos lidos`);
  return contacts;
}

// ── Escrita (novos leads) ─────────────────────────────────────────────────────
async function pushToSheets(leads) {
  if (!leads || leads.length === 0) return { pushed: 0, skipped: 0 };

  const sheets  = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const valid   = leads.filter(l => l.email && l.email.includes('@'));
  const skipped = leads.length - valid.length;

  const rows = valid.map(lead => {
    const row = new Array(21).fill('');

    const partes       = (lead.nome || '').trim().split(/\s+/);
    const primeiroNome = partes[0] || lead.nome || '';
    const resto        = partes.slice(1).join(' ');

    row[COL.NOME]       = primeiroNome;
    row[COL.SOBRENOME]  = resto;
    row[COL.TELEFONE]   = formatPhone(lead.telefone || '');
    row[COL.EMAIL]      = (lead.email || '').toLowerCase().trim();
    row[COL.EMPRESA]    = lead.nome || '';
    row[COL.CREATED]    = '';
    row[COL.ACTIVITY]   = lead.cidade || '';
    row[COL.TAGS]       = 'captado-auto';
    row[COL.SOURCE]     = 'google-maps';
    row[COL.MEDIUM]     = lead.especialidade || '';
    row[COL.CAMPAIGN]   = 'advogados';
    row[COL.CONTENT]    = lead.site || '';
    row[COL.FAT]        = 'não informado';
    row[COL.URG]        = '';
    row[COL.QUALIF]     = 'com potencial';
    // Inicia cadência automaticamente
    row[COL.CAD_STATUS] = 'ativa';
    row[COL.CAD_ETAPA]  = '0';
    row[COL.CAD_PROXIMO]= new Date().toISOString(); // envia primeiro e-mail imediatamente
    row[COL.ABERTO]     = '';
    row[COL.RESPONDIDO] = '';
    row[COL.DT_RESPOSTA]= '';

    return row;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab()}!${SHEET_RANGE_WRITE}`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: rows },
  });

  logger.success(`[SHEETS] ${rows.length} leads inseridos | ${skipped} ignorados`);
  return { pushed: rows.length, skipped };
}

// ── Update de cadência / tracking de uma linha específica ─────────────────────
/**
 * Atualiza colunas P-U de um lead específico (localizado pelo e-mail).
 * @param {string} email
 * @param {object} updates - pode conter: cadenciaStatus, cadenciaEtapa, cadenciaProximo,
 *                           emailAberto, emailRespondido, dataResposta
 */
async function updateCadenceRow(email, updates) {
  const sheets  = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const t       = tab();

  // Busca linha do lead pelo e-mail
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${t}!D2:D`,  // coluna D = email
  });

  const emailRows = res.data.values || [];
  const rowIndex  = emailRows.findIndex(r =>
    (r[0] || '').toLowerCase().trim() === email.toLowerCase().trim()
  );

  if (rowIndex === -1) {
    logger.warn(`[SHEETS] updateCadenceRow: e-mail não encontrado — ${email}`);
    return false;
  }

  const sheetRow = rowIndex + 2; // +2 por causa do header + base 1

  // Monta array de atualização para P-U (índices 15-20)
  const cadRow = new Array(6).fill('');
  if (updates.cadenciaStatus  !== undefined) cadRow[0] = updates.cadenciaStatus;
  if (updates.cadenciaEtapa   !== undefined) cadRow[1] = updates.cadenciaEtapa;
  if (updates.cadenciaProximo !== undefined) cadRow[2] = updates.cadenciaProximo;
  if (updates.emailAberto     !== undefined) cadRow[3] = updates.emailAberto;
  if (updates.emailRespondido !== undefined) cadRow[4] = updates.emailRespondido;
  if (updates.dataResposta    !== undefined) cadRow[5] = updates.dataResposta;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${t}!P${sheetRow}:U${sheetRow}`,
    valueInputOption: 'RAW',
    resource: { values: [cadRow] },
  });

  logger.info(`[SHEETS] Cadência/tracking atualizado para ${email} (linha ${sheetRow})`);
  return true;
}

// ── E-mails existentes (deduplicação) ─────────────────────────────────────────
async function getExistingEmails() {
  try {
    const contacts = await pullFromSheets();
    return contacts.map(c => c.email.toLowerCase().trim()).filter(Boolean);
  } catch (err) {
    logger.warn('[SHEETS] Não foi possível ler e-mails existentes:', err.message);
    return [];
  }
}

// ── Formatação de telefone ────────────────────────────────────────────────────
function formatPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    if (num.length === 9) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
    if (num.length === 8) return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }
  return raw;
}

module.exports = { pullFromSheets, pushToSheets, getExistingEmails, updateCadenceRow };
