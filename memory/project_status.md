# Status do Projeto MATTE

## Última atualização: 23/04/2026

## Implementado

- Captação de leads via Apify (Google Maps) — substituiu SerpAPI em 23/04/2026
  - Actor: compass/crawler-google-places
  - Actor de enriquecimento: apify/social-media-leads-analyzer (emails, phones, instagram)
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
- Cadência automática de 6 e-mails (cadenceJob.js desativado — envio apenas manual)
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
- POST /cadence/activate-all
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

- Gmail OAuth2: configurar refresh token no Railway (manual pelo Pedro)
- Publicar app OAuth no Google Cloud (sair do modo teste para tokens permanentes)
- Documentação completa em /docs
- Alertas WhatsApp quando lead responde
- Configurar APIFY_TOKEN no Railway (manual pelo Pedro)

## Variáveis de ambiente obrigatórias no Railway

| Variável                    | Descrição                              |
|-----------------------------|----------------------------------------|
| APIFY_TOKEN                 | Token do Apify (apify.com → Settings → Integrations) |
| GOOGLE_SERVICE_ACCOUNT_EMAIL| Service Account do Google Sheets       |
| GOOGLE_PRIVATE_KEY          | Chave privada do Google Sheets         |
| SHEET_ID                    | ID da planilha Google Sheets           |
| SHEET_TAB                   | Aba da planilha (Página1)              |
| PORT                        | Porta do servidor                      |
| ALLOWED_ORIGIN              | Origin permitida (GitHub Pages)        |
| GMAIL_CLIENT_ID             | OAuth2 ClientID Gmail                  |
| GMAIL_CLIENT_SECRET         | OAuth2 Secret Gmail                    |
| GMAIL_REFRESH_TOKEN         | Refresh Token Gmail                    |
| GMAIL_USER                  | E-mail do remetente                    |
| CLAUDE_API_KEY              | API Key da Anthropic (Claude)          |
| BACKEND_PUBLIC_URL          | URL pública do Railway                 |

## Infraestrutura
- Railway: matte-ia-production.up.railway.app (24/7, deploy automático via git push)
- GitHub Pages: pedrooalencar13.github.io/matte-ia (deploy automático via git push)
- Google Cloud: projeto gestor-trafego-490719
