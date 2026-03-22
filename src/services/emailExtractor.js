const axios = require('axios');
const cheerio = require('cheerio');
const { isValidEmail } = require('../utils/validator');
const { logger } = require('../utils/logger');

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const PRIORITY_PATHS = ['/contato', '/contact', '/fale-conosco', '/sobre', '/about', '/quem-somos'];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
];

function randomAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function extractEmailsFromHtml(html) {
  const matches = html.match(EMAIL_REGEX) || [];
  return [...new Set(matches)].filter(isValidEmail);
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
    timeout: 8000,
    headers: {
      'User-Agent': randomAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
    maxRedirects: 5,
  });
  return res.data;
}

/**
 * Extrai o primeiro e-mail válido encontrado em um site.
 * Estratégia: página raiz → link de contato → regex em todo HTML.
 */
async function extractEmail(siteUrl) {
  if (!siteUrl) return null;

  // Garante que começa com http/https
  const baseUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;

  try {
    // 1. Tenta a página raiz
    const rootHtml = await fetchPage(baseUrl);
    const rootEmails = extractEmailsFromHtml(rootHtml);
    if (rootEmails.length > 0) {
      logger.success(`[EXTRACTOR] E-mail na raiz de ${baseUrl}: ${rootEmails[0]}`);
      return rootEmails[0];
    }

    // 2. Procura links de contato no HTML da raiz
    const $ = cheerio.load(rootHtml);
    let contactUrl = null;

    // Checa os caminhos prioritários
    for (const path of PRIORITY_PATHS) {
      const fullUrl = normalizeUrl(baseUrl, path);
      if (!fullUrl) continue;

      // Verifica se o link existe na página
      const hasLink = $(`a[href*="${path}"]`).length > 0;
      if (hasLink) {
        contactUrl = fullUrl;
        break;
      }
    }

    // Se não achou por path, tenta encontrar link com texto de contato
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

    // 3. Acessa a página de contato se encontrada
    if (contactUrl) {
      try {
        const contactHtml = await fetchPage(contactUrl);
        const contactEmails = extractEmailsFromHtml(contactHtml);
        if (contactEmails.length > 0) {
          logger.success(`[EXTRACTOR] E-mail na pg contato de ${baseUrl}: ${contactEmails[0]}`);
          return contactEmails[0];
        }
      } catch {
        // Página de contato inacessível — continua sem parar
      }
    }

    // 4. Nenhum e-mail encontrado
    logger.warn(`[EXTRACTOR] Nenhum e-mail em ${baseUrl}`);
    return null;
  } catch (err) {
    logger.warn(`[EXTRACTOR] Erro ao acessar ${baseUrl}: ${err.message}`);
    return null;
  }
}

module.exports = { extractEmail };
