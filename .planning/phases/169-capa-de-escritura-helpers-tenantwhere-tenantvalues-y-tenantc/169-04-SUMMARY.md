---
phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
plan: 04
subsystem: backend
tags:
  [
    multi-tenancy,
    crons,
    sweep-por-tenant,
    gate-fail-closed,
    vitest,
    spy-de-service,
    mysql,
  ]

# Dependency graph
requires:
  - plan: 169-01
    provides: "forEachActiveTenant + listActiveTenants (comparación positiva contra 'active') y el patrón de segundo tenant ad-hoc con afterEach incondicional"
  - plan: 169-02
    provides: "expire-lost-leads con sweep y su tipo de retorno público intacto ({ expired, skippedManual })"
  - plan: 169-03
    provides: "runAutoApprove(db) extraída — antes no existía función pura que invocar, el job era intesteable"
provides:
  - "test/tenancy/con-04-crons-per-tenant.test.ts: el criterio 3 del ROADMAP probado sobre CRONS REALES (2 tenants activos = 2 vueltas, suspended/archived = 1) y D-03 sobre un job real"
  - "Gate fail-closed de cobertura de D-01: un job nuevo en src/jobs/ sin forEachActiveTenant deja la suite en rojo, con los incumplidores enumerados por nombre"
  - "El patrón 'spy sobre el método del service' para contar vueltas del sweep sin mockear el sweep (los jobs instancian sus services dentro del cuerpo por tenant)"
  - "src/index.ts documenta que la lista de gimnasios activos se resuelve POR CORRIDA y no en el boot"
affects:
  - "169-05..169-09 (el gate ya está puesto: cualquier job que agreguen tiene que pasar por el sweep o declarar su exención con motivo)"
  - "171 (ISO-03: el archivo respeta la declaración de alcance — no adelanta las fixtures 2-tenant ni toca test/helpers.ts)"
  - "172-175 (cuando los services reciban el ctx, el spy de este archivo sigue valiendo: corta donde empieza la lógica de negocio)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Contar vueltas del sweep espiando el MÉTODO DEL SERVICE, no mockeando forEachActiveTenant: el camino real (listActiveTenants contra MySQL + loop + try/catch) queda vivo de punta a punta"
    - "Aserción EXACTA (toHaveBeenCalledTimes) y no 'al menos': el punto del test es distinguir 2 de 1"
    - "Gate de inventario por lista exhaustiva (no sólo por conteo): un rename también lo rompe, y el mensaje muestra esperados vs encontrados"
    - "Filtro de líneas de comentario ANTES de grepear el fuente: sin él, la prosa de un docblock satisface el gate en un job que no llama al sweep"
    - "Exenciones como mapa nombre→motivo (JOBS_EXENTOS), nunca un skip: la única forma de eximir un job es escribir por qué"

key-files:
  created:
    - el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts
  modified:
    - el-templo-api/src/index.ts

key-decisions:
  - "El gate compara la lista COMPLETA de archivos de src/jobs/ contra JOBS_ESPERADOS, no sólo el conteo: un rename mantiene el 7 y pasaría desapercibido, y el mensaje del expect enumera esperados y encontrados"
  - "El segundo job del archivo (runExpireLostLeads) corre SIN spy contra MySQL real: prueba que un cuerpo con `sql` crudo sobrevive al sweep con dos tenants y conserva su tipo de retorno, cosa que un spy no podría demostrar"
  - "El test de aislamiento de errores usa mockResolvedValueOnce({approved:3}) + mockRejectedValueOnce y afirma que el acumulador devuelve 3: prueba a la vez que el gimnasio sano se procesó Y que su resultado no se perdió cuando el otro explotó"
  - "vi.restoreAllMocks() va en beforeEach Y en afterEach (además del afterAll): con isolate:false un spy sobre AdminSessionService.prototype que se filtre contamina cualquier archivo siguiente del worker"
  - "El archivo NO usa cleanAllTestData: es admin-global y no está scopeada por tenant (warning heredado del 168-REVIEW), así que borraría el segundo gimnasio del que dependen estos tests"

metrics:
  duration: "~15min"
  completed: 2026-07-28
---

# Phase 169 Plan 04: Criterio 3 sobre crons reales + gate fail-closed de los 7 jobs Summary

