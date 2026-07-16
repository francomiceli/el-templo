---
status: partial
phase: 163-maquina-de-estados-automatica-del-lead
source: [163-VERIFICATION.md]
started: 2026-07-16T02:05:00Z
updated: 2026-07-16T02:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. p90 real sembrado en prod
expected: Al aplicar la migración 0182 en prod, `system_settings.leads.perdido_window_days` queda con el p90 real de la distribución de días sesión→compra de los ~105 Ganados (dev cayó al fallback 14 por muestra <20). Verificar el valor y validarlo con Nacho.
result: [pending]

### 2. Dry-run del backfill 0183 contra prod
expected: Correr `el-templo-api/src/db/scripts/0183_backfill_lost_leads_dryrun.sql` contra prod ANTES de que el pipeline aplique 0183 — el COUNT debe dar ≈112 (En seguimiento vencidos según el brief del 15/07). Si difiere mucho, investigar antes del deploy.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
