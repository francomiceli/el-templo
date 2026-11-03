---
phase: 205-oficina
plan: 01
subsystem: database
tags: [mysql, drizzle, tenancy, migration, oficina]
requires: []
provides:
  - migración 0316 con office_topics, office_topic_events, office_topic_reads, office_mentions
  - schema Drizzle office.ts (tablas, uniones TS, constantes para JSON schemas)
  - módulo strict `office` registrado en tenancy
affects: [205-02, 205-03, 205-04]
tech-stack:
  added: []
  patterns: [tabla gym-owned strict desde el nacimiento, status/origin varchar con uniones TS]
key-files:
  created:
    - el-templo-api/src/db/migrations/0316_oficina_temas.sql
    - el-templo-api/src/db/schema/office.ts
    - el-templo-api/test/migrations/0316-oficina-temas.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
key-decisions:
  - "Las 4 tablas llevan columna id autoincremental propia (también office_topic_reads), con la UNIQUE compuesta aparte."
requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06, D-07]
duration: ~25 min
completed: 2026-11-03
---

# Phase 205 Plan 01: Base de datos de Oficina Summary

Migración 0316 a mano con las 4 tablas `office_*` (gym-owned, strict desde el nacimiento), schema Drizzle y registro en los gates de tenancy.

## Commits

- `90e9fa9bb` feat(205-01): migración 0316 y schema Drizzle de las tablas office_*
- `399b8ad5f` feat(205-01): registrar office_* en tenancy (módulo strict) y test de migración 0316

## Conteos finales

- GYM_OWNED_TABLES: 121 -> 125. Tablas del schema: 126 -> 130 (5 exentas sin cambio).
- `gymOwnedChecked` en 0192-0195 y 0196: 121 -> 125.
- Los números de partida coincidían con los del plan, no hizo falta ajustar el delta.
- `tenant-lint-allowlist.json` (está en la raíz de `el-templo-api/`, no en `src/db/`) no tiene entradas `office`.
- `pnpm lint:tenant`: DISCREPANCIAS 0, exit 0.

## Deviations from Plan

- Numeración verificada: `origin/master` y el worktree terminan en 0315, se usó 0316 sin cambios.
- `office_topic_reads` y las demás llevan `id` autoincremental propio (el plan lo especificaba solo para las otras tres; la de lecturas mencionaba solo `topic_id, user_id, last_seen_at`). Se agregó `id` por consistencia con el resto del schema.
- `schema/index.ts`: el export `./office` se agregó al final y no en orden alfabético, porque el archivo no está ordenado alfabéticamente (sigue orden de creación).
- En `GYM_OWNED_TABLES` las 4 entradas van entre `novedades` y `onboarding_analytics` (orden alfabético real).
- En `test/migrations/0316-oficina-temas.test.ts` se sumó un test extra respecto al plan: toda UNIQUE de las 4 tablas arranca por `tenant_id` (3 uniques esperadas).
- Hook de pre-commit: no se verificó si corrió; se formateó con `prettier --write` a mano antes de commitear.
- Guard de rama del executor (`worktree-agent-*`): el worktree está en `feat/oficina`, la rama designada por el orquestador. Se verificó solo que no fuera una rama protegida ni detached.

## Issues Encountered

- `npx tsc --noEmit` devuelve 3 errores, TODOS preexistentes y ajenos al plan (`src/app.ts`: falta el módulo `@fastify/rate-limit` en los `node_modules` del worktree, con dos `implicit any` derivados). Ningún error en archivos tocados. No se instaló nada (regla). Si el CI/typecheck de Franco falla igual, es el symlink de `node_modules` incompleto en `et-oficina`.
- Los tests (incluido el nuevo de migración y los conteos) NO se corrieron: no hay MySQL local. Los valida el CI.

## Known Stubs

Ninguno.

## Dudas para Franco

Ninguna nueva para este plan.

## Self-Check: PASSED

- 0316_oficina_temas.sql, office.ts, 0316-oficina-temas.test.ts presentes.
- Commits 90e9fa9bb y 399b8ad5f presentes en `feat/oficina`.
- Sin `;` dentro de comentarios `--` en la migración.
