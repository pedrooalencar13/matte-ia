const axios = require('axios');
const { logger } = require('./logger');

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 200;

/**
 * Analisa um lead e retorna score 0-10 + motivo via Claude AI.
 * @param {object} lead
 * @returns {{ aiScore: number, aiScoreReason: string }}
 */
async function scoreLead(lead) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    logger.warn('[SCORER] CLAUDE_API_KEY não configurada — score ignorado');
    return { aiScore: 0, aiScoreReason: 'API key ausente' };
  }

  const temSite      = lead.website  ? 'sim' : 'não';
  const temInstagram = lead.instagram ? 'sim' : 'não';
  const avaliacao    = lead.rating      ? `${lead.rating}` : 'sem avaliação';
  const reviews      = lead.reviewCount ? `${lead.reviewCount}` : '0';
  const categoria    = lead.category   || lead.especialidade || 'não informada';
  const cidade       = lead.city       || lead.cidade         || 'não informada';
  const nome         = lead.name       || lead.nome           || 'não informado';

  const prompt = `Você é um qualificador de leads para gestão de tráfego pago. Analise o escritório de advocacia abaixo e retorne APENAS um JSON: { "score": número de 0 a 10, "motivo": string curta }.
Dados: Nome: ${nome}, Área: ${categoria}, Avaliação Google: ${avaliacao} (${reviews} avaliações), Tem site: ${temSite}, Tem Instagram: ${temInstagram}, Cidade: ${cidade}.
Critérios: escritórios com mais avaliações, áreas lucrativas (trabalhista, previdenciário, tributário, cível) e presença digital ativa recebem scores maiores.`;

  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const text = res.data.content?.[0]?.text || '{}';
    // Extrai JSON mesmo que venha com texto extra ao redor
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error('Resposta da Claude sem JSON válido');
    const parsed = JSON.parse(match[0]);

    const score  = Math.min(10, Math.max(0, Number(parsed.score) || 0));
    const motivo = String(parsed.motivo || '').slice(0, 120);
    return { aiScore: score, aiScoreReason: motivo };
  } catch (err) {
    logger.warn(`[SCORER] Erro ao pontuar lead "${nome}": ${err.message}`);
    return { aiScore: 0, aiScoreReason: 'Erro no scoring' };
  }
}

/**
 * Pontua um array de leads em paralelo (lotes de 5 para não saturar a API).
 * Adiciona aiScore e aiScoreReason a cada lead.
 * @param {object[]} leads
 * @returns {object[]} leads com aiScore e aiScoreReason
 */
async function scoreLeads(leads) {
  if (!leads || leads.length === 0) return leads;

  const BATCH = 5;
  const result = [];

  for (let i = 0; i < leads.length; i += BATCH) {
    const batch = leads.slice(i, i + BATCH);
    const scored = await Promise.all(batch.map(async lead => {
      const { aiScore, aiScoreReason } = await scoreLead(lead);
      return { ...lead, aiScore, aiScoreReason };
    }));
    result.push(...scored);
    logger.info(`[SCORER] ${Math.min(i + BATCH, leads.length)}/${leads.length} leads pontuados`);
  }

  return result;
}

module.exports = { scoreLeads, scoreLead };
