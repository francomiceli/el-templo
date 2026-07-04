---
phase: 152-reorganizaci-n-de-caja-egresos-configurables
plan: 03
subsystem: finance (read/write path del validador)
tags: [finance, validation, read-path, filter, tests]
requires:
  - "152-01 (columnas validated_by/validated_at + relation validator en el schema)"
provides:
  - "validate() persiste validated_by/validated_at (read path denormalizado del validador)"
  - "GET /transactions expone validationStatus/validatedAt/validatorName por fila (LEFT JOIN validator)"
  - "GET /transactions acepta filtro server-side por validationStatus (validado/pendiente)"
  - "tipo ValidationStatus + campos en TransactionListItem"
affects:
  - "152-05 (UI: chip validada/pendiente + filtro por estado + validador en el detalle)"
tech-stack:
  added: []
  patterns:
    - "LEFT JOIN self-alias del validador espejando el recorder INNER (validatedBy nullable)"
    - "Denormalización read path + audit_log como doble registro forense (D-05, T-152-07)"
    - "Filtro server-side por enum en querystring (additionalProperties:false → 400, T-152-05)"
key-files:
  created: []
  modified:
    - "el-templo-api/src/modules/finance/transaction-service.ts"
    - "el-templo-api/src/modules/finance/routes.ts"
    - "el-templo-api/src/modules/finance/schemas.ts"
    - "el-templo-api/src/modules/finance/types.ts"
    - "el-templo-api/test/finance/validate-caja.test.ts"
decisions:
  - "validate() setea validated_by=adminId + validated_at=now; correct()/admin-load NO las tocan (nacen validados, D-06)"
  - "validatorName null distingue 'Validado al registrar' de 'Validado por X' en la UI (D-06)"
  - "filtro por estado como query param (validado/pendiente), NO client-side: la lista es server-paginada (D-04)"
  - "tipo ValidationStatus creado en types.ts (no existía; el plan lo asumía) — 4 valores byte-for-byte con el enum del schema"
metrics:
  duration: ~15min
  completed: 2026-07-04
---

# Phase 152 Plan 03: Read/write path del validador para el Historial de cobros Summary

`validate()` completa las columnas denormalizadas `validated_by`/`validated_at` (D-05); `correct()` y la carga admin/owner las dejan NULL (D-06, "Validado al registrar"). `list()` expone `validationStatus`, `validatedAt` y `validatorName` vía LEFT JOIN al alias `validator`, y `GET /transactions` gana un filtro server-side opcional por estado (validado/pendiente). El `audit_log` sigue siendo la fuente forense; las columnas son el read path.

## What Was Built

- **Task 1 — validate() persiste el validador** (`22840b12`): extendido el `.set({...})` de `validate()` con `validatedBy: adminId` + `validatedAt: new Date()` junto al `validationStatus: "validado"` existente (respetando el spread condicional de `cashRegisterId`). El write a `audit_log` (`transaction_validated`) se mantiene intacto como fuente forense. `correct()` y la carga admin/owner NO referencian estas columnas (nacen validadas con read path NULL — D-06). `create()` verificado: no setea validatedBy/At.
- **Task 2 — list() expone el validador + filtro por estado** (`0d111a0d`): en `list()` se declaró `const validator = alias(schema.users, "validator")`, se agregaron al select `validationStatus`/`validatedAt`/`validatorFirstName`/`validatorLastName`, un `.leftJoin(validator, ...)` (LEFT porque `validatedBy` es nullable, a diferencia del `recorder` INNER) y el map de fila construye `validatorName` (concat o `null`). `buildListConditions` gana el push condicional de `eq(validationStatus, ...)`. `routes.ts`: querystring `validationStatus` pasado a `list`. `schemas.ts`: enum `['validado','pendiente']` en el querystring (`additionalProperties:false`) + props `validationStatus`/`validatedAt`/`validatorName` en la respuesta. `types.ts`: nuevo tipo `ValidationStatus` (4 valores) + `validationStatus?: 'validado'|'pendiente'` en `TransactionListFilters` + los 3 campos en `TransactionListItem`.
- **Task 3 — tests de integración** (`015e4b43`): agregados al harness de `validate-caja.test.ts` (18 tests, todos verdes contra `eltemplo_test` local): validate() setea `validated_by`=admin + `validated_at` no-null; el listado expone `validatorName` con el nombre del admin; D-06 para admin-load y para corregido (anular+recrear) → columnas NULL y sin validatorName; filtro `?validationStatus=pendiente|validado` server-side; enum fuera de rango → 400 (T-152-05). Extendido `readTx()` con las columnas del validador + helper `listRowById()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] El tipo `ValidationStatus` no existía en el módulo**

- **Found during:** Task 2
- **Issue:** El plan (interfaces + acceptance) asumía que "el tipo `ValidationStatus` (enum fase 137) ya existe en el módulo". Un grep confirmó que solo existe `InitialValidationStatus = "pendiente" | "validado"`; el enum completo de 4 valores vivía inline en el schema Drizzle, sin tipo TS exportado.
- **Fix:** Creado `export type ValidationStatus = "pendiente" | "observado" | "corregido" | "validado"` en `types.ts` (byte-for-byte con el `mysqlEnum` del schema), usado por `TransactionListItem.validationStatus`.
- **Files modified:** `el-templo-api/src/modules/finance/types.ts`
- **Commit:** `0d111a0d`

## Threat Model Compliance

- **T-152-05** (Tampering, querystring validationStatus): mitigado — enum `['validado','pendiente']` en el schema del querystring; valor fuera de enum → 400 (test explícito).
- **T-152-06** (Info Disclosure, validatorName): aceptado — el endpoint ya está gated por el hook del módulo (FINANCE_READ); validatorName es staff, no PII de socio.
- **T-152-07** (Repudiation, quién validó): mitigado — `validated_by` denormaliza el `audit_log` (que se mantiene como fuente forense); doble registro.
- **T-152-SC** (installs): aceptado — esta fase no instala paquetes.

## Notes for Downstream Plans

- **152-05 (UI):** consumir `validationStatus` para el chip validada/pendiente, `validatorName`+`validatedAt` para el detalle ("Validado por X" vs "Validado al registrar" cuando `validatorName === null`), y `?validationStatus=` para el filtro server-side del Historial de cobros.
- `exportRowsForExcel()` NO surface las columnas del validador (usa `as TransactionExportRow[]` que enmascara los campos faltantes, igual que ya omite `createdAt`) — fuera de scope de este plan; agregarlas al Excel si un plan futuro lo pide.

## Self-Check: PASSED

- `el-templo-api/src/modules/finance/transaction-service.ts` (validatedBy: adminId, alias validator, leftJoin) — FOUND
- `el-templo-api/src/modules/finance/types.ts` (ValidationStatus, validatorName) — FOUND
- `el-templo-api/src/modules/finance/schemas.ts` (validationStatus querystring + response) — FOUND
- `el-templo-api/src/modules/finance/routes.ts` (validationStatus querystring) — FOUND
- `el-templo-api/test/finance/validate-caja.test.ts` (18 tests verdes local) — FOUND
- Commits `22840b12` (T1), `0d111a0d` (T2), `015e4b43` (T3) — FOUND
- `npx tsc --noEmit` verde
