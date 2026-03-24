# CLAUDE.md — Projeto MATTE | Pedro Aranha Gestão de Tráfego

## Ao iniciar QUALQUER sessão neste repositório
1. Leia `/memory/user.md` — identidade e infraestrutura
2. Leia `/memory/preferences.md` — padrões de código e negócio
3. Leia `/memory/decisions.md` — decisões já tomadas (não reverter sem justificativa)
4. Leia `/memory/project_status.md` — o que está pronto e o que está pendente
5. Leia `/memory/people.md` — contexto de pessoas e público-alvo

## Ao encerrar uma sessão
- Atualize `memory/project_status.md` com o que foi feito e o que ficou pendente
- Se tomou nova decisão arquitetural, adicione em `memory/decisions.md`
- Se nova preferência foi expressa, atualize `memory/preferences.md`

## Regras absolutas
- O frontend é e deve continuar sendo um ÚNICO arquivo `index.html`
- NUNCA implementar envio automático de e-mails sem confirmação humana
- NUNCA reverter o design dark theme sem instrução explícita
- SEMPRE criar backup antes de editar `index.html`: `cp index.html index.html.bak`
- SEMPRE fazer commit a cada fase concluída
- Model Claude: sempre `claude-haiku-4-5-20251001`
- Comentários e logs em português brasileiro

## Stack técnica
- Frontend: HTML/CSS/JS puro + Chart.js via CDN
- Backend: Node.js + Express + Axios + Cheerio + googleapis + node-cron
- APIs: Claude (Anthropic), SerpAPI, Google Sheets API v4, Gmail API v1
- Hospedagem: GitHub Pages (frontend) + Railway (backend)

## Comandos rápidos
```bash
cd matte-backend && npm run dev           # desenvolvimento local
git add -A && git commit -m "msg"         # commit
git push origin main                      # deploy
```

## Variáveis de ambiente obrigatórias (Railway)
SERP_API_KEY, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY,
SHEET_ID, SHEET_TAB, PORT, ALLOWED_ORIGIN,
GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER,
CLAUDE_API_KEY, BACKEND_PUBLIC_URL

## Fluxo do sistema
SerpAPI → Scraper → Email Extractor → Deduplicator → Google Sheets → Frontend → Claude API → Gmail API
