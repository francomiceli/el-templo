---
phase: 117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico
plan: 02
subsystem: backend (api) — subscriptions + db schema/migrations
tags: [schema, migration, hook, analytics-foundation, user-status-history]
status: checkpoint-pending
requires:
  - users table + userStatusEnum (Phase 103)
  - recomputeUserStatus (subscriptions/service.ts)
provides:
  - user_status_history table (foundation for Phase 118 funnel + retención)
  - forward-only status-transition hook in recomputeUserStatus
  - approximate idempotent backfill (migration 0129)
affects:
  - Phase 118 (consume user_status_history)
tech-stack:
  added: []
  patterns:
    - "Forward-only history hook: read status before + after UPDATE, INSERT only on change, same tx"
    - "Idempotent data backfill via INSERT ... SELECT ... WHERE NOT EXISTS (0127/111-06 pattern)"
    - "Shared enum value list (USER_STATUS_VALUES) to declare distinct from_status/to_status columns"
key-files:
  created:
    - el-templo-api/src/db/schema/user-status-history.ts
    - el-templo-api/src/db/migrations/0128_create_user_status_history.sql
    - el-templo-api/src/db/migrations/0129_backfill_user_status_history.sql
    - el-templo-api/test/subscriptions/user-status-history.test.ts
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/test/helpers.ts
decisions:
  - "D-10: user_status_history is a FOUNDATION table — accumulates now, consumed in Phase 118"
  - "Backfill to_status floor = 'freemium' (cannot distinguish admin-created 'prueba' retroactively)"
  - "from_status/to_status declared via mysqlEnum(name, USER_STATUS_VALUES) — reusing userStatusEnum would collide on column name 'status'"
metrics:
  tasks_completed: 2
  tasks_total: 2 (+ 1 human-verify checkpoint pending)
  completed: 2026-05-26
---

# Phase 117 Plan 02: user_status_history (fundación) Summary

Crea la tabla `user_status_history` como fundación para la Fase 118 (funnel de
conversión freemium→prueba→activo y retención por cohortes). Registra transiciones
forward de `users.status` vía hook en `recomputeUserStatus` + backfill aproximado
idempotente. No se consume en esta fase.

## What Was Built

### Task 1 — Schema Drizzle + migración DDL 0128 (commit `e66be0bf`)

- `db/schema/user-status-history.ts`: tabla con `id` (PK autoincrement), `user_id`
  (FK `users.id` ON DELETE CASCADE, notNull), `from_status` (enum, nullable —
  primera transición sin origen), `to_status` (enum, notNull), `source`
  (varchar(16), default `'recompute'`), `changed_at` (timestamp defaultNow notNull).
  Índices `idx_user_status_history_user_id` y `idx_user_status_history_user_changed`
  (user_id, changed_at) para las queries de cohortes de Fase 118.
- `db/schema/users.ts`: se exportó `USER_STATUS_VALUES` (const tuple) para declarar
  `from_status`/`to_status` con los mismos valores del enum sin colisionar el column
  name "status" que tiene `userStatusEnum`.
- Registrada en `db/schema/index.ts` (`export * from "./user-status-history"`).
- `0128_create_user_status_history.sql`: DDL a mano (sin IF NOT EXISTS), constraint FK
  con nombre Drizzle-convergente, sin `;` en comentarios.

### Task 2 — Hook forward-only + backfill 0129 + tests (commit `5c13101a`)

- `subscriptions/service.ts` `recomputeUserStatus`: lee `users.status` ANTES del
  UPDATE (Drizzle select), reejecuta el UPDATE existente, lee el status DESPUÉS, e
  inserta una fila en `user_status_history` SOLO si cambió (`statusAfter !== statusBefore`).
  Forward-only. La inserción usa el mismo `tx` → rollback atómico con la transición de
  la sub. Traza con `this.log.info`.
- `0129_backfill_user_status_history.sql`: backfill aproximado en 2 pasos, ambos
  `INSERT ... SELECT ... WHERE NOT EXISTS` (idempotente):
  - Pass 1: fila inicial por miembro (role='member', status no nulo) a `users.created_at`
    con `to_status='freemium'`, `from_status` NULL, source `'backfill'`.
  - Pass 2: transición `freemium → activo` a la primera `subscriptions.created_at` del
    miembro (solo para los que tienen sub), source `'backfill'`.
  - SOLO INSERT — nunca UPDATE/DELETE sobre users/subscriptions (T-117-03).
- `test/subscriptions/user-status-history.test.ts`: 3 tests contra MySQL real (reloj
  real): (a) activación inserta una fila freemium→activo; (b) recompute sin cambio no
  duplica; (c) rollback del tx elimina la fila de historial.
- `user_status_history` agregado a `TABLES_TO_CLEAN` en `helpers.ts`.

## Verification

- `pnpm tsc --noEmit` limpio (api).
- `pnpm vitest run test/subscriptions/user-status-history.test.ts` → 3/3 verdes.
- `pnpm db:migrate` aplicó 0127/0128/0129 a la DB local; re-correr es no-op.
- Idempotencia del backfill verificada: re-ejecución manual de los 2 INSERT afectó 0
  filas; conteo estable en 41 (36 iniciales + 5 activaciones) en la DB local.
- Sin `;` en comentarios de 0128 ni 0129 (gate verificado; se corrigió un `;` que se
  había colado en un comentario de 0129 — rompía el split del runner en tests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `;` dentro de un comentario `--` de la migración 0129**

- **Found during:** Task 2 (primera corrida de los tests)
- **Issue:** el comentario `--   /register seeds 'freemium'; admin-created members...`
  contenía un `;`. El runner (`splitSqlStatements`) splitea por `;` ANTES de strippear
  comentarios, así que el texto del comentario quedaba pegado al INSERT y MySQL fallaba.
- **Fix:** se reescribió el comentario sin `;`.
- **Files modified:** `0129_backfill_user_status_history.sql`
- **Commit:** `5c13101a`

### Decisión de discreción (no es desviación)

- `from_status`/`to_status` se declararon con `mysqlEnum(<col>, USER_STATUS_VALUES)`
  porque `userStatusEnum` está atado al column name "status" y reutilizarlo produciría
  dos columnas "status". Se exportó `USER_STATUS_VALUES` desde `users.ts`.

## Checkpoint Pendiente (Task 3 — human-verify, blocking)

NO se auto-aprobó. Migraciones aplicadas a la DB local; falta la verificación humana
del operador y el flujo staging-first estricto (correr en staging, sanity-check,
aprobar prod). Registrado como blocker en STATE.

## Threat Flags

Ninguno. La superficie de seguridad coincide con el threat_model del plan
(T-117-03 backfill solo-INSERT idempotente; T-117-04 hook atómico con rollback).
Sin paquetes nuevos.

## Known Stubs

Ninguno. La tabla es fundación intencional: se llena ya pero se consume en Fase 118
(documentado en CONTEXT D-10 y en el objetivo del plan).

## Self-Check: PASSED

- Archivos creados: 4/4 presentes.
- Commits: `e66be0bf` (Task 1), `5c13101a` (Task 2) presentes.
