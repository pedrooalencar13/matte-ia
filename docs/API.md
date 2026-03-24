# API Reference — MATTE Backend

Base URL: `https://matte-ia-production.up.railway.app`

## Health

```
GET /health
```
Retorna `{ "status": "ok", "timestamp": "..." }`

---

## Scraper

```
POST /scraper/start          — Inicia captação de leads
GET  /scraper/status         — Status atual { running, found, valid, jobId }
POST /scraper/stop           — Para o scraper
```

---

## Sheets

```
POST /sheets/push            — Envia leads novos para a planilha
GET  /sheets/pull            — Retorna todos os contatos + meta-dados
```

Resposta do `/sheets/pull`:
```json
{
  "contacts": [...],
  "meta": {
    "total": 150,
    "emCadencia": 45,
    "abriram": 12,
    "responderam": 5,
    "concluidos": 8,
    "ultimoSync": "2026-03-24T12:00:00Z"
  }
}
```

---

## Email

```
POST /email/send             — Envia um e-mail
POST /email/bulk             — Disparo em massa (background)
GET  /email/status           — Status do job de bulk
GET  /email/test             — Testa credenciais Gmail OAuth2
```

Corpo do `/email/send`:
```json
{ "to": "email@exemplo.com", "subject": "Assunto", "body": "Corpo do e-mail" }
```

---

## Cadência

```
GET  /cadence/status         — Estatísticas de cadência
POST /cadence/pause/:email   — Pausa cadência de um lead
POST /cadence/resume/:email  — Retoma cadência de um lead
POST /cadence/reset/:email   — Reinicia cadência do zero
POST /cadence/activate-all   — Ativa cadência para todos sem cadência
GET  /cadence/history/:email — Histórico de um lead
```

---

## Tracking

```
GET  /track/open             — Pixel de rastreamento de abertura
GET  /track/stats            — Estatísticas globais de abertura/resposta
GET  /track/stats/:email     — Estatísticas de um lead específico
```

---

## Inbox

```
GET  /inbox/scan             — Escaneia Gmail e classifica e-mails não lidos
GET  /inbox/stats            — Estatísticas dos e-mails processados
GET  /inbox/drafts           — Lista rascunhos gerados automaticamente
```

---

## Tasks

```
GET    /tasks                — Lista todas as tarefas
POST   /tasks                — Cria nova tarefa { title, description, priority }
PUT    /tasks/:id            — Atualiza tarefa
DELETE /tasks/:id            — Remove tarefa
POST   /tasks/:id/complete   — Marca como concluída
```

---

## Leads

```
GET    /leads                — Lista leads do cache local
POST   /leads                — Adiciona lead ao cache
DELETE /leads/:id            — Remove lead do cache
```
