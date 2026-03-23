const cron = require('node-cron');
const { checkAndSendCadence } = require('../services/cadenceManager');
const { logger } = require('../utils/logger');

// A cada 1 hora
cron.schedule('0 * * * *', async () => {
  logger.info('[CRON-CADENCE] Verificando e-mails de cadência...');
  try {
    const result = await checkAndSendCadence();
    logger.info(`[CRON-CADENCE] ${result.sent} enviados, ${result.errors} erros`);
  } catch (err) {
    logger.error('[CRON-CADENCE] Erro na rodada:', err.message);
  }
});

logger.info('[CRON-CADENCE] Agendado: a cada hora (0 * * * *)');
