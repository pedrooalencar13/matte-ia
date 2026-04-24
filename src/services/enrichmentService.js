const axios = require('axios');
const { pullFromSheets, updateCell } = require('./sheetsClient');
const { logger } = require('../utils/logger');

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// Índices de colunas (0-based)
const COL_INSTAGRAM  = 21;
const COL_SCORE_IA   = 22;
const COL_MOTIVO     = 23;
const COL_EMAIL_VAL  = 27; // AB

let _state = { running: false, processed: 0, total: 0, current: '' };

function getEnrichmentStatus() {
  return { ..._state };
}

async function checkEmailMx(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1];
  try {
    const res = await axios.get(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { timeout: 5000 }
    );
    const answers = res.data?.Answer || res.data?.Authority || [];
    return answers.length > 0;
  } catch {
    return null;
  }
}

async function fetchSiteContent(siteUrl) {
  if (!siteUrl) return null;
  try {
    let url = siteUrl;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MatteBot/1.0)' },
      maxContentLength: 300000,
    });
    const html = String(res.data || '');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const igMatch        = html.match(/https?:\/\/(?:www\.)?instagram\.com\/[^"'\s,>]{3,50}/);
    const mentionsMkt    = /marketing\s+digital|tr[áa]fego\s+pago|google\s+ads|facebook\s+ads|anún?cio|agência\s+digital/i.test(html);

    const areaPatterns   = [
      ['trabalhista',    /trabalhist/i],
      ['previdenciário', /previd[eê]nc/i],
      ['tributário',     /tribut[aá]r/i],
      ['cível',          /c[ií]vel/i],
      ['família',        /fam[ií]lia/i],
      ['criminal',       /criminal|penal/i],
      ['imobiliário',    /imobili[aá]r/i],
    ];
    const areas = areaPatterns
      .filter(([, re]) => re.test(text))
      .map(([name]) => name);

    return {
      content:        text.slice(0, 1000),
      instagramUrl:   igMatch ? igMatch[0] : '',
      mentionsMkt,
      areas,
    };
  } catch {
    return null;
  }
}

async function checkOab(nome) {
  if (!nome) return null;
  try {
    const res = await axios.get(
      `https://cna.oab.org.br/Home/Search?q=${encodeURIComponent(nome)}`,
      { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const html = String(res.data || '');
    return /advogado|inscricao|inscri[çc][aã]o/i.test(html);
  } catch {
    return null;
  }
}

async function scoreEnriched(lead, enrichData) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return { aiScore: 0, aiScoreReason: 'API key ausente' };

  const { emailValido, siteData, oabRegistrado } = enrichData;
  const nome        = lead.nome || lead.name || 'não informado';
  const categoria   = lead.category || lead.medium || lead.especialidade || 'não informada';
  const cidade      = lead.cidade || lead.city || 'não informada';
  const avaliacao   = lead.rating      ? String(lead.rating)      : 'sem avaliação';
  const reviews     = lead.reviewCount ? String(lead.reviewCount) : '0';
  const temSite     = (lead.site || lead.website) ? 'sim' : 'não';
  const conteudo    = siteData?.content        || '';
  const mencionaMkt = siteData?.mentionsMkt    ? 'sim' : 'não';
  const areasMenc   = siteData?.areas?.join(', ') || 'não identificadas';
  const oabStr      = oabRegistrado === true ? 'sim' : oabRegistrado === false ? 'não' : 'não verificado';
  const emailStr    = emailValido   === true ? 'sim' : emailValido   === false ? 'não' : 'não verificado';

  const prompt = `Você é especialista em qualificação de leads para gestão de tráfego pago.
Analise o escritório abaixo e retorne APENAS JSON válido:
{ "score": número 1-10, "motivo": "string com exatamente 3 frases completas" }

Dados:
Nome: ${nome}
Área: ${categoria}
Avaliação Google: ${avaliacao}★ (${reviews} avaliações)
Cidade: ${cidade}
Email válido: ${emailStr}
OAB registrado: ${oabStr}
Tem site: ${temSite}
Conteúdo do site: ${conteudo}
Menciona marketing/anúncios no site: ${mencionaMkt}
Áreas mencionadas no site: ${areasMenc}

Critérios:
- Área lucrativa (trabalhista, previdenciário, tributário, cível, família): +2
- Mais de 50 avaliações Google: +1
- Mais de 200 avaliações: +2
- Nota Google ≥ 4.5: +1
- Site profissional ativo: +1
- OAB registrado confirmado: +1
- Email válido com domínio próprio: +1
- Menciona marketing/anúncios (já tem agência): -2
- Email inválido: -3
O motivo deve ter exatamente 3 frases, mencionar dados reais e explicar por que é ou não boa oportunidade para gestão de tráfego.`;

  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: CLAUDE_MODEL, max_tokens: 1000, messages: [{ role: 'user', content: prompt }] },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 25000,
      }
    );
    const text   = res.data.content?.[0]?.text || '{}';
    const match  = text.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error('Sem JSON na resposta');
    const parsed = JSON.parse(match[0]);
    const score  = Math.min(10, Math.max(0, Number(parsed.score) || 0));
    const motivo = String(parsed.motivo || '');
    return { aiScore: score, aiScoreReason: motivo };
  } catch (err) {
    logger.warn(`[ENRICH] Erro no score de "${nome}": ${err.message}`);
    return { aiScore: 0, aiScoreReason: 'Erro no scoring' };
  }
}

