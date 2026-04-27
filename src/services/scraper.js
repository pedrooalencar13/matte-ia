const { v4: uuidv4 } = require('uuid');
const { scrapePlaces } = require('../scrapers/apifyScraper');
const { scoreLeads } = require('../utils/scorer');
const { isDuplicate } = require('./deduplicator');
const { isValidEmail } = require('../utils/validator');
const { getExistingEmails } = require('./sheetsClient');
const { logger } = require('../utils/logger');
const { readLeads, writeLeads } = require('../routes/leads');
const { runEnrichmentBatch } = require('./enrichmentService');

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

/**
 * Extrai especialidade do termo de busca.
 */
function getEspecialidade(term) {
  const map = {
    trabalhista:  'trabalhista',
    previdenciario: 'previdenciário',
    empresarial:  'empresarial',
    criminal:     'criminal',
    familia:      'família',
    tributario:   'tributário',
    imobiliario:  'imobiliário',
    advocacia:    'geral',
  };
  for (const [key, val] of Object.entries(map)) {
    if (term.includes(key)) return val;
  }
  return 'geral';
}

/**
 * Executa uma rodada completa de scraping via Apify.
 * @param {object} options - terms, cities, limit
 */
async function runScraper(options = {}) {
  if (jobStatus.running) {
    logger.warn('[SCRAPER] Já existe um job rodando. Aguarde.');
    return [];
  }

  const terms      = options.terms  || DEFAULT_SEARCH_TERMS;
  const cities     = options.cities || DEFAULT_CITIES;
  const maxPerRun  = options.limit  || parseInt(process.env.SCRAPER_MAX_PER_RUN) || 50;
  const jobId      = uuidv4().substring(0, 8);

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

  const newLeads       = [];
  const visitedDomains = new Set();
  const combinations   = [];

  for (const term of terms) {
    for (const city of cities) {
      combinations.push({ term, city });
    }
  }

  logger.info(`[SCRAPER] Job ${jobId} — ${combinations.length} combinações de busca (Apify)`);

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

    let results = [];
    try {
      results = await scrapePlaces(query);
      jobStatus.found += results.length;
    } catch (err) {
      logger.error(`[SCRAPER] Erro no Apify para "${query}": ${err.message}`);
      jobStatus.errors++;
    }

    for (const place of results) {
      if (!jobStatus.running) break;
      if (jobStatus.valid >= maxPerRun) break;

      const email   = (place.email || '').toLowerCase().trim();
      const website = place.website || '';

      if (!email || !isValidEmail(email)) continue;

      // Anti-bloqueio: não duplicar domínio
      if (website) {
        let domain;
        try { domain = new URL(website).hostname; } catch { domain = website; }
        if (visitedDomains.has(domain)) continue;
        visitedDomains.add(domain);
      }

      if (isDuplicate(email, [...localLeads, ...newLeads], sheetEmails)) {
        jobStatus.duplicates++;
        logger.warn(`[SCRAPER] Duplicado: ${email}`);
        continue;
      }

      const lead = {
        id:          uuidv4(),
        nome:        place.name   || '',
        name:        place.name   || '',
        email,
        especialidade: getEspecialidade(term),
        category:    place.category  || '',
        cidade:      city,
        city:        place.city  || city,
        site:        website,
        website,
        telefone:    place.phone || '',
        phone:       place.phone || '',
        endereco:    place.address || '',
        address:     place.address || '',
        instagram:   place.instagram || '',
        rating:      place.rating      || 0,
        reviewCount: place.reviewCount || 0,
        fonte:       'Google Maps (Apify)',
        status:      'novo',
        capturedAt:  new Date().toISOString(),
      };

      newLeads.push(lead);
      jobStatus.valid++;
      jobStatus.lastLog = `✓ ${lead.nome} — ${email}`;
      logger.success(`[SCRAPER] ✓ ${lead.nome} — ${email}`);
    }

    processed++;
    jobStatus.progress = Math.round((processed / combinations.length) * 100);
  }

  // Pontua leads com Claude AI
  let leadsParaSalvar = newLeads;
  if (newLeads.length > 0) {
    jobStatus.lastLog = 'Pontuando leads com IA...';
    try {
      leadsParaSalvar = await scoreLeads(newLeads);
      logger.info(`[SCRAPER] Scoring concluído para ${leadsParaSalvar.length} leads`);
    } catch (err) {
      logger.warn('[SCRAPER] Erro no scoring de leads:', err.message);
    }

    // Persiste leads novos no cache local
    const allLeads = [...localLeads, ...leadsParaSalvar];
    writeLeads(allLeads);
    logger.success(`[SCRAPER] ${leadsParaSalvar.length} novos leads salvos no cache local`);

    // Inicia enriquecimento profundo em background após 2s
    setTimeout(() => runEnrichmentBatch(leadsParaSalvar.length), 2000);

    // Inicia cadência automática para novos clientes após 10s
    setTimeout(async () => {
      try {
        const { runCadenceJob } = require('./cadenceAutoJob');
        logger.info('[SCRAPER] Iniciando cadência para novos clientes...');
        await runCadenceJob();
      } catch(e) {
        logger.error('[SCRAPER] Erro ao iniciar cadência:', e.message);
      }
    }, 10000);
  }

  jobStatus.running  = false;
  jobStatus.progress = 100;
  jobStatus.lastLog  = `Concluído — ${jobStatus.valid} leads válidos encontrados`;
  logger.info(`[SCRAPER] Job ${jobId} finalizado`);

  return leadsParaSalvar;
}

function stopScraper() {
  if (jobStatus.running) {
    jobStatus.running = false;
    logger.warn('[SCRAPER] Job interrompido manualmente');
  }
}

module.exports = { runScraper, getStatus, stopScraper };
