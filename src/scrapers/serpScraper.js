const axios = require('axios');
const { scoreLeads } = require('../utils/scorer');

async function scrapePlaces(query, limit = 10) {
  const SERP_API_KEY = process.env.SERP_API_KEY;
  console.log('[SERP] Key disponível:', !!SERP_API_KEY);
  if (!SERP_API_KEY) {
    console.warn('[SERP] SERP_API_KEY não configurada — configure no Render Environment');
    return [];
  }

  try {
    console.log(`[SERP] Buscando: "${query}" (limite: ${limit})`);
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        engine: 'google_maps',
        q: query,
        type: 'search',
        hl: 'pt',
        api_key: SERP_API_KEY,
        num: limit
      },
      timeout: 15000
    });

    const results = response.data.local_results || [];
    const leads = [];

    for (const place of results.slice(0, limit)) {
      const website = place.website || '';
      let email = '';
      let instagram = '';
      let phone = place.phone || '';

      if (website) {
        const enriched = await enrichFromSite(website);
        if (enriched.email) email = enriched.email;
        if (enriched.instagram) instagram = enriched.instagram;
        if (!phone && enriched.phone) phone = enriched.phone;
      }

      if (!email || !email.includes('@')) continue;

      leads.push({
        name: place.title || '',
        email: email.toLowerCase().trim(),
        phone,
        website,
        address: place.address || '',
        city: extractCity(place.address || ''),
        rating: parseFloat(place.rating || 0),
        reviewCount: parseInt(place.reviews || 0),
        category: place.type || 'advogado',
        instagram,
        source: 'serp-auto'
      });
    }

    if (leads.length > 0) {
      console.log(`[SERP] Gerando score IA para ${leads.length} leads...`);
      return await scoreLeads(leads);
    }

    return leads;

  } catch(e) {
    console.error(`[SERP] Erro para "${query}":`, e.message);
    return [];
  }
}

async function enrichFromSite(url) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = res.data || '';

    const emailMatch = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const email = emailMatch.find(e =>
      !e.includes('example') && !e.includes('sentry') &&
      !e.includes('wix') && !e.includes('wordpress') &&
      !e.includes('@2x') && !e.includes('.png') && !e.includes('.jpg')
    ) || '';

    const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
    const instagram = igMatch ? `https://instagram.com/${igMatch[1]}` : '';

    const phoneMatch = html.match(/(\(?\d{2}\)?\s?[\d\s\-]{8,12})/g) || [];
    const phone = phoneMatch[0] || '';

    return { email, instagram, phone };
  } catch(e) {
    return { email: '', instagram: '', phone: '' };
  }
}

function extractCity(address) {
  if (!address) return '';
  const parts = address.split(',');
  return parts.length >= 2 ? parts[parts.length - 2].trim() : '';
}

module.exports = { scrapePlaces };
