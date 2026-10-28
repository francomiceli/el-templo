---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 22
subsystem: testing
tags:
  [
    tenancy,
    members,
    users,
    auth,
    leads,
    sentinel,
    sonda-revertida,
    tenant-safe,
    ratchet,
  ]

# Dependency graph
requires:
  - phase: 173-21
    provides: "test/helpers.ts endurecido (cleanAllTestData sobrevive al throw), sonda documentada, hallazgo crítico auth/routes.ts"
  - phase: 173-11
    provides: "canAccessBranch decide por gimnasio (D-14), resolveBranchDelGimnasio/assertBranchDelGimnasio"
  - phase: 173-04
    provides: "CountryScope.tenantId requerido"
provides:
  - "Pre-task: auth/routes.ts (login/register/refresh) sobrevive al throw del sentinel — las 5 anotaciones tenant-safe ahora embebidas EN EL SQL, no solo como comentario TS"
  - "test/members, test/users, test/auth (11 archivos, 61 sitios) sobreviven al throw sobre las 8 tablas del módulo"
  - "test/shared, test/branch-access.test.ts, test/country-scope.test.ts y los 6 archivos de leads/freemium (9 archivos más, 2 sitios adicionales) sobreviven al throw"
  - "5 tests de canAccessBranch — unit restaurados a su motivo real de aserción (deferred-items.md 173-20 cerrado)"
  - "10 errores TS2345 preexistentes del baseline resueltos como efecto colateral (185 → 175)"
