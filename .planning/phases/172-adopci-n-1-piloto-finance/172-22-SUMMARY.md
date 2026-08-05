---
phase: 172-adopci-n-1-piloto-finance
plan: 22
subsystem: verification
tags: [tenancy, finance, staging, ci, snapshot, uat, checkpoint]

# Dependency graph
requires:
  - plan: 172-05
    provides: "snapshot-finance-endpoints.ts + antes.json (baseline D-12, staging, rango 2026-H1)"
  - plan: 172-21
    provides: "el switch: finance en TENANT_STRICT_MODULES, allowlist 501→450"
provides:
  - "Rama en staging (merges 387c0aaf + 211c0003) con CI verde: suite completo con el sentinel en throw"
  - "Evidencia D-12: diff de los 7 agregadores con CERO diferencias reales (10 ageInDays +1 por el día calendario entre fotos + 1 metadata)"
  - "UAT de staff aprobado por Franco (owner) — cobro, validación, caja, sin cambios de comportamiento"
  - "Fix FK-safe de la limpieza de coach-load-pricing-gate y coach-load-alta (2579bc6b) — cierra también los viejos 'rojos ambientales'"
affects: [172-23, 173]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "La limpieza de beforeEach con DELETEs crudos va SIEMPRE en una conexión única del pool con FOREIGN_KEY_CHECKS=0 (patrón coach-load.test.ts): el orden 'que cubre las FKs' es falso en cuanto otro archivo del worker deja filas hijas"
    - "Agregar archivos de test re-baraja qué archivos comparten base por worker en CI: una bomba FK latente puede explotar en un archivo que nadie tocó"

key-files:
  created: []
  modified:
    - el-templo-api/test/finance/coach-load-pricing-gate.test.ts
    - el-templo-api/test/finance/coach-load-alta.test.ts

key-decisions:
  - "El diff D-12 se dio por VACÍO con causa documentada: las 11 divergencias son 10 campos `ageInDays` (todos exactamente +1 — pasó un día calendario entre capturas; el campo se computa contra NOW al momento del request) + 1 timestamp de metadata. Verificado por comparación profunda: CERO divergencias en montos, filas, saldos o totales. El script y el rango no se tocaron (prohibido por el plan)"
  - "El fallo de CI (ER_ROW_IS_REFERENCED_2 en pricing-gate) NO era del sentinel: bomba FK latente destapada porque los 4 archivos nuevos de ISO-03 re-barajaron los workers. Fix = copiar el patrón FK-safe que coach-load.test.ts ya tenía, a los 2 archivos que quedaban frágiles"
  - "La observación del UAT (chip 'Pendiente' en el panel de cobros sobre un cobro validado) NO es bug de la fase: CobrosPage.vue:70 muestra 'Pendiente' hardcodeado para toda fila no anulada (deuda declarada WR-03, anterior; el endpoint no expone validationStatus). Backend verificado coherente: tx 73 validado, bandeja vacía, saldo movido. La rama no toca el front"

patterns-established: []

requirements-completed: [ADO-01]

# Metrics
duration: ~2h (incluye ciclo CI rojo→fix→verde y UAT del staff)
completed: 2026-07-31
---

# Phase 172 Plan 22: Checkpoint — CI, diff de números y UAT Summary

**La fase cumplió su otra mitad con evidencia: el suite completo pasa en CI con el sentinel en throw, los 7 agregadores de finance dan números idénticos en staging antes y después de la migración (las únicas divergencias son el paso de un día calendario en `ageInDays`), y el staff (Franco, owner) cobró, validó y arqueó sin notar cambios.**

## Task 1 — Push a staging y CI

- Push autorizado por Franco. Merge `387c0aaf` a staging (88 archivos, +12.100/−2.211, **sin migraciones**), rama `feat/172-adopcion-finance` publicada en origin.
- **Primer CI rojo** — no del sentinel: `DELETE FROM subscriptions` en `coach-load-pricing-gate.test.ts:215` con `ER_ROW_IS_REFERENCED_2` desde `program_enrollments` dejadas por otro archivo del mismo worker (`isolate: false`). Local no lo vio: el 172-21 corrió single-worker.
- **Fix `2579bc6b`**: los 2 archivos con limpieza frágil (`pricing-gate` y `coach-load-alta`) copian el patrón FK-safe que `coach-load.test.ts` ya tenía — conexión única del pool, `FOREIGN_KEY_CHECKS=0`, DELETEs acotados por tenant en las strict (la conexión cruda pasa por el sentinel), `program_enrollments` antes de `subscriptions`. 13/13 verdes local. Merge `211c0003` a staging.
- **CI verde con el suite completo y el sentinel en throw** (confirmado por Franco). Efecto colateral bueno: esto explica y cierra los viejos "2 rojos ambientales" de `coach-load-alta`.

## Task 2 — Snapshot "después" y diff D-12

Token de admin minteado por SSH en el server de staging (HS256 con el `JWT_SECRET` del `.env.production`; el secret no salió del server). Captura contra `https://api-staging.eltemplo.org`:

```
GET /transactions/summary ......... 200
GET /cash-registers/balances ...... 200
GET /pending-tray ................. 200 (3 filas)
GET /movements-history ............ 200 (62 filas)
GET /transactions ................. 200 (42 filas)
GET /cost-centers/all ............. 200
GET /reports/outstanding-balances . 200 (7 filas)
```

Diff `antes.json` (2026-07-30 22:51 UTC) vs `despues.json` (2026-07-31 19:05 UTC):

- `--diff` reportó 2 endpoints divergentes (`pending-tray`, `outstanding-balances`), primer path `ageInDays`.
- Comparación profunda completa: **11 divergencias = 10 × `ageInDays` (todas exactamente +1) + 1 timestamp de metadata. CERO divergencias en cualquier otro campo.**
- Causa: `ageInDays` se computa contra NOW al momento del request y entre las dos fotos pasó un día calendario. No se tocó ni el script ni el rango.

**Conclusión D-12: la migración no movió un peso.**

## Task 3 — UAT del staff

Franco (cuenta **owner**) en el admin de staging: registró un cobro de plan en efectivo (Adrián Spagnoli, $350.000 ARS), lo vio reflejado en caja, y dio **"uat ok"**.

**Observación investigada y explicada** (no-gap): el panel de cobros mostraba chip "Pendiente" sobre el cobro, pero en caja aparecía validado. Verificación contra la API de staging: la transacción (id 73) está `validado` —correcto por VAL-02: el rol owner valida al nacer—, la bandeja de pendientes está vacía y el saldo se movió. El chip es `CobrosPage.vue:70`: **"Pendiente" hardcodeado para toda fila no anulada**, deuda declarada en el propio comentario (WR-03: el endpoint del listado no expone `validationStatus`). Preexistente; esta rama no toca el front.

**→ Backlog (fuera de fase):** exponer `validationStatus` en el listado de cobros y renderizar el chip real Validado/Pendiente.

## Task Commits

| Qué                               | Commit     | Dónde                     |
| --------------------------------- | ---------- | ------------------------- |
| Merge fase → staging              | `387c0aaf` | staging                   |
| Fix FK-safe limpieza (2 archivos) | `2579bc6b` | feat/172-adopcion-finance |
| Merge fix → staging               | `211c0003` | staging                   |

## Próximo

172-23: el doc de la receta de adopción (`.docs/saas-multitenancy/07-receta-adopcion.md`) — último plan de la fase. Insumos ya anotados en deferred-items: sede virtual propia por gimnasio, sentinel por-query vs lente por-tabla, orden allowlist→strict.