El criterio 3 del ROADMAP deja de ser una propiedad del helper y pasa a estar probado sobre crons reales — dos gimnasios activos, dos vueltas; suspendido o archivado, una — y un gate fail-closed convierte D-01 ("ningún cron queda para acordarse después") de hecho en invariante: un job nuevo sin sweep deja la suite en rojo con su nombre en el mensaje.

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files:** 1 creado, 1 modificado (solo comentario)
- **Tests:** 8 verdes (`test/tenancy/con-04-crons-per-tenant.test.ts`, 80,0 s)

## Tasks Completed

| Task | Nombre                                                | Commit     | Archivos                                                           |
| ---- | ----------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| 1    | Criterio 3 sobre crons reales                         | `3f69a1fe` | `test/tenancy/con-04-crons-per-tenant.test.ts` (nuevo, 259 líneas) |
| 2    | Gate fail-closed de los 7 jobs + comentario de índice | `d79d5569` | `test/tenancy/con-04-crons-per-tenant.test.ts`, `src/index.ts`     |

## Task 1 — los 5 tests de comportamiento (tenant `90269`)

| Test | Qué afirma                                                                              | Aserción                                                            |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1    | Dos gimnasios `active` → el cuerpo de `auto-approve` corre **dos** veces                | `toHaveBeenCalledTimes(2)` + retorno `{ approved: 0 }` intacto      |
| 2    | El 90269 en `suspended` → **una** vez (T-169-17)                                        | `toHaveBeenCalledTimes(1)`                                          |
| 3    | El 90269 en `archived` → **una** vez                                                    | `toHaveBeenCalledTimes(1)`                                          |
| 4    | El cuerpo falla en la 2ª vuelta → `runAutoApprove` **resuelve**, el 1er gimnasio corrió | 2 llamadas + `{ approved: 3 }` (el resultado del sano no se pierde) |
| 5    | `runExpireLostLeads` con dos activos, **sin spy**, contra MySQL                         | tipo de retorno `{ expired, skippedManual }` numérico, no lanza     |

**Por qué se espía el service y no el sweep (T-169-19).** Mockear `forEachActiveTenant` probaría el mock. El spy va sobre `AdminSessionService.prototype.autoApprovePendingSessions`, que el cuerpo por tenant invoca una vez por vuelta (los jobs instancian sus services **dentro** del cuerpo desde los planes 169-02/169-03). Así el camino real queda vivo de punta a punta: `listActiveTenants` consulta MySQL, el loop itera, el `try/catch` por iteración contiene. El corte está exactamente donde empezaría la lógica de negocio, que en esta fase no cambia (D-02). El motivo quedó escrito en el docblock del archivo.

**Evidencia de la corrida** (salida real: el `tenantId` es campo estructurado, y en el test 4 el error del 90269 se absorbe con `job` y `tenantId` mientras el tenant 1 ya había dejado sus 3):

```json
{"name":"auto-approve","tenantId":1,"approved":0,"msg":"Sin sesiones pendientes de auto-aprobar en un gimnasio"}
{"name":"auto-approve","tenantId":90269,"approved":0,"msg":"Sin sesiones pendientes de auto-aprobar en un gimnasio"}
{"name":"auto-approve","tenantId":1,"approved":3,"msg":"Sesiones auto-aprobadas para mañana en un gimnasio"}
{"level":50,"name":"auto-approve","tenantId":90269,"job":"auto-approve","msg":"Barrido por tenant fallo para un gimnasio; sigue con el siguiente"}
{"name":"expire-lost-leads","tenantId":1,"windowDays":14,"expired":0,"skippedManual":0,"msg":"Barrido de leads perdidos completado para un gimnasio"}
{"name":"expire-lost-leads","tenantId":90269,"windowDays":14,"expired":0,"skippedManual":0,"msg":"Barrido de leads perdidos completado para un gimnasio"}
```

Los tests 2 y 3 no producen ninguna línea con `tenantId: 90269` — que es la forma independiente de ver que el gimnasio no activo no se procesó.

