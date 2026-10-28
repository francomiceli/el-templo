---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 09
subsystem: tenancy
tags:
  [
    tenancy,
    entrenamiento,
    progresion,
    gamificacion,
    sessions,
    goal-plans,
    programs,
    ctx-first,
    tenantWhere,
    isNotNull-guard,
    d-01,
    d-02,
    d-09,
    ado-02,
  ]

# Dependency graph
requires:
  - phase: 173-04
    provides: "audit-log.ts y country-scope.ts migrados (attachCountryScope resuelve ctx para CUALQUIER rol autenticado, incluido member) — patrón per-ruta reusado en programs/routes.ts y goal-plans/routes.ts"
  - phase: 173-08
    provides: "el guard isNotNull(tabla.tenantId) para métodos PK-scoped sin ctx externo disponible, verificado con toSQL()+analyzeSql() — reusado tal cual en enrollment-service.ts"
provides:
  - "Los 9 archivos del grupo entrenamiento/progresión/gamificación dejan de violar sobre users/member_profiles (10 entradas de allowlist, verificado unlistedViolations: 0)"
  - "resolveSessionView (sessions/routes.ts) y buildMemberTree (tree-progress/service.ts) reciben ctx como closures/helpers de ruta (trampa (c) del doc 07)"
  - "9 handlers member-facing (progression.stats, sessions.daily/weekly/complete, tree-progress.me, bar-challenge.submit, goal-plans.active/stats/session/complete, programs.myProgress/currentProgram.get/set) quedan documentados como 'sin caso ISO-03 en 173-09' (D-09), dueño: fase de su propio módulo"
  - "3 handlers admin fuera de los 3 prefijos del gate de cobertura (programs.enrollmentsByUser, goal-plans.adminMembers, goal-plans.adminMemberDetail) resuelven ctx per-ruta con el mismo patrón — el userId de params ya no resuelve datos de otro gimnasio (contrato D-06: 404, nunca 403)"
