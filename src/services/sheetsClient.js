const { google } = require('googleapis');
const { logger } = require('../utils/logger');

// Mapeamento de colunas (0-indexed)
const COL = {
  NOME: 0,
  B: 1,
  C: 2,
  EMAIL: 3,
  EMPRESA: 4,
  TELEFONE: 5,
  CIDADE: 6,
  TAGS: 7,
  I: 8,
  SITE: 9,
  CAMPAIGN: 10,
  L: 11,
  FAT: 12,
  URG: 13,
  QUALIF: 14,
};

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

/**
 * Lê todos os contatos da planilha.
 * Retorna array de objetos com as colunas mapeadas.
 */
async function pullFromSheets() {
  const sheets = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const tab = process.env.SHEET_TAB || 'Sheet1';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A2:O`,
  });

  const rows = res.data.values || [];
  const contacts = rows.map((row, i) => ({
    index: i + 2,
    nome: row[COL.NOME] || '',
    email: row[COL.EMAIL] || '',
    empresa: row[COL.EMPRESA] || '',
    telefone: row[COL.TELEFONE] || '',
    cidade: row[COL.CIDADE] || '',
    tags: row[COL.TAGS] || '',
    site: row[COL.SITE] || '',
    campaign: row[COL.CAMPAIGN] || '',
    faturamento: row[COL.FAT] || '',
    urgencia: row[COL.URG] || '',
    qualificacao: row[COL.QUALIF] || '',
  })).filter(c => c.email);

  logger.info(`[SHEETS] ${contacts.length} contatos lidos da planilha`);
  return contacts;
}

/**
 * Insere um array de leads na planilha.
 * Cada lead vira uma linha nova ao final da aba.
 */
async function pushToSheets(leads) {
  if (!leads || leads.length === 0) return { pushed: 0, skipped: 0 };

  const sheets = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const tab = process.env.SHEET_TAB || 'Sheet1';

  // Monta as linhas na ordem correta das colunas A-O
  const rows = leads.map(lead => {
    const row = new Array(15).fill('');
    row[COL.NOME] = lead.nome || '';
    row[COL.EMAIL] = lead.email || '';
    row[COL.EMPRESA] = lead.nome || '';          // empresa = nome do escritório
    row[COL.TELEFONE] = lead.telefone || '';
    row[COL.CIDADE] = lead.cidade || '';
    row[COL.TAGS] = 'captado-auto';
    row[COL.SITE] = lead.site || '';
    row[COL.CAMPAIGN] = 'advogados';             // ESSENCIAL: ativa template fixo no frontend
    row[COL.FAT] = 'nao informado';
    row[COL.URG] = '';
    row[COL.QUALIF] = 'com potencial';
    return row;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: rows },
  });

  logger.success(`[SHEETS] ${rows.length} leads inseridos na planilha`);
  return { pushed: rows.length, skipped: 0 };
}

/**
 * Retorna todos os e-mails já existentes na planilha (para deduplicação).
 */
async function getExistingEmails() {
  try {
    const contacts = await pullFromSheets();
    return contacts.map(c => c.email.toLowerCase().trim()).filter(Boolean);
  } catch (err) {
    logger.warn('[SHEETS] Não foi possível ler e-mails existentes:', err.message);
    return [];
  }
}

module.exports = { pullFromSheets, pushToSheets, getExistingEmails };
