---
phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant
plan: 04
subsystem: testing
tags: [multi-tenancy, fixtures, test-helpers, tenantValues, ISO-02, retrocompatibilidad]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
    provides: "`tenantValues` / `TenantContext` de `src/modules/shared/tenant.ts`, y el precedente 169-06 (`tv-pairing-tenant.test.ts`) con el orden de FKs de la limpieza"
  - phase: 171-01
    provides: "`createTestApp(opts)` — el archivo `test/helpers.ts` que este plan vuelve a tocar"
provides:
  - "`createStaffUser(app, { …, tenantId? })` — default 1, los DOS inserts (users y user_branches) por `tenantValues`"
  - "`createTestMember(app, { …, tenantId? })` — default 1 por `/auth/register`; distinto de 1 por INSERT directo + `getAuthToken`"
  - "`test/fixtures/second-tenant.ts` — `seedSecondTenant` / `limpiarSegundoGimnasio` / `TENANT_DOS` (90671) / `SegundoGimnasio`"
affects:
  [
    171-05 (verifica por comportamiento que las filas nacen con tenant_id 90671 y que la limpieza no deja rastro),
    172-175 (toda batería de aislamiento se siembra con este fixture),
    169-06 (su workaround `UPDATE users SET tenant_id` queda obsoleto),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parámetro opcional con default que preserva byte a byte el camino previo (precedente `country?` de la Phase 110)"
    - "Fixture opt-in por archivo con limpieza local en orden de FK, en vez de ampliar la limpieza global"

key-files:
  created:
    - el-templo-api/test/fixtures/second-tenant.ts
  modified:
    - el-templo-api/test/helpers.ts

key-decisions:
  - "`createTestMember` bifurca por `tenantId` (Camino A del RESEARCH): con 1 o sin el override va por `/auth/register` como siempre; con otro gimnasio va por INSERT directo, porque la ruta no conoce el tenant hasta la fase 175"
  - "`tenantId` se saca del objeto ANTES de llamar a `registerUser`: la ruta no lo conoce y el payload del camino del tenant 1 tiene que llegar con las mismas claves que antes de la fase"
  - "El token del staff sale de un envoltorio de `getAuthToken` que agrega el gimnasio al mensaje del rojo — envoltorio, no reimplementación del login (DRY)"
  - "El fixture NO siembra `aura_config` (unique global de `source_type`) ni `cash_registers` (D-06 no lo pide; hay `ensureEfectivoCaja`)"
  - "`TABLES_TO_CLEAN` queda intacta: meter `branches` ahí rompe los 165 archivos que dependen de la sede semilla"

patterns-established:
  - "Fixture de gimnasio: constante de id exportada con la lista de ids tomados re-grepeada, `CTX` de módulo, `seed*` que arranca por su propio `limpiar*` (idempotente) y `limpiar*` con `WHERE tenant_id` en cada DELETE"

requirements-completed: []

# Metrics
duration: ~35min
completed: 2026-07-29
---

# Phase 171 Plan 04: Helpers con `tenantId` y fixture del segundo gimnasio Summary

**`createStaffUser` y `createTestMember` aceptan el gimnasio como parámetro con default 1 —los ~215 archivos que ya los llaman no cambiaron ni una línea— y `test/fixtures/second-tenant.ts` siembra el espejo mínimo de D-06 (gimnasio + sede + actividad + plan + horario + admin + coach + 2 socios, con tokens) y lo borra sin dejar rastro.**

## Performance

- **Duration:** ~35 min (2 corridas MySQL-backed de ~60-90 s cada una)
- **Completed:** 2026-07-29
- **Tasks:** 2/2
- **Files modified:** 1 creado, 1 modificado

## Accomplishments

- **Retrocompatibilidad literal, no prometida.** `git status --porcelain el-templo-api/test/` durante el task 1 listó **sólo** `helpers.ts`: cero archivos de test tocados. Los 13 tests de `test/tenancy/tenant-helpers.test.ts` (MySQL real) pasan en verde con los helpers modificados.
- **Los DOS inserts de `createStaffUser` pasan por `tenantValues`** — `users` y `user_branches`. El segundo es el que se olvida siempre: también es tabla gym-owned y sin la columna el coach del gimnasio 2 tendría su sede de trabajo registrada en El Templo.
- **El workaround del 169-06 quedó obsoleto y prohibido por escrito.** El único precedente del repo reasignaba el dueño del segundo gimnasio con un UPDATE crudo de `users.tenant_id` después del insert; el fixture nuevo no lo replica y su docblock dice por qué no puede volver.
- **`createTestMember` bifurca sin tocar el camino viejo.** Con `tenantId` ausente o 1 llama a `registerUser` exactamente como antes (el `tenantId` se saca del objeto antes de armar el payload, así la ruta recibe las mismas claves de siempre). Con otro gimnasio hace INSERT directo espejando las columnas que `register` escribe (`role: member`, `level: kairos`, `status: freemium`, `branch_source: manual`) y saca el token por login normal.
- **El fixture es idempotente por construcción:** `seedSecondTenant` arranca llamando a `limpiarSegundoGimnasio`, así que un `beforeEach` que lo invoque en cada test no choca con su propia PK (la de `tenants` es explícita, no autoincrement).
- **Los 7 DELETE de la limpieza llevan los 7 su filtro** (`tenant_id`, y `id` en el de `tenants`), en orden de FK con los checks ENCENDIDOS: schedules → subscription_plans → activities → user_branches → users → branches → tenants. Es lo que pide el Pitfall 11 para cuando `finance` entre a `TENANT_STRICT_MODULES` en la 172.
- **Cero `any`, cero `console.`, cero deps, cero migraciones, `test/setup.ts` sin una sola referencia al fixture** (D-05: la siembra es opt-in por archivo).

## Task Commits

1. **Task 1: `tenantId` opcional (default 1) en createStaffUser y createTestMember** — `5c873111` (feat)
2. **Task 2: `test/fixtures/second-tenant.ts` — espejo mínimo D-06 opt-in + limpieza** — `0f768c79` (feat)

## Files Created/Modified

- `el-templo-api/test/helpers.ts` — import directo de `tenantValues` (no está en el barrel, a propósito); `createStaffUser` con `tenantId?: number` y sus dos `.values()` envueltos; `createTestMember` con la bifurcación y el helper interno `crearSocioDeOtroGimnasio`; tres párrafos de docblock nuevos que explican la retrocompatibilidad y por qué el gimnasio 2 no puede ir por la API. `TABLES_TO_CLEAN` **sin cambios**.
- `el-templo-api/test/fixtures/second-tenant.ts` **(nuevo, 390 líneas)** — `TENANT_DOS = 90671`, `TENANT_TEMPLO`, `CTX`, `SocioDelGimnasioDos`, `SegundoGimnasio`, `seedSecondTenant`, `limpiarSegundoGimnasio` y el envoltorio interno `tokenDe`. Docblock de cabecera con `POR QUE EXISTE ESTE ARCHIVO`, `COMO SE USA` (con el `beforeEach`/`afterAll` completo), `QUE SIEMBRA`, `QUE NO SIEMBRA` y la sección de los emails.

## Decisions Made

- **`TENANT_DOS = 90671` re-grepeado antes de fijarlo**, como el plan exigía. Los ids ocupados en `test/` al 2026-07-29 son 90000-90006, 90123, 90168, 90169, 90269, 90369, 90418, 90469, 90569 y 90940. 90671 estaba libre y `grep -rl` confirma que el fixture es su único usuario.
- **`tokenDe` es un envoltorio de `getAuthToken`, no un login propio.** La primera versión reimplementaba el `app.inject` para poder nombrar el gimnasio en el error; se reescribió como `try/catch` alrededor del helper canónico (CLAUDE.md: "DRY, flag repetition aggressively"). Se conserva el valor real —un `Login failed for x@test.com` pelado, en una batería con dos gimnasios, manda a debuggear al lugar equivocado— sin duplicar el request.
- **Se exporta también `TENANT_TEMPLO = 1`.** El fixture nunca lo toca, pero los archivos que hagan opt-in van a comparar contra El Templo y así no queda un `1` mágico suelto en las aserciones (regla 5 de PATTERNS).
- **`dni` y `phone` del socio del gimnasio 2 se generan únicos.** La unique de `dni` ya es compuesta con el tenant desde la 168, pero el chequeo de teléfono duplicado de la Phase 111 sigue siendo global: un fixture del gimnasio 2 no puede bloquearle un registro al 1.
- **La consecuencia aceptada quedó escrita en el docblock:** el socio del gimnasio 2 no tiene los efectos colaterales de `register` (código de referido, `member_profiles`). D-06 no los pide, y la alternativa —registrar por API y reasignar— dejaría esas filas colaterales en el tenant 1, que es justo lo que las fases 172-175 van a auditar.

## Deviations from Plan

Ninguna deviation de las reglas 1-4. Dos ajustes de redacción para que los criterios de aceptación mecánicos del propio plan den el valor exacto que piden (mismo tipo de ajuste que registró el 171-01):

- El docblock decía dos veces `UPDATE users SET tenant_id` al citar el workaround prohibido, y el criterio pide que ese literal aparezca **0 veces** en el archivo. Reescrito como "un UPDATE crudo de `users.tenant_id`": mismo contenido, y ahora el grep mide lo que quiere medir (que el workaround no esté como código) en vez de contar la prosa que lo prohíbe.
- El docblock citaba el `DELETE FROM users WHERE NOT (email <=> 'admin@test.com')` de `cleanAllTestData` para explicar el orden de llamada, y eso hacía que `grep -c "DELETE FROM"` diera 8 contra 7 filtros. Reescrito como "un DELETE de `users` con `WHERE NOT (…)`". Ahora los conteos son 7 y 7 exactos.

**Total deviations:** 0 auto-fixes. **Impacto:** ninguno sobre el comportamiento; sólo redacción de comentarios.

## Issues Encountered

- **`test/helpers.ts` tiene un `TS2783` preexistente** (`'id' is specified more than once` en el `return { id: user.id, …, ...user }` de `createTestMember`, línea 389 en `HEAD` antes de este plan). No lo introdujo este plan, el valor resultante es idéntico y CI no typechequea `test/` (`tsconfig.json` incluye sólo `src/**`), así que queda **fuera de alcance** por la regla de scope. Anotado acá para que no se lea como regresión en el próximo `tsc` suelto.
- **`tsc` suelto sobre `test/` arrastra dos errores de `src/modules/campaigns/templates.ts`** (`mjml` sin tipos): también preexistentes, y sólo aparecen porque el `tsc` suelto no usa el `tsconfig.json` del proyecto.
- **Sonda descartable del fixture.** El plan deja la verificación por comportamiento para el 171-05, pero un fixture con un FK o un nombre de columna mal habría llegado roto a ese plan. Se escribió un archivo de test temporal (`test/tenancy/tmp-sonda-171-04.test.ts`), se corrió contra MySQL real y se **borró sin commitear**: verde en 83 s afirmando 1 sede, 1 actividad, 1 plan, 1 horario, 4 users y 1 `user_branches` con `tenant_id = 90671`, los 4 tokens resueltos, la idempotencia de la segunda siembra y la limpieza dejando los contadores en 0 (incluida la fila de `tenants`). `git status` quedó limpio antes del commit del task 2.

## Verification

| Criterio del plan                                                          | Resultado                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm exec vitest run test/tenancy/tenant-helpers.test.ts`                 | **13/13 verde** (58,6 s)                                    |
| `grep -c "tenantValues(" test/helpers.ts`                                   | 3 (users, user_branches, socio del tenant 2)                |
| `grep -c "tenantId?: number" test/helpers.ts`                               | 2                                                           |
| `git status --porcelain el-templo-api/test/` en el task 1                   | sólo `helpers.ts`                                           |
| Derivación de `country` (Phase 110) y insert de `user_branches` intactos    | sí — el diff sólo reindenta los `.values()`                 |
| `grep -rl "90671" test/`                                                    | sólo `test/fixtures/second-tenant.ts`                       |
| `grep -c "tenantValues(" test/fixtures/second-tenant.ts`                    | 5 (sede, actividad, plan, horario + el del docblock de uso) |
| `grep -c "UPDATE users SET tenant_id" test/fixtures/second-tenant.ts`       | 0                                                           |
| `DELETE FROM` vs. `tenant_id = ` / `id = ` en el fixture                    | 7 y 7                                                       |
| `grep -c "second-tenant" test/setup.ts`                                     | 0                                                           |
| `TABLES_TO_CLEAN` modificada                                                | no                                                          |
| `grep -c ": any\|console\." test/fixtures/second-tenant.ts`                 | 0                                                           |
| Líneas del fixture (mínimo 150)                                             | 390                                                         |
| Archivos nuevos bajo `src/db/migrations/`                                   | ninguno                                                     |
| `git status --porcelain el-templo-api/pnpm-lock.yaml`                       | vacío — cero deps nuevas (T-171-SC)                         |
| Prettier                                                                    | `All matched files use Prettier code style!`                |

## Known Stubs

Ninguno. El fixture está completo para lo que D-06 pide; lo que deliberadamente **no** siembra (`aura_config`, `cash_registers`, subscripciones/reservas) está listado con su motivo en la sección `QUE NO SIEMBRA` del docblock, no es trabajo pendiente.

## User Setup Required

None — no se requiere configuración externa.

## Next Phase Readiness

- El plan **171-05** puede importar `seedSecondTenant` / `limpiarSegundoGimnasio` / `TENANT_DOS` y afirmar por `SELECT tenant_id` que las filas nacen en 90671 y que la limpieza no deja rastro. La sonda descartable ya demostró que el camino feliz funciona, así que ese plan puede concentrarse en las aserciones que importan.
- Las fases **172-175** ya tienen la infraestructura del criterio 3 del ROADMAP: staff, socios y espejo del gimnasio 2 en una llamada.
- **Recordatorio para quien toque el fixture:** el docblock de `limpiarSegundoGimnasio` explica por qué `branches` no puede entrar a `TABLES_TO_CLEAN`. Si alguien "simplifica" la limpieza moviéndola ahí, rompe los 165 archivos que dependen de la sede semilla.

## Nota sobre ISO-02

El plan declara `requirements: [ISO-02]`, pero ISO-02 lo comparten **171-04, 171-05 y 171-06**, y su enunciado pide fixtures que siembren 2 tenants **más** los helpers por tenant. La mitad de los helpers está hecha y el fixture existe, pero lo que afirma que la siembra es correcta es la batería del 171-05. Siguiendo el precedente del 171-01 con ISO-01, **no se corrió `requirements mark-complete`**: `REQUIREMENTS.md` queda con ISO-02 en `Pending`, que es el estado real. Lo cierra el plan que lo demuestre.

## Self-Check: PASSED

Los 2 archivos de código y este SUMMARY existen en disco; los 2 commits de tarea (`5c873111`, `0f768c79`) existen en `git log`.

---

_Phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant_
_Completed: 2026-07-29_
