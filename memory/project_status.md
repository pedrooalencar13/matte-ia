# Status do Projeto MATTE

## Última atualização: 24/03/2026

## Implementado

- Captação de leads via SerpAPI (Google Maps)
- Extração de e-mail dos sites dos escritórios
- Deduplicação por e-mail
- Push/Pull Google Sheets com colunas mapeadas (A-U)
- Painel de e-mails com geração via Claude
- Chat assistente integrado
- Template fixo para advogados + detecção automática
- Cron scraper a cada 6h
- Sync automático a cada 60s
- Disparo em massa via Gmail API (backend, sem abrir abas)
- Envio individual via backend (sem window.open)
- Cadência automática de 6 e-mails
- Tracking de abertura (pixel) e resposta (Gmail API)
- Dashboard avançado: 8 KPIs, gráfico temporal, 3 gráficos, funil visual, tabela paginada, exportação CSV, auto-refresh 30s, saúde do sistema
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

## Pendente

- Gmail OAuth2: configurar refresh token no Railway (manual pelo Pedro)
- Publicar app OAuth no Google Cloud (sair do modo teste para tokens permanentes)
- Documentação completa em /docs
- Alertas WhatsApp quando lead responde
- Upgrade SerpAPI para plano pago (100 buscas/mês no gratuito)

## Infraestrutura
- Railway: matte-ia-production.up.railway.app (24/7, deploy automático via git push)
- GitHub Pages: pedrooalencar13.github.io/matte-ia (deploy automático via git push)
- Google Cloud: projeto gestor-trafego-490719
