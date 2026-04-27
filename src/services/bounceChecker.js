const { google } = require('googleapis');
const sheetsClient = require('./sheetsClient');

async function checkBounces() {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Buscar emails de bounce nas últimas 24h
    const query =
      'from:mailer-daemon OR subject:"delivery status notification" OR ' +
      'subject:"mail delivery failed" OR subject:"undeliverable" newer_than:1d';

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });

    if (!res.data.messages || res.data.messages.length === 0) {
      console.log('[BOUNCE] Nenhum bounce encontrado');
      return { bounces: 0 };
    }

    const contacts = await sheetsClient.pullFromSheets();
    let bounceCount = 0;

    for (const msg of res.data.messages) {
      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        const bodyText   = extractEmailBody(full.data.payload);
        const emailMatch = bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
        if (!emailMatch) continue;

        for (const failedEmail of emailMatch) {
          const contact = contacts.find(
            c => c.email?.toLowerCase() === failedEmail.toLowerCase()
          );
          if (contact && contact.cadenciaStatus === 'ativa') {
            console.warn(`[BOUNCE] Email retornado para ${failedEmail} — pausando cadência`);
            await sheetsClient.updateCadenciaStatus(contact.rowIndex, 'bounce').catch(() => {});
            bounceCount++;
          }
        }
      } catch(e) {
        console.error('[BOUNCE] Erro ao processar mensagem:', e.message);
      }
    }

    console.log(`[BOUNCE] ${bounceCount} bounce(s) processado(s)`);
    return { bounces: bounceCount };

  } catch(e) {
    console.error('[BOUNCE] Erro geral:', e.message);
    return { bounces: 0, error: e.message };
  }
}

function extractEmailBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    return payload.parts.map(p => extractEmailBody(p)).join(' ');
  }
  return '';
}

module.exports = { checkBounces };
