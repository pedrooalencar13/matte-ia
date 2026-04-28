# Status do Projeto MATTE

## Última atualização: 28/04/2026

## Implementado

- Captação multi-fonte: Apify, Outscraper (500/mês grátis) e SerpAPI — selecionável no painel
  - src/scrapers/outscraper.js — Outscraper API com Score IA integrado
  - src/scrapers/serpScraper.js — SerpAPI com enriquecimento de site e Score IA
  - src/scrapers/apifyScraper.js — Apify (Actor compass/crawler-google-places)
  - Seleção dinâmica por source (apify/outscraper/serp) em runScraper()
  - Busca automática a cada 6h via serpAutoService.js (usa Outscraper se disponível, SerpAPI como fallback)
  - Modal de captação tem selector de fonte no painel frontend
- Captação de leads via Apify (Google Maps) — legacy, ainda suportado
- Lead scoring com Claude AI (scorer.js): score 0-10 + motivo por lead
- Extração de e-mail dos sites dos escritórios (emailExtractor)
- Deduplicação por e-mail
- Push/Pull Google Sheets com colunas mapeadas (A-X):
  - Colunas A-U: dados existentes (mantidos intactos)
  - V=Instagram (URL do perfil)
  - W=Score IA (número 0-10)
  - X=Motivo Score (texto curto)
- Painel de e-mails com geração via Claude
- Chat assistente integrado
- Template fixo para advogados + detecção automática
- Cron scraper a cada 6h
- Sync automático a cada 60s
- Disparo em massa via Gmail API (backend, sem abrir abas)
- Envio individual via backend (sem window.open)
- Cadência de 10 e-mails (cadenceJob.js desativado — envio apenas via cadenceAutoJob ou manual)
  - Painel Disparos exibe o email correto da etapa ao selecionar contato com cadência ativa
  - Indicador visual de etapa (Email N de 10 + status colorido)
  - cleanEmailBody() remove markdown dos templates
  - GET /cadence/template/:etapa disponível no backend
- Tracking de abertura (pixel) e resposta (Gmail API)
- Dashboard avançado: 8 KPIs, gráfico temporal, 3 gráficos, funil visual, tabela paginada, exportação CSV, auto-refresh 30s, saúde do sistema
  - Coluna Score IA com badge colorido (vermelho 0-4, amarelo 5-7, verde 8-10)
  - Tooltip/texto com motivo do score
  - Coluna Instagram com link clicável (abre em nova aba)
  - Exportação CSV inclui Score IA, Motivo Score, Instagram
- Sistema de tarefas: CRUD completo, overlay UI, persistência em data/tasks.json
- Gerenciador de inbox: classificação automática de e-mails, geração de rascunhos via Claude
- Sistema de memória persistente (/memory)
- CLAUDE.md com instruções de sessão
- GET /email/test para diagnóstico Gmail OAuth2
- GET /ping para keep-alive via cron-job.org (Render plano gratuito)
- POST /cadence/activate-all + botão "✦ Ativar todos" no header do frontend
- cadenceAutoJob.js processa em lotes de 20 com rebus da planilha + pausa de 30s entre lotes (sem limite de 50)
- Interface de contatos limpa: remove tags (qualif, fat, ADV, cad) — exibe só nome + email + badge de etapa
- Chat assistente com estatísticas ao vivo (ativas, sem cadência, responderam) no system prompt
- quickAction() contextual: inclui nome/especialidade do contato selecionado nos prompts rápidos
- GET /sheets/pull com meta-dados estruturados
- Verificação de credenciais no startup do servidor
- parseCSV corrigido (RFC 4180 completo)
- Botão Parar captação: feedback otimista, rollback em erro, capture-indicator

## Colunas Google Sheets (A-X)

| Col | Índice | Campo             |
|-----|--------|-------------------|
| A   | 0      | First Name        |
| B   | 1      | Last Name         |
| C   | 2      | Phone             |
| D   | 3      | Email             |
| E   | 4      | Business Name     |
| F   | 5      | Created           |
| G   | 6      | Last Activity (cidade) |
| H   | 7      | Tags              |
| I   | 8      | utm_source        |
| J   | 9      | utm_medium (especialidade) |
| K   | 10     | utm_campaign      |
| L   | 11     | utm_content (site) |
| M   | 12     | faturamento       |
| N   | 13     | urgencia          |
| O   | 14     | qualificacao      |
| P   | 15     | cadencia_status   |
| Q   | 16     | cadencia_etapa    |
| R   | 17     | cadencia_proximo  |
| S   | 18     | email_aberto      |
| T   | 19     | email_respondido  |
| U   | 20     | data_resposta     |
| V   | 21     | instagram         |
| W   | 22     | score_ia          |
| X   | 23     | motivo_score      |

## Pendente

- Gmail OAuth2: configurar refresh token no Render (manual pelo Pedro)
- Publicar app OAuth no Google Cloud (sair do modo teste para tokens permanentes)
- Documentação completa em /docs
- Alertas WhatsApp quando lead responde
- Configurar todas as variáveis de ambiente no Render (manual pelo Pedro)
- Configurar cron-job.org: GET https://matte-ia.onrender.com/ping a cada 10 minutos

## Pendente (pós 27/04/2026)

- Criar conta outscraper.com e adicionar OUTSCRAPER_API_KEY no Render
- Testar captação com Outscraper selecionado no painel

## Variáveis de ambiente obrigatórias no Render

| Variável                    | Descrição                                           |
|-----------------------------|-----------------------------------------------------|
| APIFY_TOKEN                 | Token do Apify (apify.com → Settings → Integrations) |
| GOOGLE_SERVICE_ACCOUNT_EMAIL| Service Account do Google Sheets                    |
| GOOGLE_PRIVATE_KEY          | Chave privada do Google Sheets                      |
| SHEET_ID                    | ID da planilha Google Sheets                        |
| SHEET_TAB                   | Aba da planilha (Página1)                           |
| ALLOWED_ORIGIN              | https://pedrooalencar13.github.io                   |
| GMAIL_CLIENT_ID             | OAuth2 ClientID Gmail                               |
| GMAIL_CLIENT_SECRET         | OAuth2 Secret Gmail                                 |
| GMAIL_REFRESH_TOKEN         | Refresh Token Gmail                                 |
| GMAIL_USER                  | pedrooalencar13@gmail.com                           |
| CLAUDE_API_KEY              | API Key da Anthropic (Claude)                       |
| BACKEND_PUBLIC_URL          | https://matte-ia.onrender.com                       |
| SCRAPER_MAX_PER_RUN         | 50 (opcional)                                       |
| SCRAPER_CRON                | 0 */6 * * * (opcional)                              |
| OUTSCRAPER_API_KEY          | outscraper.com → Dashboard → API Key (grátis 500/mês) |
| SERP_API_KEY                | serpapi.com → Dashboard (100/mês grátis)            |

Nota: PORT não precisa ser configurada — o Render injeta automaticamente.

## Infraestrutura
- Render: matte-ia.onrender.com (migrado do Railway em 23/04/2026)
- GitHub Pages: pedrooalencar13.github.io/matte-ia (deploy automático via git push)
- Google Cloud: projeto gestor-trafego-490719
- Keep-alive: cron-job.org → GET https://matte-ia.onrender.com/ping a cada 10 min
