---
phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
plan: 01
subsystem: database
tags: [drizzle, mysql, migration, exercises, milestones]
requires: []
provides:
  - "exercises.milestone_exercise_id (INT NULL, self-FK SET NULL, índice exercises_milestone_idx)"
  - "tabla exercise_milestone_proposals con UNIQUE(exercise_id) y FK CASCADE"
  - "export exerciseMilestoneProposals desde src/db/schema/index.ts"
affects:
  - 133-03 (heurística + bootstrap escriben propuestas pending)
  - 133-04 (accept transaccional escribe el truth milestone_exercise_id)
  - 133-05 (backbone filtra por milestone_exercise_id IS NULL)
tech-stack:
  added: []
  patterns:
    - "Migración SQL manuscrita (runner custom, _migrations como fuente de verdad)"
    - "Tabla de propuestas separada del truth (espejo de exercise_dimension_proposals/0138)"
key-files:
  created:
    - el-templo-api/src/db/schema/exercise-milestone-proposals.ts
    - el-templo-api/src/db/migrations/0145_milestone_exercise_id.sql
    - el-templo-api/test/migrations/0145-milestone-exercise-id.test.ts
  modified:
    - el-templo-api/src/db/schema/exercises.ts
    - el-templo-api/src/db/schema/index.ts
decisions:
  - "Opción A del RESEARCH confirmada: tabla exercise_milestone_proposals espejo de 0138 (propuestas nunca escriben en exercises; truth solo en el accept del profe)"
  - "FK proposed_milestone_exercise_id con nombre acortado exercise_milestone_proposals_proposed_milestone_exercise_id_fk (62 chars) — el nombre Drizzle-convergente completo excede el límite de 64 de MySQL"
  - "engine VARCHAR(30) NOT NULL (a diferencia del analog 0138 donde es nullable) — toda propuesta de hito nace de un engine identificado"
metrics:
  duration: ~7min
  tasks: 2
  files: 5
  completed: 2026-06-07
---

# Phase 133 Plan 01: Migración 0145 — eje hito/variante Summary

JWT-style one-liner: Columna `milestone_exercise_id` (self-FK SET NULL) + tabla `exercise_milestone_proposals` (UNIQUE por ejercicio, status pending/accepted/rejected), aplicada vía runner custom y validada con 9 tests de INFORMATION_SCHEMA + round-trip Drizzle.

## What Was Built

### Task 1 — Schema Drizzle (commit 50984785)

- `exercises.ts`: nueva columna `milestoneExerciseId: int("milestone_exercise_id")` inmediatamente después de `canonicalExerciseId`, self-FK a `exercises.id` con `onDelete: "set null"`, docblock con la semántica (NULL = hito o sin clasificar → backbone; NOT NULL = variante colgando del hito → fuera del backbone; truth escrito SOLO por el accept transaccional del profe). Índice `exercises_milestone_idx` espejo del canonical.
- `exercise-milestone-proposals.ts` (nuevo): espejo estructural de `exercise-dimension-proposals.ts`. Columnas: `exercise_id` (NOT NULL, FK CASCADE, UNIQUE), `proposed_milestone_exercise_id` (NULL = propuesto como HITO, FK SET NULL), `movement_token` VARCHAR(100), `step_rank` INT, `status` ENUM pending/accepted/rejected DEFAULT pending, `engine` VARCHAR(30) NOT NULL, `confidence` INT, `created_at`. Índices: UNIQUE `exercise_milestone_proposals_exercise_uq`, `exercise_milestone_proposals_status_idx`.
- `index.ts`: export registrado junto a exercise-dimension-proposals.

### Task 2 — Migración 0145 + test (commit 2cb76b3d)

- `0145_milestone_exercise_id.sql` manuscrita (NO drizzle-kit generate), 4 statements: ALTER ADD COLUMN (AFTER canonical_exercise_id), CREATE INDEX, ADD CONSTRAINT self-FK SET NULL, CREATE TABLE de propuestas. Header con disciplina de 0143/0138: comment safety (cero `;` en comentarios — verificado por grep), reversibilidad documentada, convención de naming de FK.
- Aplicada localmente: `pnpm db:migrate` → "Applying: 0145_milestone_exercise_id.sql (4 statements) / Applied successfully", registrada en `_migrations`.
- Test `0145-milestone-exercise-id.test.ts` (analog 0121): 9 tests verdes — shape de columnas vía INFORMATION_SCHEMA.COLUMNS, las 3 FKs con sus DELETE_RULE (SET NULL / CASCADE / SET NULL) vía KEY_COLUMN_USAGE + REFERENTIAL_CONSTRAINTS, índices vía STATISTICS (incluye NON_UNIQUE=0 del UNIQUE), round-trip Drizzle (hito + variante apuntándolo + propuesta pending), y exactamente 1 fila en `_migrations`.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` limpio (corrido tras cada task).
- `pnpm exec vitest run test/migrations/0145-milestone-exercise-id.test.ts` → 9/9 verdes (53s).
- Nombre físico idéntico schema↔migración: `grep -c '"milestone_exercise_id"' src/db/schema/exercises.ts` = 1; el ALTER usa el mismo literal.
- Comentarios SQL sin `;`: `grep '^--' ... | grep -c ';'` = 0.
- Suite completa NO corrida localmente (regla del proyecto — corre en CI al pushear con confirmación del usuario).

## Must-Haves Check

- [x] `exercises.milestone_exercise_id` existe (INT NULL, self-FK SET NULL, indexada) y `exercise_milestone_proposals` existe con UNIQUE(exercise_id)
- [x] Migración 0145 aplicó vía runner custom y quedó registrada en `_migrations`
- [x] Default NULL: cero cambio en el backbone hasta que un profe acepte (el round-trip del test confirma que un ejercicio sin clasificar queda con NULL)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — DDL + schema + test, sin superficies de UI ni datos mockeados.

## Threat Flags

Ninguna superficie nueva fuera del threat model del plan (T-133-01 mitigado por comment safety + test de INFORMATION_SCHEMA; T-133-02 mitigado por las reglas de FK verificadas en Tests 2/2b/2c). Cero cambios en package.json.

## Self-Check: PASSED
