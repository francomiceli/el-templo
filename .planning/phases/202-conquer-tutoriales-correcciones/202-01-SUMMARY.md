---
phase: 202-conquer-tutoriales-correcciones
plan: 01
subsystem: database
tags: [conquer, drizzle, mysql, tenancy, migrations]
requires:
  - phase: 201-conquer
    provides: tablas conquer_* (0290-0291), gates de tenancy, catálogo sembrado
provides:
  - tabla conquer_corrections (0298) y su schema Drizzle `conquerCorrections`
  - tabla conquer_tutorials (0299) y su schema Drizzle `conquerTutorials`
  - gates de tenancy (conteos, módulo strict) y limpieza de tests con las 2 tablas
affects: [202-02, 202-03, 202-04, 202-05, 202-06, 202-07]
tech-stack:
  added: []
  patterns: ["tablas gym-owned strict en el módulo conquer, sin semilla"]
key-files:
  created:
    - el-templo-api/src/db/migrations/0298_conquer_corrections.sql
    - el-templo-api/src/db/migrations/0299_conquer_tutorials.sql
    - el-templo-api/test/migrations/0298-0299-conquer-videos.test.ts
  modified:
    - el-templo-api/src/db/schema/conquer.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
key-decisions:
  - "DA-37: dos tablas gym-owned strict, sin datos de migración"
  - "FK exercise_id de conquer_corrections sin ON DELETE (restrict, como conquer_steps): un ejercicio con correcciones no se borra"
patterns-established:
  - "Clave de video única por gimnasio: UNIQUE (tenant_id, video_key) que admite varios NULL"
requirements-completed: [D-25, D-26, D-27, D-28, D-21]
duration: 25min
completed: 2026-10-26
---

# Phase 202 Plan 01: Tablas de correcciones y tutoriales Summary

**Tablas `conquer_corrections` (0298) y `conquer_tutorials` (0299) con schema Drizzle, aisladas por gimnasio y contadas por los 5 gates de tenancy.**

## Commits

| Tarea | Commit | Mensaje |
|-------|--------|---------|
| 1 | `c5dbb68b2` | feat(202-01): tablas de correcciones y tutoriales de Conquer (migraciones 0298 y 0299, DA-37) |
| 2 | `135020f3f` | test(202-01): tenancy de conquer_corrections y conquer_tutorials (conteos, strict y limpieza) |

## Columnas

`conquer_corrections` (Drizzle `conquerCorrections`, `CONQUER_CORRECTION_STATUSES` exportado):
`id`, `tenant_id`, `user_id` (FK users cascade, NOT NULL), `exercise_id` (FK conquer_exercises, NULL), `step` (enum e1/e2/e3/hold, NULL),
`combo_key` varchar(16) NULL, `rung_id` (FK conquer_rungs set null, NULL), `comment` varchar(500) NULL, `video_key` varchar(255) NULL,
`video_seconds` smallint NOT NULL, `video_deleted_at` datetime NULL, `video_deleted_by` (FK users set null), `status` enum
('pendiente','respondida') NOT NULL default 'pendiente', `reply_text` varchar(1000) NULL, `reply_video_key` varchar(255) NULL,
`reply_video_seconds` smallint NULL, `replied_by` (FK users set null), `replied_at` datetime NULL, `reply_seen_at` datetime NULL,
`created_at`, `updated_at`.
Índices: UNIQUE `uq_conquer_corrections_tenant_video_key (tenant_id, video_key)`, `idx_conquer_corrections_tenant_status
(tenant_id, status, created_at)`, `idx_conquer_corrections_tenant_user (tenant_id, user_id, status)`.

`conquer_tutorials` (Drizzle `conquerTutorials`): `id`, `tenant_id`, `exercise_id` (FK conquer_exercises cascade, NULL), `combo_key`
varchar(16) NULL, `video_key` varchar(255) NOT NULL, `uploaded_by` (FK users set null), `created_at`, `updated_at`.
UNIQUE `uq_conquer_tutorials_tenant_exercise (tenant_id, exercise_id)` y `uq_conquer_tutorials_tenant_combo (tenant_id, combo_key)`.

Tipos exportados: `ConquerCorrectionRow`, `ConquerTutorialRow`, `ConquerCorrectionStatus`.

## Conteos (N -> N+2)

| Dónde | Antes | Después |
|-------|-------|---------|
| `GYM_OWNED_TABLES.length` (`test/db/tenant-tables.test.ts:128`) | 114 | 116 |
| `schemaTables.size` (`test/db/tenant-tables.test.ts:133`) | 119 | 121 |
| `MODULOS_DECLARADOS.conquer` (`test/db/tenant-tables.test.ts:461-476`) | 10 | 12 |
| `gymOwnedChecked` (`test/migrations/0192-0195-tenant-columns.test.ts:168` título, `:186` expect) | 114 | 116 |
| Test 10 (`test/migrations/0196-tenant-unique-contracts.test.ts:616` título, `:646` mensaje, `:651` expect) | 114 | 116 |
| `GYM_OWNED_TABLES` y `TENANT_STRICT_MODULES.conquer` (`src/db/tenant-tables.ts`) | 10 | 12 entradas |

