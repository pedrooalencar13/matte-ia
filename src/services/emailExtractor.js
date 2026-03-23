const https = require('https');
const axios = require('axios');
const cheerio = require('cheerio');
const { logger } = require('../utils/logger');

// Ignora erros de SSL (certificados inválidos são comuns em sites de escritórios pequenos)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const PRIORITY_PATHS = ['/contato', '/contact', '/fale-conosco', '/sobre', '/about', '/quem-somos'];

const BLOCKED_FRAGMENTS = [
  'example.com', 'noreply', 'no-reply', 'sentry.io', 'wix.com',
  'wordpress.com', 'google.com', 'facebook.com', 'instagram.com',
  'seusite.com', 'empresa.com', 'dominio.com', 'webmaster@',
  'admin@', 'test@', 'teste@', 'yourname@', 'email@',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
];

function randomAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function isAllowed(email) {
  if (!email || !email.includes('@')) return false;
  const lower = email.toLowerCase();
  return !BLOCKED_FRAGMENTS.some(frag => lower.includes(frag));
}

/**
 * Extrai e-mails de links mailto: no HTML (mais confiável que regex).
 */
function extractMailtoLinks($) {
  const emails = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
    if (isAllowed(email)) emails.push(email.toLowerCase());
  });
  return [...new Set(emails)];
}

/**
 * Extrai e-mails via regex no texto do HTML.
 */
function extractByRegex(html) {
  const matches = html.match(EMAIL_REGEX) || [];
  return [...new Set(matches)].filter(isAllowed).map(e => e.toLowerCase());
}

/**
 * Busca e-mail em um HTML usando mailto primeiro, depois regex.
 */
function findEmailInHtml(html) {
  const $ = cheerio.load(html);

  const mailto = extractMailtoLinks($);
  if (mailto.length > 0) return { email: mailto[0], method: 'mailto' };

  const regex = extractByRegex(html);
  if (regex.length > 0) return { email: regex[0], method: 'regex' };

  return null;
}

function normalizeUrl(base, path) {
  try {
    return new URL(path, base).href;
  } catch {
    return null;
  }
}

async function fetchPage(url) {
  const res = await axios.get(url, {
    httpsAgent,                  // ← SSL bypass
    timeout: 8000,
    maxRedirects: 5,
    headers: {
      'User-Agent': randomAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  return res.data;
}

/**
 * Extrai o primeiro e-mail válido encontrado em um site.
 *
 * Ordem de busca:
 *   1. mailto links na página raiz
 *   2. regex na página raiz
 *   3. mailto links na página de contato
 *   4. regex na página de contato
 *
 * Nunca lança erro — retorna null se não encontrar nada.
 */
async function extractEmail(siteUrl) {
  if (!siteUrl) return null;

  const baseUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;

  let rootHtml = null;

  // ── Passo 1 & 2: página raiz ────────────────────────────────────────────────
  try {
    rootHtml = await fetchPage(baseUrl);
    const found = findEmailInHtml(rootHtml);
    if (found) {
      logger.success(`[EXTRACTOR] ✓ ${found.email} (${found.method} / raiz) — ${baseUrl}`);
      return found.email;
    }
  } catch (err) {
    logger.warn(`[EXTRACTOR] Raiz inacessível ${baseUrl}: ${err.message}`);
    return null;
  }

  // ── Passo 3 & 4: página de contato ─────────────────────────────────────────
  const $ = cheerio.load(rootHtml);
  let contactUrl = null;

  // Tenta caminhos prioritários que existam como link na página
  for (const p of PRIORITY_PATHS) {
    if ($(`a[href*="${p}"]`).length > 0) {
      contactUrl = normalizeUrl(baseUrl, p);
      break;
    }
  }

  // Fallback: texto do link contém "contato" / "fale" / "contact"
  if (!contactUrl) {
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = ($(el).text() || '').toLowerCase();
      if (text.includes('contato') || text.includes('fale') || text.includes('contact')) {
        contactUrl = normalizeUrl(baseUrl, href);
        return false; // break
      }
    });
  }

  if (contactUrl) {
    try {
      const contactHtml = await fetchPage(contactUrl);
      const found = findEmailInHtml(contactHtml);
      if (found) {
        logger.success(`[EXTRACTOR] ✓ ${found.email} (${found.method} / contato) — ${baseUrl}`);
        return found.email;
      }
    } catch {
      // Página de contato inacessível — não para o scraper
    }
  }

  logger.warn(`[EXTRACTOR] ✗ Nenhum e-mail encontrado — ${baseUrl}`);
  return null;
}

module.exports = { extractEmail };
