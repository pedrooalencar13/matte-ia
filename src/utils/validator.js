const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

// Domínios descartados por serem genéricos, de exemplo ou no-reply
const BLOCKED_PREFIXES = ['noreply', 'no-reply', 'donotreply', 'mailer-daemon', 'postmaster'];
const BLOCKED_DOMAINS = [
  'example.com', 'example.org', 'test.com', 'seusite.com.br',
  'dominio.com.br', 'empresa.com.br', 'seuemail.com', 'email.com',
];

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.toLowerCase().trim();
  if (!EMAIL_REGEX.test(normalized)) return false;

  const [prefix, domain] = normalized.split('@');
  if (BLOCKED_PREFIXES.some(p => prefix.startsWith(p))) return false;
  if (BLOCKED_DOMAINS.includes(domain)) return false;

  return true;
}

function normalizeLead(raw) {
  return {
    nome: (raw.nome || '').trim(),
    email: (raw.email || '').toLowerCase().trim(),
    especialidade: (raw.especialidade || '').trim(),
    cidade: (raw.cidade || '').trim(),
    site: (raw.site || '').trim(),
    telefone: (raw.telefone || '').trim(),
    fonte: raw.fonte || 'manual',
    status: raw.status || 'novo',
  };
}

module.exports = { isValidEmail, normalizeLead };