async function enrichLead(lead) {
  const nome = lead.nome || lead.name || '';
  logger.info(`[ENRICH] Processando: ${nome} (${lead.email})`);
  _state.current = nome;

  const [emailValido, siteData, oabRegistrado] = await Promise.allSettled([
    checkEmailMx(lead.email),
    fetchSiteContent(lead.site || lead.website || ''),
    checkOab(nome),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : null));

  const { aiScore, aiScoreReason } = await scoreEnriched(lead, { emailValido, siteData, oabRegistrado });

  if (!lead.rowIndex) {
    logger.warn(`[ENRICH] Lead sem rowIndex: ${nome}`);
    return { nome, aiScore };
  }

  const saves = [];
  if (siteData?.instagramUrl && !lead.instagram) {
    saves.push(updateCell(lead.rowIndex, COL_INSTAGRAM, siteData.instagramUrl));
  }
  saves.push(updateCell(lead.rowIndex, COL_SCORE_IA,  String(aiScore)));
  saves.push(updateCell(lead.rowIndex, COL_MOTIVO,    aiScoreReason));
  saves.push(updateCell(lead.rowIndex, COL_EMAIL_VAL,
    emailValido === true ? 'sim' : emailValido === false ? 'não' : ''
  ));

  await Promise.allSettled(saves);
  return { nome, aiScore };
}

async function runEnrichmentBatch(limit = 20) {
  if (_state.running) {
    logger.warn('[ENRICH] Batch já em execução — ignorando nova chamada');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  _state = { running: true, processed: 0, total: 0, current: '' };

  try {
    const all     = await pullFromSheets();
    const pending = all.filter(c => !c.scoreIa || c.scoreIa === '0' || Number(c.scoreIa) === 0);
    const batch   = pending.slice(0, Math.min(limit, 50));
    _state.total  = batch.length;
    logger.info(`[ENRICH] ${batch.length} leads sem score para processar`);

    let succeeded = 0, failed = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const chunk   = batch.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(chunk.map(lead => enrichLead(lead)));
      results.forEach(r => {
        _state.processed++;
        if (r.status === 'fulfilled') succeeded++;
        else {
          failed++;
          logger.warn('[ENRICH] Falha em lead:', r.reason?.message);
        }
      });
      logger.info(`[ENRICH] ${_state.processed}/${_state.total} processados`);
      if (i + BATCH_SIZE < batch.length) await new Promise(r => setTimeout(r, 2000));
    }

    return { processed: _state.processed, succeeded, failed };
  } catch (err) {
    logger.error('[ENRICH] Erro no batch:', err.message);
    return { processed: _state.processed, succeeded: 0, failed: _state.total };
  } finally {
    _state.running = false;
    _state.current = '';
  }
}

async function runRescore(limit = 50) {
  if (_state.running) {
    logger.warn('[ENRICH] Batch já em execução — ignorando rescore');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  _state = { running: true, processed: 0, total: 0, current: '' };

  try {
    const all   = await pullFromSheets();
    // Processa leads QUE JÁ TÊM score (diferente do runEnrichmentBatch)
    const batch = all.filter(c => c.scoreIa && Number(c.scoreIa) > 0)
                     .slice(0, Math.min(limit, 100));
    _state.total = batch.length;
    logger.info(`[ENRICH] Rescore: ${batch.length} leads com score existente para reanalisar`);

    let succeeded = 0, failed = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const chunk   = batch.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(chunk.map(lead => enrichLead(lead)));
      results.forEach(r => {
        _state.processed++;
        if (r.status === 'fulfilled') succeeded++;
        else {
          failed++;
          logger.warn('[ENRICH] Falha no rescore:', r.reason?.message);
        }
      });
      logger.info(`[ENRICH] Rescore: ${_state.processed}/${_state.total} processados`);
      if (i + BATCH_SIZE < batch.length) await new Promise(r => setTimeout(r, 2000));
    }

    return { processed: _state.processed, succeeded, failed };
  } catch (err) {
    logger.error('[ENRICH] Erro no rescore:', err.message);
    return { processed: _state.processed, succeeded: 0, failed: _state.total };
  } finally {
    _state.running = false;
    _state.current = '';
  }
}

module.exports = { runEnrichmentBatch, runRescore, getEnrichmentStatus };
