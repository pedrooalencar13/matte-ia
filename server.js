require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { logger } = require('./src/utils/logger');

const leadsRouter = require('./src/routes/leads');
const scraperRouter = require('./src/routes/scraper');
const sheetsRouter = require('./src/routes/sheets');

// Inicia cron job em background
require('./src/jobs/scraperJob');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'https://pedrooalencar13.github.io',
  methods: ['GET', 'POST', 'DELETE'],
}));

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas
app.use('/leads', leadsRouter);
app.use('/scraper', scraperRouter);
app.use('/sheets', sheetsRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('[SERVER] Erro não tratado:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  logger.info(`[SERVER] Matte Backend rodando na porta ${PORT}`);
  logger.info(`[SERVER] CORS liberado para: ${process.env.ALLOWED_ORIGIN || 'https://pedrooalencar13.github.io'}`);
});
