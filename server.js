require('dotenv').config();
const express = require('express');
const { logger } = require('./src/utils/logger');

const leadsRouter   = require('./src/routes/leads');
const scraperRouter = require('./src/routes/scraper');
const sheetsRouter  = require('./src/routes/sheets');
const emailRouter   = require('./src/routes/email');
const cadenceRouter = require('./src/routes/cadence');
const trackRouter   = require('./src/routes/track');
const inboxRouter   = require('./src/routes/inbox');
const tasksRouter   = require('./src/routes/tasks');
const repliesRouter     = require('./src/routes/replies');
const enrichmentRouter  = require('./src/routes/enrichment');

// Cron jobs em background
require('./src/jobs/scraperJob');
require('./src/jobs/cadenceJob');
require('./src/jobs/replyCheckerJob');
require('./src/jobs/inboxJob');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://pedrooalencar13.github.io';
const ALLOWED_ORIGINS = [
  ALLOWED_ORIGIN,
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '10mb' }));

// ── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
const API_SECRET = process.env.API_SECRET;
app.use((req, res, next) => {
  if (req.path === '/ping' || req.path === '/health') return next();
  if (!API_SECRET) return next();
  const key = req.headers['x-api-key'];
  if (key !== API_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// ── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── PING (keep-alive para cron-job.org no Render gratuito) ──────────────────
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── ROTAS ───────────────────────────────────────────────────────────────────
app.use('/leads',   leadsRouter);
app.use('/scraper', scraperRouter);
app.use('/sheets',  sheetsRouter);
app.use('/email',   emailRouter);
app.use('/cadence', cadenceRouter);
app.use('/track',   trackRouter);
app.use('/inbox',   inboxRouter);
app.use('/tasks',   tasksRouter);
app.use('/replies',     repliesRouter);
app.use('/enrichment',  enrichmentRouter);

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
  logger.info(`[SERVER] Origins permitidas: ${ALLOWED_ORIGINS.join(', ')} + localhost`);

  // ── Verificação de credenciais na inicialização ──────────────────
  console.log('\n═══ VERIFICAÇÃO DE CREDENCIAIS MATTE ═══');
  const creds = [
    ['APIFY_TOKEN',                'Apify (scraping)'],
    ['GOOGLE_SERVICE_ACCOUNT_EMAIL','Google Sheets'],
    ['GOOGLE_PRIVATE_KEY',         'Google Sheets Key'],
    ['GMAIL_CLIENT_ID',            'Gmail OAuth ClientID'],
    ['GMAIL_CLIENT_SECRET',        'Gmail OAuth Secret'],
    ['GMAIL_REFRESH_TOKEN',        'Gmail Refresh Token'],
    ['CLAUDE_API_KEY',             'Claude API'],
  ];
  creds.forEach(([key, label]) => {
    const val = process.env[key];
    if (val) {
      console.log(`  ✓ ${label}`);
    } else {
      console.warn(`  ✗ FALTANDO: ${label} (${key})`);
      console.warn(`    → Configure ${key} no Render Environment Variables`);
    }
  });
  console.log('═════════════════════════════════════════\n');
});