affects: ["173-23", "173-24", "173-25", "173-30 (el switch)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dos canales de exención (D-17 de la 170): un comentario TS antes de una cadena de Drizzle exime al LINT (AST) pero NUNCA al SENTINEL (que solo lee el SQL final que llega al pool) — la exención real para el sentinel va embebida DENTRO de un fragmento `sql` en el propio `.where()`/predicado, ej. `sql\`/* tenant-safe: motivo */ ${eq(col, val)}\``"
    - "Los INSERT sobre tablas con `tenantIdColumn()` (DEFAULT 1 a nivel del builder de Drizzle) NO necesitan tocarse para pasar el sentinel: Drizzle materializa el default en el INSERT generado cuando el campo no viene explícito — verificado empíricamente (0 violaciones de INSERT en 3 corridas completas sobre ~90 archivos)"
    - "Migraciones históricas pre-tenancy que un test extrae y re-ejecuta verbatim (`splitSqlStatements` + `sql.raw`) se eximen con el motivo embebido ANTES del statement extraído, nunca se acotan — acotarlas reescribiría el statement que el test declara probar 'exacto' (mismo patrón que test/migrations/0109_reconcile_soledad.test.ts)"
    - "Un test que instancia un objeto de tipo con un campo requerido faltante puede pasar en verde por el motivo EQUIVOCADO durante años si el compilador nunca corre sobre test/ — el ratchet de tsc lo hubiera atrapado como TS2345 desde el día 1 de 173-04"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/test/tenancy/con-01-uniques-cross-tenant.test.ts
    - el-templo-api/test/members/members.test.ts
    - el-templo-api/test/members/members-status-filter.test.ts
    - el-templo-api/test/members/members-trial.test.ts
    - el-templo-api/test/members/outstanding-concepts.test.ts
    - el-templo-api/test/members/sepa-domiciliacion.test.ts
    - el-templo-api/test/members/user-status-history-hooks.test.ts
    - el-templo-api/test/users/member-creation-defaults.test.ts
    - el-templo-api/test/users/staff-disabled.test.ts
    - el-templo-api/test/users/user-status-transitions.test.ts
    - el-templo-api/test/auth/auth.test.ts
    - el-templo-api/test/auth/register.test.ts
    - el-templo-api/test/shared/audit-log.test.ts
    - el-templo-api/test/shared/tenant-scope.test.ts
    - el-templo-api/test/branch-access.test.ts
    - el-templo-api/test/admin-leads-patch.test.ts
    - el-templo-api/test/lead-status-transitions.test.ts
    - el-templo-api/test/backfill-lost-leads.test.ts
    - el-templo-api/test/expire-lost-leads.test.ts
    - el-templo-api/test/convert-freemium-to-trial.test.ts
    - el-templo-api/test-check-baseline.json

key-decisions:
  - "Toda la clasificación de este plan cayó en categoría 2 (conveniencia acotable → filtro con tenantWhere), salvo una única exención: el UPDATE de la migración histórica 0183 que backfill-lost-leads.test.ts re-ejecuta verbatim"
  - "Cero exenciones nuevas sobre código de producción — solo la pre-task tocó src/ (auth/routes.ts), y fue para AGREGAR el canal del sentinel a una exención YA APROBADA por 173-15, no para crear una nueva"
  - "Los 5 tests rojos de canAccessBranch — unit NO se documentan como 'cambio de significado por D-14' porque no lo eran: la causa raíz era un bug de construcción del test (CountryScope sin tenantId), no una consecuencia del cambio país→gimnasio. Se corrigió con Rule 1 (bug), no con una reinterpretación de la aserción"
  - "El ratchet de typecheck:tests se actualizó en el mismo commit que arregló los 10 TS2345 (185→175), siguiendo la regla dura del plan"

patterns-established:
  - "Tag tenant-safe embebido en sql`` para Drizzle query builder: primer precedente del repo para exención sobre `.select().from().where()` (todas las exenciones previas eran sql crudo o conn.query)"

requirements-completed: [ADO-02]

# Metrics
duration: ~4h
completed: 2026-08-08
---

# Phase 173 Plan 22: Adopción 2 — members, guarda de anclas — propio módulo Summary

**Los 20 archivos de test más pesados del módulo (members, users, auth, shared, leads/freemium y branch-access) sobreviven al throw del sentinel sobre las 8 tablas de `members`, con una pre-task obligatoria que hizo utilizable la sonda para todo el resto de la fase: las 5 anotaciones `tenant-safe` de `auth/routes.ts` eran solo comentarios TS (invisibles para el sentinel) y ahora también viven embebidas en el SQL — sin esa pre-task, cualquier login en cualquier plan siguiente daba 500.**

## Performance

- **Duration:** ~4h
- **Tasks:** 2/2 + 1 pre-task obligatoria
- **Files modified:** 21 (1 de producción — `auth/routes.ts` — + 19 de test + 1 baseline de ratchet)

## Task Commits

| Tarea    | Nombre                                           | Commit            | Archivos |
| -------- | ------------------------------------------------ | ----------------- | -------- |
| Pre-task | tenant-safe embebido en el SQL de auth/routes.ts | `daf75094` (fix)  | 2        |
| Task 1   | test/members, test/users y test/auth             | `9942d389` (feat) | 11       |
| Task 2   | leads, shared, country-scope y branch-access     | `604a892e` (feat) | 9        |

**Plan metadata:** este SUMMARY (el orquestador hace el commit final).

## Accomplishments

- **Pre-task crítica resuelta:** las 5 anotaciones `tenant-safe` de `auth/routes.ts` (login, register ×3, refresh) eran comentarios TS colgados sobre una cadena de Drizzle — exiimían al LINT (que ancla por AST al código fuente) pero el SENTINEL solo lee el SQL de runtime, y Drizzle nunca emite un comentario TS en ese texto. Con la sonda de members encendida, cualquier login daba 500 (hallazgo de 173-21). Fix: el mismo tag se repite EMBEBIDO dentro de un fragmento `sql` en el `.where()` de cada uno de los 5 sitios (`sql\`/_ tenant-safe: motivo _/ ${eq(...)}\``), conservando el comentario TS para el lint. Mismo tratamiento para los 3 `SELECT COUNT(\*)`de`contar()`en`con-01-uniques-cross-tenant.test.ts`que leen`users` cross-tenant a propósito.
- **61 sitios en 11 archivos** (`test/members`, `test/users`, `test/auth`) sobreviven al throw — TODOS categoría 2 (filtro `tenantWhere`), cero exenciones nuevas.
- **2 sitios adicionales que el inventario del plan no anticipaba** aparecieron al correr la Task 2 con la sonda encendida: `test/shared/tenant-scope.test.ts:117` (DELETE de conveniencia) y `test/branch-access.test.ts:968` (SELECT de `user_branches`) — mismo tratamiento, filtro.
- **Una única exención nueva**, y no es de producción: `test/backfill-lost-leads.test.ts` extrae y re-ejecuta VERBATIM el UPDATE de la migración histórica 0183 (pre-tenancy). Acotarlo reescribiría el statement que el test declara probar "exacto" — se eximió con el motivo embebido antes del statement, mismo patrón que `test/migrations/0109_reconcile_soledad.test.ts`.
- **Los INSERT sobre `users` no necesitaron tocarse.** Verificado empíricamente sobre ~90 archivos y 3 corridas completas: Drizzle materializa el `DEFAULT 1` de `tenantIdColumn()` en el INSERT generado cuando el campo no viene explícito en `.values()`, así que ya satisfacen al sentinel. Cero violaciones de INSERT en toda la fase.
- **Los 5 tests rojos de `canAccessBranch — unit`** (deferred-items.md, hallazgo 173-20) se restauraron a su motivo real: los 10 objetos `CountryScope` de ese `describe` no llevaban `tenantId` (campo requerido desde 173-04) — `assertTenant` lanzaba dentro de `canAccessBranch` (173-11), el `catch` interno lo convertía en `false`, y los 5 casos que esperaban `true` quedaban en rojo mientras los 5 que esperaban `false` pasaban por el motivo EQUIVOCADO. Se agregó `tenantId: 1` a los 10 objetos.
- **Efecto colateral positivo:** el fix de `canAccessBranch — unit` resolvió 10 errores `TS2345` preexistentes del baseline de `typecheck:tests` (185 → 175 en el mismo commit, `-- --update`).

## Files Created/Modified

- `el-templo-api/src/modules/auth/routes.ts` — 5 exenciones `tenant-safe` ahora embebidas en el SQL además del comentario TS (pre-task).
- `el-templo-api/test/tenancy/con-01-uniques-cross-tenant.test.ts` — 3 `SELECT COUNT(*)` de `users` con el tag embebido (pre-task).
- `el-templo-api/test/members/*.ts` (6 archivos), `test/users/*.ts` (3), `test/auth/auth.test.ts`, `test/auth/register.test.ts` — Task 1.
- `el-templo-api/test/shared/audit-log.test.ts`, `test/shared/tenant-scope.test.ts`, `test/branch-access.test.ts`, `test/admin-leads-patch.test.ts`, `test/lead-status-transitions.test.ts`, `test/backfill-lost-leads.test.ts`, `test/expire-lost-leads.test.ts`, `test/convert-freemium-to-trial.test.ts` — Task 2.
- `el-templo-api/test-check-baseline.json` — regenerado tras arreglar los 10 TS2345.

## Decisions Made

### 1. Categoría única: filtro, no exención (salvo un caso)

Todos los 63 sitios de conveniencia (lecturas/escrituras por `id`/`email` en `beforeEach`/`it`) se acotaron con `tenantWhere(tabla, ctx)` agregado al `and(...)` del `where`. Ninguno de los 20 archivos siembra en el gimnasio 2, así que un filtro global ahí era comodidad, no diseño — mismo criterio que 172-14 aplicó al piloto de finance. La única excepción es el UPDATE de la migración 0183 (ver Accomplishments).

### 2. La pre-task encontró el canal correcto para exenciones sobre Drizzle query builder

No existía precedente en el repo de una exención `tenant-safe` sobre una cadena `.select().from().where()` de Drizzle (todas las previas eran `sql` crudo o `conn.query`). La solución: envolver el predicado en un fragmento `sql\`` que contenga el comentario y el valor de comparación interpolado — Drizzle acepta `SQL`chunks dentro de`sql` templates, y el texto final que llega al pool lleva el comentario donde el sentinel lo busca.

### 3. Los 5 rojos de branch-access.test.ts no son un "cambio de significado por D-14"

El plan pedía documentar caso por caso si algún test de `branch-access.test.ts` "cambió de significado con D-14". Investigado: NO. La causa era un bug de construcción del test (falta un campo requerido), no una consecuencia del cambio país→gimnasio. Las otras `describe` del archivo (`Cross-country 403 + virtual bypass`, `Coach user_branches gating`) siguen probando exactamente lo mismo que antes porque sus fixtures viven todas en el mismo gimnasio (tenant 1) — D-14 solo cambia comportamiento cuando hay una sede de OTRO gimnasio de por medio, y este archivo nunca sembró una.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / pre-task encargada por el orquestador] `auth/routes.ts` no sobrevivía al throw**

