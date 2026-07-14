---
phase: 157-n-cleo-transaccional-de-referidos
plan: 01
subsystem: referrals-data-foundation
tags: [schema, migration, referrals, drizzle, mysql]
requires: []
provides:
  - "tabla referrals (vínculo referidor→referido, referredId UNIQUE)"
  - "tabla referral_credits (registro auditable append-only, idempotente por subscriptionId)"
  - "users.referralCode (UNIQUE) + users.referredBy (self-FK, index)"
  - "subscriptions.referralDiscountPercent/referralDiscountAmount"
  - "seed aura_config[referral]=10 + system_settings[referral.max_percent_cap]=40"
affects:
  - el-templo-api/src/db/schema
  - el-templo-api/src/db/migrations
tech-stack:
  added: []
  patterns:
    [
      drizzle-self-fk-anyMysqlColumn,
      idempotent-seed-where-not-exists,
      hand-written-migration,
    ]
key-files:
  created:
    - el-templo-api/src/db/schema/referrals.ts
    - el-templo-api/src/db/schema/referral-credits.ts
    - el-templo-api/src/db/migrations/0176_referrals_core.sql
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/db/schema/subscriptions.ts
    - el-templo-api/src/db/schema/index.ts
decisions: [D-14, D-18, D-22, D-23, D-25]
metrics:
  duration: ~20min
  completed: 2026-07-10
requirements: [REF-01, REF-04, DESC-04, AURA-02]
---

# Phase 157 Plan 01: Núcleo transaccional de referidos (fundaciones de datos) Summary

Esquema Drizzle + migración 0176 hand-written que crean las tablas `referrals` y `referral_credits`, agregan `referralCode`/`referredBy` a `users` y `referralDiscountPercent`/`referralDiscountAmount` a `subscriptions`, y siembran la calibración (10% por vínculo, tope 40%) de forma idempotente.

## What Was Built

- **`referrals`** — vínculo de referido con `referredId` UNIQUE (D-14/REF-04: cada miembro a lo sumo un referidor). Enums a module-scope: `status` (`pending|qualified|revoked`) default `pending`, `attribution_channel` (`self_service|assisted`). `qualifiedAt` nullable, `createdBy` self-FK (AnyMySqlColumn, ON DELETE SET NULL), timestamps `created_at`/`updated_at`. `relations` con `referrer`/`referred`.
- **`referral_credits`** — append-only, `uniqueIndex("unique_referral_credit_sub").on(subscriptionId)` para idempotencia por cargo (D-18). Columnas `userId`, `subscriptionId`, `percent`, `amount`, `createdAt`.
- **`users`** — `referral_code` varchar(16) UNIQUE (REF-01/D-25, nullable), `referred_by` self-FK clonando `createdBy` + `idx_users_referred_by`.
- **`subscriptions`** — `referral_discount_percent`/`referral_discount_amount` NUEVAS (D-23), separadas de `auraDiscount*` intactas.
- **`0176_referrals_core.sql`** — CREATE TABLE x2 + ALTER users/subscriptions + 2 seeds idempotentes (`WHERE NOT EXISTS`). Aplicada limpia localmente (11 statements). Enums byte-for-byte contra el schema.

## Verification

- `pnpm build` (tsc) exit 0 con los schemas nuevos.
- `pnpm db:migrate` aplicó 0176 limpio en la DB local (`eltemplo`).
- DB check post-apply: enums = `enum('pending','qualified','revoked')` / `enum('self_service','assisted')`; columnas `referral_code`/`referred_by` en users; `referral_discount_percent`/`referral_discount_amount` en subscriptions; `system_settings['referral.max_percent_cap']=40`.
- `grep` de `;` en comentarios del SQL = 0; `CREATE TABLE IF NOT EXISTS` = 2; `WHERE NOT EXISTS` = 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Nombre físico de la columna del enum en `aura_config`**

- **Found during:** Task 3 (migración)
- **Issue:** El plan (interfaces + `<action>`) indicaba sembrar `INSERT INTO aura_config (source_type, ...)` con `WHERE source_type='referral'`. La columna física real es `aura_config_source_type` (`mysqlEnum("aura_config_source_type", ...)` en `aura-config.ts:11`). Usar `source_type` habría fallado en CI/prod con `Unknown column` (trap conocido del skill de migraciones, tsc verde).
- **Fix:** El seed usa `aura_config_source_type` byte-for-byte.
- **Files modified:** `el-templo-api/src/db/migrations/0176_referrals_core.sql`
- **Commit:** 28116251

**2. [Rule 3 - Blocking] Import de `AnyMySqlColumn`**

- **Found during:** Task 1 (build)
- **Issue:** El plan sugería `import { relations, type AnyMySqlColumn } from "drizzle-orm"`; `AnyMySqlColumn` se exporta desde `drizzle-orm/mysql-core`, no de `drizzle-orm` (TS2305).
- **Fix:** Movido el `type AnyMySqlColumn` al import de `drizzle-orm/mysql-core`.
- **Files modified:** `el-templo-api/src/db/schema/referrals.ts`
- **Commit:** a93c8ae0

## Notes

- **Seed idempotente confirmado:** en la DB local ya existía la fila `aura_config[referral]` con `default_amount=50` (del `db:seed`); el `WHERE NOT EXISTS` NO la sobrescribió — comportamiento correcto (D-12: nunca clobbea un valor ya seteado). En una DB fresca de staging/prod la migración siembra 10.
- **Aplicación en staging/prod:** diferida al pipeline/operador (staging-first STRICT). NO ejecutada en este plan más allá de la DB local.
- **No backfill** de los ~2000 códigos existentes (D-25) — queda para script a demanda antes de la fase 158.

## Commits

- a93c8ae0: feat(157-01): schemas referrals y referral_credits
- b5d2a7af: feat(157-01): columnas referralCode/referredBy en users y referralDiscount\* en subscriptions
- 28116251: feat(157-01): migración 0176 núcleo de referidos

## Self-Check: PASSED
