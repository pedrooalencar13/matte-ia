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
// V=21 instagram          ← URL do perfil ou vazio
// W=22 score_ia           ← número 0-10
// X=23 motivo_score       ← texto curto

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
  // Enriquecimento Apify + IA
  INSTAGRAM:    21,
  SCORE_IA:     22,
  MOTIVO_SCORE: 23,
  // Novas colunas
  TELEFONE_FIXO: 24,
  TELEFONE_CEL:  25,
  SITE:          26,
  EMAIL_VALIDO:  27,
  // Tracking de clique no CTA
  CTA_CLICADO:   28,
};

const SHEET_RANGE_READ  = 'A1:AC'; // inclui linha de cabeçalho (sheetRows[0] = header)
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
  const dataRows = rows.slice(1); // remove linha de cabeçalho (índice 0 = linha 1 da planilha)

  const contacts = dataRows.map((row, i) => ({
    rowIndex:         i + 2, // linha real na planilha (começa em 2 pois linha 1 é header)
    nome:             row[COL.NOME]         || '',
    sobrenome:        row[COL.SOBRENOME]    || '',
    telefone:         row[COL.TELEFONE]     || '',
    email:            row[COL.EMAIL]        || '',
    empresa:          row[COL.EMPRESA]      || '',
    created:          row[COL.CREATED]      || '',
    cidade:           sanitizeCity(row[COL.ACTIVITY] || ''),
    tags:             row[COL.TAGS]         || '',
    source:           row[COL.SOURCE]       || '',
    medium:           row[COL.MEDIUM]       || '',   // especialidade
    campaign:         row[COL.CAMPAIGN]     || '',
    site:             row[COL.CONTENT]      || '',
    faturamento:      row[COL.FAT]          || '',
    urgencia:         row[COL.URG]          || '',
    qualificacao:     row[COL.QUALIF]       || '',
    cadenciaStatus:   row[COL.CAD_STATUS]   || '',
    cadenciaEtapa:    row[COL.CAD_ETAPA]    || '0',
    cadenciaProximo:  row[COL.CAD_PROXIMO]  || '',
    emailAberto:      row[COL.ABERTO]       || '',
    emailRespondido:  row[COL.RESPONDIDO]   || '',
    dataResposta:     row[COL.DT_RESPOSTA]  || '',
    instagram:        row[COL.INSTAGRAM]     || '',
    scoreIa:          row[COL.SCORE_IA]      || '',
    motivoScore:      row[COL.MOTIVO_SCORE]  || '',
    telefoneFixo:     row[COL.TELEFONE_FIXO] || '',
    telefoneCelular:  row[COL.TELEFONE_CEL]  || '',
    site:             row[COL.SITE]          || row[COL.CONTENT] || '',
    emailValido:      row[COL.EMAIL_VALIDO]  || '',
  })).filter(c => c.email && c.email.includes('@'));

  logger.info(`[SHEETS] ${contacts.length} contatos lidos`);
  return contacts;
}

// Converte índice 0-based para letra de coluna (A=0, Z=25, AA=26, AB=27...)
function indexToCol(idx) {
  let col = '';
  let n   = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n   = Math.floor((n - 1) / 26);
  }
  return col;
}

// Separa telefone em fixo ou celular (heurística brasileira)
function splitPhone(raw) {
  if (!raw) return { fixo: '', celular: '' };
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return { fixo: '', celular: '' };
  const local      = digits.length >= 10 ? digits.slice(-9) : digits.slice(-8);
  const isCelular  = local.length === 9 && local[0] === '9';
  if (isCelular) return { fixo: '', celular: raw.trim() };
  return { fixo: raw.trim(), celular: '' };
}

