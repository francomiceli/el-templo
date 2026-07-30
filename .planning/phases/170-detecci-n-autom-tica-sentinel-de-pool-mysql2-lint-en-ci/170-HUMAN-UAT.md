---
status: partial
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
source: [170-VERIFICATION.md]
started: 2026-07-29T14:35:01Z
updated: 2026-07-30T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Push a staging + rojo único esperado del gate D-14

expected: Al pushear `feat/170-sentinel-lint` a staging, el step "Tenant lint (CON-06)" de ci.yml sale ROJO una sola vez — el ratchet D-14 detecta que la allowlist creció de 423 (origin/staging) a 501 entradas. Es el comportamiento aceptado en el checkpoint del plan 170-10 (mismo movimiento que el plan 08). El deploy de staging no depende de ci.yml. El push siguiente sobre la misma base vuelve a verde. Si el rojo persiste más de un run, ES un bug del gate.
result: PASSED 2026-07-29. Rojo único confirmado en el run del push `3c0857e9` (`gainedEntries: 78` contra `--base=e3ba7ae5`, los otros tres gates en 0). Verde confirmado en el push siguiente: CI #1327 sobre `bb9e9bf` (backmerge master→staging) pasó el step "Tenant lint (CON-06)" completo en verde, y Deploy Staging #775 verde (13m 32s). El ratchet se comportó exactamente como se aceptó en el checkpoint del plan 170-10.

### 2. Ventana de observación 2-3 días del sentinel en staging

expected: Con el sentinel corriendo en staging (modo log.error + métrica, ningún módulo en strict), durante 2-3 días de tráfico real: ningún camino roto por el sentinel, volumen de `log.error` accionable (no ruido recurrente por falsos positivos), nada nuevo en Sentry atribuible al sentinel. Cierra la cláusula operativa del criterio 2 (CON-05): "tras la ventana de observación en staging la lista de excepciones queda cerrada".
result: PASSED CON LIMITACIÓN DECLARADA 2026-07-30 (decisión de Franco). Lectura por SSH read-only de ~14 h de logs de `eltemplo-staging-api`: 66 fingerprints distintos sobre 39 tablas gym-owned, 2.731 violaciones, `fingerprintsOmitidos: 0`, 0 fallos internos del parser, 0 hits strict, proceso `online` con `unstable restarts: 0` y nada en Sentry. Las 39 tablas son subconjunto ESTRICTO de las 86 del inventario del suite — cero violaciones fuera de él a nivel de tabla — y cero falsos positivos. LIMITACIÓN: staging casi no se usó, los 66 fingerprints son el 3,6% de los 1.852 del suite y la muestra no convergió (63→63→66); además el cruce fue a nivel de tabla, no de fingerprint (el volcado crudo de los 1.852 salió de una sonda revertida sin commitear). Se cierra igual porque el sentinel está en modo `log` con la lista strict vacía y no puede tirar una query (T-170-14): una forma no observada produce, como consecuencia completa, una línea más de `log.error`. Detalle completo en `170-INVENTORY.md` § "Ventana de observación en staging".

### 3. Lectura del sentinel en PRODUCCIÓN a T+48 h del tren (obligación derivada del test 2)

expected: A las ~48 h de que el tren `170 + 171` llegue a `master`, releer los logs del sentinel en el proceso de producción (`eltemplo-api`) con la misma batería read-only usada en staging (`pm2 describe` + `pm2 logs --lines 20000 --nostream` filtrado por "sentinel de tenancy"), y responder las mismas tres preguntas: (a) ¿alguna tabla gym-owned fuera de las 86 del inventario?, (b) ¿algún falso positivo real del parser?, (c) ¿volumen manejable / dedup funcionando? Prod corre el mismo modo `log` con `TENANT_STRICT_MODULES` vacía pero con el 100% del tráfico real del staff, así que es la muestra que staging no pudo dar. Si aparece un falso positivo, la resolución es arreglar el parser o el skiplist — NUNCA bajar el sentinel ni aceptar el ruido. Requiere OK explícito de Franco para SSHear (Rule 0 del debugging playbook).
result: [pending — agendado 2026-07-30, se dispara con el tren a master]

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
