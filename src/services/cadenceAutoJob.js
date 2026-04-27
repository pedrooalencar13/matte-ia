const templates      = require('../data/emailTemplates');
const { personalizeEmail }    = require('./emailPersonalizer');
const sheetsClient   = require('./sheetsClient');
const { sendEmail }  = require('./gmailSender');

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
      try {
        const etapaAtual  = parseInt(contato.cadenciaEtapa || 0);
        const proximaEtapa = etapaAtual + 1;
        const template     = templates[etapaAtual]; // índice 0-based = etapa atual

        const corpoPersonalizado = await personalizeEmail(template, contato);

        // Pixel de tracking via e-mail hash (compatível com rota /track/open existente)
        const emailHash     = Buffer.from(contato.email || '').toString('base64url');
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
          // Cadência concluída após último email
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
        _state.errors++;
        console.error(`[CADENCE-AUTO] Erro para ${contato.email}:`, e.message);
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
