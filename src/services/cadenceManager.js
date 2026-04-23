const axios = require('axios');
const { logger } = require('../utils/logger');
const { sendEmail } = require('./gmailSender');

// ── Sequência de cadência (6 e-mails em 10 dias) ─────────────────────────────
const CADENCE_STEPS = [
  {
    etapa: 0,
    diasApos: 0,
    assuntoBase: 'Por que a maioria dos advogados não consegue fechar leads',
    instrucao: 'Escreva um e-mail de abertura que apresenta o problema central: advogados que investem em tráfego pago mas não convertem leads porque têm comunicação genérica. Seja direto, use linguagem simples, máximo 3 parágrafos. Não mencione preços. Termine com pergunta aberta.',
  },
  {
    etapa: 1,
    diasApos: 2,
    assuntoBase: 'O erro silencioso que faz você perder clientes com lead quente',
    instrucao: 'Escreva um e-mail sobre o erro de não ter uma estrutura de follow-up. Muitos leads somem após o primeiro contato não por falta de interesse, mas porque o escritório não tem processo. Máximo 3 parágrafos. Termine com "Isso acontece no seu escritório?".',
  },
  {
    etapa: 2,
    diasApos: 4,
    assuntoBase: 'Como um escritório de advocacia aumentou a taxa de conversão em 3x',
    instrucao: 'Escreva um case real (fictício mas plausível) de um escritório trabalhista em São Paulo que triplicou conversão após ajustar a segmentação dos anúncios. Seja específico com números. Máximo 4 parágrafos. Termine com "Podemos fazer o mesmo pelo seu escritório".',
  },
  {
    etapa: 3,
    diasApos: 6,
    assuntoBase: 'A estratégia que separa escritórios que crescem dos que estacionam',
    instrucao: 'Escreva sobre segmentação de audiência: a diferença entre anunciar para "quem precisa de advogado" vs "quem teve benefício INSS negado nos últimos 30 dias". Mostre como comunicação específica atrai lead mais qualificado. Máximo 3 parágrafos.',
  },
  {
    etapa: 4,
    diasApos: 8,
    assuntoBase: 'O problema não é o tráfego — é o que acontece depois',
    instrucao: 'Escreva sobre o que acontece DEPOIS que o lead chega: velocidade de resposta, qualificação na triagem, estrutura da consulta. Explique que tráfego traz volume, mas processo de atendimento define conversão. Máximo 3 parágrafos. Tom consultivo.',
  },
  {
    etapa: 5,
    diasApos: 10,
    assuntoBase: 'Quer que eu analise gratuitamente sua estratégia de captação?',
    instrucao: 'CTA direto. Escreva uma proposta de análise gratuita da estratégia atual do escritório. Seja específico sobre o que será analisado (anúncios, público, copy, landing page). Inclua o WhatsApp (11) 99515-7048 de forma natural no texto. Máximo 3 parágrafos. Tom confiante mas sem pressão.',
  },
];

/**
 * Gera o corpo de um e-mail de cadência usando Claude API.
 */
async function gerarEmailCadencia({ lead, step }) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY não configurada no .env');

  const prompt = `Você é especialista em marketing jurídico e gestão de tráfego pago para escritórios de advocacia.

Escreva um e-mail de prospecção em português brasileiro para o seguinte escritório:

Nome: ${lead.nome || lead.name || 'Advogado(a)'}
Especialidade: ${lead.especialidade || lead.medium || 'advocacia'}
Cidade: ${lead.cidade || lead.activity || 'Brasil'}
Empresa: ${lead.empresa || lead.emp || ''}

Instrução específica: ${step.instrucao}

Regras obrigatórias:
- Máximo 4 parágrafos curtos
- Tom humano e direto, sem clichês corporativos
- Assine como: Pedro Aranha | Gestão de Tráfego para Escritórios Jurídicos
- NÃO inclua assunto, APENAS o corpo do e-mail
- NÃO use formatação markdown`;

  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  }, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    timeout: 30000,
  });

  return res.data.content[0].text;
}

/**
 * Lê a planilha e envia e-mails para leads com cadência ativa que estejam no prazo.
 */
async function checkAndSendCadence() {
  const { pullFromSheets, updateCadenceRow } = require('./sheetsClient');

  let contacts;
  try {
    contacts = await pullFromSheets();
  } catch (err) {
    logger.error('[CADENCE] Erro ao ler planilha:', err.message);
    return { processed: 0, sent: 0, errors: 0 };
  }

  const now = new Date();
  const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://matte-ia.onrender.com';

  let sent = 0, errors = 0;

  for (const contact of contacts) {
    const status = contact.cadenciaStatus;
    if (status !== 'ativa') continue;

    const etapa = parseInt(contact.cadenciaEtapa) || 0;
    const proximo = contact.cadenciaProximo ? new Date(contact.cadenciaProximo) : now;

    if (proximo > now) continue; // Ainda não está na hora
    if (etapa >= CADENCE_STEPS.length) {
      // Completou todas as etapas
      await updateCadenceRow(contact.email, { cadenciaStatus: 'concluida' });
      continue;
    }

    const step = CADENCE_STEPS[etapa];

    try {
      logger.info(`[CADENCE] Enviando etapa ${etapa} para ${contact.email}`);
      const corpo = await gerarEmailCadencia({ lead: contact, step });

      const emailHash = Buffer.from(contact.email).toString('base64url');
      const trackingUrl = `${backendUrl}/track/open?id=${emailHash}&etapa=${etapa}`;

      await sendEmail({
        to: contact.email,
        subject: step.assuntoBase,
        body: corpo,
        trackingPixelUrl: trackingUrl,
      });

      // Calcula próxima data
      const proximaEtapa = etapa + 1;
      const novoStatus = proximaEtapa >= CADENCE_STEPS.length ? 'concluida' : 'ativa';
      let proximaData = '';
      if (novoStatus === 'ativa') {
        const diasProximo = CADENCE_STEPS[proximaEtapa].diasApos - step.diasApos;
        const d = new Date(now);
        d.setDate(d.getDate() + diasProximo);
        proximaData = d.toISOString();
      }

      await updateCadenceRow(contact.email, {
        cadenciaStatus: novoStatus,
        cadenciaEtapa: String(proximaEtapa),
        cadenciaProximo: proximaData,
      });

      logger.success(`[CADENCE] ✓ Etapa ${etapa} enviada para ${contact.email}`);
      sent++;

      // Delay entre envios
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      logger.error(`[CADENCE] ✗ Erro para ${contact.email}: ${err.message}`);
      errors++;
    }
  }

  logger.info(`[CADENCE] Rodada concluída — ${sent} enviados, ${errors} erros`);
  return { processed: contacts.filter(c => c.cadenciaStatus === 'ativa').length, sent, errors };
}

module.exports = { checkAndSendCadence, CADENCE_STEPS };