**Higiene (T-169-20).** `beforeEach` restaura mocks y deja los dos gimnasios en `active`; `afterEach` **incondicional** restaura mocks y devuelve el tenant 1 a `active`; `afterAll` limpia el 90269 y cierra la app. El test 8 afirma que después de la limpieza `COUNT(*) WHERE id = 90269` da 0 y que el tenant 1 sigue en pie.

## Task 2 — el gate fail-closed (Tests 6 y 7) + `src/index.ts`

Un `describe` que **no toca la base**: lee `src/jobs/` con `fs.readdirSync` (path resuelto desde `__dirname`, no desde el cwd) y afirma dos cosas.

1. **Inventario exacto:** la lista ordenada de `.ts` debe ser exactamente los 7 jobs conocidos. Se compara la **lista completa** y no sólo el conteo, decisión deliberada: un rename mantiene el 7 y se colaría.
2. **Cobertura:** todo archivo cuyo contenido —descartadas las líneas de comentario— contenga `cron.schedule` debe contener también `forEachActiveTenant`, salvo que figure en `JOBS_EXENTOS` (mapa nombre→motivo, hoy vacío).

**El filtro de comentarios no es cosmético.** Los 7 jobs llevan un docblock que explica el barrido y nombra `forEachActiveTenant` en prosa. Sin el filtro, ese docblock alcanzaría para satisfacer el gate en un job que no llama al sweep — el test pasaría en verde probando la existencia de un comentario.

**Fail-closed verificado en vivo.** Se agregó temporalmente `src/jobs/__gate-probe.ts` (un `cron.schedule` pelado, sin sweep) y los **dos** gates cayeron enumerando al incumplidor por nombre:

```
AssertionError: El inventario de src/jobs/ cambió. Esperados (7): auto-approve.ts, … Encontrados (8): __gate-probe.ts, auto-approve.ts, …
AssertionError: Jobs con cron.schedule que NO llaman a forEachActiveTenant: __gate-probe.ts. Un cron sin barrido por gimnasio lee y escribe sin contexto de tenant y nadie se entera (D-01/T-169-18).
```

El archivo sonda se borró inmediatamente (`src/jobs/` verificado de vuelta en 7) y **nunca se commiteó**. Los dos mensajes dicen además qué hacer: envolver el cuerpo en el sweep, o —si es genuinamente global— anotarlo con `/* tenant-safe: <motivo> */` y sumarlo a `JOBS_EXENTOS` **con el motivo**. Nunca un `skip`: la lista de exenciones es documentación ejecutable, mismo criterio que la `TENANT_UNIQUE_ALLOWLIST` de la 168.

**`src/index.ts`: 10 líneas de comentario, 0 deleciones.** `git diff --numstat` del commit da `10 0`. Las 7 llamadas `startXJob(app.db)` están idénticas y sólo dos siguen siendo `async` (por el descubrimiento de timezones que ya hacían). El comentario nuevo dice, citando fase 169 y D-01, que la lista de gimnasios activos **no** se resuelve ahí: cada job la pide en **cada corrida** vía `forEachActiveTenant`, para que activar o suspender un gimnasio aplique en el tick siguiente sin reiniciar el proceso — mismo espíritu que "el tenant no viaja en el JWT" (`country-scope.ts:30-31`).

## Deviations from Plan

**Ninguna.** El plan se ejecutó como está escrito: el id de tenant, los seams espiados, los estados recorridos, la forma del gate y el alcance del cambio en `src/index.ts` salieron todos de `<interfaces>` sin ajustes.

Dos precisiones de ejecución, las dos dentro de lo que el plan dejaba a criterio:

- El gate de inventario compara la **lista completa** además del conteo (el plan pedía "exactamente 7"). Estrictamente más fuerte, mismo mensaje de error.
- `vi.restoreAllMocks()` se puso también en `beforeEach` y en `afterAll`, no sólo en el `afterEach` que pedía el plan. Con `isolate: false` un spy filtrado contamina archivos siguientes del worker, y restaurar de más no cuesta nada.

**Nota sobre el orden TDD:** Task 1 está marcada `tdd="true"` pero su artefacto **es** el test: la implementación que ejercita ya existía (planes 169-02 y 169-03), así que no hubo gate RED previo — igual que registró el plan 169-01. El RED real de este plan es el del gate, y se ejercitó a propósito con el archivo sonda de Task 2.

## Verificación