// ── Verifica/insere cabeçalhos das colunas V-AB na primeira execução ──────────
async function ensureHeaders(sheets, sheetId) {
  const EXPECTED = {
    [COL.INSTAGRAM]:    'Instagram',
    [COL.SCORE_IA]:     'Score IA',
    [COL.MOTIVO_SCORE]: 'Motivo Score',
    [COL.TELEFONE_FIXO]:'Telefone Fixo',
    [COL.TELEFONE_CEL]: 'Telefone Celular',
    [COL.SITE]:         'Site',
    [COL.EMAIL_VALIDO]: 'Email Valido',
    [COL.CTA_CLICADO]:  'CTA Clicado',
  };

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab()}!A1:AC1`,
  });

  const header = (res.data.values || [[]])[0] || [];
  const updates = [];

  for (const [colIdx, label] of Object.entries(EXPECTED)) {
    const idx = parseInt(colIdx);
    if ((header[idx] || '').trim() !== label) {
      updates.push({ range: `${tab()}!${indexToCol(idx)}1`, values: [[label]] });
    }
  }

  if (updates.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    resource: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });

  logger.info(`[SHEETS] Cabeçalhos inseridos: ${updates.map(u => u.values[0][0]).join(', ')}`);
}

// ── Escrita (novos leads) ─────────────────────────────────────────────────────
async function pushToSheets(leads) {
  if (!leads || leads.length === 0) return { pushed: 0, skipped: 0 };

  const sheets  = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const valid   = leads.filter(l => l.email && l.email.includes('@'));
  const skipped = leads.length - valid.length;

  await ensureHeaders(sheets, sheetId);

  const rows = valid.map(lead => {
    const row      = new Array(28).fill('');
    const nomeCompleto = (lead.nome || lead.name || '').trim();

    row[COL.NOME]        = nomeCompleto;                                  // A — nome completo
    row[COL.SOBRENOME]   = lead.category || lead.especialidade || '';     // B — categoria
    row[COL.TELEFONE]    = formatPhone(lead.telefone || lead.phone || '');
    row[COL.EMAIL]       = (lead.email || '').toLowerCase().trim();
    row[COL.EMPRESA]     = nomeCompleto;                                  // E — mesmo nome completo
    row[COL.CREATED]     = new Date().toISOString();                      // F — data de captação
    row[COL.ACTIVITY]    = lead.cidade || lead.city || '';
    row[COL.TAGS]        = 'captado-auto';
    row[COL.SOURCE]      = 'google-maps';
    row[COL.MEDIUM]      = lead.especialidade || lead.category || '';
    row[COL.CAMPAIGN]    = 'advogados';
    row[COL.CONTENT]     = lead.site || lead.website || '';
    row[COL.FAT]         = 'não informado';
    row[COL.URG]         = '';
    row[COL.QUALIF]      = 'com potencial';
    row[COL.CAD_STATUS]  = 'ativa';
    row[COL.CAD_ETAPA]   = '0';
    row[COL.CAD_PROXIMO] = new Date().toISOString();
    row[COL.ABERTO]      = '';
    row[COL.RESPONDIDO]  = '';
    row[COL.DT_RESPOSTA] = '';
    row[COL.INSTAGRAM]    = lead.instagram || '';
    row[COL.SCORE_IA]     = lead.aiScore !== undefined ? String(lead.aiScore) : '';
    row[COL.MOTIVO_SCORE] = lead.aiScoreReason || '';
    const phones          = splitPhone(lead.telefone || lead.phone || '');
    row[COL.TELEFONE_FIXO]= phones.fixo;
    row[COL.TELEFONE_CEL] = phones.celular;
    row[COL.SITE]         = lead.website || lead.site || '';
    row[COL.EMAIL_VALIDO] = '';

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

// ── Sanitização de cidade (descarta valores que parecem datas do CRM) ─────────
function sanitizeCity(val) {
  if (!val) return '';
  if (/\d{4}-\d{2}-\d{2}/.test(val)) return '';
  if (/\w{3}\s+\d{1,2}\s+\d{4}/.test(val)) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return '';
  if (/^\w{3}\s+\d{2}\s+\d{4}\s+\d{2}:\d{2}/.test(val)) return '';
  return val;
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

// ── Leitura raw (todas as linhas, sem filtro) ──────────────────────────────────
async function readAll() {
  const sheets  = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab()}!${SHEET_RANGE_READ}`,
  });
  return res.data.values || [];
}

// ── Atualização de célula individual ──────────────────────────────────────────
/**
 * Atualiza uma célula específica pelo número de linha (1-based, incluindo header)
 * e índice de coluna (0-based).
 * @param {number} rowNum   - linha na planilha (2 = primeira linha de dados)
 * @param {number} colIndex - coluna 0-based (ex: 19 = T, 20 = U, 15 = P)
 * @param {string} value    - valor a gravar
 */
async function updateCell(rowNum, colIndex, value) {
  const sheets  = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const range   = `${tab()}!${indexToCol(colIndex)}${rowNum}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'RAW',
    resource: { values: [[value]] },
  });
  logger.info(`[SHEETS] updateCell(${range}) = "${value}"`);
}

// ── Atualização da etapa de cadência por rowIndex ─────────────────────────────
async function updateCadenciaEtapa(rowIndex, etapa, proximoEnvio) {
  const sheets  = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const data    = [
    { range: `${tab()}!${indexToCol(COL.CAD_ETAPA)}${rowIndex}`,   values: [[String(etapa)]] },
    { range: `${tab()}!${indexToCol(COL.CAD_PROXIMO)}${rowIndex}`, values: [[proximoEnvio || '']] },
  ];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    resource: { valueInputOption: 'RAW', data },
  });
}

async function updateCadenciaStatus(rowIndex, status) {
  await updateCell(rowIndex, COL.CAD_STATUS, status);
}

module.exports = {
  COL,
  pullFromSheets,
  pushToSheets,
  getExistingEmails,
  updateCadenceRow,
  updateCadenciaEtapa,
  updateCadenciaStatus,
  readAll,
  updateCell,
};
