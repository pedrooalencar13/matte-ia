const cron = require('node-cron');
const { runScraper } = require('../services/scraper');
const { pushToSheets } = require('../services/sheetsClient');
const { logger } = require('../utils/logger');

const CRON_SCHEDULE = process.env.SCRAPER_CRON || '0 */6 * * *';

if (!cron.validate(CRON_SCHEDULE)) {
  logger.error(`[CRON] Expressao invalida: "${CRON_SCHEDULE}". Usando padrao 0 */6 * * *`);
}

cron.schedule(cron.validate(CRON_SCHEDULE) ? CRON_SCHEDULE : '0 */6 * * *', async () => {
  logger.info('[CRON] Iniciando rodada automatica de captacao...');

  try {
    const newLeads = await runScraper();

    if (newLeads.length > 0) {
      logger.info(`[CRON] ${newLeads.length} leads novos — enviando para a planilha...`);
      const result = await pushToSheets(newLeads);
      logger.success(`[CRON] ${result.pushed} leads enviados para a planilha`);
    } else {
      logger.info('[CRON] Nenhum lead novo nesta rodada');
    }
  } catch (err) {
    logger.error('[CRON] Erro na rodada automatica:', err.message);
  }
});

logger.info(`[CRON] Agendamento ativo: "${CRON_SCHEDULE}"`);