- **Found during:** pre-task obligatoria (encargada explícitamente por el orquestador antes de las tasks del plan).
- **Issue:** las 5 anotaciones `tenant-safe` de `auth/routes.ts` (169-15) eran comentarios TS sobre el query builder — invisibles para el sentinel. Bloqueaba la sonda para TODO el resto de la fase (login/registro/refresh de cualquier test que use `getAuthToken`/`registerUser` daba 500).
- **Fix:** tag embebido en el SQL vía fragmento `sql\`` en el `where`, conservando el comentario TS. Detalle completo en Accomplishments.
- **Files modified:** `src/modules/auth/routes.ts`, `test/tenancy/con-01-uniques-cross-tenant.test.ts`.
- **Verificación:** sonda de members encendida a mano, login/registro/refresh reales sin 500, sonda revertida.
- **Committed in:** `daf75094`.

**2. [Rule 1 - Bug] 2 sitios adicionales no anticipados por el inventario del plan (Task 2)**

- **Found during:** Task 2, primera corrida en caliente.
- **Issue:** `test/shared/tenant-scope.test.ts:117` (DELETE por id sin filtro) y `test/branch-access.test.ts:968` (SELECT de `user_branches` sin filtro) no estaban en el `files_modified` original del plan pero SÍ dentro de los directorios/archivos que el plan sí cubre (`test/shared/`, `test/branch-access.test.ts` es parte de los 9 destinos de la Task 2).
- **Fix:** mismo tratamiento categoría 2 (filtro `tenantWhere`).
- **Files modified:** ya listados arriba.
- **Committed in:** `604a892e`.