| Verificación                                                                                       | Resultado                                  |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `npx vitest run test/tenancy/con-04-crons-per-tenant.test.ts --no-file-parallelism`                | **8 passed** (80,0 s / 100,8 s en Task 1)  |
| `npx tsc --noEmit`                                                                                 | **exit 0** (después de cada task)          |
| `git diff --numstat` de `src/index.ts` en el commit                                                | `10 0` — sólo comentario, cero deleciones  |
| Las 7 llamadas `startXJob(app.db)` presentes e idénticas                                           | OK                                         |
| Gate roto a propósito (`src/jobs/__gate-probe.ts`) → los dos `expect` caen listando el incumplidor | OK, sonda borrada y no commiteada          |
| Cero `any` explícito / cero `console.*` en los 2 archivos                                          | OK                                         |
| `SELECT COUNT(*) FROM tenants WHERE id = 90269` en `eltemplo_test_1`                               | **0** (y el tenant 1 en `active`)          |
| `git status` del worktree tras cada commit                                                         | limpio (symlink de `node_modules` borrado) |
| `git diff --diff-filter=D` post-commit                                                             | sin borrados                               |

## Threat Model — dispositions cubiertas

| Threat   | Cómo quedó cubierto                                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-169-17 | Tests 2 y 3 con `toHaveBeenCalledTimes(1)` sobre `suspended` **y** `archived` — los dos estados no activos del enum, no sólo el feliz.                                            |
| T-169-18 | Gate fail-closed de inventario + cobertura, con filtro de comentarios para que la prosa no lo satisfaga. Probado rompiéndolo en vivo.                                             |
| T-169-19 | Se espía el método del service, no el sweep: `listActiveTenants`, el loop y el `try/catch` corren de verdad contra MySQL. El motivo está escrito en el docblock del archivo.      |
| T-169-20 | `afterEach` incondicional (tenant 1 a `active`) + `vi.restoreAllMocks()` en `beforeEach`/`afterEach`/`afterAll` + `afterAll` que borra el 90269. Verificado por SQL post-corrida. |
| T-169-SC | Cero dependencias nuevas, cero installs. `node_modules` por symlink al worktree 167, creado para typechequear/testear y borrado antes de cada commit.                             |

## Estado del worktree

`/home/franco/projects/et-169-tenant-layer`, rama `feat/169-capa-escritura`, 8 commits sobre `1200b8af`:

- `c21baefd`, `f6bc7ecc` — plan 169-01
- `0426d4de`, `bb85aa64` — plan 169-02
- `dbb89644`, `f3036876` — plan 169-03
- `3f69a1fe` — `test(169-04): criterio 3 sobre crons reales, 2 tenants = 2 vueltas`
- `d79d5569` — `test(169-04): gate fail-closed de cobertura de los 7 jobs`

Nada pusheado (staging-first: el rollout es del plan 169-09). El symlink de `node_modules` está **borrado**; recrearlo apuntando a `/home/franco/projects/et-167-columnas/el-templo-api/node_modules` antes de cualquier typecheck o corrida de tests, y volver a borrarlo antes de commitear. El checkout principal `/home/franco/projects/el-templo` no se tocó: sigue en `fix/referral-preview-y-refresh-ficha` con su working tree de código intacto.

## Requirements: CON-04 sigue **Pending** a propósito

El frontmatter declara `requirements: [CON-04]` y **no se marcó completo**. Con este plan los 7 crons están cubiertos **y probados**, pero CON-04 abarca todos los caminos sin request: faltan el webhook de Wellhub (169-05), los scripts CLI y `tv_pairings`. Marcarlo ahora sería un falso positivo que el verificador de fase tendría que revertir. Lo cierra el último plan de la fase, igual que decidieron el 169-01, el 169-02 y el 169-03.

## Known Stubs

Ninguno. El archivo no deja placeholders: `JOBS_EXENTOS` está vacío **a propósito** (hoy ningún job está exento) y su vacío es la aserción, no un TODO.

## Self-Check: PASSED

- `el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts` presente en el worktree.
- `el-templo-api/src/index.ts` modificado (solo comentario) y presente.
- Commits presentes en `git log --all`: `3f69a1fe`, `d79d5569`.
- `git status` del worktree: limpio.
