/**
 * Verifica se um e-mail já existe localmente ou na planilha.
 */
function isDuplicate(email, localLeads, sheetEmails = []) {
  if (!email) return true;
  const norm = email.toLowerCase().trim();
  return (
    localLeads.some(l => (l.email || '').toLowerCase().trim() === norm) ||
    sheetEmails.includes(norm)
  );
}

/**
 * Remove duplicados de um array de leads pelo campo e-mail.
 */
function deduplicateArray(leads) {
  const seen = new Set();
  return leads.filter(lead => {
    const key = (lead.email || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { isDuplicate, deduplicateArray };