**3. [Rule 1 - Bug] Los 5 tests rojos de `canAccessBranch — unit` (deferred-items.md 173-20)**

- **Found during:** Task 2, al abordar `branch-access.test.ts` explícitamente.
- **Issue:** ver Decisions Made #3.
- **Fix:** `tenantId: 1` agregado a los 10 objetos `CountryScope` del describe.
- **Files modified:** `test/branch-access.test.ts`.
- **Committed in:** `604a892e`.

---

**Total deviations:** 3 (1 Rule 3 pre-task encargada + 2 Rule 1 bugs). Ninguna es scope creep: la pre-task era instrucción explícita del orquestador, y los otros dos son bugs que el propio `<action>` del plan instruye corregir al encontrarlos ("clasificar con la regla del doc 07 §4(d)").
**Impact on plan:** Sin la pre-task, ninguna de las dos tasks del plan podía correr la sonda de verificación en caliente que ambas requieren como `<verify>`.

## Issues Encountered

**`pnpm exec tsc -p tsconfig.test-check.json --noEmit` no sale con código 0** — sale con exit 2 y 185→175 líneas de error, EXACTAMENTE el baseline del ratchet (`pnpm run typecheck:tests` confirma 0 errores nuevos). Esto es deuda preexistente documentada desde 172-14/173-21 (`tsc --noEmit` no es un gate limpio en este repo; el gate real es `typecheck:tests` con su ratchet + `vitest`). El criterio literal del plan ("sale con código 0") es aspiracional dado que el repo arrancó esta fase con 185 errores de tipo conocidos en `test/`; se verificó la condición real que importa (0 nuevos, 0 empeorados) en cada commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- La sonda de `members` es ahora completamente utilizable para 173-23/24/25: login/registro/refresh no dan 500, y los 3 archivos de test más pesados del módulo (más leads/shared/branch-access) ya sobreviven al throw.
- `deferred-items.md` actualizado: los dos hallazgos que este plan tenía asignados (173-20 y el crítico de 173-21) están CERRADOS con commit y verificación.
- El baseline de `typecheck:tests` bajó a 175 — 173-23/24/25 heredan ese número, no 185.
- Ningún archivo de `src/` quedó tocado salvo `auth/routes.ts` (pre-task, exención pre-existente reforzada, sin cambio de comportamiento).
- `tenant-lint-allowlist.json` intacto (este plan no tocó `src/modules/members|users`, así que no paga ninguna entrada — la cuenta sigue para 173-30).

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_

## Self-Check: PASSED

- `el-templo-api/src/modules/auth/routes.ts` — FOUND, commit `daf75094`
- `el-templo-api/test/members/members.test.ts` (y los otros 10 de Task 1) — FOUND, commit `9942d389`
- `el-templo-api/test/branch-access.test.ts` (y los otros 8 de Task 2) — FOUND, commit `604a892e`
- Commits `daf75094`, `9942d389`, `604a892e` en `feat/173-adopcion-members` — FOUND (`git log --oneline`)
- `git status --porcelain el-templo-api/src/db/tenant-tables.ts` vacío tras cada corrida con sonda — VERIFICADO
- `pnpm run typecheck:tests`: 175/175 baseline, 0 nuevos — VERIFICADO
- `vitest run --no-file-parallelism` de los 30 archivos combinados (Task 1 + Task 2): 374/377 (1 skip + 2 todo preexistentes), 0 rojos — VERIFICADO
- `.planning/phases/173-.../deferred-items.md` actualizado con el cierre de los 2 hallazgos — FOUND
