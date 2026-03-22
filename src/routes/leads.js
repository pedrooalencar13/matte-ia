const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { isValidEmail, normalizeLead } = require('../utils/validator');
const { logger } = require('../utils/logger');

const router = express.Router();
const DATA_FILE = path.join(__dirname, '../data/leads.json');

// ─── Helpers de persistência ──────────────────────────────────────────────────

function readLeads() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function writeLeads(leads) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2), 'utf8');
}

// ─── GET /leads ───────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const leads = readLeads();
    res.json(leads);
  } catch (err) {
    logger.error('[LEADS] Erro ao ler leads:', err.message);
    res.status(500).json({ error: 'Erro ao ler leads' });
  }
});

// ─── POST /leads ──────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { nome, email, especialidade, cidade, site, telefone } = req.body;

    if (!nome || !email) {
      return res.status(400).json({ error: 'Campos obrigatorios: nome, email' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail invalido' });
    }

    const leads = readLeads();
    const exists = leads.some(l => l.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: 'E-mail ja cadastrado' });
    }

    const lead = {
      id: uuidv4(),
      ...normalizeLead({ nome, email, especialidade, cidade, site, telefone }),
      fonte: 'manual',
      status: 'novo',
      capturedAt: new Date().toISOString(),
    };

    leads.push(lead);
    writeLeads(leads);

    logger.success(`[LEADS] Lead manual adicionado: ${email}`);
    res.status(201).json(lead);
  } catch (err) {
    logger.error('[LEADS] Erro ao criar lead:', err.message);
    res.status(500).json({ error: 'Erro ao criar lead' });
  }
});

// ─── DELETE /leads/:id ────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const leads = readLeads();
    const index = leads.findIndex(l => l.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Lead nao encontrado' });
    }

    const removed = leads.splice(index, 1)[0];
    writeLeads(leads);

    logger.info(`[LEADS] Lead removido: ${removed.email}`);
    res.json({ message: 'Lead removido', lead: removed });
  } catch (err) {
    logger.error('[LEADS] Erro ao remover lead:', err.message);
    res.status(500).json({ error: 'Erro ao remover lead' });
  }
});

module.exports = router;
module.exports.readLeads = readLeads;
module.exports.writeLeads = writeLeads;
