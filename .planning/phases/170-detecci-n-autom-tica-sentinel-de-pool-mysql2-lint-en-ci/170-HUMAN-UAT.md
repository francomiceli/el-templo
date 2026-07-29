---
status: partial
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
source: [170-VERIFICATION.md]
started: 2026-07-29T14:35:01Z
updated: 2026-07-29T14:35:01Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Push a staging + rojo único esperado del gate D-14

expected: Al pushear `feat/170-sentinel-lint` a staging, el step "Tenant lint (CON-06)" de ci.yml sale ROJO una sola vez — el ratchet D-14 detecta que la allowlist creció de 423 (origin/staging) a 501 entradas. Es el comportamiento aceptado en el checkpoint del plan 170-10 (mismo movimiento que el plan 08). El deploy de staging no depende de ci.yml. El push siguiente sobre la misma base vuelve a verde. Si el rojo persiste más de un run, ES un bug del gate.
result: ROJO confirmado 2026-07-29 en el run del push `3c0857e9`: `gainedEntries: 78` contra `--base=e3ba7ae5` (exactamente los +78 del re-baseline), y los otros tres gates en 0 (`unlistedViolations: 0`, stale ×2 en 0, `strictWithAllowlist: 0`). Falta: confirmar deploy-staging verde de ese push + verde de ci.yml en el próximo push a staging (base ya con 501).

### 2. Ventana de observación 2-3 días del sentinel en staging

expected: Con el sentinel corriendo en staging (modo log.error + métrica, ningún módulo en strict), durante 2-3 días de tráfico real: ningún camino roto por el sentinel, volumen de `log.error` accionable (no ruido recurrente por falsos positivos), nada nuevo en Sentry atribuible al sentinel. Cierra la cláusula operativa del criterio 2 (CON-05): "tras la ventana de observación en staging la lista de excepciones queda cerrada".
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
