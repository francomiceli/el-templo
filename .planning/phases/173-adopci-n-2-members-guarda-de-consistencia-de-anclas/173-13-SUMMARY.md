---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 13
subsystem: tenancy
tags:
  [tenancy, ado-02, ado-07, d-05, d-06, d-08, users, staff, branch-consistency]

# Dependency graph
requires:
  - phase: 173-11
    provides: "resolveBranchDelGimnasio / assertBranchDelGimnasio — el resolvedor único de sede validada por gimnasio"
  - phase: 173-12
    provides: "FK compuesta fk_users_tenant_branch (capa 2/DB del invariante ADO-07)"
provides:
  - "users/service.ts migrado a TenantContext: las 4 escrituras de user_branches y las 2 de branchUpdatedAt del módulo de staff pasan por assertBranchDelGimnasio"
  - "users/routes.ts con assertTenant en el borde de sus 4 handlers"
affects:
  [
    "173-30 (el switch: agrega branch-access.ts/branches + users/service.ts/routes.ts a la lista de entradas stale a borrar de tenant-lint-allowlist.json)",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "assertBranchDelGimnasio(ctx, branchId, tx) llamado DENTRO de la transacción de escritura, con lo escrito siendo branch.id (fila resuelta), nunca input.branchId crudo"
    - "branchIds[] resuelto UNO POR UNO en un loop for antes de cualquier insert — todo-o-nada, sin filtrado silencioso"
    - "filtro de querystring (branchId de GET) resuelto con resolveBranchDelGimnasio ANTES de listar: sede ajena → lista vacía, no error"
    - "tenantWhere del lado de branches va en el ON del innerJoin (D-14), también cuando el join es INNER"

key-files:
  modified:
    - el-templo-api/src/modules/users/service.ts
    - el-templo-api/src/modules/users/routes.ts

key-decisions:
  - "El filtro branchId del querystring de GET /api/admin/users se resuelve con resolveBranchDelGimnasio (no assert): una sede ajena devuelve lista vacía en vez de lanzar, porque un listado no tiene una rama de error natural distinta de 'sin resultados' — sigue siendo D-06 (sede inexistente, nunca acceso denegado)"
  - "[Rule 1] updateStaff no escribía branchUpdatedAt/branchSource al cambiar branchId vía PUT (a diferencia de createStaff, que sí lo hacía en sus dos ramas). Se corrigió en el mismo bloque que ya se tocaba para resolver la sede contra el gimnasio: el trío está documentado como obligatorio en users.ts:144 y su ausencia dejaba la ventana de protección de 45 días del cron de recategorización sin activar tras una edición manual de sede desde el admin"
  - "GET / se envolvió en try/catch + handleServiceError (antes no lo tenía): assertTenant puede lanzar AppError(403, TENANT_UNRESOLVED) de forma fail-closed, y el resto de las rutas ya migradas de la fase siempre envuelven el punto donde assertTenant puede lanzar"

requirements-completed: [ADO-02, ADO-07]

# Metrics
duration: ~1h
completed: 2026-08-08
---

# Phase 173 Plan 13: Módulo de staff (`users/service.ts` + `users/routes.ts`) — Summary

**Las 4 escrituras de `user_branches` del sistema (todas en este archivo) y las 2 de `branchUpdatedAt` del alta/edición de staff pasan ahora por `assertBranchDelGimnasio`, escribiendo siempre el id de la fila resuelta contra el gimnasio del `ctx` — nunca el número crudo del payload — y las 4 rutas de `/api/admin/users` resuelven su `ctx` con `assertTenant` en el borde.**

## Performance

- **Tasks:** 2/2
- **Files modified:** 2 (`users/service.ts`, `users/routes.ts`)

## Accomplishments

- `UserService` migrado completo: `ctx: TenantContext` primero en `listStaff`, `createStaff`, `updateStaff`, `toggleDisabled`; `tenantWhere` inline en todo select/update/delete de `users` y `user_branches`, incluido el `ON` del `innerJoin` con `branches`; `tenantValues` en los 2 inserts de `users` y en los 2 de `user_branches`.
- ADO-07 cerrado para el módulo de staff: `input.branchId` (alta y edición) e `input.branchIds[]` (alta y edición) se resuelven con `assertBranchDelGimnasio` **dentro de la misma transacción** — lo que se escribe es el `id` de la fila resuelta. Una sede de otro gimnasio lanza `NotFoundError` ("Sede no encontrada"), nunca un 403. `branchIds[]` se resuelve uno por uno y se rechaza la operación entera si alguno es ajeno.
- El filtro `branchId` del querystring de `GET /api/admin/users` se resuelve contra el gimnasio antes de listar: una sede ajena devuelve lista vacía, no filas cruzadas.
- `users/routes.ts`: `attachCountryScope` montado en el hook `onRequest` del plugin (después del check `OWNER_ROLES`), y un único `assertTenant(request.scope, "users.<operación>")` por handler en los 4 handlers del archivo.
- Deviation (Rule 1): `updateStaff` no escribía `branchUpdatedAt`/`branchSource` al cambiar `branchId` vía `PUT` — corregido en el mismo bloque que ya se tocaba.

## Task Commits

1. **Task 1: Plomería y queries de users/service.ts** — `08d1b289` (feat)
2. **Task 2: users/routes.ts — assertTenant en las 5 rutas y sus queries directas** — `c949805c` (feat)

**Plan metadata:** este SUMMARY (sin commit propio adicional — el orquestador hace el commit final de metadata en el checkout principal).

## Files Modified

- `el-templo-api/src/modules/users/service.ts` — firmas migradas, 6 anclas cerradas (tabla abajo), `tenantWhere`/`tenantValues` en todo statement de `users`/`user_branches`, filtro de `branches` en el `ON`.
- `el-templo-api/src/modules/users/routes.ts` — `attachCountryScope` + 4× `assertTenant`, `GET /` envuelto en try/catch.

## Los 6 sitios de ancla cerrados (D-05/D-08), file:line post-cambio

| #   | Sitio (post-cambio)                                       | Forma                                       | Antes                                       | Después                                                                                                  |
| --- | --------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | `service.ts:222-236` (`update(users)`, promoción a staff) | `branchId`/`branchUpdatedAt`/`branchSource` | `input.branchId` crudo, sin `tenantWhere`   | `branch.id` resuelto por `assertBranchDelGimnasio(ctx, input.branchId, tx)`, `tenantWhere` en el `WHERE` |
| 2   | `service.ts:248-267` (`insert(users)`, alta)              | `branchId`/`branchUpdatedAt`/`branchSource` | `input.branchId` crudo                      | `branch.id` resuelto (mismo resolvedor), `tenantValues(ctx, {...})`                                      |
| 3   | `service.ts:239-246` (`delete(userBranches)`, promoción)  | reemplazo de sedes                          | sin `tenantWhere`                           | `tenantWhere(schema.userBranches, ctx)`                                                                  |
| 4   | `service.ts:270-278` (`insert(userBranches)`, alta)       | alta de `branchIds[]`                       | `branchIds` crudo, sin `tenantValues`       | resuelto uno por uno (`resolvedBranchIds`), `tenantValues(ctx, {...})` por fila                          |
| 5   | `service.ts:412-420` (`delete(userBranches)`, edición)    | reemplazo de sedes                          | sin `tenantWhere`                           | `tenantWhere(schema.userBranches, ctx)`                                                                  |
| 6   | `service.ts:421-435` (`insert(userBranches)`, edición)    | edición de `branchIds[]`                    | `input.branchIds` crudo, sin `tenantValues` | resuelto uno por uno, `tenantValues(ctx, {...})` por fila                                                |

Adicional no listado como ancla pero cerrado en el mismo plan: `updateStaff` ahora también resuelve `input.branchId` con `assertBranchDelGimnasio` (`service.ts:396-400`) y estampa `branchUpdatedAt`/`branchSource` — el plan solo nombraba los 2 sitios de `createStaff` (`:178`/`:199` originales) para `branchUpdatedAt`, pero `updateStaff` comparte el mismo resolvedor y necesitaba el mismo fix (ver Deviations).

## Decisions Made

- **Filtro de listado (`GET /api/admin/users?branchId=`) usa `resolveBranchDelGimnasio` (no `assert`)**: una sede ajena en el querystring devuelve lista vacía en vez de lanzar — un listado no tiene una rama de error natural distinta de "sin resultados", y D-06 (sede inexistente, nunca 403) se cumple igual porque nunca se filtran filas ajenas ni se confirma la existencia de la sede en otro gimnasio.
- **`GET /` se envolvió en try/catch + `handleServiceError`** (no lo tenía antes de este plan): con `assertTenant` en el cuerpo del handler, un `tenantId` no resoluble lanza `AppError(403, TENANT_UNRESOLVED)` de forma fail-closed — sin el catch, Fastify habría usado su error handler default en vez del formato `{error, message}` consistente con el resto del módulo.
- **La FK simple/compuesta de 173-12 no se tocó**: este plan es 100% capa de aplicación (D-05a/D-05b ya estaban resueltas por 173-11/173-12).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `updateStaff` no escribía `branchUpdatedAt`/`branchSource` al cambiar `branchId` vía PUT**

- **Found during:** Task 1, al resolver `input.branchId` con `assertBranchDelGimnasio` dentro de la transacción de `updateStaff` — la línea original (`if (input.branchId !== undefined) updateFields.branchId = input.branchId;`) solo tocaba `branchId`, sin su docblock trío (`src/db/schema/users.ts:144`: "Se escriben SIEMPRE juntos con branchId").
- **Issue:** `createStaff` (ambas ramas: promoción y alta) sí escribía el trío completo, pero la edición vía `PUT /api/admin/users/:userId` no. Esto rompe la ventana de protección de 45 días del cron `reassign-multibranch.ts` (D-07 del milestone): si un admin reasigna manualmente la sede de un staff con rol coach/recepción vía el form de edición, el cron mensual podría sobreescribirla dentro de esos 45 días porque `branchUpdatedAt` nunca se actualizó, tratando la edición manual como si no hubiera ocurrido.
- **Por qué no era scope creep:** el statement exacto (`updateFields.branchId = ...`) es uno de los 6 sitios de ancla que el plan pide cerrar (D-05/D-08); resolver `branchId` contra el gimnasio y no tocar el trío que la propia migración documenta como obligatorio habría dejado el bug a medio arreglar en el mismo bloque de código que la tarea ya estaba modificando.
- **Fix:** al resolver `branchId` dentro de la transacción, se agregan también `branchUpdatedAt: new Date()` y `branchSource: "manual" as const` al `updateFields`.
- **Files modified:** `el-templo-api/src/modules/users/service.ts` (`updateStaff`, dentro de `this.db.transaction`).
- **Verification:** `pnpm exec vitest run --no-file-parallelism test/users test/auth` verde (79/79); no hay test dirigido nuevo para este trío específico — cubierto por cobertura existente de `updateStaff` con `branchId` (el PUT de rol, `users.test.ts:184-206`, no lo ejercita directamente porque cambia `role`, no `branchId`; ningún test existente asignaba `branchId` en un PUT, así que no había ningún test que se rompiera por el fix ni que lo verificara explícitamente — riesgo residual documentado abajo).
- **Commit:** `08d1b289` (Task 1)

### Ajustes documentados (no son bugs, desajustes plan/código)

**2. La ruta `POST /api/admin/users/:userId/program-addons` no vive en `users/routes.ts`**

- **Found during:** lectura inicial del plan y `read_first`, al buscar la 5ª ruta nombrada en el contexto ("Rutas del prefijo (5)").
- **Issue:** el plan (y `173-CONTEXT.md`/`tenant-manifest.ts`) cuentan 5 rutas bajo el prefijo `/api/admin/users`, pero la 5ª (`program-addons`) está registrada físicamente en `src/modules/programs/routes.ts`, no en `users/routes.ts`. Verificado que ya tiene `attachCountryScope` + `assertTenant(request.scope, "programs.enroll-addon")` desde un plan anterior (comentario en el propio archivo: `"173-04: mismo patrón que enrollAddon"`).
- **Resolución:** no se tocó `programs/routes.ts` (fuera de los `files_modified` del plan, y ya migrado). `users/routes.ts` tiene 4 handlers, los 4 con `assertTenant`. El criterio de aceptación literal del plan ("`grep -c` ≥ 5 en `users/routes.ts`") no se puede cumplir tal cual está escrito porque cuenta una ruta que físicamente no está en ese archivo — verificado en su lugar que las 5 rutas del prefijo completo tienen su `assertTenant` (4 en `users/routes.ts` + 1 ya existente en `programs/routes.ts`).
- **Impacto:** ninguno sobre el objetivo del plan (las 5 rutas del prefijo resuelven su gimnasio en el borde); es una discrepancia de conteo entre la documentación de fase y la ubicación física del código, no una omisión de trabajo.

---

**Total deviations:** 1 auto-fix de código (Rule 1) + 1 ajuste documentado (desajuste plan/código, sin impacto).

## Issues Encountered

Ninguno más allá de lo documentado en Deviations.

## Verification Results

| Verificación                                                       | Comando                                                                                                                                              | Resultado                                                                                                                                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck de `src/`                                                | `pnpm exec tsc --noEmit`                                                                                                                             | exit 0                                                                                                                                                                          |
| Typecheck de `test/` (ratchet)                                     | `pnpm typecheck:tests`                                                                                                                               | exit 0 (185 baseline, 0 nuevos, 0 empeorados, 0 obsoletos, TS2554: 0)                                                                                                           |
| Tests dirigidos Task 1                                             | `pnpm exec vitest run --no-file-parallelism test/users`                                                                                              | exit 0, 4 archivos / 28 tests                                                                                                                                                   |
| Tests dirigidos Task 2 (final)                                     | `pnpm exec vitest run --no-file-parallelism test/users test/auth`                                                                                    | exit 0, 8 archivos / 79 tests                                                                                                                                                   |
| `assertBranchDelGimnasio`/`resolveBranchDelGimnasio` en service.ts | `grep -c "assertBranchDelGimnasio\|resolveBranchDelGimnasio" src/modules/users/service.ts`                                                           | 9 (≥3 exigido)                                                                                                                                                                  |
| `403`/`Forbidden` en service.ts vs. baseline                       | `grep -cE "403\|Forbidden" src/modules/users/service.ts`                                                                                             | 0 (baseline `origin/staging`: 0 — no aumentó)                                                                                                                                   |
| `tenantId!` / `tenantId ??`                                        | `grep -rnE "tenantId!\|tenantId\s*\?\?" service.ts routes.ts`                                                                                        | sin líneas                                                                                                                                                                      |
| `input.branchId` nunca escrito crudo                               | `grep -n "input.branchId" service.ts` (lectura manual)                                                                                               | solo pasado a `assertBranchDelGimnasio`, nunca a un `.set`/`.values` directo                                                                                                    |
| `assertTenant` en routes.ts                                        | `grep -c "assertTenant(request.scope" src/modules/users/routes.ts`                                                                                   | 4 (ver Deviation 2 — la 5ª ruta del prefijo vive en `programs/routes.ts`, ya migrada)                                                                                           |
| `fastify.db` en routes.ts                                          | `grep -n "fastify.db" src/modules/users/routes.ts`                                                                                                   | 2 líneas: `:23` instancia `UserService` (constructor, no query directa), `:42` `attachCountryScope(request, fastify.db)` (helper ya migrado) — ninguna query directa que migrar |
| Lint de tenancy (copia de trabajo)                                 | `pnpm exec tsx src/db/scripts/lint-tenant.ts --allowlist=/tmp/allowlist-173-13.json` (con las 3 entradas de `users/service.ts` borradas de la copia) | `unlistedViolations: 0`; `staleNoLongerViolating: 53` — ninguna entrada de la lista menciona `users/service.ts` ni `users/routes.ts`                                            |
| Allowlist real intacta                                             | `git status --short el-templo-api/tenant-lint-allowlist.json`                                                                                        | sin cambios                                                                                                                                                                     |
| Deletions accidentales                                             | `git diff --diff-filter=D --name-only HEAD~1 HEAD` (ambos commits)                                                                                   | ninguna                                                                                                                                                                         |
| Procesos vitest huérfanos                                          | `pgrep -fa vitest` antes de cada corrida                                                                                                             | ninguno encontrado en ningún momento                                                                                                                                            |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Los 6 sitios de ancla de `users/service.ts` (4 de `user_branches` + 2 de `branchUpdatedAt` del módulo de staff) quedan cerrados; junto con 173-11 (helper) y 173-12 (FK compuesta), el invariante `user.tenant_id === branch.tenant_id` está protegido en las 3 capas para el módulo de staff completo.
- Recordatorio para 173-30 (el switch): las 3 entradas de `tenant-lint-allowlist.json` para `users/service.ts` (`branches`, `user_branches`, `users`) quedan stale (ya no violan) y deben borrarse junto con las demás entradas heredadas de planes previos de la fase.
- `programs/routes.ts` (la 5ª ruta del prefijo `/api/admin/users`) ya estaba migrada desde el plan 173-04 — no requiere trabajo adicional de este plan ni de los siguientes.
- Sin migraciones creadas por este plan (confirmado: la reserva de la fase sigue desde 0200, ya consumida por 173-12).

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_

## Self-Check: PASSED

- `el-templo-api/src/modules/users/service.ts` — FOUND
- `el-templo-api/src/modules/users/routes.ts` — FOUND
- `.planning/phases/173-adopci-n-2-members-guarda-de-consistencia-de-anclas/173-13-SUMMARY.md` — FOUND
- Commit `08d1b289` (Task 1) — FOUND
- Commit `c949805c` (Task 2) — FOUND
