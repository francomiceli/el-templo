---
phase: 152-reorganizaci-n-de-caja-egresos-configurables
plan: 01
subsystem: finance (schema + migración)
tags: [schema, migration, cost-centers, validation, backfill]
requires: []
provides:
  - "financial_transactions.validated_by / validated_at (nullable FK read path del validador)"
  - "financialTxValidator relation en el schema Drizzle"
  - "cost_centers unique index (name, country) para el ABM"
  - "seeds AR genéricos (Alquiler / Viáticos) + 'Pago a proveedores'"
  - "backfill de validaciones históricas desde audit_log"
affects:
  - "152-03/152-05 (read path del validador en /transactions)"
  - "152-04/152-06 (ABM de centros de costo)"
tech-stack:
  added: []
  patterns:
    - "Nullable-FK + relation espejando voidedBy/voidedAt/voider (D-05/D-06)"
    - "Migración hand-written idempotente (FROM DUAL WHERE NOT EXISTS + UPDATE por name+country)"
    - "Backfill UPDATE ... JOIN audit_log keyed en target_id (1 evento por tx = JOIN plano seguro)"
key-files:
  created:
    - "el-templo-api/src/db/migrations/0165_validated_by_and_cost_center_abm.sql"
  modified:
    - "el-templo-api/src/db/schema/financial-transactions.ts"
    - "el-templo-api/src/db/schema/cost-centers.ts"
decisions:
  - "validated_by/at NULLABLE: solo la transición pendiente→validado las setea; nacidos-validados e históricos no-backfilleados quedan NULL (D-06)"
  - "ADD UNIQUE INDEX corre DESPUÉS de los renames de seeds para no colisionar (T-152-03)"
  - "Renames por UPDATE (name, country), NO delete: ninguna categoría en uso se pierde (D-09 / T-152-01)"
metrics:
  duration: ~10min
  completed: 2026-07-04
---

# Phase 152 Plan 01: validated_by/at + ABM de centros de costo (schema + migración 0165) Summary

Cimiento de schema de la fase 152: agrega el read path denormalizado del validador (`validated_by`/`validated_at` nullable FK en `financial_transactions`, espejando `voided_by`/`voided_at`) y la unicidad `(name, country)` del ABM de centros de costo, más los renames de seeds Templo-céntricos a genéricos y el seed `Pago a proveedores`, todo en una única migración `0165` escrita a mano y aplicada a la DB local.

## What Was Built

- **Task 1 — Schemas Drizzle** (`d15b17f7`): `validatedBy: int("validated_by").references(() => users.id)` + `validatedAt: timestamp("validated_at")` inmediatamente después de `validationStatus`, más la relación `validator` (`relationName: "financialTxValidator"`) espejando `voider`. En `cost-centers.ts`: import de `uniqueIndex` + `uniqueIndex("uq_cost_centers_name_country").on(table.name, table.country)`. `npx tsc --noEmit` verde.
- **Task 2 — Migración 0165** (`5fdefca7`): 4 bloques ordenados — (1) ALTER ADD `validated_by`/`validated_at` nullable + FK; (2) backfill `UPDATE ... JOIN audit_log` en `action='transaction_validated'` (verificado: `validate()` escribe exactamente 1 evento por tx, JOIN plano no multiplica); (3) renames `Alquiler Constitución→Alquiler`, `Viáticos profes→Viáticos` por (name, country); (4) seed idempotente `Pago a proveedores` + `ADD UNIQUE INDEX` corriendo después de los renames. Sin `;` en comentarios.
- **Task 3 — Aplicación [BLOCKING]**: `pnpm db:migrate` aplicó 0165 (7 statements) limpio. Verificado por query: columnas nullable presentes, índice `uq_cost_centers_name_country` creado, seeds AR = `Alquiler | Librería | Pago a proveedores | Retiros | Varios | Viáticos` (sin los nombres viejos), fila 0165 en `_migrations`.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Compliance

- **T-152-01** (rename de seeds): mitigado — UPDATE por (name, country) exacto, NO delete.
- **T-152-02** (backfill JOIN): mitigado — `validate()` escribe 1 solo evento `transaction_validated` por tx (verificado en transaction-service.ts:704-707), JOIN plano no multiplica.
- **T-152-03** (ADD UNIQUE INDEX): mitigado — el índice se agrega en el bloque 4, después de los renames del bloque 3.

## Notes for Downstream Plans

- 152-03/152-05 pueden leer `validated_by`/`validated_at` y hacer el self-join `validator` (LEFT JOIN — nullable) sin tocar schema ni migración.
- 152-04/152-06 pueden apoyar el ABM sobre el índice único; el service debe alinear la comprobación de nombre a la collation case-insensitive de MySQL (belt-and-suspenders con el uniqueIndex).
- La migración 0165 viaja a prod con el tren staging→master y muta la caja real (renames D-09, impacto explícito ya decidido).

## Self-Check: PASSED

- `el-templo-api/src/db/migrations/0165_validated_by_and_cost_center_abm.sql` — FOUND
- `el-templo-api/src/db/schema/financial-transactions.ts` (validated_by) — FOUND
- `el-templo-api/src/db/schema/cost-centers.ts` (uq_cost_centers_name_country) — FOUND
- Commit `d15b17f7` (Task 1) — FOUND
- Commit `5fdefca7` (Task 2) — FOUND
- DB: columnas, índice único, renames de seeds y fila `_migrations` 0165 — verificados por query
