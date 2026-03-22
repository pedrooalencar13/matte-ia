const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { extractEmail } = require('./emailExtractor');
const { isDuplicate } = require('./deduplicator');
const { isValidEmail } = require('../utils/validator');
const { getExistingEmails } = require('./sheetsClient');
const { logger } = require('../utils/logger');
const { readLeads, writeLeads } = require('../routes/leads');

const DEFAULT_SEARCH_TERMS = [
  'advogado trabalhista',
  'advogado previdenciario',
  'advogado empresarial',
  'advogado criminal',
  'advogado familia',
  'advogado tributario',
  'escritorio de advocacia',
  'advogado imobiliario',
];

const DEFAULT_CITIES = [
  'Sao Paulo', 'Rio de Janeiro', 'Belo Horizonte',
  'Curitiba', 'Porto Alegre', 'Salvador',
  'Fortaleza', 'Recife', 'Campinas', 'Goiania',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
];

// Estado global do job atual
let jobStatus = {
  running: false,
  found: 0,
  valid: 0,
  duplicates: 0,
  errors: 0,
  progress: 0,
  lastLog: '',
  jobId: null,
};

function getStatus() {
  return { ...jobStatus };
}

function randomAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Delay variável para anti-bloqueio
function delay(ms) {
  return new Promise(r => setTimeout(r, ms + Math.random() * 1000));
}

/**
 * Busca resultados do Google Maps via SerpAPI.
 */
async function searchSerpApi(query) {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) throw new Error('SERP_API_KEY não configurada');

  const res = await axios.get('https://serpapi.com/search', {
    params: {
      engine: 'google_maps',
      q: query,
      api_key: apiKey,
      hl: 'pt',
      gl: 'br',
    },
    timeout: 15000,
    headers: { 'User-Agent': randomAgent() },
  });

  return res.data.local_results || [];
}

/**
 * Extrai especialidade do termo de busca.
 */
function getEspecialidade(term) {
  const map = {
    trabalhista: 'trabalhista',
    previdenciario: 'previdenciário',
    empresarial: 'empresarial',
    criminal: 'criminal',
    familia: 'família',
    tributario: 'tributário',
    imobiliario: 'imobiliário',
    advocacia: 'geral',
  };
  for (const [key, val] of Object.entries(map)) {
    if (term.includes(key)) return val;
  }
  return 'geral';
}

/**
 * Executa uma rodada completa de scraping.
 * @param {object} options - terms, cities, limit
 */
async function runScraper(options = {}) {
  if (jobStatus.running) {
    logger.warn('[SCRAPER] Já existe um job rodando. Aguarde.');
    return [];
  }

  const terms = options.terms || DEFAULT_SEARCH_TERMS;
  const cities = options.cities || DEFAULT_CITIES;
  const maxPerRun = options.limit || parseInt(process.env.SCRAPER_MAX_PER_RUN) || 50;
  const delayMs = parseInt(process.env.SCRAPER_DELAY_MS) || 2500;
  const jobId = uuidv4().substring(0, 8);

  // Reset status
  jobStatus = {
    running: true,
    found: 0,
    valid: 0,
    duplicates: 0,
    errors: 0,
    progress: 0,
    lastLog: 'Iniciando...',
    jobId,
  };

  const newLeads = [];
  const visitedDomains = new Set();
  const combinations = [];

  for (const term of terms) {
    for (const city of cities) {
      combinations.push({ term, city });
    }
  }

  logger.info(`[SCRAPER] Job ${jobId} — ${combinations.length} combinações de busca`);

  // Pré-carrega e-mails existentes para deduplicação
  let sheetEmails = [];
  try {
    sheetEmails = await getExistingEmails();
  } catch {
    logger.warn('[SCRAPER] Não foi possível pré-carregar e-mails da planilha');
  }

  const localLeads = readLeads();
  let processed = 0;

  for (const { term, city } of combinations) {
    if (!jobStatus.running) break;
    if (jobStatus.valid >= maxPerRun) {
      logger.info(`[SCRAPER] Limite de ${maxPerRun} leads atingido`);
      break;
    }

    const query = `${term} ${city}`;
    logger.info(`[SCRAPER] Buscando: "${query}"`);

    let results = [];
    try {
      results = await searchSerpApi(query);
      jobStatus.found += results.length;
    } catch (err) {
      logger.error(`[SCRAPER] Erro na SerpAPI para "${query}": ${err.message}`);
      jobStatus.errors++;
    }

    for (const result of results) {
      if (!jobStatus.running) break;
      if (jobStatus.valid >= maxPerRun) break;

      const site = result.website;
      if (!site) continue;

      // Anti-bloqueio: não bater no mesmo domínio duas vezes
      let domain;
      try {
        domain = new URL(site).hostname;
      } catch {
        continue;
      }
      if (visitedDomains.has(domain)) continue;
      visitedDomains.add(domain);

      await delay(delayMs);

      try {
        const email = await extractEmail(site);

        if (!email || !isValidEmail(email)) continue;

        if (isDuplicate(email, [...localLeads, ...newLeads], sheetEmails)) {
          jobStatus.duplicates++;
          logger.warn(`[SCRAPER] Duplicado: ${email}`);
          continue;
        }

        const lead = {
          id: uuidv4(),
          nome: result.title || '',
          email,
          especialidade: getEspecialidade(term),
          cidade: city,
          site,
          telefone: result.phone || '',
          endereco: result.address || '',
          fonte: 'Google Maps',
          status: 'novo',
          capturedAt: new Date().toISOString(),
        };

        newLeads.push(lead);
        jobStatus.valid++;
        jobStatus.lastLog = `✓ ${lead.nome} — ${email}`;
        logger.success(`[SCRAPER] ✓ ${lead.nome} — ${email}`);
      } catch (err) {
        jobStatus.errors++;
        logger.warn(`[SCRAPER] Erro ao processar ${site}: ${err.message}`);
      }
    }

    processed++;
    jobStatus.progress = Math.round((processed / combinations.length) * 100);
  }

  // Persiste leads novos no cache local
  if (newLeads.length > 0) {
    const allLeads = [...localLeads, ...newLeads];
    writeLeads(allLeads);
    logger.success(`[SCRAPER] ${newLeads.length} novos leads salvos no cache local`);
  }

  jobStatus.running = false;
  jobStatus.progress = 100;
  jobStatus.lastLog = `Concluído — ${jobStatus.valid} leads válidos encontrados`;
  logger.info(`[SCRAPER] Job ${jobId} finalizado`);

  return newLeads;
}

function stopScraper() {
  if (jobStatus.running) {
    jobStatus.running = false;
    logger.warn('[SCRAPER] Job interrompido manualmente');
  }
}

module.exports = { runScraper, getStatus, stopScraper };
