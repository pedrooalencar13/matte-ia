const axios          = require('axios');
const templates      = require('../data/emailTemplates');
const { personalizeEmail }    = require('./emailPersonalizer');
const sheetsClient   = require('./sheetsClient');
const { sendEmail }  = require('./gmailSender');

// ── Validação de MX (melhor esforço — falha não bloqueia envio) ───────────────
async function isEmailValid(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1];
  if (!domain) return false;
  try {
    const res = await axios.get(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { timeout: 5000 }
    );
    const d = res.data;
    return d.Status === 0 && Array.isArray(d.Answer) && d.Answer.length > 0;
  } catch {
    return true; // falha de DNS não bloqueia
  }
}

let _running = false;
let _state   = { running: false, processed: 0, sent: 0, errors: 0, current: '' };

function getCadenceState() {
  return { ..._state, running: _running };
}

async function runCadenceJob() {
  if (_running) {
    console.log('[CADENCE-AUTO] Já em execução, pulando...');
    return;
  }
  _running = true;
  _state   = { running: true, processed: 0, sent: 0, errors: 0, current: '' };

  try {
    const result   = await sheetsClient.pullFromSheets();
    const contacts = Array.isArray(result) ? result : (result.contacts || []);
    const agora    = new Date();

    const pendentes = contacts.filter(c => {
      if (c.cadenciaStatus !== 'ativa')      return false;
      if (c.emailRespondido === 'sim')        return false;
      if (!c.email || !c.email.includes('@')) return false;
      const etapa = parseInt(c.cadenciaEtapa || 0);
      if (etapa >= templates.length)          return false;
      if (!c.cadenciaProximo)                 return true;
      return new Date(c.cadenciaProximo) <= agora;
    });

    console.log(`[CADENCE-AUTO] ${pendentes.length} contatos pendentes de envio`);

    const lote = pendentes.slice(0, 50);
    const BACKEND_URL = process.env.BACKEND_PUBLIC_URL || 'https://matte-ia.onrender.com';

    for (const contato of lote) {
      _state.current = contato.nome || contato.email;

      // ── Validação MX (melhor esforço) ──────────────────────────────────────
      const emailOk = await isEmailValid(contato.email);
      if (!emailOk) {
        console.warn(`[CADENCE-AUTO] Email sem MX: ${contato.email} — marcando como bounce`);
        await sheetsClient.updateCadenciaStatus(contato.rowIndex, 'bounce').catch(() => {});
        await sheetsClient.updateCell(contato.rowIndex, sheetsClient.COL.EMAIL_VALIDO, 'nao').catch(() => {});
        _state.errors++;
        _state.processed++;
        continue;
      }

      try {
        const etapaAtual   = parseInt(contato.cadenciaEtapa || 0);
        const proximaEtapa = etapaAtual + 1;
        const template     = templates[etapaAtual]; // índice 0-based = etapa atual

        const corpoPersonalizado = await personalizeEmail(template, contato);

        // Pixel de tracking via e-mail hash (compatível com rota /track/open existente)
        const emailHash        = Buffer.from(contato.email || '').toString('base64url');
        const trackingPixelUrl = `${BACKEND_URL}/track/open?id=${emailHash}&etapa=${etapaAtual}`;

        await sendEmail({
          to:               contato.email,
          subject:          template.assunto,
          body:             corpoPersonalizado,
          trackingPixelUrl,
          source:           'manual_individual'
        });

        const proximoEnvio = new Date();
        proximoEnvio.setDate(proximoEnvio.getDate() + 7);

        if (proximaEtapa >= templates.length) {
          await sheetsClient.updateCadenciaEtapa(contato.rowIndex, proximaEtapa, '');
          await sheetsClient.updateCadenciaStatus(contato.rowIndex, 'concluida');
        } else {
          await sheetsClient.updateCadenciaEtapa(
            contato.rowIndex,
            proximaEtapa,
            proximoEnvio.toISOString()
          );
        }

        _state.sent++;
        console.log(
          `[CADENCE-AUTO] ✓ Email ${proximaEtapa}/${templates.length} enviado para ` +
          `${contato.nome} (${contato.email})`
        );

        await new Promise(r => setTimeout(r, 2500));

      } catch(e) {
        // ── Detecção de bounce por erro de entrega ──────────────────────────
        const msg      = (e.message || '').toLowerCase();
        const isBounce =
          msg.includes('550') || msg.includes('551') || msg.includes('552') ||
          msg.includes('553') || msg.includes('554') ||
          msg.includes('invalid') || msg.includes('does not exist') ||
          msg.includes('user unknown') || msg.includes('no such user') ||
          msg.includes('mailbox not found');

        if (isBounce) {
          console.warn(`[CADENCE-AUTO] Bounce para ${contato.email} — pausando cadência`);
          await sheetsClient.updateCadenciaStatus(contato.rowIndex, 'bounce').catch(() => {});
          await sheetsClient.updateCell(contato.rowIndex, sheetsClient.COL.EMAIL_VALIDO, 'bounce').catch(() => {});
        } else {
          console.error(`[CADENCE-AUTO] Erro para ${contato.email}:`, e.message);
        }
        _state.errors++;
      }
      _state.processed++;
    }

  } catch(e) {
    console.error('[CADENCE-AUTO] Erro geral:', e.message);
  } finally {
    _running        = false;
    _state.running  = false;
    _state.current  = '';
    console.log(
      `[CADENCE-AUTO] Concluído. Enviados: ${_state.sent} | Erros: ${_state.errors}`
    );
  }
}

function startCadenceScheduler() {
  console.log('[CADENCE-AUTO] Agendador iniciado — verificação a cada hora');
  setInterval(runCadenceJob, 60 * 60 * 1000);
}

module.exports = { startCadenceScheduler, runCadenceJob, getCadenceState };
