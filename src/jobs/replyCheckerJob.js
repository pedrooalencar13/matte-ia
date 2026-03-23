const cron = require('node-cron');
const { checkRepliesFrom } = require('../services/gmailSender');
const { pullFromSheets, updateCadenceRow } = require('../services/sheetsClient');
const { logger } = require('../utils/logger');

// A cada 30 minutos
cron.schedule('*/30 * * * *', async () => {
  logger.info('[CRON-REPLY] Verificando respostas de leads...');

  try {
    const contacts = await pullFromSheets();

    // Filtra leads que ainda não responderam mas estão em cadência ativa
    const candidatos = contacts
      .filter(c => c.cadenciaStatus === 'ativa' && c.emailRespondido !== 'sim')
      .map(c => c.email);

    if (candidatos.length === 0) {
      logger.info('[CRON-REPLY] Nenhum lead ativo para checar respostas');
      return;
    }

    logger.info(`[CRON-REPLY] Checando respostas de ${candidatos.length} leads...`);

    // Busca respostas no Gmail em lotes de 20
    const BATCH = 20;
    let totalRespostas = 0;

    for (let i = 0; i < candidatos.length; i += BATCH) {
      const lote = candidatos.slice(i, i + BATCH);
      const respostas = await checkRepliesFrom(lote);

      for (const resposta of respostas) {
        try {
          const ok = await updateCadenceRow(resposta.email, {
            emailRespondido: 'sim',
            dataResposta: new Date(resposta.date || Date.now()).toISOString(),
            cadenciaStatus: 'respondeu', // pausa cadência automaticamente
          });

          if (ok) {
            logger.success(`[CRON-REPLY] ✓ Resposta detectada: ${resposta.email}`);
            totalRespostas++;
          }
        } catch (err) {
          logger.warn(`[CRON-REPLY] Erro ao atualizar ${resposta.email}: ${err.message}`);
        }
      }

      // Delay entre lotes
      if (i + BATCH < candidatos.length) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    logger.info(`[CRON-REPLY] ${totalRespostas} respostas registradas`);
  } catch (err) {
    logger.error('[CRON-REPLY] Erro na verificação:', err.message);
  }
});

logger.info('[CRON-REPLY] Agendado: a cada 30 minutos (*/30 * * * *)');
