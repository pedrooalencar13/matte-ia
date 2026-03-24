# Registro de Decisões Arquiteturais

## DEC-001 — Backend no Railway
- **Data:** 22/03/2026 | **Revisão:** 21/04/2026
- **Decisão:** Node.js no Railway como backend
- **Motivo:** Custo zero, deploy simples via git push
- **Status:** ACTIVE

## DEC-002 — Template fixo para advogados
- **Data:** 22/03/2026 | **Revisão:** 21/04/2026
- **Decisão:** Não chamar Claude API para leads com campaign=advogados
- **Motivo:** Economizar tokens em ~70%; consistência na mensagem
- **Status:** ACTIVE

## DEC-003 — Bypass SSL no emailExtractor
- **Data:** 23/03/2026 | **Revisão:** 22/04/2026
- **Decisão:** rejectUnauthorized:false no axios para extração de e-mails
- **Motivo:** Muitos sites de escritórios têm SSL inválido/expirado
- **Status:** ACTIVE

## DEC-004 — Cadência de 6 e-mails em 10 dias
- **Data:** 23/03/2026 | **Revisão:** 22/04/2026
- **Decisão:** Sequência automática D+0, D+2, D+4, D+6, D+8, D+10
- **Motivo:** Nutrição gradual sem ser invasivo
- **Status:** ACTIVE

## DEC-005 — Envio via Gmail API no backend
- **Data:** 24/03/2026 | **Revisão:** 23/04/2026
- **Decisão:** Eliminar window.open(), enviar via servidor Node.js
- **Motivo:** window.open com 50+ leads travava o computador do Pedro
- **Status:** ACTIVE

## DEC-006 — Dashboard avançado com paginação e CSV
- **Data:** 24/03/2026 | **Revisão:** 23/04/2026
- **Decisão:** Dashboard com 8 KPIs, gráfico temporal, funil visual, paginação 50/pág, exportação CSV
- **Motivo:** Necessidade de métricas estilo Google Ads para tomada de decisão
- **Status:** ACTIVE
