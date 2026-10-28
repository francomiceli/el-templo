---
phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo
plan: 03
subsystem: api
tags: [fastify, drizzle, mysql, feature-flags, multi-tenancy, vitest, avvio]

# Dependency graph
requires:
  - "modules.ts / module-flags.ts (176-01) — MODULE_NAMES, DEFAULT_PUBLIC_TENANT_ID, isModuleEnabled"
provides:
  - "requireModule/moduleScope/moduleGuardOf (src/modules/shared/module-registry.ts) — guard 404 fail-closed por-ruta"
  - "Los 12 registros de rutas de templo-training en app.ts envueltos con moduleScope"
  - "test/tenancy/mod-01-guard.test.ts — batería de comportamiento del guard contra MySQL real"
affects:
  [
    "176-04 (registry de hooks)",
    "176-05 (gate de cobertura ISO-01 sexto test, lee moduleGuardOf)",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'onRoute (scope) que appendea el guard a route.onRequest por-ruta, NUNCA addHook("onRequest") de instancia'
    - 'Propagación manual del nombre fastify-plugin (Symbol.for("registered-plugin")/Symbol.for("plugin-meta")) al array real de `app` tras cada moduleScope, para que dependencias nombradas entre fp(...) sigan resolviendo pese a la encapsulación nueva'
    - "db.execute(sql`/* tenant-safe: motivo */ ...`) para el único SELECT sobre una tabla STRICT (users) que estructuralmente no puede filtrar por tenant_id — anotación embebida EN EL SQL, no en un comentario TS (el sentinel de tenancy solo lee el texto que llega al pool)"

key-files:
  created:
    - el-templo-api/src/modules/shared/module-registry.ts
    - el-templo-api/test/tenancy/mod-01-guard.test.ts
  modified:
    - el-templo-api/src/app.ts
    - el-templo-api/test/fixtures/second-tenant.ts

key-decisions:
  - "Técnica del guard: hook onRoute de scope que appendea a onRequest por-ruta (RESEARCH §Pattern 1), verificada de nuevo contra el build real"
  - "resolveTenantForGuard: (1) request.scope?.tenantId, (2) SELECT mínimo users.tenant_id vía db.execute + anotación tenant-safe embebida en el SQL, (3) DEFAULT_PUBLIC_TENANT_ID=1 (D-06) — alcance real 35 rutas de marketing, no solo las públicas"
  - 'Pitfall 6 (nuevo, no anticipado por el RESEARCH): moduleScope propaga el nombre fastify-plugin del plugin recién registrado al array real de `app` (Symbol.for("registered-plugin")), porque envolver cada uno de los 7 fp de training en su PROPIO scope encapsulado rompe la dependencia nombrada sessions-plugin -> spom-plugin que antes resolvía compartiendo el array de app directamente'
  - "Pitfall 7 (nuevo): users es tabla STRICT (TENANT_STRICT_MODULES); el único SELECT del guard que la toca usa db.execute(sql`/* tenant-safe: ... */`) en vez del query builder, con doble destructuring [[row]] porque ese camino de drizzle-orm/mysql2 (sin fields/customResultMapper) devuelve el tuple crudo de mysql2 sin desenvolver"

requirements-completed: [MOD-01]

# Metrics
duration: ~2h30min
completed: 2026-08-21
---

# Phase 176 Plan 03: Guard `requireModule` + `moduleScope` + registry de training Summary

**Guard `requireModule` (404 fail-closed, `onRoute`-append) aplicado a los 12 registros de rutas de `templo-training` en `app.ts` — probado contra MySQL real con contraste, encontrando y resolviendo dos trampas reales de Fastify/avvio y del sentinel de tenancy que el RESEARCH no había anticipado.**

## Performance

- **Duration:** ~2h30min
- **Started:** 2026-08-21 (continuación de 176-01/02, HEAD `853907e8`)
- **Completed:** 2026-08-21
- **Tasks:** 3/3
- **Files modified:** 4 (1 nuevo core, 1 nuevo test, 2 modificados)

## Accomplishments

- `module-registry.ts`: `requireModule` (guard 404 fail-closed), `moduleScope` (envoltorio `onRoute`-append encapsulado), `moduleGuardOf` (lector para el gate del plan 176-05). Docblock largo con la técnica, las tres restricciones que resuelve, y los DOS pitfalls nuevos descubiertos ejecutando este plan (ver Deviations).
- `app.ts`: los 12 registros de `templo-training` (7 wrappers `fp` + 5 registros directos) envueltos con `moduleScope(app, "templo-training", ...)`. `checkInRosterRoutes` NO se envuelve (tenant-scoped, comparte prefijo con `checkInAdminRoutes` pero es otro registro). `src/plugins/*.ts` sin tocar.
- `test/tenancy/mod-01-guard.test.ts`: 5 casos contra `GET /api/tree-progress/me` (un `fp`, cubre también la trampa de encapsulación) — OFF → 404 exacto, contraste (el 404 desaparece al prender el flag), ON → El Templo intacto, guard después de `authenticate` (401 sin token), apagar el módulo de El Templo lo apaga de verdad. 5/5 verde contra MySQL real.

## Task Commits

1. **Task 1: module-registry.ts** — `0349604b` (feat)
2. **Task 2: envolver los 12 registros en app.ts** (+ fix Pitfall 6 en module-registry.ts) — `991660a3` (feat)
3. **Task 3: mod-01-guard.test.ts** (+ fixes Pitfall 7 en module-registry.ts + fixture second-tenant.ts) — `7ca09c06` (test)

## Verificación final (las 7 del prompt)

1. `pnpm exec tsc --noEmit` → exit 0.
2. `pnpm exec vitest run --no-file-parallelism test/tenancy/mod-01-guard.test.ts --hookTimeout=250000` → **5/5 verde**.
3. `pnpm exec vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000` → **11/11 verde**, `ENTRADAS_BASELINE = 370` sin moverse (corrido 3 veces durante la ejecución, siempre verde).
4. `pnpm exec vitest run test/tenancy/mod-01-flags.test.ts --hookTimeout=250000` → **5/5 verde** (sin contaminación de cache entre archivos, corrido después de todos los cambios).
5. `git -C /home/franco/projects/et-176/el-templo-api diff --stat -- src/plugins/` → **vacío**.
6. Acceptance criteria grep-ables — todos verificados tras el estado final:
   - `module-registry.ts`: `addHook("onRequest"` = 0, `addHook("onRoute"` = 1, `code(404)` presente (2 matches: docblock + código), `403` = 0, `attachScope|attachCountryScope` = 0, `export function moduleGuardOf` presente.
   - `app.ts`: `moduleScope(app, "templo-training"` = **12**, `checkInRosterRoutes` sigue siendo `app.register` directo.
   - `mod-01-guard.test.ts`: 5 `it()`.
7. `git status --porcelain` limpio tras cada commit. `git diff --stat 2a4f5c92..HEAD` sobre `el-templo-api/src` y `el-templo-api/test` suma exactamente los archivos de 176-01 (`modules.ts`, `module-flags.ts`, migración 0207, fixtures/tests de flags), los 2 goldens de pricing ya commiteados antes de que arrancara esta ejecución (fuera de alcance de este plan), y los 4 archivos de este plan (`module-registry.ts`, `app.ts`, `mod-01-guard.test.ts`, `second-tenant.ts`).

## Alcance real de la rama (3) de `resolveTenantForGuard` — precisión pedida

`resolveTenantForGuard` tiene tres ramas: (1) `request.scope?.tenantId` si ya está resuelto por un hook de instancia; (2) `request.user?.userId` presente pero sin scope todavía → `SELECT users.tenant_id` mínimo; (3) `DEFAULT_PUBLIC_TENANT_ID` (= 1).

La rama (3) cubre **35 rutas de marketing**, no solo las rutas públicas sin autenticación. De esas 35: las de blog/academy/franchise/app-landing sin `request.user` caen ahí por ausencia real de usuario — pero las **16 rutas admin de blog** también caen en (3), porque autentican con `{ preHandler: [fastify.authenticate] }` **por-ruta**, y `preHandler` corre DESPUÉS de `onRequest` (donde vive el guard): en el momento en que `requireModule` se ejecuta, `request.user` todavía no existe para esas 16 rutas tampoco, exactamente igual que para las rutas verdaderamente públicas. O sea: **35 rutas resuelven siempre tenant 1, estén o no autenticadas** — más amplio que lo que D-06 enuncia textualmente ("las públicas"). Con un solo tenant real (El Templo) esto es indistinguible; en un escenario multi-tenant, las 16 rutas admin de blog consultarían el flag del tenant equivocado (deuda consciente, aceptada por decisión explícita del plan — moverlas de `preHandler` a `onRequest` tocaría una superficie que nadie pidió tocar). Documentado con esta precisión también en el docblock de `module-registry.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, Pitfall 6 nuevo] `moduleScope` rompía la dependencia nombrada `sessions-plugin -> spom-plugin`**

- **Found during:** Task 2, primera corrida de `iso-01-manifiesto.test.ts` tras envolver los 12 registros — el boot de la app tiraba `AssertionError: The dependency 'spom-plugin' of plugin 'sessions-plugin' is not registered`.
- **Root cause (verificado con un script standalone reproduciendo el escenario mínimo, node -e sobre fastify 5.7.4 + fastify-plugin 5.1.0 reales del proyecto):** antes de este plan, los 7 `fp(...)` de training se registraban directo sobre `app`, compartiendo el mismo array interno de avvio (`Symbol.for("registered-plugin")`) — así `sessions-plugin` podía ver que `spom-plugin` ya estaba registrado. `moduleScope` envuelve cada uno en su PROPIO `app.register(async (scoped) => {...})` (necesario para no derramar el guard, Pitfall 3 del RESEARCH) — y avvio clona ese array (`Object.create`) al crear cada scope nuevo, así que el nombre que `spom-plugin` registra queda solo en la copia de SU scope, invisible para el scope de `sessions-plugin`.
- **Fix:** después de `await scoped.register(plugin, opts)` dentro de `moduleScope`, se lee la metadata fastify-plugin del `plugin` recién registrado (`Symbol.for("plugin-meta")`) y, si tiene nombre, se empuja manualmente al array REAL de `app` (`Symbol.for("registered-plugin")`) — los mismos símbolos globales que usan `fastify`/`fastify-plugin` internamente, no un import de su código privado. Reproducido el bug y verificado el fix con un script aislado antes de aplicarlo al código real.
- **Files modified:** `el-templo-api/src/modules/shared/module-registry.ts`.
- **Verification:** `iso-01-manifiesto.test.ts` 11/11 verde (el boot completo de la app, con los 370 registros, es justamente lo que este test ejercita).
- **Committed in:** `991660a3`.

**2. [Rule 1 - Bug, Pitfall 7 nuevo] El SELECT de `resolveTenantForGuard` violaba el sentinel de tenancy (CON-05) sobre `users`**

- **Found during:** Task 3, primera corrida de `mod-01-guard.test.ts` — la ruta devolvía 500 en vez de 404/200.
- **Root cause:** `users` está en `TENANT_STRICT_MODULES` (`src/db/tenant-tables.ts`, módulo `members`) — el sentinel de tenancy (`src/db/sentinel/install.ts`) hace `throw` en test/dev sobre cualquier query a una tabla strict cuyo texto SQL no mencione `tenant_id` en la zona de predicado (WHERE/JOIN, no la proyección). El SELECT original (`db.select({tenantId}).from(users).where(eq(users.id, userId)).limit(1)`, calcado del pseudocódigo del RESEARCH) no tiene `tenant_id` en el predicado — estructuralmente no puede tenerlo: es la query que DESCUBRE el tenant, el mismo motivo por el que el lookup inicial del helper de scope de país/tenant (`country-scope.ts`) tampoco filtra por tenant (ese pasa el sentinel de pura casualidad, porque su `LEFT JOIN ... ON users.tenant_id = tenants.id` menciona `tenant_id` en la condición del join, no porque esté realmente filtrando).
- **Fix:** reescrito con `db.execute(sql\`/_ tenant-safe: <motivo> _/ SELECT tenant_id AS tenantId FROM users WHERE id = ${{userId}} LIMIT 1\`)`. La anotación de exención tiene que viajar EN EL TEXTO SQL (el canal del sentinel, `src/db/sentinel/analyze.ts`§"LOS DOS CANALES DE EXENCIÓN") — un comentario TS no alcanza. Efecto colateral encontrado y corregido en el mismo fix: ese camino de`drizzle-orm/mysql2`(sin`fields`/`customResultMapper`, el caso de un `sql` crudo) devuelve en RUNTIME el tuple crudo de mysql2 (`[filas, metadata]`) SIN desenvolver — verificado leyendo `drizzle-orm/mysql2/session.js` — así que hace falta doble destructuring (`const [rows] = await db.execute(...); const [row] = rows;`, con un cast documentado — no `any`— porque el tipo de`db.execute()`para el driver mysql2 está fijo en`[ResultSetHeader, FieldPacket[]]` independientemente del genérico).
- **Files modified:** `el-templo-api/src/modules/shared/module-registry.ts`.
- **Verification:** `mod-01-guard.test.ts` 5/5 verde; `tsc --noEmit` limpio.
- **Committed in:** `7ca09c06`.

**3. [Rule 3 - Blocking] `limpiarSegundoGimnasio` no borraba `tenant_settings` del gimnasio 2**

- **Found during:** Task 3, `afterEach`/`afterAll` del test nuevo — `DELETE FROM tenants WHERE id = 90671` reventaba con `ER_ROW_IS_REFERENCED_2 (fk_tenant_settings_tenant)`.
- **Root cause:** `test/fixtures/second-tenant.ts` es anterior a la fase 176 (fase 171) — nunca anticipó que un test pudiera sembrar filas `tenant_settings` para `TENANT_DOS` vía `setModuleFlag` (176-01). `mod-01-guard.test.ts` es el primer archivo que combina `seedSecondTenant` + `setModuleFlag(app, TENANT_DOS, ...)`, y `tenant_settings` no está en `TABLES_TO_CLEAN` (igual que `cash_registers`/`audit_log`, que ya tenían su propio DELETE defensivo en este mismo archivo por el mismo motivo).
- **Fix:** agregado un `DELETE FROM tenant_settings WHERE tenant_id = ${{TENANT_DOS}}` en `limpiarSegundoGimnasio`, mismo patrón/estilo que los DELETE defensivos existentes de `cash_registers`/`audit_log`, documentado con la misma convención de comentario.
- **Files modified:** `el-templo-api/test/fixtures/second-tenant.ts` (archivo compartido, fuera de la lista `<files>` original del plan — modificado porque bloqueaba directamente la Task 3 y es un fixture, no código de producto).
- **Verification:** `mod-01-guard.test.ts` corre completo (`beforeEach`/`afterEach`/`afterAll`) sin errores de FK; `git status --porcelain` limpio al terminar.
- **Committed in:** `7ca09c06`.

---

**Total deviations:** 3, todas Rule 1/3 (auto-fix, sin necesidad de decisión del usuario). Ninguna es Rule 4 (arquitectural): las tres son correcciones acotadas al mecanismo (`moduleScope`, `resolveTenantForGuard`, el fixture de limpieza) que no cambian ninguna decisión `decisions_locked` del plan — la técnica del guard, la respuesta 404, y las tres ramas de `resolveTenantForGuard` quedaron exactamente como las fijó el plan.

**Impact on plan:** Los tres fixes eran imprescindibles para que Task 2 y Task 3 pasaran sus propios gates (`iso-01-manifiesto.test.ts` y `mod-01-guard.test.ts` respectivamente). Ninguno estaba anticipado por el RESEARCH — el script de verificación empírica del RESEARCH usaba rutas de prueba sintéticas sin dependencias nombradas entre `fp(...)` ni tablas strict involucradas, así que no podía haberlos encontrado. Quedan documentados en el docblock de `module-registry.ts` como "Pitfall 6" y "Pitfall 7" para que la fase 176-04 (registry de hooks, que también va a tocar plugins/tablas strict) los tenga presentes.

## Issues Encountered

Ninguno más allá de lo documentado en Deviations. Depuración incluyó dos scripts standalone (`node -e`/`tsx`) para reproducir y verificar los fixes de los Pitfalls 6 y 7 ANTES de tocar el código real — ninguno quedó en el repo (borrados tras confirmar).

## User Setup Required

None — sin variables de entorno nuevas, sin dependencias nuevas, sin migraciones nuevas en este plan (usa la 0207 de 176-01, ya aplicada).

## Next Phase Readiness

- `requireModule`/`moduleScope`/`moduleGuardOf` listos para que el plan 176-04 (registry de hooks) y el resto de los registros `templo-module` (marketing, onboarding, gamification) los reusen.
- El gate de cobertura del plan 176-05 (sexto test de `iso-01-manifiesto.test.ts`, "toda ruta templo-module lleva `requireModule` de SU módulo") puede apoyarse en `moduleGuardOf` tal cual quedó exportado — no necesita re-implementar la lectura de `route.onRequest`.
- Pitfall 6 (propagación de nombres fastify-plugin entre scopes de `moduleScope`) y Pitfall 7 (sentinel de tenancy sobre `users`) quedan documentados en el docblock de `module-registry.ts` para que 176-04/176-05 no los redescubran desde cero si tocan más plugins `fp` con dependencias nombradas o más tablas strict.
- Worktree `et-176` limpio (`git status --porcelain` vacío), rama `feat/176-modulos`, 3 commits nuevos sobre `853907e8` (`0349604b`, `991660a3`, `7ca09c06`).

---

_Phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo_
_Completed: 2026-08-21_

## Self-Check: PASSED

Verificado en disco:

- `el-templo-api/src/modules/shared/module-registry.ts` existe.
- `el-templo-api/test/tenancy/mod-01-guard.test.ts` existe.
- `el-templo-api/src/app.ts` y `el-templo-api/test/fixtures/second-tenant.ts` modificados.
- Los 3 commits (`0349604b`, `991660a3`, `7ca09c06`) existen en `git log --oneline --all` del worktree `et-176`.
- `git -C /home/franco/projects/et-176 status --porcelain` vacío.
  Sin items faltantes.
