const axios = require('axios');
const { logger } = require('../utils/logger');

const APIFY_BASE = 'https://api.apify.com/v2';
const PLACES_ACTOR = 'compass~crawler-google-places';
const POLL_INTERVAL_MS = 3000;
const RUN_TIMEOUT_MS = 300000; // 5 minutos

function getToken() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN não configurada');
  return token;
}

// Aguarda um run do Apify terminar com polling
async function waitForRun(runId) {
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await axios.get(
      `${APIFY_BASE}/actor-runs/${runId}?token=${getToken()}`,
      { timeout: 10000 }
    );
    const { status, defaultDatasetId } = res.data.data;
    if (status === 'SUCCEEDED') return defaultDatasetId;
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Apify run ${runId} terminou com status: ${status}`);
    }
  }
  throw new Error(`Apify run ${runId} excedeu timeout de ${RUN_TIMEOUT_MS / 1000}s`);
}

// Busca itens de um dataset do Apify
async function fetchDatasetItems(datasetId) {
  const res = await axios.get(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${getToken()}&format=json`,
    { timeout: 30000 }
  );
  return res.data || [];
}

// Dispara o Actor de Google Places e retorna os resultados brutos
async function runPlacesActor(query, limit) {
  const res = await axios.post(
    `${APIFY_BASE}/acts/${PLACES_ACTOR}/runs?token=${getToken()}`,
    {
      searchStringsArray: [query],
      maxCrawledPlacesPerSearch: limit,
      language: 'pt-BR',
      countryCode: 'br',
      scrapeContacts: true,
    },
    { timeout: 15000 }
  );
  const runId = res.data.data.id;
  logger.info(`[APIFY] Places run iniciado: ${runId} para "${query}"`);
  const datasetId = await waitForRun(runId);
  return fetchDatasetItems(datasetId);
}

/**
 * Scraper principal via Apify.
 * Retorna array normalizado:
 * { name, email, phone, website, instagram, address, city, rating, reviewCount, category }
 *
 * @param {string} query  - texto da busca (ex: "advogado trabalhista Guarujá")
 * @param {number} [limit=10] - máximo de resultados
 */
async function scrapePlaces(query, limit = 10) {
  logger.info(`[APIFY] Buscando: "${query}" (limite: ${limit})`);
  const rawResults = await runPlacesActor(query, limit);
  logger.info(`[APIFY] ${rawResults.length} lugares encontrados para "${query}"`);

  return rawResults.map(place => ({
    name:        place.title        || '',
    email:       extractEmail(place),
    phone:       place.phone        || '',
    website:     place.website      || '',
    instagram:   place.socialMedia?.instagram || '',
    address:     place.address      || '',
    city:        place.city         || extractCity(place.address || ''),
    rating:      place.totalScore   || 0,
    reviewCount: place.reviewsCount || 0,
    category:    place.categoryName || '',
  }));
}

// Extrai e-mail dos dados de contato retornados com scrapeContacts:true
function extractEmail(place) {
  if (Array.isArray(place.emails) && place.emails.length) return place.emails[0];
  if (typeof place.email === 'string' && place.email) return place.email;
  return '';
}

// Tenta extrair cidade do endereço (heurística para endereços brasileiros)
function extractCity(address) {
  if (!address) return '';
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 3) return parts[parts.length - 3] || '';
  if (parts.length >= 2) return parts[parts.length - 2] || '';
  return '';
}

module.exports = { scrapePlaces };
