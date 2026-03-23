const { google } = require('googleapis');
const { logger } = require('../utils/logger');

// Mapeamento real da planilha (0-indexed)
// A=0  First Name
// B=1  Last Name
// C=2  Phone        ← telefone aqui
// D=3  Email
// E=4  Business Name
// F=5  Created      ← deixar vazio (preenchido pelo sistema)
// G=6  Last Activity← deixar vazio
// H=7  Tags
// I=8  utm_source
// J=9  utm_medium
// K=10 utm_campaign
// L=11 utm_content
// M=12 (faturamento no frontend)
// N=13 (urgencia no frontend)
// O=14 (qualificacao no frontend)

const COL = {
  NOME:     0,  // A - First Name
  SOBRENOME:1,  // B - Last Name
  TELEFONE: 2,  // C - Phone ← CORRIGIDO
  EMAIL:    3,  // D - Email
  EMPRESA:  4,  // E - Business Name
  CREATED:  5,  // F - Created (deixar vazio)
  ACTIVITY: 6,  // G - Last Activity (cidade vai aqui para aparecer no painel)
  TAGS:     7,  // H - Tags
  SOURCE:   8,  // I - utm_source
  MEDIUM:   9,  // J - utm_medium
  CAMPAIGN: 10, // K - utm_campaign
  CONTENT:  11, // L - utm_content
  FAT:      12, // M - faturamento
  URG:      13, // N - urgencia
  QUALIF:   14, // O - qualificacao
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
 */
async function pullFromSheets() {
  const sheets = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const tab = process.env.SHEET_TAB || 'Página1';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A2:O`,
  });

  const rows = res.data.values || [];
  const contacts = rows.map((row, i) => ({
    index:       i + 2,
    nome:        row[COL.NOME]     || '',
    email:       row[COL.EMAIL]    || '',
    empresa:     row[COL.EMPRESA]  || '',
    telefone:    row[COL.TELEFONE] || '',
    cidade:      row[COL.ACTIVITY] || '', // cidade mapeada em Last Activity
    tags:        row[COL.TAGS]     || '',
    campaign:    row[COL.CAMPAIGN] || '',
    faturamento: row[COL.FAT]      || '',
    urgencia:    row[COL.URG]      || '',
    qualificacao:row[COL.QUALIF]   || '',
  })).filter(c => c.email && c.email.includes('@'));

  logger.info(`[SHEETS] ${contacts.length} contatos lidos da planilha`);
  return contacts;
}

/**
 * Insere leads na planilha com mapeamento correto de colunas.
 */
async function pushToSheets(leads) {
  if (!leads || leads.length === 0) return { pushed: 0, skipped: 0 };

  const sheets = await getSheetsClient();
  const sheetId = process.env.SHEET_ID;
  const tab = process.env.SHEET_TAB || 'Página1';

  // Valida e filtra leads com e-mail válido
  const valid = leads.filter(l => l.email && l.email.includes('@'));
  const skipped = leads.length - valid.length;

  const rows = valid.map(lead => {
    const row = new Array(15).fill('');

    // Extrai primeiro e último nome do escritório
    const partes = (lead.nome || '').trim().split(/\s+/);
    const primeiroNome = partes[0] || lead.nome || '';
    const resto = partes.slice(1).join(' ');

    row[COL.NOME]     = primeiroNome;                    // A - First Name
    row[COL.SOBRENOME]= resto;                           // B - Last Name
    row[COL.TELEFONE] = formatPhone(lead.telefone || '');// C - Phone ← CORRIGIDO
    row[COL.EMAIL]    = (lead.email || '').toLowerCase().trim(); // D - Email
    row[COL.EMPRESA]  = lead.nome || '';                 // E - Business Name
    row[COL.CREATED]  = '';                              // F - Created (deixar vazio)
    row[COL.ACTIVITY] = lead.cidade || '';               // G - Last Activity (cidade)
    row[COL.TAGS]     = 'captado-auto';                  // H - Tags
    row[COL.SOURCE]   = 'google-maps';                   // I - utm_source
    row[COL.MEDIUM]   = lead.especialidade || '';        // J - utm_medium (especialidade)
    row[COL.CAMPAIGN] = 'advogados';                     // K - utm_campaign (ativa template)
    row[COL.CONTENT]  = lead.site || '';                 // L - utm_content (site)
    row[COL.FAT]      = 'não informado';                 // M - faturamento
    row[COL.URG]      = '';                              // N - urgencia
    row[COL.QUALIF]   = 'com potencial';                 // O - qualificacao

    return row;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: rows },
  });

  logger.success(`[SHEETS] ${rows.length} leads inseridos | ${skipped} ignorados (sem e-mail)`);
  return { pushed: rows.length, skipped };
}

/**
 * Retorna e-mails já existentes na planilha (para deduplicação).
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

/**
 * Formata telefone para padrão legível.
 * Ex: +5511994567890 → (11) 99456-7890
 */
function formatPhone(raw) {
  if (!raw) return '';
  // Remove tudo que não é dígito
  const digits = raw.replace(/\D/g, '');
  // Brasil: +55 + DDD(2) + número(8 ou 9)
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    if (num.length === 9) return `(${ddd}) ${num.slice(0,5)}-${num.slice(5)}`;
    if (num.length === 8) return `(${ddd}) ${num.slice(0,4)}-${num.slice(4)}`;
  }
  // Se não conseguir formatar, retorna como veio
  return raw;
}

module.exports = { pullFromSheets, pushToSheets, getExistingEmails };
