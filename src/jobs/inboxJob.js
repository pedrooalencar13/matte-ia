const cron = require('node-cron');
const { scanAndClassify } = require('../services/inboxManager');
const { logger } = require('../utils/logger');

// A cada 1 hora — verifica e classifica e-mails não lidos
cron.schedule('0 * * * *', async () => {
  logger.info('[CRON-INBOX] Verificando caixa de entrada...');
  try {
    const result = await scanAndClassify();
    const { URGENTE, PRECISA_RESPOSTA } = result.classified || {};
    if (URGENTE > 0 || PRECISA_RESPOSTA > 0) {
      logger.warn(`[CRON-INBOX] Atenção: ${URGENTE} urgentes, ${PRECISA_RESPOSTA} precisam resposta`);
    } else {
      logger.info(`[CRON-INBOX] ${result.scanned} e-mails processados`);
    }
  } catch(e) {
    logger.error('[CRON-INBOX] Erro:', e.message);
  }
});

logger.info('[CRON-INBOX] Agendado: a cada hora (0 * * * *)');
