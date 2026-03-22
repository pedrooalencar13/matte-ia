# matte-backend

Backend Node.js para captação e gestão de leads jurídicos.
Scraping via SerpAPI (Google Maps) + extração de e-mail + escrita automática na Google Sheets.

---

## Setup em 5 passos

### 1. Clone o repositório
```bash
git clone https://github.com/pedrooalencar13/matte-backend
cd matte-backend
```

### 2. Instale dependências
```bash
npm install
```

### 3. Configure as variáveis de ambiente
```bash
cp .env.example .env
# Edite .env com suas chaves
```

### 4. Configure a Service Account do Google

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um projeto (ex: `matte-backend`)
3. Ative a API: **Google Sheets API**
4. Vá em **Credenciais → Criar credencial → Conta de serviço**
5. Baixe o arquivo JSON da chave
6. Copie o e-mail da service account (ex: `matte@projeto.iam.gserviceaccount.com`)
7. Abra a planilha no Google Sheets
8. Clique em **Compartilhar** → cole o e-mail → permissão **Editor**
9. No `.env`, preencha `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY`

> **Atenção com a chave privada:** Cole o conteúdo entre aspas e substitua quebras de linha por `\n`:
> ```
> GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
> ```

### 5. Inicie o servidor
```bash
npm run dev    # desenvolvimento (nodemon, auto-reload)
npm start      # produção
```

---

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Verifica se o servidor está online |
| `GET` | `/leads` | Lista todos os leads do cache local |
| `POST` | `/leads` | Adiciona lead manualmente |
| `DELETE` | `/leads/:id` | Remove lead do cache |
| `POST` | `/scraper/start` | Inicia captação imediata |
| `GET` | `/scraper/status` | Status em tempo real do job |
| `POST` | `/scraper/stop` | Interrompe o job atual |
| `POST` | `/sheets/push` | Envia leads novos para a Google Sheets |
| `GET` | `/sheets/pull` | Lê contatos da planilha |

---

## POST /scraper/start — parâmetros opcionais

```json
{
  "terms": ["advogado trabalhista"],
  "cities": ["São Paulo"],
  "limit": 20
}
```

Se omitidos, usa os termos e cidades padrão (80 combinações).

---

## GET /scraper/status — resposta

```json
{
  "running": true,
  "found": 12,
  "valid": 9,
  "duplicates": 2,
  "errors": 1,
  "progress": 45,
  "lastLog": "✓ Silva & Associados — contato@silvaadv.com.br",
  "jobId": "a3f2e1b0"
}
```

---

## Cron automático

O scraper roda automaticamente a cada 6 horas (configurável via `SCRAPER_CRON` no `.env`).
Leads novos são salvos no cache local e enviados automaticamente para a planilha.

---

## Integração com o frontend (index.html)

Adicione ao bloco de configuração do `index.html`:

```javascript
const BACKEND_URL = 'http://localhost:3001'; // ou URL do deploy

// Botão "Captar leads"
async function startCapture() {
  const r = await fetch(`${BACKEND_URL}/scraper/start`, { method: 'POST' });
  const d = await r.json();
  toast(`Captação iniciada — Job: ${d.jobId}`);
}

// Sync para a planilha
async function syncCapturedLeads() {
  const r = await fetch(`${BACKEND_URL}/sheets/push`, { method: 'POST' });
  const d = await r.json();
  toast(`✓ ${d.pushed} leads enviados para a planilha!`);
  loadSheet();
}
```

---

## Deploy gratuito (Railway ou Render)

1. Suba o código para um repositório GitHub
2. Conecte o repo no [Railway.app](https://railway.app) ou [Render.com](https://render.com)
3. Configure as variáveis de ambiente no painel
4. Após o deploy, atualize `ALLOWED_ORIGIN` com a URL do frontend e `BACKEND_URL` no `index.html`

---

## Estrutura de pastas

```
matte-backend/
├── server.js               # Entry point Express
├── src/
│   ├── routes/
│   │   ├── leads.js        # CRUD de leads
│   │   ├── scraper.js      # Controle do scraper
│   │   └── sheets.js       # Push/pull Google Sheets
│   ├── services/
│   │   ├── scraper.js      # Lógica SerpAPI → sites → e-mail
│   │   ├── emailExtractor.js  # Regex + Cheerio
│   │   ├── sheetsClient.js    # Google Sheets API wrapper
│   │   └── deduplicator.js    # Evita duplicados
│   ├── jobs/
│   │   └── scraperJob.js   # Cron a cada 6h
│   ├── data/
│   │   └── leads.json      # Cache local (não commitado)
│   └── utils/
│       ├── logger.js        # Logs coloridos
│       └── validator.js     # Validação e normalização
```
