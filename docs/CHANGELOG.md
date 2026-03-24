# Changelog

## v3.0.0 — 24/03/2026

### Corrigido
- `enviarEmail()`: usa backend em vez de `window.open()` / `sendPrompt()`
- `startBulkSend()`: removido fallback que abria Gmail em múltiplas abas
- `startCapture()`: feedback otimista — botão Parar aparece antes da resposta do backend
- `stopCapture()`: rollback correto do estado dos botões em caso de erro
- `checkCaptureStatus()`: em erro de rede mantém botão Parar visível (retry mais lento)
- `parseCSV()`: corrigido parser RFC 4180 — aspas no valor, escape `""` dentro de strings
- `GET /sheets/pull`: retorna estrutura com `meta` para o dashboard

### Adicionado
- Dashboard avançado: 8 KPIs, gráfico temporal 30 dias, 3 gráficos lado a lado, funil visual HTML, tabela paginada (50/pág), exportação CSV, auto-refresh 30s, indicador de saúde do sistema
- Sistema de tarefas: CRUD completo via `/tasks`, overlay UI no frontend com formulário inline
- Gerenciador de inbox: `/src/services/inboxManager.js` — classifica e-mails em URGENTE/PRECISA_RESPOSTA/FYI/LIXO, gera rascunhos via Claude API
- `GET /email/test`: diagnostica se credenciais Gmail OAuth2 estão configuradas e válidas
- `POST /cadence/activate-all`: ativa cadência para todos os leads sem cadência configurada
- Verificação de credenciais no startup do servidor (server.js)
- `capture-indicator`: span animado no header durante captação ativa
- Botão Parar com estilo vermelho mais visível
- Botão "Tarefas" no header
- Sistema de memória persistente (`/memory/`)
- `CLAUDE.md` com instruções para sessões futuras
- `docs/API.md` com documentação de todos os endpoints

---

## v2.0.0 — 23/03/2026

### Adicionado
- Cadência automática de 6 e-mails (D+0, D+2, D+4, D+6, D+8, D+10)
- Tracking de abertura (pixel 1x1)
- Tracking de resposta (Gmail API)
- Envio em massa via Gmail API no backend
- Dashboard básico com 6 cards e 2 gráficos

---

## v1.0.0 — 22/03/2026

### Adicionado
- Captação de leads via SerpAPI + Google Maps
- Extração de e-mail dos sites dos escritórios
- Deduplicação por e-mail
- Push para Google Sheets
- Painel de disparos com geração de e-mail via Claude
- Chat assistente integrado
- Template fixo para advogados
- Cron automático a cada 6h
