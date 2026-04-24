const { google } = require('googleapis');
const http = require('http');
const url = require('url');
require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'http://localhost:3002/callback'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://mail.google.com/'],
  prompt: 'consent'
});

console.log('\n=== AUTORIZAÇÃO GMAIL ===');
console.log('Abra este URL no navegador:');
console.log('\n' + authUrl + '\n');

const server = http.createServer(async (req, res) => {
  const qs = new url.URL(req.url, 'http://localhost:3002').searchParams;
  const code = qs.get('code');
  if (!code) { res.end('Erro: code não encontrado'); return; }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n=== NOVO REFRESH TOKEN ===');
    console.log(tokens.refresh_token);
    console.log('\nAdicione como GMAIL_REFRESH_TOKEN no Render e no .env');
    res.end('<h2 style="font-family:sans-serif;color:green">Token gerado com sucesso! Feche esta aba e volte ao terminal.</h2>');
  } catch(e) {
    console.error('Erro:', e.message);
    res.end('Erro: ' + e.message);
  } finally {
    setTimeout(() => server.close(), 1000);
  }
});

server.listen(3002, () => {
  console.log('Aguardando em http://localhost:3002/callback ...\n');
});
