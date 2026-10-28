---
phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo
plan: 05
subsystem: api
tags: [fastify, vitest, feature-flags, multi-tenancy, ci-gate]

# Dependency graph
requires:
  - "requireModule/moduleScope/moduleGuardOf (176-03, src/modules/shared/module-registry.ts)"
  - "19 llamadas a moduleScope en runtime, 141/141 rutas templo-module cubiertas (176-03 + 176-04)"
  - "MODULE_NAMES / ModuleName (176-01, src/modules/shared/modules.ts)"
provides:
  - "Gate ISO-01 bidireccional del mecanismo de módulos: test 6 (cobertura, 141/141) + test 7 (contención, guard no se derrama)"
  - "test/tenant-manifest.ts importa MODULE_NAMES de src/ — los 4 nombres de módulo se declaran una sola vez en todo el repo"
  - "POST /api/admin/users/:userId/program-addons reclasificada templo-module/templo-training en el manifiesto (bug de clasificación de la fase 171, encontrado por el test 7)"
affects:
  [
    "176-06 (registry de hooks) — puede apoyarse en el gate ya bidireccional",
    "cualquier plan futuro que agregue una ruta templo-module sin guard o derrame un guard fuera de templo-module",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "beforeAll guarda la REFERENCIA a cada RouteOptions (no serializa en el acto) y lee moduleGuardOf() sobre esas referencias DESPUÉS de createTestApp() (post-ready), porque el onRoute de la raíz corre antes que el onRoute de scope que moduleScope cuelga"
    - "El gate lee la marca de módulo con moduleGuardOf importado de src/ — nunca una re-implementación local de la lectura de route.onRequest (grep temploModule = 0 en el test)"

key-files:
  created: []
  modified:
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts

key-decisions:
  - "ENTRADAS_BASELINE se mantuvo en 370 (no se movió): la fase no agrega ni borra rutas, solo agrega tests y una recategorización (que por diseño del propio archivo no mueve el total)"
  - "MODULOS_TEMPLO en tenant-manifest.ts pasó a ser un alias local de MODULE_NAMES (import de src/) en vez de una lista duplicada, para no tocar el resto del archivo que ya consumía ese identificador"
  - "Deviation (Rule 1 - bug encontrado por el test 7 al escribirlo): POST /api/admin/users/:userId/program-addons estaba clasificada tenant-scoped en el manifiesto pero se registra dentro de programRoutes, la MISMA fábrica de plugin que sus 15 hermanos templo-training, ya envuelta entera con moduleScope desde 176-03 — el guard ya corría ahí desde esa fase, lo desactualizado era el manifiesto. Reclasificada a templo-module/templo-training con el mismo criterio (doc 04 §2.1) ya aplicado a sus hermanos (D-04 veredicto caso 9). Recategorización, no ruta nueva: ENTRADAS_BASELINE no se movió."

requirements-completed: [MOD-01]

# Metrics
duration: ~2h
completed: 2026-08-21
---

# Phase 176 Plan 05: Gate ISO-01 bidireccional (cobertura + contención) Summary

**El gate fail-closed `iso-01-manifiesto.test.ts` pasa de 5 a 7 tests: el sexto afirma que las 141 rutas `templo-module` llevan el guard de SU módulo (cobertura), el séptimo afirma que ninguna ruta NO-templo lleva guard (contención) — y este último, al escribirse, encontró y corrigió un bug real de clasificación de la fase 171 que llevaba viviendo sin que nadie lo notara desde 176-03.**

## Performance

- **Duration:** ~2h (incluye ~40 min perdidos en un flake de infraestructura compartida: otro worktree corriendo tests en paralelo sobre el mismo MySQL colisionó con `eltemplo_test_1`, el nombre de DB por-worker — ver "Issues Encountered")
- **Started:** 2026-08-21, HEAD `e93a8de7` (176-01..04 ya commiteados)
- **Completed:** 2026-08-21
- **Tasks:** 3/3
- **Files modified:** 2 (`test/tenant-manifest.ts`, `test/tenancy/iso-01-manifiesto.test.ts`) — `src/` sin tocar, como pide el plan

## Accomplishments

- **Task 1** — `test/tenant-manifest.ts` invierte la duplicación: `MODULOS_TEMPLO` deja de ser una lista propia y pasa a ser un alias local de `MODULE_NAMES`, importado de `src/modules/shared/modules.ts` (fuente única, 176-01). Docblock actualizado: ya no afirma "TypeScript puro sin un solo import".
- **Task 2** — El `beforeAll` único del archivo se extiende (no se duplica) para guardar la referencia a cada `RouteOptions` observado por el `onRoute` de la raíz, y construir `guardsPorRuta: Map<string, ModuleName>` leyendo `moduleGuardOf(route)` sobre esas referencias DESPUÉS de que `createTestApp()` resolvió (post-`ready()`) — el hook de scope que `moduleScope` cuelga corre después del de la raíz, así que serializar en el acto no vería el guard. Sexto test: cobertura 141/141, `sinGuard=[]` y `moduloCruzado=[]`.
- **Task 3** — Séptimo test: contención, `derramadas=[]`. Demostrado con la prueba negativa manual obligatoria (ver abajo). En el camino, el test encontró una entrada mal clasificada en el manifiesto (`POST /api/admin/users/:userId/program-addons`) que hacía que `derramadas` NO estuviera vacío contra el estado real del código — corregida (ver Deviations).
- Docblock de cabecera del gate actualizado: la enumeración "LO QUE SE AFIRMA" pasa de 5 a 7 puntos; las dos menciones a "la fase 176 va a LEER esa etiqueta" pasan a presente ("la fase 176 LEE esa etiqueta").

## Task Commits

1. **Task 1: tenant-manifest.ts importa MODULE_NAMES de src/** — `dcdce896` (test)
2. **Task 2: beforeAll extendido + sexto test (cobertura 141/141)** — `9a336d09` (test)
3. **Task 3: séptimo test (contención) + fix de clasificación del manifiesto** — `4fed533b` (test)

## Verificación final (las 6 del prompt)

1. `pnpm exec tsc --noEmit` → exit 0.
2. `pnpm exec vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000` → **13/13 verde** (11 originales + test 6 + test 7), `ENTRADAS_BASELINE = 370` sin moverse.
3. `pnpm exec vitest run test/tenancy/mod-01-guard.test.ts test/tenancy/mod-01-flags.test.ts --hookTimeout=250000` → **16/16 verde** (11 de mod-01-guard + 5 de mod-01-flags), corridos junto con iso-01 en la verificación combinada: **29/29 verde en total** (3 archivos).
4. `git -C /home/franco/projects/et-176 diff --stat -- el-templo-api/src/` → **VACÍO** (sin output, exit 0) — confirmado DESPUÉS de revertir la prueba negativa de la Task 3.
5. Grep-ables:
   - `grep -n 'from "../src/modules/shared/modules"' test/tenant-manifest.ts` → matchea, línea 145.
   - `grep -c 'const MODULOS_TEMPLO = \[' test/tenant-manifest.ts` → 0.
   - `grep -n "sin un solo import" test/tenant-manifest.ts` → sin matches.
   - `grep -c "moduleGuardOf" test/tenancy/iso-01-manifiesto.test.ts` → 4 (import + 3 usos/comentarios de código, ninguno re-implementa la lectura).
   - `grep -c "temploModule" test/tenancy/iso-01-manifiesto.test.ts` → 0 (sin re-implementación local de la marca).
6. `git status --porcelain` limpio tras cada commit. `git diff --stat e93a8de7..HEAD` sobre el worktree completo suma EXACTAMENTE los 2 archivos del plan: `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` (159 líneas, +154/-5 acumulado en los 2 commits que lo tocan) y `el-templo-api/test/tenant-manifest.ts` (61 líneas, +51/-12 acumulado en los 2 commits que lo tocan).

## Prueba negativa del test 7 (Task 3, obligatoria) — salida ROJA textual

Se envolvió temporalmente `checkInRosterRoutes` con `moduleScope(app, "templo-training", checkInRosterRoutes, { prefix: "/api/admin/check-ins" })` en `src/app.ts` (reemplazando el `app.register` directo), se corrió el gate, y se confirmó el rojo nombrando exactamente la ruta esperada:

```
 ❯ test/tenancy/iso-01-manifiesto.test.ts (13 tests | 1 failed)
   ✓ toda ruta registrada por el app tiene entrada en el manifiesto
   ✓ toda entrada del manifiesto corresponde a una ruta que existe (atrapa typos, renames y rutas borradas)
   ✓ todo HEAD observado se explica por un GET hermano (un HEAD declarado a mano no se cuela)
   ✓ el manifiesto tiene exactamente las 370 entradas del baseline
   ✓ toda entrada del manifiesto real tiene la forma exigida (D-02 motivo, D-07 módulo, categoría válida)
   ✓ toda ruta templo-module del manifiesto lleva requireModule de SU módulo
   × ninguna ruta NO-templo lleva requireModule (el guard no se derrama)
   ✓ un HEAD manual junto a un GET con exposeHeadRoute: false va al manifiesto, no al filtro (WR-03)
   ...

 FAIL  test/tenancy/iso-01-manifiesto.test.ts > manifiesto de rutas — contra el app real (ISO-01) > ninguna ruta NO-templo lleva requireModule (el guard no se derrama)
AssertionError: Rutas NO "templo-module" que sin embargo llevan un guard requireModule: GET /api/admin/check-ins/roster (guard=templo-training, categoria=tenant-scoped). QUÉ HACER: revisá el moduleScope más cercano en src/app.ts o src/modules-boot.ts. Sospechoso #1: un addHook colgado dentro del cuerpo de un fp(...) — fastify-plugin desencapsula ese hook hasta la raíz de la app, así que cualquier ruta registrada después queda marcada. Sospechoso #2: envolver checkInRosterRoutes (tenant-scoped) junto con checkInAdminRoutes (templo-training) porque comparten el prefijo /api/admin/check-ins — son DOS registros distintos, solo el segundo va con moduleScope. POR QUÉ IMPORTA: un guard derramado devuelve 404 en TODA la API en cuanto un tenant apaga cualquier módulo, y el test de cobertura de arriba pasaría igual en verde — este es el lado del gate que caza el modo de falla más caro de la fase 176.: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "GET /api/admin/check-ins/roster (guard=templo-training, categoria=tenant-scoped)",
+ ]

 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```

El cambio en `src/app.ts` fue revertido inmediatamente después de confirmar el rojo. Verificado: `git -C /home/franco/projects/et-176 diff --stat -- el-templo-api/src/` no produce output (diff vacío) — la prueba negativa no dejó rastro en `src/`, y el archivo de test volvió a estar 13/13 verde tras el revert (ver punto 2 de la verificación final).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, encontrado por el test 7 al escribirlo] `POST /api/admin/users/:userId/program-addons` mal clasificada como `tenant-scoped`**

- **Found during:** Task 3, primera corrida verde del test 7 contra el estado real del código (sin ninguna prueba negativa de por medio — este era el estado NORMAL del repo).
- **Issue:** `derramadas` no estaba vacío: `POST /api/admin/users/:userId/program-addons (guard=templo-training, categoria=tenant-scoped)`. La ruta lleva el guard `requireModule("templo-training", ...)` en runtime porque se registra dentro de `programRoutes` (`src/modules/programs/routes.ts`), y `programRoutes` está envuelto ENTERO con `moduleScope(app, "templo-training", programRoutes, { prefix: "/api" })` desde el plan 176-03 (junto con sus otros 15 endpoints hermanos, todos ya clasificados `templo-module`/`templo-training` en el manifiesto). El manifiesto, sin embargo, seguía clasificando esta UNA ruta `tenant-scoped`, filed bajo la sección alfabética `/api/admin/users` en vez de junto a sus hermanos en el bloque "templo-training · programs".
- **Root cause:** desliz de la clasificación manual de la fase 171 (370 entradas a mano, D-01 sin reglas de prefijo — precisamente el tipo de error que el propio archivo dice que puede pasar). El endpoint asigna un "program add-on" (`EnrollmentService.enrollAddon`, fase 112 D-10) — inscripción a un PROGRAMA de entrenamiento, el mismo concepto que sus 15 hermanos (`/api/admin/programs/*`, `/api/members/programs/*`, `/api/members/me/current-program`), cuyo veredicto D-04 (caso 9, checkpoint 171-06) ya cita el doc 04 §2.1: "programs" es `templo-training`. No es un bug de código: el guard de `requireModule` YA estaba corriendo correctamente en esta ruta desde 176-03 — lo que estaba desactualizado era el dato del manifiesto.
- **Fix:** reclasificada `POST /api/admin/users/:userId/program-addons` de `tenant-scoped` a `templo-module`/`templo-training` en `test/tenant-manifest.ts`, movida del bloque alfabético `/api/admin/users` al bloque "templo-training · programs" junto a sus 15 hermanos, con un comentario largo explicando la causa y citando el precedente D-04 caso 9. Es una RECATEGORIZACIÓN, no una ruta nueva: `ENTRADAS_BASELINE` (370) no se movió — consistente con la regla explícita del propio archivo ("recategorizar una ruta no lo pone rojo... el TOTAL tampoco se mueve").
- **Files modified:** `el-templo-api/test/tenant-manifest.ts`.
- **Verification:** el test 5 (forma, D-07 módulo obligatorio) y el test 7 (contención) ambos verdes tras el fix; `ENTRADAS_BASELINE = 370` confirmado sin cambios en el test 4.
- **Committed in:** `4fed533b` (junto con el séptimo test, Task 3).

**Nota sobre el alcance de este hallazgo:** no se auditó el resto de las 370 entradas buscando otros posibles deslices similares — el gate de contención (test 7) es exactamente el mecanismo que atrapa esta clase de error hacia adelante, y de hecho lo atrapó en su primera corrida. Si existiera otra entrada mal clasificada del mismo tipo, el test 7 la habría nombrado también; no lo hizo, así que no hay evidencia de más casos.

---

**Total deviations:** 1, Rule 1 (auto-fix, sin necesidad de decisión del usuario — no cambia ninguna decisión `decisions_locked` del plan, no mueve `ENTRADAS_BASELINE`, sigue el precedente literal ya escrito en el archivo para exactamente este tipo de corrección).

**Impact on plan:** Ninguno en el mecanismo del gate. El fix fue imprescindible para que la Task 3 pasara su propio criterio de aceptación (`derramadas = []` contra el estado real del código, sin ninguna prueba negativa de por medio).

## Issues Encountered

**Flake de infraestructura compartida (no relacionado con el código de este plan):** durante la Task 2, varias corridas de `iso-01-manifiesto.test.ts` fallaron con `Unknown database 'eltemplo_test_1'` o `Unknown column 'description' in 'field list'`. Investigado: otro worktree (`et-analytics-scope`) estaba corriendo su propia suite de tests en paralelo contra el mismo MySQL compartido. `test/setup.ts` deriva el nombre de la DB por-worker de `VITEST_POOL_ID`, que cae en `"1"` para corridas de un solo archivo — así que dos worktrees corriendo tests de un solo archivo al mismo tiempo colisionan sobre el mismo nombre `eltemplo_test_1`, y el `globalSetup` de cualquiera de los dos que arranca dropea las DBs `eltemplo_test_*` del otro a mitad de su provisioning. Confirmado con `ps aux | grep vitest` en el momento de la falla. No es un bug de este plan ni de la fase 176: es una limitación conocida del entorno local con múltiples worktrees activos (ver memoria del proyecto, "Flake local: test_db_flake_worker_envenenada"). Mitigado reintentando cuando el proceso ajeno terminó (confirmado con `ps aux`) — no se tocó `test/setup.ts` ni ningún mecanismo de aislamiento de DB, fuera del alcance de este plan.

## User Setup Required

None — sin variables de entorno nuevas, sin dependencias nuevas, sin migraciones nuevas en este plan.

## Next Phase Readiness

- El gate ISO-01 es bidireccional (cobertura + contención) para las 141 rutas `templo-module`: cualquier plan futuro (176-06 en adelante) que agregue una ruta a un módulo Templo sin `moduleScope`, o derrame un guard fuera de su scope, lo va a ver rojo en `iso-01-manifiesto.test.ts` con el mensaje exacto de qué revisar.
- `MODULE_NAMES` es la única declaración de los 4 nombres de módulo en todo el repo — un typo en un nombre de módulo deja de ser posible.
- Worktree `et-176` limpio (`git status --porcelain` vacío), rama `feat/176-modulos`, 3 commits nuevos sobre `e93a8de7` (`dcdce896`, `9a336d09`, `4fed533b`).
- Sin bloqueadores para 176-06.

---

_Phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo_
_Completed: 2026-08-21_

## Self-Check: PASSED

Verificado en disco:

- `el-templo-api/test/tenant-manifest.ts` modificado (confirmado con `git diff --stat`).
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` modificado (confirmado con `git diff --stat`).
- Los 3 commits (`dcdce896`, `9a336d09`, `4fed533b`) existen en `git log --oneline e93a8de7..HEAD` del worktree `et-176`.
- `git -C /home/franco/projects/et-176 status --porcelain` vacío.
- `git -C /home/franco/projects/et-176 diff --stat -- el-templo-api/src/` vacío (sin output).
  Sin items faltantes.