Todos coincidían con los valores de la 201 (114/119): no hubo corrección. Manifiesto de rutas (`test/tenancy/iso-01-manifiesto.test.ts:386`,
`ENTRADAS_BASELINE`): NO se tocó (este plan no agrega rutas), hoy vale **516**.

## Mutantes (razonados, no se corren tests localmente)

1. `video_seconds` nullable en 0298: `test/migrations/0298-0299-conquer-videos.test.ts:150` (`expect(rows[0].isNullable).toBe(nullable ? "YES" : "NO")`)
   falla en el caso `["conquer_corrections", "video_seconds", false]` (fila declarada en `:31-34`).
2. Un UNIQUE de 0298/0299 sin `tenant_id` adelante (p. ej. `(video_key)`): `:133` (`expect(row.columnName, ...).toBe("tenant_id")`) falla con
   el nombre del índice; `:131` impide que pase "vacío" si se pierden todos.
3. Un `;` en un comentario `--`: APLICADO de verdad sobre 0298 (`-- Depende de la 0290; y conquer_rungs.`) y el grep
   `^\s*--.*;` lo detectó (línea 20); el test `:171` (`expect(offending).toEqual([])`, `it.each` sobre los 2 archivos) falla igual. Revertido (copia en scratchpad).
4. (tarea 2) Sacar `conquer_tutorials` de `GYM_OWNED_TABLES`: falla `tenant-tables.test.ts:128` (115 vs 116), `:134`
   (gymOwned + exempt vs `schemaTables`) y el it "toda tabla listada existe en GYM_OWNED_TABLES" (`:537`).
5. (tarea 2) Sacar `conquer_tutorials` de `TENANT_STRICT_MODULES.conquer`: falla `tenant-tables.test.ts:534`
   (`toEqual(normalizar(MODULOS_DECLARADOS))`).

## Desvíos del plan

Ninguno de contenido. Notas:
- Los guards de commit en worktree (`worktree-agent-*`) no aplican: esto corre en el worktree de fase `et-201-conquer`, rama `feat/201-conquer`
  (no protegida), por indicación explícita del orquestador.
- `prettier --write` solo sobre el test nuevo (el `it.each` de 3 líneas lo reflejó); el resto pasó `prettier --check`.
- Gates: `tsc --noEmit` OK, `lint:tenant` rc=0, `typecheck:tests` sin líneas de `test/migrations/029*`, `test/migrations/019*`, `test/db/tenant-tables`,
  `test/helpers`, `test/fixtures/second-tenant`. Higiene (`console.*`, `any`) vacía. Tests NO corridos (regla).
- Pre-flight de numeración: 0298/0299 libres en el worktree, `origin/master`, `origin/staging` y todos los `et-*` (último: 0297).

## Trampas para 202-02 en adelante

- **Para la base local de Franco:** el orquestador corre `pnpm db:migrate` (aplica 0298 y 0299). Yo no.
- `conquerCorrections.step` es `mysqlEnum("step", CONQUER_STEP_KEYS)` y es NULL para combos; `exerciseId` y `comboKey` también NULL: la regla
  "escalón XOR combo" NO la impone la base, la tiene que validar el servicio (DA-41).
- `videoSeconds` es NOT NULL (el video del alumno siempre existe al crear); `videoKey` es NULL solo tras el borrado del alumno (`videoDeletedAt/By`).
- Fila `status` por defecto `pendiente`; al responder: `status='respondida'`, `repliedBy/repliedAt` y texto y/o `replyVideoKey`. `replySeenAt` NULL = sin ver.
- El UNIQUE `(tenant_id, video_key)` solo cubre `video_key` del alumno, NO `reply_video_key` (el plan lo define así): las claves del coach llevan
  `correctionId` + uuid (DA-38), no choca en la práctica.
- `conquer_tutorials`: dos UNIQUE con NULL permitido; una fila de ejercicio lleva `combo_key` NULL y al revés. Hacer upsert con
  `onDuplicateKeyUpdate` o buscar antes por (ejercicio | combo) con `tenantWhere`.
- `exercise_id` de `conquer_tutorials` es ON DELETE CASCADE, el de `conquer_corrections` NO (restrict).
- Ambas tablas están en `TABLES_TO_CLEAN` (antes de `conquerSessionSteps`) y en `limpiarSegundoGimnasio`: los tests de 202-03+ no necesitan limpiarlas a mano.
- Tenancy hoy: 116 gym-owned / 121 en schema. Manifiesto de rutas: 516 (este plan no lo movió; 202-03+ suman sobre el valor actual).
- `lint:tenant` mira cada statement por separado: `tenantWhere`/`tenantValues` inline también en estas tablas (módulo strict `conquer`: el sentinel tira en test/dev).

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Archivos creados existen: 0298, 0299 y el test (commit `c5dbb68b2`).
- Commits `c5dbb68b2` y `135020f3f` presentes en `git log`.
