const axios = require('axios');
const { scoreLeads } = require('../utils/scorer');

async function scrapePlaces(query, limit = 10) {
  const OUTSCRAPER_KEY = process.env.OUTSCRAPER_API_KEY;
  if (!OUTSCRAPER_KEY) {
    console.warn('[OUTSCRAPER] OUTSCRAPER_API_KEY não configurada');
    return [];
  }

  try {
    console.log(`[OUTSCRAPER] Buscando: "${query}" (limite: ${limit})`);

    const response = await axios.get('https://api.app.outscraper.com/maps/search-v3', {
      params: {
        query,
        limit,
        language: 'pt',
        region: 'BR',
        fields: 'name,phone,site,full_address,city,rating,reviews,type,emails_and_contacts'
      },
      headers: { 'X-API-KEY': OUTSCRAPER_KEY },
      timeout: 30000
    });

    const results = response.data?.data?.[0] || [];
    const leads = [];

    for (const place of results) {
      const email = place.email ||
        place.emails_and_contacts?.emails?.[0] ||
        place.site_email || '';

      if (!email || !email.includes('@')) continue;

      const instagram = place.instagram ||
        place.emails_and_contacts?.instagram ||
        place.social_networks?.instagram || '';

      leads.push({
        name: place.name || '',
        email: email.toLowerCase().trim(),
        phone: place.phone || place.phones?.[0] || '',
        website: place.site || place.website || '',
        address: place.full_address || '',
        city: place.city || extractCity(place.full_address || ''),
        rating: parseFloat(place.rating || 0),
        reviewCount: parseInt(place.reviews || 0),
        category: place.type || 'advogado',
        instagram,
        source: 'outscraper'
      });
    }

    if (leads.length > 0) {
      console.log(`[OUTSCRAPER] Gerando score IA para ${leads.length} leads...`);
      return await scoreLeads(leads);
    }

    console.log(`[OUTSCRAPER] ${leads.length} leads com email para "${query}"`);
    return leads;

  } catch(e) {
    if (e.response?.status === 402) {
      console.error('[OUTSCRAPER] Créditos esgotados — verifique outscraper.com/dashboard');
    } else {
      console.error(`[OUTSCRAPER] Erro para "${query}":`, e.message);
    }
    return [];
  }
}

function extractCity(address) {
  if (!address) return '';
  const parts = address.split(',');
  return parts.length >= 2 ? parts[parts.length - 2].trim() : '';
}

module.exports = { scrapePlaces };