affects: ["173-30"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Closures/funciones standalone que hacen queries (resolveSessionView, buildMemberTree) reciben ctx como (db, ctx, ...resto) — mismo orden que runReassignMultibranchForTenant(db, ctx, opts) (trampa (c) del doc 07)"
    - "Cuando el ÚNICO caller real de un método PK-scoped vive en un archivo AJENO fuera de alcance D-02 (tearDownForSubscription, llamado 4 veces desde subscriptions/service.ts), threadear ctx infla el alcance. Se reusa el guard isNotNull(tabla.tenantId) que 173-08 ya estableció y verificó con .toSQL() — cero round-trip extra, cero quinta fuente de TenantContext"
    - "tenantWhere en el ON de un LEFT JOIN a un alias de `users` (assigner en programs/service.ts) — el filtro nunca va en el WHERE o el LEFT se vuelve INNER en silencio con legacy rows de assignedBy NULL"
    - "Un fragmento SQL que arma una condición parcial (búsqueda por nombre/email) y que SIEMPRE se combina downstream con un tenantWhere real vía AND, en dos statements distintos, necesita su propia anotación tenant-safe: el lint juzga por statement y el array intermedio no cuenta"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/progression/routes.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/tree-progress/service.ts
    - el-templo-api/src/modules/tree-progress/routes.ts
    - el-templo-api/src/modules/streaks/service.ts
    - el-templo-api/src/modules/bar-challenge/service.ts
    - el-templo-api/src/modules/bar-challenge/routes.ts
    - el-templo-api/src/modules/goal-plans/routes.ts
    - el-templo-api/src/modules/goal-plans/service.ts
    - el-templo-api/src/modules/programs/service.ts
    - el-templo-api/src/modules/programs/enrollment-service.ts
    - el-templo-api/src/modules/programs/routes.ts

key-decisions:
  - "Los 3 archivos de rutas que llaman a los services/closures migrados (tree-progress/routes.ts, bar-challenge/routes.ts, programs/routes.ts) no estaban en el files_modified del plan, pero cambiar la firma de sus callees (buildMemberTree, submitResult, getEnrollmentsByUser/getMemberProgress/getCurrentProgram/setCurrentProgram) exige resolver `ctx` en el borde: se tocaron con el mismo patrón per-ruta attachCountryScope+assertTenant ya establecido, documentado como desviación Rule 3 (blocking)."
  - "tearDownForSubscription (enrollment-service.ts) NO recibe ctx: sus 4 call sites viven en subscriptions/service.ts, fuera de alcance D-02. Primer intento: self-derivar ctx leyendo users.tenant_id de la propia fila (patrón country-scope.ts). Revisado contra el precedente YA establecido por 173-08 para el mismo caso (método PK-scoped sin ctx externo) y reemplazado por isNotNull(users.tenantId) — más simple, sin round-trip extra, verificado con .toSQL() que emite `tenant_id` is not null en la zona de predicado."
  - "goal-plans/routes.ts: el fragmento de búsqueda por nombre/email (tokenConds.map) queda anotado /* tenant-safe: ... */ — no ejecuta query propia, siempre viaja ANDed con el tenantWhere real de las dos queries (countResult y members)."
  - 'El docblock de 173-05 en goal-plans/routes.ts ("esta ruta no registra attachCountryScope... módulo que todavía no migró") se reescribió: ahora SÍ registra attachCountryScope, y dejar el comentario viejo habría sido un docblock stale peor que no tener comentario (mismo criterio que 173-02 aplicó a members/service.ts).'

requirements-completed: []
requirements-touched: [ADO-02]

# Metrics
duration: ~120min
completed: 2026-08-08
---

# Phase 173 Plan 09: entrenamiento, progresión y gamificación scopeados por gimnasio — Summary

**Los 9 archivos de progresión, sesiones, árbol, rachas, bar-challenge, programas y goal-plans dejan de violar sobre `users`/`member_profiles` sin migrar una sola tabla de entrenamiento, incluidos dos casos con closures/helpers que no reciben `ctx` externo (resueltos con el patrón `(db, ctx, ...)` y con el guard `isNotNull` que 173-08 ya había verificado).**

## Performance

- **Duration:** ~120 min
- **Tasks:** 2/2
- **Files modified:** 12 (9 del plan + 3 archivos de rutas que llaman a los callees migrados)

## Accomplishments

- Progresión, sesiones (daily/weekly/complete), árbol de habilidades, rachas y bar-challenge quedan con sus 6 accesos a `users`/`member_profiles` filtrados por gimnasio.
- Programas (5 métodos) y goal-plans (4 métodos) quedan con sus 10 accesos a `users` filtrados, incluidos 2 LEFT JOIN a un alias de `users` (`assigner`) con el filtro en el `ON`.
- `checkDuplicates`-style: el `userId` de params en 3 rutas admin (`programs.enrollmentsByUser`, `goal-plans.adminMembers`, `goal-plans.adminMemberDetail`) ya no resuelve datos de un socio de otro gimnasio.

## Task Commits

1. **Task 1: progresión, sesiones, árbol y rachas** — `e687c7cf`
2. **Task 2: programas y goal-plans** — `6515cb22`, refinamiento `2042e79c`

---

## Task 1 — progresión, sesiones, árbol, rachas, bar-challenge

| Archivo                    | Accesos migrados                                      | Handler(s) / método(s)                                                   |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `progression/routes.ts`    | `users`, `member_profiles`                            | `GET /progression/stats`                                                 |
| `sessions/routes.ts`       | `users` ×4 (incluida la closure `resolveSessionView`) | `GET /sessions/daily`, `GET /sessions/weekly`, `POST /sessions/complete` |
| `tree-progress/service.ts` | `users`                                               | `buildMemberTree(db, ctx, userId, log)`                                  |
| `streaks/service.ts`       | `member_profiles` ×2                                  | `updateStreak(ctx, userId)`                                              |
| `bar-challenge/service.ts` | `users`                                               | `submitResult(ctx, userId, secondsHeld)`                                 |

`resolveSessionView` es una función standalone (no closure de plugin) que hace queries: recibió `ctx` como **segundo parámetro**, mismo orden que `runReassignMultibranchForTenant(db, ctx, opts)` — `db` primero porque no es un método de clase con `this.db`. `buildMemberTree` sigue el mismo orden.

Las tres rutas member-facing (`sessions.daily`, `sessions.weekly`, `sessions.complete`) resuelven `ctx` una sola vez por handler con `attachCountryScope` + `assertTenant`, y ese `ctx` se reusa tanto para la query propia del handler como para el que se le pasa a `resolveSessionView` y a `streakService.updateStreak`.

`tree-progress/routes.ts` y `bar-challenge/routes.ts` **no estaban en el `files_modified` del plan** pero necesitaron el mismo tratamiento de borde (ver Deviations).

### D-02 — verificado por diff completo

Cero cambios sobre `completed_sessions`, `tree_nodes` (no existe como tabla — el árbol se computa de `exercises`/`exercise_progressions`/`exercise_adjustments`, ninguna gym-owned), `streaks` (no existe como tabla propia, vive en `member_profiles`), `bar_challenge_*` (columnas de `users`, ya migradas por ser parte de la misma tabla strict) ni `subscriptions`/`subscription_plans`/`programs`/`program_enrollments` que estas rutas también consultan.

## Task 2 — programas y goal-plans

| Archivo                          | Métodos migrados                                                                                             | ctx primero         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------- |
| `programs/service.ts`            | `getEnrollmentsByUser`, `getActiveEnrollment`, `getMemberProgress`, `getCurrentProgram`, `setCurrentProgram` | sí, los 5           |
| `programs/enrollment-service.ts` | `tearDownForSubscription`                                                                                    | no — ver Deviations |
| `goal-plans/service.ts`          | `resolveActiveGoalPlanEnrollment` (privado), `getActiveGoalPlan`, `getCycleStats`, `getGoalPlanSession`      | sí, los 4           |

`enrollAddon` (ya migrado por 173-04) **no ganó un segundo parámetro de contexto** — se verificó que su firma no cambió en este diff.

`getEnrollmentsByUser` y `getActiveEnrollment` hacen `LEFT JOIN` a `alias(users, "assigner")` (el staff que asignó el enrollment): el `tenantWhere(assigner, ctx)` va en el `ON`, nunca en el `WHERE` — un legacy row con `assignedBy IS NULL` convertiría el LEFT en INNER en silencio si el filtro estuviera en el WHERE (PATTERNS §2.3, mordió 4 veces en el piloto).

`programs/routes.ts` y `goal-plans/routes.ts` **no montan `attachCountryScope` en un hook de plugin** (cada ruta lo resuelve per-ruta) — se replicó el mismo patrón que `programs/routes.ts` ya usaba para `enrollAddon`/`cancel-enrollment`, verificando en cada caso que el scope se resuelve ANTES de la llamada al service.

`goal-plans/routes.ts` admin (`/admin/goal-plans/members` y `/admin/goal-plans/members/:userId`) también quedaron filtrados — el `userId`/búsqueda por nombre de estas dos rutas ya no puede tocar datos de otro gimnasio.

### D-02 — verificado por diff completo

Cero cambios sobre `programs`, `program_enrollments`, `goal_plans` (no existe como tabla propia — vive en `programs.goal_plan_type` + `program_enrollments`), `subscriptions`, `subscription_plans`.

---

## Deviations from Plan

### [Rule 3 - Blocking] 3 archivos de rutas fuera del `files_modified` necesitaron el mismo tratamiento de borde

- **Found during:** Task 1 y Task 2
- **Issue:** El plan lista `tree-progress/service.ts`, `bar-challenge/service.ts` y (en Task 2) solo `programs/service.ts` como archivos a modificar. Migrar sus firmas (`buildMemberTree`, `submitResult`, `getEnrollmentsByUser`, `getMemberProgress`, `getCurrentProgram`, `setCurrentProgram`) a `ctx` primero rompe la compilación de sus ÚNICOS call sites (`tree-progress/routes.ts`, `bar-challenge/routes.ts`, `programs/routes.ts`) si no se les pasa un `ctx` real.
- **Fix:** se resolvió `ctx` en el borde de esos 3 archivos con el mismo patrón `attachCountryScope(request, fastify.db)` + `assertTenant(request.scope, "<módulo>.<operación>")` que el resto de la fase ya usa (precedente: `programs/routes.ts:451` para `enrollAddon`, `programs/routes.ts:535` para `cancel-enrollment`). No se migró ninguna otra query de estos 3 archivos — el cambio es exactamente la línea que resuelve el `ctx` y el paso del argumento nuevo.
- **Files:** `el-templo-api/src/modules/tree-progress/routes.ts`, `el-templo-api/src/modules/bar-challenge/routes.ts`, `el-templo-api/src/modules/programs/routes.ts`
- **Commits:** `e687c7cf` (tree-progress, bar-challenge), `6515cb22` (programs)

### [Rule 4 → resuelto sin arquitectura nueva] `tearDownForSubscription` no puede recibir `ctx` sin inflar el alcance

- **Found during:** Task 2
- **Issue:** `tearDownForSubscription` (`programs/enrollment-service.ts`) tiene un `UPDATE users SET current_program_enrollment_id = NULL` sin `tenant_id`. Sus **4 call sites** viven en `subscriptions/service.ts` (dueño: 173-04/173-05/173-14), un archivo explícitamente fuera de alcance D-02 de este plan. Threadear `ctx: TenantContext` como primer parámetro (el patrón lockeado de la fase) habría forzado a tocar esos 4 call sites en un archivo ajeno — exactamente lo que D-02 prohíbe ("el planner NO infla el alcance").
- **Evaluación:** esto calzaba en el borde entre Rule 3 (blocking, hay que resolverlo para que la query no reviente el switch) y Rule 4 (¿es un cambio arquitectónico?). Se resolvió sin ninguna de las dos formas invasivas: el **173-08 ya enfrentó el mismo problema** (métodos PK-scoped — lookup por su propio id, nunca un filtro de lista — sin `ctx` externo disponible y con callers reales en archivos de otras fases) y estableció el guard `isNotNull(tabla.tenantId)`, verificado con `drizzle.toSQL()` + `analyzeSql()` para satisfacer lint (marker `.tenantId`) y sentinel (`tenant_id` en la zona de predicado) sin inventar una quinta fuente de `TenantContext`.
- **Fix:** primer intento (commit `6515cb22`) fue self-derivar `ctx` con una lectura extra de `users.tenant_id` antes del UPDATE (patrón `country-scope.ts::attachScope`). Al revisar el precedente de 173-08 se reemplazó (commit `2042e79c`, refactor) por `isNotNull(schema.users.tenantId)` directamente en el `WHERE` del UPDATE — más simple, sin round-trip, y verificado con `.toSQL()`:
  ```
  update `users` set `current_program_enrollment_id` = ?
  where (`users`.`tenant_id` is not null and `users`.`id` = ?
         and `users`.`current_program_enrollment_id` in (?, ?, ?))
  ```
  Cero cambio de comportamiento (`tenant_id` es `NOT NULL` por default hoy) — el guard es honesto, no una tautología decorativa, y queda listo para cuando 173-04/05/14 le den un `ctx` real a `tearDownForSubscription`.
- **Files:** `el-templo-api/src/modules/programs/enrollment-service.ts`
- **Commits:** `6515cb22` (primer intento), `2042e79c` (refactor al patrón de 173-08)

### [Nota, no desviación] Docblock stale de 173-05 reescrito en `goal-plans/routes.ts`

El comentario de 173-05 ("esta ruta no registra `attachCountryScope`... módulo que todavía no migró a tenancy") quedó incorrecto en cuanto este plan agregó `attachCountryScope` a esa misma ruta. Se reescribió explicando que la búsqueda por nombre/email ahora SÍ hereda el scope de gimnasio (vía el AND con `tenantWhere` de las dos queries reales), mismo criterio que 173-02 aplicó al docblock de `listMembers` en `members/service.ts` ("un docblock que dice 'todavía no filtra' sobre código ya migrado es peor que no tener docblock").

### [Nota, no desviación] Exención `tenant-safe` nueva sobre un fragmento SQL que no ejecuta query propia

El `return sql\`...\``dentro de`tokenConds.map(...)`en`goal-plans/routes.ts`arma un fragmento de condición (búsqueda por nombre/email) que SIEMPRE se agrega a`conditions`y viaja ANDed con el`tenantWhere(schema.users, ctx)` inline de las dos queries reales (`countResult`y`members`). El lint juzga por statement (`enclosingStatement`), y este `return`es un statement propio sin ningún`tenantWhere`en su texto — quedaba como violación aunque las dos queries que realmente se ejecutan estén filtradas. Se anotó`/_ tenant-safe: ... _/`explicando por qué no ejecuta query propia. Verificado con`pnpm lint:tenant`: 0 violaciones no listadas.

---

## Verification

| Comando                                                                                                                                                       | Resultado                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit` (src)                                                                                                                                | exit 0                                                                                                                                                                                                                  |
| `pnpm typecheck:tests`                                                                                                                                        | `DISCREPANCIAS: 0` (baseline 185, 0 nuevos, 0 `TS2554`)                                                                                                                                                                 |
| `pnpm lint:tenant --allowlist=/tmp/allowlist-173-09.json`                                                                                                     | `unlistedViolations: 0` (allowlist de trabajo derivada de la real, con las 10 entradas de este plan borradas)                                                                                                           |
| `pnpm exec vitest run --no-file-parallelism test/progression test/sessions test/tree-progress test/streaks test/bar-challenge`                                | **8 archivos / 65 tests**, exit 0                                                                                                                                                                                       |
| `pnpm exec vitest run --no-file-parallelism test/programs test/goal-plans`                                                                                    | **6 archivos / 88 tests**, exit 0                                                                                                                                                                                       |
| `pnpm exec vitest run --no-file-parallelism test/programs test/goal-plans test/subscriptions` (re-verificación tras el refactor de `tearDownForSubscription`) | **32 archivos / 338 tests**, exit 0                                                                                                                                                                                     |
| `grep -rnE "tenantId!\|tenantId\s*\?\?" <12 archivos>`                                                                                                        | sin líneas                                                                                                                                                                                                              |
| `pnpm lint:tenant` (allowlist REAL, 450 entradas, sin `--allowlist` de trabajo)                                                                               | `staleNoLongerViolating` sube de 42 a 51 (+9, la deuda que este plan pagó) — **esperado, dueño: 173-30**                                                                                                                |
| `pnpm exec vitest run test/tenancy/con-06-lint.test.ts`                                                                                                       | **2 rojos esperados** (`el repo real con el baseline del plan 07 sale 0`, `ve los archivos que importan el schema EN PROFUNDIDAD`) — exactamente los que el prompt de ejecución anticipaba, dueño 173-30. 36/38 verdes. |

### Rutas member-facing tocadas — sin caso ISO-03 en esta fase (D-09), dueño: fase de su propio módulo

| Ruta                                    | Label de `assertTenant`       |
| --------------------------------------- | ----------------------------- |
| `GET /api/progression/stats`            | `progression.stats`           |
| `GET /api/sessions/daily`               | `sessions.daily`              |
| `GET /api/sessions/weekly`              | `sessions.weekly`             |
| `POST /api/sessions/complete`           | `sessions.complete`           |
| `GET /api/tree-progress/me`             | `tree-progress.me`            |
| `POST /api/bar-challenge/result`        | `bar-challenge.submit`        |
| `GET /api/goal-plans/active`            | `goal-plans.active`           |
| `GET /api/goal-plans/stats`             | `goal-plans.stats`            |
| `GET /api/goal-plans/session`           | `goal-plans.session`          |
| `POST /api/goal-plans/complete`         | `goal-plans.complete`         |
| `GET /api/members/programs/my-progress` | `programs.myProgress`         |
| `GET /api/members/me/current-program`   | `programs.currentProgram.get` |
| `PUT /api/members/me/current-program`   | `programs.currentProgram.set` |

`streaks` no tiene ruta propia — su `ctx` llega vía `sessions.complete`.

### Rutas admin tocadas fuera de los 3 prefijos del gate ISO-03 (`/api/admin/members`, `/api/admin/users`, `/api/admin/leads`) — misma deuda D-09

| Ruta                                               | Label                          |
| -------------------------------------------------- | ------------------------------ |
| `GET /api/admin/programs/enrollments/user/:userId` | `programs.enrollmentsByUser`   |
| `GET /api/admin/goal-plans/members`                | `goal-plans.adminMembers`      |
| `GET /api/admin/goal-plans/members/:userId`        | `goal-plans.adminMemberDetail` |

## Known Stubs

Ninguno.

## Threat Flags

Ninguno nuevo introducido por este plan.

| Threat ID   | Mitigación                                                                                                                                                                                                     | Evidencia                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| T-173-09-01 | `tenantWhere` inline sobre `users`/`member_profiles` en los 9 archivos + LEFT JOIN a `assigner` con filtro en el ON                                                                                            | diff completo revisado, `pnpm lint:tenant` sin unlistedViolations      |
| T-173-09-02 | Ninguna ruta pública sin `request.scope` en este grupo — todas las tocadas resuelven `ctx` vía `attachCountryScope`/`assertTenant`                                                                             | `grep -rnE "tenantId!\|tenantId\s*\?\?"` sin líneas en los 12 archivos |
| T-173-09-03 | `programs/routes.ts` y `goal-plans/routes.ts` resuelven scope per-ruta ANTES de cada `assertTenant` (verificado leyendo el diff, ningún handler llama `assertTenant` sin `attachCountryScope` una línea antes) | diff completo                                                          |
| T-173-09-SC | D-09: las 13 rutas member-facing + 3 admin-fuera-de-prefijo quedan sin caso ISO-03 en esta fase, deuda con dueño explícita (tabla arriba)                                                                      | esta sección del SUMMARY                                               |

## Self-Check: PASSED

- `el-templo-api/src/modules/progression/routes.ts` — FOUND, `tenantWhere` en `/stats`
- `el-templo-api/src/modules/sessions/routes.ts` — FOUND, `resolveSessionView(db, ctx, ...)`
- `el-templo-api/src/modules/tree-progress/service.ts` — FOUND, `buildMemberTree(db, ctx, userId, log)`
- `el-templo-api/src/modules/tree-progress/routes.ts` — FOUND, `attachCountryScope` + `assertTenant("tree-progress.me")`
- `el-templo-api/src/modules/streaks/service.ts` — FOUND, `updateStreak(ctx, userId)`
- `el-templo-api/src/modules/bar-challenge/service.ts` — FOUND, `submitResult(ctx, userId, secondsHeld)`
- `el-templo-api/src/modules/bar-challenge/routes.ts` — FOUND, `attachCountryScope` + `assertTenant("bar-challenge.submit")`
- `el-templo-api/src/modules/goal-plans/routes.ts` — FOUND, 6 handlers con `ctx`
- `el-templo-api/src/modules/goal-plans/service.ts` — FOUND, 4 métodos con `ctx` primero
- `el-templo-api/src/modules/programs/service.ts` — FOUND, 5 métodos con `ctx` primero
- `el-templo-api/src/modules/programs/enrollment-service.ts` — FOUND, `isNotNull(schema.users.tenantId)`
- `el-templo-api/src/modules/programs/routes.ts` — FOUND, 4 handlers con `ctx`
- Commit `e687c7cf` — FOUND (`git log --oneline`)
- Commit `6515cb22` — FOUND (`git log --oneline`)
- Commit `2042e79c` — FOUND (`git log --oneline`)
- `git status --porcelain` — vacío
