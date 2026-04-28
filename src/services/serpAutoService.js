const sheetsClient = require('./sheetsClient');

let _autoRunning = false;
let _lastRun = null;

const DEFAULT_QUERIES = [
  { term: 'advogado trabalhista', cities: ['São Paulo', 'Santos', 'Guarujá', 'Campinas'] },
  { term: 'advogado previdenciário', cities: ['São Paulo', 'Santos', 'São Vicente'] },
  { term: 'advogado tributário', cities: ['São Paulo', 'Campinas'] },
  { term: 'advogado cível', cities: ['São Paulo', 'Santos'] },
  { term: 'advogado família', cities: ['São Paulo', 'Guarujá'] },
  { term: 'escritório advocacia', cities: ['Guarujá', 'Santos', 'São Vicente', 'Cubatão'] }
];

async function runSerpAutoCron() {
  if (_autoRunning) {
    console.log('[SERP-CRON] Já em execução, pulando...');
    return { total: 0 };
  }
  _autoRunning = true;
  _lastRun = new Date().toISOString();
  let totalNovos = 0;

  try {
    const hasOutscraper = !!process.env.OUTSCRAPER_API_KEY;
    const { scrapePlaces } = hasOutscraper
      ? require('../scrapers/outscraper')
      : require('../scrapers/serpScraper');
    const scraperName = hasOutscraper ? 'Outscraper' : 'SerpAPI';

    console.log(`[SERP-CRON] Iniciando busca automática com ${scraperName}...`);

    for (const { term, cities } of DEFAULT_QUERIES) {
      for (const city of cities) {
        const query = `${term} ${city}`;
        try {
          const leads = await scrapePlaces(query, 5);
          if (leads.length > 0) {
            const result = await sheetsClient.pushToSheets(leads);
            const inserted = result?.inserted || result?.pushCount || 0;
            totalNovos += inserted;
            if (inserted > 0) {
              console.log(`[SERP-CRON] ✓ "${query}": ${inserted} novos`);
            }
          }
          await new Promise(r => setTimeout(r, 3000));
        } catch(e) {
          console.error(`[SERP-CRON] Erro para "${query}":`, e.message);
        }
      }
    }

    console.log(`[SERP-CRON] Concluído. ${totalNovos} novos leads adicionados.`);

    if (totalNovos > 0) {
      const { runCadenceJob } = require('./cadenceAutoJob');
      setTimeout(() => runCadenceJob(), 5000);
    }

  } finally {
    _autoRunning = false;
  }

  return { total: totalNovos };
}

function getAutoStatus() {
  return { running: _autoRunning, lastRun: _lastRun };
}

module.exports = { runSerpAutoCron, getAutoStatus };
