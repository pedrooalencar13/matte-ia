const axios = require('axios');
const { logger } = require('../utils/logger');

const APIFY_BASE = 'https://api.apify.com/v2';
const PLACES_ACTOR = 'compass~crawler-google-places';
const SOCIAL_ACTOR = 'apify~social-media-leads-analyzer';
const POLL_INTERVAL_MS = 3000;
const RUN_TIMEOUT_MS = 300000; // 5 minutos

function apifyHeaders() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN não configurada');
  return { Authorization: `Bearer ${token}` };
}

// Aguarda um run do Apify terminar com polling
async function waitForRun(runId) {
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await axios.get(`${APIFY_BASE}/actor-runs/${runId}`, {
      headers: apifyHeaders(),
      timeout: 10000,
    });
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
  const res = await axios.get(`${APIFY_BASE}/datasets/${datasetId}/items`, {
    headers: apifyHeaders(),
    params: { clean: true, format: 'json' },
    timeout: 30000,
  });
  return res.data || [];
}

// Dispara o Actor de Google Places e retorna os resultados brutos
async function runPlacesActor(query) {
  const res = await axios.post(
    `${APIFY_BASE}/acts/${PLACES_ACTOR}/runs`,
    {
      searchStringsArray: [query],
      maxCrawledPlacesPerSearch: 50,
      language: 'pt',
    },
    { headers: apifyHeaders(), timeout: 15000 }
  );
  const runId = res.data.data.id;
  logger.info(`[APIFY] Places run iniciado: ${runId} para "${query}"`);
  const datasetId = await waitForRun(runId);
  return fetchDatasetItems(datasetId);
}

// Dispara o Actor de social media para um website e retorna emails/phones/instagram
async function runSocialActor(website) {
  const res = await axios.post(
    `${APIFY_BASE}/acts/${SOCIAL_ACTOR}/runs`,
    { startUrls: [{ url: website }], maxDepth: 1 },
    { headers: apifyHeaders(), timeout: 15000 }
  );
  const runId = res.data.data.id;
  const datasetId = await waitForRun(runId);
  const items = await fetchDatasetItems(datasetId);
  if (!items.length) return {};

  // Consolida emails, phones e instagram de todos os itens retornados
  const emails = [];
  const phones = [];
  let instagram = '';

  for (const item of items) {
    if (Array.isArray(item.emails)) {
      item.emails.forEach(e => { if (e && !emails.includes(e)) emails.push(e); });
    }
    if (Array.isArray(item.phones)) {
      item.phones.forEach(p => { if (p && !phones.includes(p)) phones.push(p); });
    }
    if (!instagram && item.instagram) instagram = item.instagram;
    // Alguns formatos trazem socialProfiles
    if (!instagram && item.socialProfiles?.instagram) instagram = item.socialProfiles.instagram;
  }

  return { emails, phones, instagram };
}

/**
 * Scraper principal via Apify.
 * Retorna array normalizado:
 * { name, email, phone, website, instagram, address, city, rating, reviewCount, category }
 *
 * @param {string} query   - texto da busca (ex: "advogado trabalhista São Paulo")
 * @param {boolean} [enrichSocial=true] - se deve chamar o actor de social media
 */
async function scrapePlaces(query, enrichSocial = true) {
  logger.info(`[APIFY] Buscando: "${query}"`);
  const rawResults = await runPlacesActor(query);
  logger.info(`[APIFY] ${rawResults.length} lugares encontrados para "${query}"`);

  const leads = [];

  for (const place of rawResults) {
    const website = place.website || place.url || '';

    let email = '';
    let phone = place.phone || place.phoneUnformatted || '';
    let instagram = '';

    // Tenta extrair email/social do website via actor dedicado
    if (website && enrichSocial) {
      try {
        const social = await runSocialActor(website);
        if (social.emails?.length) email = social.emails[0];
        if (social.phones?.length && !phone) phone = social.phones[0];
        if (social.instagram) instagram = social.instagram;
      } catch (err) {
        logger.warn(`[APIFY] Social actor falhou para ${website}: ${err.message}`);
      }
    }

    leads.push({
      name:        place.title || place.name || '',
      email:       email,
      phone:       phone,
      website:     website,
      instagram:   instagram,
      address:     place.address || place.street || '',
      city:        place.city || extractCity(place.address || ''),
      rating:      place.totalScore || place.rating || 0,
      reviewCount: place.reviewsCount || place.userRatingsTotal || 0,
      category:    place.categoryName || place.categories?.[0] || '',
    });
  }

  return leads;
}

// Tenta extrair cidade do endereço (heurística simples para endereços brasileiros)
function extractCity(address) {
  if (!address) return '';
  const parts = address.split(',').map(p => p.trim());
  // Endereços BR costumam ter cidade na antepenúltima ou penúltima parte
  if (parts.length >= 3) return parts[parts.length - 3] || '';
  if (parts.length >= 2) return parts[parts.length - 2] || '';
  return '';
}

module.exports = { scrapePlaces };
