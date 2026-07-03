---
phase: 150-cuentas-bancarias-flexibles
plan: 01
subsystem: finance
tags: [cash-registers, bank-accounts, cost-centers, migration, drizzle]
requires:
  - "cash_registers table (phase 138)"
  - "cost_centers table (phase 147)"
provides:
  - "6 nullable bank columns on cash_registers (bankName/accountHolder/taxId/cbuCvu/accountAlias/accountNumber)"
  - "'Retiros' cost center (AR) seeded idempotently"
  - "CreateBankAccountInput/UpdateBankAccountInput/BankAccountRow domain types"
affects:
  - "el-templo-api finance module (service plan 02, routes plan 03 consume the new types + columns)"
tech-stack:
  added: []
  patterns:
    - "Hand-written migration (db:generate blocked by pre-existing sessions.goal_plan_type drift)"
    - "Idempotent seed via INSERT ... SELECT FROM DUAL WHERE NOT EXISTS (guard on name+country)"
key-files:
  created:
    - "el-templo-api/src/db/migrations/0163_bank_accounts_and_retiros.sql"
  modified:
    - "el-templo-api/src/db/schema/cash-registers.ts"
    - "el-templo-api/src/modules/finance/types.ts"
decisions:
  - "UpdateBankAccountInput OMITS currency — moneda fija post-creación (D-04)"
  - "BankAccountRow.balance = firmeBalance únicamente, nunca sumado con pendiente (CAJA-03)"
  - "'Retiros' sembrado en país AR (D-09 / Claude's Discretion)"
metrics:
  duration: ~10min
  completed: 2026-07-03
  tasks: 2
  files: 3
---

# Phase 150 Plan 01: Cuentas Bancarias Flexibles — Schema y Migración Summary

Extendió `cash_registers` con 6 columnas bancarias nullable y sembró el centro de costo "Retiros", estableciendo la base de datos y los contratos de tipos sobre los que se construyen el ABM de cuentas bancarias (plan 02/03) y el retiro del dueño.

## What Was Built

**Task 1 — Schema + tipos de dominio** (`c710e22a`):

- 6 columnas bancarias nullable en el modelo Drizzle `cashRegisters`, `AFTER currency`, con pares Drizzle→SQL exactos: `bankName`→`bank_name`(100), `accountHolder`→`account_holder`(120), `taxId`→`tax_id`(20), `cbuCvu`→`cbu_cvu`(34), `accountAlias`→`account_alias`(60), `accountNumber`→`account_number`(50). `name` (NOT NULL) intacto.
- 3 interfaces exportadas en `types.ts` sin `any`: `CreateBankAccountInput` (3 obligatorios: bankName/accountHolder/currency + opcionales nullable), `UpdateBankAccountInput` (mismos campos opcionales, SIN `currency` — D-04), `BankAccountRow` (forma de lectura con `balance` = saldo firme, documentado CAJA-03).

**Task 2 — Migración 0163** (`dc0ba76e`):

- `ALTER TABLE cash_registers` con las 6 columnas encadenadas `AFTER currency`, todas nullable, nombres byte-for-byte con el schema.
- Seed idempotente de `'Retiros'` (país AR) vía `INSERT ... SELECT FROM DUAL WHERE NOT EXISTS` con guard en (name, country).
- Aplicada con el runner custom (`pnpm db:migrate`), trackeada en `_migrations`. Reejecución = "No new migrations to apply".

## Verification

- `pnpm build` (tsc) verde.
- `SHOW COLUMNS FROM cash_registers`: las 6 columnas presentes, todas `nullable=YES`.
- `SELECT COUNT(*) FROM cost_centers WHERE name='Retiros' AND country='AR'` = 1.
- Idempotencia: segunda corrida del runner no reaplica ni duplica.
- Ningún comentario `--` del SQL contiene `;` (verificado post-fix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Punto y coma dentro de un comentario SQL rompió el primer intento de migración**

- **Found during:** Task 2 (primer `pnpm db:migrate`)
- **Issue:** Un comentario `--` de la migración 0163 contenía `(D-03); las cajas efectivo`. El runner custom splittea por `;` ANTES de strippear los comentarios `--`, así que el fragmento `las cajas efectivo ... ALTER TABLE ...` se ejecutó como statement inválido → `ER_PARSE_ERROR 1064`. Regla dura documentada en el propio plan y en MEMORY.
- **Fix:** Reescribí el comentario reemplazando el `;` por "mientras" (`(D-03) mientras las cajas efectivo las dejan NULL`). Nada se había aplicado (el ALTER falló antes de registrar en `_migrations`), así que la reejecución aplicó limpio.
- **Files modified:** `el-templo-api/src/db/migrations/0163_bank_accounts_and_retiros.sql`
- **Commit:** `dc0ba76e` (fix incluido en el mismo commit de la migración)

## Known Stubs

Ninguno. Este plan es puramente schema/tipos/migración; el ABM y el service que consumen estos contratos vienen en planes 02/03.

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/migrations/0163_bank_accounts_and_retiros.sql
- FOUND: el-templo-api/src/db/schema/cash-registers.ts (6 bank columns)
- FOUND: el-templo-api/src/modules/finance/types.ts (3 domain types)
- FOUND commit: c710e22a (Task 1)
- FOUND commit: dc0ba76e (Task 2)
