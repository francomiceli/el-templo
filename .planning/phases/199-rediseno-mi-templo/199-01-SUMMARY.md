---
phase: 199-rediseno-mi-templo
plan: 01
subsystem: api-db
tags: [drizzle, mysql, tenancy, sponsors, migration]
requires: []
provides:
  - tabla de plataforma `sponsor_brands` (sin tenant_id, exenta)
  - tabla gym-owned `sponsor_views` (strict, módulo `sponsors`)
  - migración 0279 aplicada en la base local
affects: [199-02, 199-03]
tech-stack:
  added: []
  patterns: [tabla exenta de plataforma, gym-owned con unique user_id-first]
key-files:
  created:
    - el-templo-api/src/db/schema/sponsors.ts
    - el-templo-api/src/db/migrations/0279_sponsors.sql
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
key-decisions:
  - "sponsor_views.uq_sponsor_views_user_brand lleva user_id primero (brand_id apunta a tabla exenta)"
  - "sponsor_brands.is_active nace false (activar pasa por el límite de D-24)"
requirements-completed: [D-17, D-18, D-19, D-25]
duration: ~15 min
completed: 2026-10-15
---

# Phase 199 Plan 01: Modelo de datos de patrocinadores Summary

`sponsor_brands` (catálogo de plataforma, sin tenant_id, exenta) y `sponsor_views` (métricas por socio y marca, gym-owned strict) con migración manual 0279 aplicada en local y los 5 conteos fijos de tenancy en 103 gym-owned / 5 exentas / 108 tablas.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `6d9aa4c6c` feat(199-01): migración 0279 + schema de patrocinadores
- Task 2: `7ce1debd9` feat(199-01): gates de tenancy de sponsor_brands (exenta) y sponsor_views (gym-owned strict) + conteos fijos

## Resultados de verificación

- `npx tsc --noEmit` (el-templo-api): 0 errores (tras cada task y al final).
- `pnpm lint:tenant`: exit 0, `DISCREPANCIAS: 0`.
- `pnpm db:migrate`: `Applying: 0279_sponsors.sql (2 statements)` -> `Applied successfully`.
- `typecheck:tests` filtrado por los archivos tocados (tenant-tables.test, second-tenant, helpers.ts, 0192-0195, 0196-tenant): 0 errores.
- Criterios de aceptación (greps): `redeem_type` mysqlEnum = 1, `enum('code','carnet')` en SQL sin comentarios = 1, ningún comentario SQL con `;`, sección `sponsor_brands` con 0 `tenant_id` (total en el .sql = 4), `"sponsor_brands"` en tenant-tables = 1, allowlist = 1, `sponsors: ["sponsor_views"]` = 1 en src y 1 en test, `toBe(108)` = 1, `toBe(5)` / `toBe(103)` presentes, 103 en ambos tests de migraciones, helpers = 2, second-tenant `sponsor_views` = 1. Todos PASS.
- No se corrió vitest (corre en CI).

## Deviations from Plan

1. **[Observación, sin cambio de código] El runner aplicó también `0275_novedades.sql`** en la base local: estaba pendiente porque la rama hereda Novedades pero la base local no la tenía aplicada. Es una migración de la propia rama (no ajena), se aplicó sin error. No hubo que tocar nada.
2. **[Menor] Comentario en `second-tenant.ts`** redactado sin repetir el literal `sponsor_views`, para que el criterio `grep -c sponsor_views = 1` se cumpla exacto.
3. **Texto del docblock de exentas** ("Son cuatro ... quinta" pasó a "Son cinco ... sexta") y comentarios de historial actualizados; sin impacto funcional.

Total: 0 bugs ni correcciones Rule 1-3; plan ejecutado esencialmente como estaba escrito.

## Dudas abiertas (no bloqueantes)

- `sponsor_brands.partner_id` tiene FK a `referral_partners`, que es gym-owned (tiene tenant_id), mientras `sponsor_brands` es de plataforma. Ejecutado tal cual el plan. Conviene revisar en el plan del servicio/rutas (03) que el vínculo no filtre datos entre tenants (un partner de un gimnasio ligado a una marca de plataforma) y si no será mejor dejar `partner_id` solo informativo. `lint:tenant` y los gates no lo marcan.
- El hook lint-staged hace su propio backup interno (`git stash` automático de la herramienta) en cada commit; no fue invocado por mí y el worktree quedó limpio.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model del plan (T-199-01/02 mitigados: tenant_id NOT NULL + FK + strict, solo DDL sin datos ni `;` en comentarios; T-199-03 aceptado).

## Self-Check: PASSED

- Archivos creados existen en el worktree (`sponsors.ts`, `0279_sponsors.sql`).
- Commits `6d9aa4c6c` y `7ce1debd9` presentes en `git log`; `git status --porcelain` vacío al terminar.
