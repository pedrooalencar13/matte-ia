require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { logger } = require('./src/utils/logger');

const leadsRouter   = require('./src/routes/leads');
const scraperRouter = require('./src/routes/scraper');
const sheetsRouter  = require('./src/routes/sheets');
const emailRouter   = require('./src/routes/email');
const cadenceRouter = require('./src/routes/cadence');
const trackRouter   = require('./src/routes/track');

// Cron jobs em background
require('./src/jobs/scraperJob');
require('./src/jobs/cadenceJob');
require('./src/jobs/replyCheckerJob');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://pedrooalencar13.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  process.env.ALLOWED_ORIGIN,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Permite requests sem origin (ex: curl, Railway health checks)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin não permitida — ${origin}`));
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Responde preflight OPTIONS para todas as rotas
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));

// ── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── ROTAS ───────────────────────────────────────────────────────────────────
app.use('/leads',   leadsRouter);
app.use('/scraper', scraperRouter);
app.use('/sheets',  sheetsRouter);
app.use('/email',   emailRouter);
app.use('/cadence', cadenceRouter);
app.use('/track',   trackRouter);

// ── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// ── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('[SERVER] Erro não tratado:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  logger.info(`[SERVER] Matte Backend rodando na porta ${PORT}`);
  logger.info(`[SERVER] Origins permitidas: ${ALLOWED_ORIGINS.join(', ')}`);
});
