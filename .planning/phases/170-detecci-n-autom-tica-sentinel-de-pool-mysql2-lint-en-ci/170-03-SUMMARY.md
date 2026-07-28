---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
plan: 03
subsystem: database
tags:
  [multi-tenancy, tenant-id, lint, ast, typescript-compiler-api, vitest, fail-closed, ci-gate]

# Dependency graph
requires:
  - phase: 167-columnas
    provides: "GYM_OWNED_TABLES (87 tablas) + isGymOwnedTable — el filtro de toda tabla detectada"
  - phase: 169-capa-de-escritura
    provides: "tenantWhere / tenantValues — la forma canónica que el lint premia como cumplimiento, y las 9 exenciones tenant-safe sembradas contra las que se valida el matcher"
  - phase: 170-02
    provides: "El precedente del recorte por indexOf para cerrar el agujero del motivo vacío (la regex del RESEARCH daba por válida la anotación pelada)"
provides:
  - "buildSchemaTableMap(schemaDir) — mapa identificador de schema a tabla física, 91 declaraciones resueltas por AST"
  - "lintTenantSources(opts) — el pase completo: accesos, cumplimiento, exenciones ancladas e inventario D-12"
  - "TenantAccess / ExemptionRecord / UnanchoredTag / LintSourceResult — el contrato que el plan 05 extiende con la CLI"
  - "DEFAULT_SCOPE_DIRS — el alcance de archivos FIJADO por D-16"
  - "19 tests que congelan el motor contra fixtures controlados y contra los 6 sitios reales de origin/master"
affects: [170-04, 170-05, 170-06, 171-fixtures-2-tenant, 172-adopcion-finance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inventario independiente de los hallazgos: las exenciones se recogen ANTES que los accesos, para que una exención que no cubre nada salga igual con covers=0 en vez de desaparecer"
    - "Prosa vs. código como categoría de salida propia (unanchoredTags): el lint reporta las menciones del tag que NO eximen, en vez de callarlas"
    - "Defensa en profundidad documentada como tal: la condición redundante lleva escrito por qué no se borra y qué prueba negativa la sostiene"

key-files:
  created:
    - el-templo-api/src/db/scripts/lint-tenant.ts
    - el-templo-api/test/tenancy/con-06-lint.test.ts
    - el-templo-api/test/tenancy/__fixtures__/lint/tipos.ts
    - el-templo-api/test/tenancy/__fixtures__/lint/accesos.ts
    - el-templo-api/test/tenancy/__fixtures__/lint/exenciones.ts
    - el-templo-api/test/tenancy/__fixtures__/lint/exento-por-archivo.ts
  modified: []

key-decisions:
  - "El inventario de exenciones (D-12) se computa con independencia de los accesos y se expone como exemptionInventory: el contrato TenantAccess[] del plan no podía contener la exención de notification-cron.ts, que no tiene ningún acceso debajo"
  - "unanchoredTags es informativo y NO una violación: hay archivos que documentan legítimamente la convención (require-tenant.ts es uno), y convertirlo en rojo rompería el propio archivo que explica la regla"
  - "El alcance de archivos es fail-closed: un scopeDir inexistente lanza en vez de saltearse, porque un lint que mira menos código del que cree es peor que uno que no corre"

patterns-established:
  - "Un fixture de análisis estático vive bajo test/ con extensión .ts real: el tsconfig del API solo incluye src/**, así que no lo typechequea, y el motor lo encuentra sin trucos de extensión"
  - "Prueba negativa escalonada: se afloja UNA condición por vez para separar cuál rechaza qué, en vez de aflojar todo junto y atribuir el rojo a la condición equivocada"

requirements-completed: [CON-06]

# Metrics
duration: 25min
completed: 2026-07-28
---

# Phase 170 Plan 03: Motor de análisis del lint de tenancy Summary

**El lint ya sabe leer el repo entero en 1,1 s y decir exactamente qué accede a una tabla gym-owned sin nombrar el gimnasio: 428 archivos, 1.640 accesos, 1.597 violaciones y las 9 exenciones reales de la fase 169 ancladas — con cero falsos positivos de prosa, que es el hallazgo 169-09 cerrado.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-28T16:55Z
- **Completed:** 2026-07-28T17:20Z
- **Tasks:** 3/3
- **Files created:** 6 (1.298 líneas, cero deleciones)

## Accomplishments

- **El mapa de tablas se resuelve por AST, no por grep.** `buildSchemaTableMap` devuelve **91 entradas** de `src/db/schema/` — el regex de una línea que el RESEARCH midió resolvía 21 y encima levantaba la tabla fantasma `foo` que vive dentro del JSDoc de `tenant-column.ts`. Sin ese mapa, `schema.tvPairings` sería un identificador cualquiera y los accesos a `tv_pairings` pasarían **invisibles** (T-170-04).
- **Las dos formas de acceso están cubiertas y la unión es fail-closed.** Query builder (`.from` / `.insert` / `.update` / `.delete`, resolviendo tanto el `import * as schema` de 110 archivos como el import nombrado de 9) y template `sql` crudo (nombres en el texto literal **unidos** a las tablas interpoladas). Sobre-reportar termina en una entrada de allowlist que alguien revisa; sub-reportar termina en una fuga entre gimnasios.
- **El hallazgo 169-09 queda cerrado, y verificado sobre el repo real.** El matcher ancla **exactamente las 9 exenciones** de la fase 169 (más la propia de este archivo nuevo = 10 en el inventario) y **rechaza los 2 casos de prosa**: `src/db/schema/tv.ts` y `src/db/scripts/require-tenant.ts`, los mismos 2 que el grep crudo autorizaba. Los dos aparecen listados en `unanchoredTags`, o sea que el lint los ve y los descarta a la vista, en vez de ignorarlos en silencio.
- **La exención que no exime nada también se ve.** `src/jobs/notification-cron.ts:754` tiene su anotación anclada pero `covers: 0`: no hay ningún acceso a tabla gym-owned debajo. Eso es información, no ruido — o el sitio que eximía se movió, o la exención está de más.
- **La dedup de Pitfall 7 está probada contra el sitio que la motivó.** El mismo comentario de `notification-cron.ts` matchea como leading del `ExpressionStatement` **y** del `CallExpression` interno; la dedup por `range.pos` lo deja en una sola entrada, afirmada nominalmente.
- **El alcance de D-16 quedó escrito antes de generar cualquier baseline.** `src/**` + `scripts/**` del API, `test/**` excluido con el motivo adentro del docblock. Verificado: **cero** accesos con ruta bajo `el-templo-api/test/`.

## Task Commits

1. **Task 1: Mapa identificador a tabla física por AST** — `e021c9eb` (feat)
2. **Task 2: Detección, cumplimiento y anclaje de exenciones** — `99cdac3f` (feat)
3. **Task 3: Batería del motor con fixtures + archivos reales** — `9d47087d` (test)

## Files Created/Modified

- `el-templo-api/src/db/scripts/lint-tenant.ts` — **nuevo, 801 líneas.** Docblock con el molde de `verify-tenant-uniques.ts` (`QUÉ HACE`, `ALCANCE DE ARCHIVOS (D-16)`, `POR QUÉ NO ES UNA REGLA ESLINT`, `POR QUÉ NO USA EL TYPE CHECKER`, `POR QUÉ AST Y NO UN GREP`, `SOLO LECTURA`, `CÓMO SE CORRE`), su propia exención de archivo, `buildSchemaTableMap`, `lintTenantSources` y las interfaces del contrato.
- `el-templo-api/test/tenancy/con-06-lint.test.ts` — **nuevo, 338 líneas, 19 tests** en dos `describe`.
- `el-templo-api/test/tenancy/__fixtures__/lint/` — **4 archivos nuevos** (`tipos.ts`, `accesos.ts`, `exenciones.ts`, `exento-por-archivo.ts`), 159 líneas.

## Decisions Made

- **El inventario de D-12 se computa con independencia de los accesos.** El plan tipa `exemptions` como `TenantAccess[]`, pero su propio criterio de aceptación pide que el inventario contenga `src/jobs/notification-cron.ts`, que **no tiene ningún acceso detectado** debajo de su exención. Se respetó el contrato del plan (`exemptions` = accesos cubiertos, 33 sobre el repo real) y se agregó `exemptionInventory: ExemptionRecord[]` con las exenciones ancladas, cubran o no algo. Sin esa separación, la mitad del inventario que D-12 pide —las 6 exenciones de archivo de scripts de plataforma, que casi ninguna escribe tablas de negocio— sería invisible.
- **`unanchoredTags` es una salida propia, y es informativa.** D-12 pide validar que las exenciones anclen "a un sitio real de query, no prosa suelta". La forma útil de esa validación no es un booleano interno: es una lista. Es la que evita el peor final posible —alguien escribe la anotación como comentario de línea, se queda tranquilo y se entera en el rojo de CI sin saber por qué— y es la que hace **visible** el 169-09. No es violación a propósito: `require-tenant.ts` documenta la convención y convertirlo en rojo rompería el archivo que la explica.
- **Los fixtures son `.ts` reales, no `.ts.txt`.** El plan admitía las dos formas. El `tsconfig.json` del API tiene `include: ["src/**/*"]`, así que `test/` **no se typechequea** y un fixture `.ts` deliberadamente flojo no puede romper `tsc --noEmit`; a cambio, el motor lo encuentra con su recorrido normal, sin una excepción de extensión que después habría que mantener. Verificado: `tsc --noEmit` sale 0 con los fixtures presentes.
- **El cumplimiento se busca en el statement que contiene el acceso, no en la línea.** `tenantWhere` suele estar en un `.where()` encadenado dos líneas más abajo. Es presencia y no corrección, igual que el sentinel, y está escrito en el código.
- **Un `scopeDir` inexistente lanza.** Saltearlo dejaría al lint mirando menos código del que cree e informando "0 violaciones" sobre un subconjunto — el modo de falla silencioso que ya inutilizó gates en fases anteriores.

## Deviations from Plan

### 1. [Rule 2 - Funcionalidad crítica faltante] El inventario de D-12 no cabía en `TenantAccess[]`

- **Found during:** Task 2
- **Issue:** El `<interfaces>` del plan define `exemptions: TenantAccess[]` como "el inventario de D-12", pero su criterio de aceptación exige que ese inventario contenga `src/jobs/notification-cron.ts`. Ese sitio tiene exención anclada y **cero accesos** debajo (`seedService.seedTemplates()` no es un `.from`/`.insert` sobre una tabla del schema), así que no puede existir como `TenantAccess`. Lo mismo pasa con las 6 exenciones de archivo de los scripts de plataforma (`run-migrations.ts`, los dos `verify-tenant-*`, `wellhub-sandbox.ts`): con el contrato literal, el inventario que D-12 pide habría salido con 3 entradas de 9.
- **Fix:** Se mantuvo `exemptions: TenantAccess[]` tal cual lo pide el plan y se **agregó** `exemptionInventory: ExemptionRecord[]` (`file`, `line`, `motive`, `scope`, `covers`) más `unanchoredTags`. Ambos campos son aditivos: el consumidor del plan 05 no pierde nada.
- **Files modified:** `el-templo-api/src/db/scripts/lint-tenant.ts`
- **Verification:** sobre el repo real, `exemptionInventory` tiene 10 entradas (las 9 de la fase 169 + la propia de `lint-tenant.ts`) y `exemptions` tiene 33 accesos cubiertos.
- **Committed in:** `99cdac3f`

### 2. [Rule 1 - Bug] La prueba negativa que el plan describe no reproduce: el rechazo de `schema/tv.ts` es por otra causa

- **Found during:** Task 3
- **Issue:** El criterio de aceptación pide demostrar que "relajar el matcher a `getLeadingCommentRanges` sin el chequeo de `MultiLineCommentTrivia` hace que `src/db/schema/tv.ts` aparezca como exento". **No pasa**, y se comprobó aflojando una condición por vez:
  - **Sonda A** (solo se saca el chequeo de `MultiLineCommentTrivia`): **nada cambia**. La regex del tag está anclada en la apertura del bloque, y un comentario de línea empieza con dos barras, así que ya falla por la otra condición.
  - **Sonda B** (solo se afloja el anclaje: el tag se busca en cualquier parte del comentario): **`require-tenant.ts` pasa a figurar como archivo exento** — el inventario salta de 10 a 12. `schema/tv.ts` sigue afuera.
  - **Sonda C** (las dos aflojadas): `require-tenant.ts` exento **y** el comentario de línea del fixture pasa a eximir. `schema/tv.ts` **sigue afuera**, porque su anotación citada vive dentro de un objeto literal —trivia de un `PropertyAssignment`—, una posición que el matcher no consulta nunca. O sea que ese archivo está rechazado por partida doble.
- **Fix:** No se tocó el motor: su comportamiento es el correcto y ambos archivos quedan rechazados, que es lo que el plan y D-10 piden. Se corrigió la **documentación** (docblock de `exemptionMotive` y del test) para que diga la causa real de cada rechazo, y se dejó escrito por qué la condición redundante **no se borra**: es defensa en profundidad para el día en que alguien toque la regex, y la sonda C lo demuestra.
- **Files modified:** `el-templo-api/src/db/scripts/lint-tenant.ts`, `el-templo-api/test/tenancy/con-06-lint.test.ts`
- **Verification:** ver "Prueba negativa" abajo — la sonda C dejó **5 tests rojos**, entre ellos la aserción nominal de `require-tenant.ts`.
- **Committed in:** `9d47087d`

### 3. [Rule 3 - Bloqueo] El docblock no puede nombrar las construcciones que su propio gate prohíbe

- **Found during:** Task 1
- **Issue:** El criterio de aceptación pide `grep -c "eval|import(" src/db/scripts/lint-tenant.ts` = 0, y la primera versión de la sección `SOLO LECTURA` explicaba justamente que el motor **no** usa esas dos construcciones — dando 1. Es el mismo tropiezo que el plan 02 tuvo con `createTestApp` y, en chiquito, el mismo hallazgo 169-09 que motiva este archivo entero: **el grep no distingue código de prosa**.
- **Fix:** La sección se reescribió sin nombrarlas, y con la explicación de por qué no están nombradas — para que el próximo que lea el docblock no las "complete" y rompa el gate sin entender.
- **Files modified:** `el-templo-api/src/db/scripts/lint-tenant.ts`
- **Committed in:** `e021c9eb`

### 4. [Rule 3 - Bloqueo] El worktree es `et-170-sentinel`, no `et-170-deteccion`

- **Found during:** arranque
- **Issue:** El plan referencia `/home/franco/projects/et-170-deteccion` en su `<context>` y en los tres bloques `<verify>`. Ese worktree no existe.
- **Fix:** Se trabajó en `/home/franco/projects/et-170-sentinel` (rama `feat/170-sentinel-lint`), el worktree real de la fase, como ya lo registraron los desvíos de los planes 01 y 02. Cero worktrees nuevos.
- **Files modified:** ninguno
- **Committed in:** n/a

---

**Total deviations:** 4 auto-fixed (1 × Rule 2 — el contrato del plan no alcanzaba para su propio criterio de aceptación; 1 × Rule 1 — la prueba negativa documentada no reproducía; 2 × Rule 3 — bloqueos de proceso/entorno)
**Impact on plan:** Ninguno sobre el contrato entregado. Los exports, las firmas, el alcance D-16 y los criterios de aceptación salieron como los especifica el plan; lo agregado es aditivo. Cero dependencias, cero migraciones, cero scope creep.

## Issues Encountered

- **`spom_config` sigue siendo trampa.** El desvío 1 del plan 02 avisó que **no** es un ejemplo de tabla no gym-owned. Este plan usó `system_settings` (config global heredada, `TENANT_EXEMPT_TABLES`) y `tenants` (plataforma) como los casos "sin acceso", verificados contra `isGymOwnedTable` antes de escribir el fixture.
- **La corrida del archivo de test tarda ~115 s.** Los 19 tests corren en milisegundos; el resto es el `setupFiles` de Vitest provisionando MySQL para un archivo que no toca la base (hallazgo 169-07). Tercera fase consecutiva que lo reconfirma: es exactamente el motivo de D-09 de que el lint **no** sea un gate de Vitest sino un step propio de CI.
- **Prettier reformatea el caso TRAILING del fixture** (parte `.insert(schema.bookings)` en varias líneas y deja el comentario después del paréntesis). El anclaje sigue funcionando —es trivia trailing del mismo `CallExpression`—, pero por eso las aserciones del test se hacen por archivo/tabla/tipo y **nunca por número de línea**: una corrida de `lint-staged` no puede volverlas rojas.
- **`unanchoredTags` incluye al propio `lint-tenant.ts` (2 menciones) y a `sentinel/analyze.ts` (5).** Son las regex y los strings donde el tag aparece como **dato**, no como anotación. Es correcto y es el motivo por el que esta salida es informativa y no una violación: el plan 05 no debe convertirla en rojo sin resolver antes este caso.

## Verification Results

| Verificación                                                              | Resultado                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                                  | ✅ exit 0 (después de cada task y al cierre, con las sondas ya revertidas)        |
| `pnpm exec vitest run test/tenancy/con-06-lint.test.ts`                   | ✅ **19 tests passed**                                                            |
| `buildSchemaTableMap("src/db/schema")`                                    | ✅ 91 entradas (mín. 85), `tvPairings` → `tv_pairings`, sin la fantasma `foo`     |
| `lintTenantSources({ rootDir })` sobre el repo                            | ✅ `filesScanned` **428** (mín. 350), **1.032 ms** (máx. 10 s)                    |
| Accesos detectados                                                        | ✅ 1.640 (1.175 query-builder + 465 sql-template); 1.597 violaciones, 33 eximidos |
| Exenciones aceptadas (4 nominales)                                        | ✅ `seed.ts`, `notification-cron.ts`, `tv/pairing.ts`, `wellhub/service.ts`       |
| Exenciones rechazadas (2 nominales, hallazgo 169-09)                      | ✅ `schema/tv.ts` y `scripts/require-tenant.ts` fuera del inventario, en prosa    |
| Dedup por `range.pos` en `notification-cron.ts`                           | ✅ exactamente 1 entrada de inventario                                            |
| Accesos con ruta bajo `el-templo-api/test/`                               | ✅ 0 — el alcance D-16 no mira `test/`                                            |
| `grep -c "eval\|import(" src/db/scripts/lint-tenant.ts`                   | ✅ 0 — el motor no ejecuta lo que analiza (T-170-12)                              |
| `grep -c "console\." src/db/scripts/lint-tenant.ts`                       | ✅ 0 — la salida la agrega la CLI del plan 05                                     |
| Ocurrencias de `any`                                                      | ✅ 0 en los 6 archivos                                                            |
| Lista de tablas importada, no duplicada                                   | ✅ `import { isGymOwnedTable } from "../tenant-tables"`                           |
| Prettier                                                                  | ✅ los 6 archivos en estilo                                                       |
| `pnpm-lock.yaml`                                                          | ✅ sin cambios — cero dependencias instaladas o actualizadas (T-170-SC)           |
| Migraciones de DB                                                         | ✅ ninguna (la numeración sigue reservada desde 0197)                             |

### Inventario de exenciones del repo real (D-12, salida de una sola pasada)

```
file covers=0   src/db/run-migrations.ts:10            herramienta de plataforma: aplica DDL a la base entera…
file covers=0   src/db/scripts/lint-tenant.ts:86       tooling de plataforma: analiza el fuente por AST…      ← nueva, de este plan
file covers=0   src/db/scripts/verify-tenant-backfill.ts:58  verificador de plataforma: escanea TODOS los tenants…
file covers=0   src/db/scripts/verify-tenant-uniques.ts:61   verificador de plataforma: escanea TODOS los tenants…
file covers=25  src/db/seed-spom.ts:1                  provisioning local/de test: construye la base desde cero…
file covers=6   src/db/seed.ts:1                       provisioning local/de test: construye la base desde cero…
site covers=0   src/jobs/notification-cron.ts:754      seed de templates global hasta la adopción de notifications (fase 175)
site covers=1   src/modules/tv/pairing.ts:145          pairing pre-claim
site covers=1   src/modules/wellhub/service.ts:135     idempotencia global previa a la derivacion del tenant (M8)
file covers=0   scripts/wellhub-sandbox.ts:27          no toca la DB: postea al webhook local…
```

Y las menciones que **no** anclan (`unanchoredTags`), agrupadas por archivo:
`schema/tv.ts` (1), `scripts/require-tenant.ts` (1), `scripts/lint-tenant.ts` (2), `sentinel/analyze.ts` (5), `modules/tv/pairing.ts` (1). **Las dos primeras son exactamente los 2 falsos positivos del grep crudo de la fase 169.**

### Prueba negativa escalonada (fail-closed demostrado en vivo)

Se aflojó **una condición por vez** para saber cuál rechaza qué, en vez de aflojar todo junto y atribuir el rojo a la condición equivocada:

| Sonda | Qué se aflojó                                              | Inventario del repo | `require-tenant.ts` exento | `schema/tv.ts` exento | Fixture: el comentario de línea exime |
| ----- | ---------------------------------------------------------- | ------------------- | -------------------------- | --------------------- | ------------------------------------- |
| —     | (motor entregado)                                          | 10                  | no                         | no                    | no                                    |
| A     | sin chequeo de `MultiLineCommentTrivia`                    | 10                  | no                         | no                    | no                                    |
| B     | tag buscado en cualquier parte del comentario              | **12**              | **sí**                     | no                    | no                                    |
| C     | las dos                                                    | **12**              | **sí**                     | no                    | **sí**                                |

Con la **sonda C** aplicada, `pnpm exec vitest run test/tenancy/con-06-lint.test.ts` quedó en **5 failed | 14 passed**, y los rojos son exactamente los guards que protegen la regla:

- `la exención de sitio exime; el motivo vacío y el comentario de línea NO`
- `el inventario D-12 lista las 3 exenciones con su alcance, su motivo y a cuántos accesos cubre`
- `las anotaciones que no anclan se reportan aparte y no eximen nada`
- `el fixture tiene exactamente 4 violaciones y 4 accesos eximidos`
- `rechaza la mención en prosa de el-templo-api/src/db/scripts/require-tenant.ts (hallazgo 169-09)`

Sondas **revertidas sin commitear el estado roto** (idioma 168-05 / 169-04 / 170-01): `git diff` sobre `lint-tenant.ts` quedó vacío contra el commit `99cdac3f` antes de escribir el Task 3.

## User Setup Required

None — cero variables de entorno nuevas, cero servicios externos, cero configuración manual.

## Next Phase Readiness

**Listo para el plan 05 (CLI, allowlist y ratchet), que extiende este mismo archivo:**

- El contrato está exportado y estable: `lintTenantSources({ rootDir, scopeDirs?, schemaMap? }) → LintSourceResult`.
- **El baseline que va a generar tiene 1.597 violaciones sobre 1.640 accesos.** Es deuda real y esperada: la fase 169 dejó los helpers, pero la adopción por módulo es 172-175, así que hoy solo **10** accesos cumplen (los de `pairing.ts`, `wellhub/service.ts`, `country-scope.ts`, `balance-service.ts` y `scripts/seed-onboarding-aura.ts`). La clave de allowlist de D-13 es `file` + `table`, sin líneas.
- **Lo que este plan deliberadamente NO hace:** la allowlist y su diff contra la rama base (D-14, con la trampa del clone shallow y de `event.before`), el gate de coherencia strict/allowlist (D-15), `formatReport`, los exit codes 0/1/2 y el `pnpm` script.
- **Aviso para el plan 05:** `unanchoredTags` **no** debe convertirse en rojo tal cual. Hoy incluye a `sentinel/analyze.ts` y al propio `lint-tenant.ts`, donde el tag aparece como dato dentro de una regex, y a `require-tenant.ts`, que documenta la convención. Si el plan 05 la quiere como gate, primero necesita distinguir "mención documental" de "anotación mal escrita".
- **Aviso para la fase 171:** el alcance excluye `test/` por D-16 y **no se puede agrandar sin regenerar el baseline**, que es la puerta trasera que D-16 prohíbe. El ruido de los 228 archivos de test es problema de los fixtures 2-tenant.

**Sin blockers.** Nada se pusheó, nada se mergeó a `staging` ni a `master`: los tres commits viven en la rama local `feat/170-sentinel-lint` del worktree.

## Threat Flags

Ninguna superficie nueva. Los 6 archivos son un analizador estático y sus fixtures: cero endpoints, cero rutas de auth, cero cambios de schema, cero dependencias. El plan **mitiga** T-170-01 (detección AST de las dos formas de acceso con unión fail-closed), T-170-09 (las dos condiciones necesarias del matcher, con la prueba negativa escalonada y las aserciones nominales de los 2 rechazos), T-170-06 (`scope: "file"` marcado y reportado aparte, con el motivo del alcance mayor escrito), T-170-12 (análisis puramente sintáctico, sin `createProgram`, con criterio grepeable) y T-170-04 (91 declaraciones resueltas por AST + `it` de regresión del mapa). T-170-SC queda cerrado: cero paquetes instalados.

## Self-Check: PASSED

- Archivos: `el-templo-api/src/db/scripts/lint-tenant.ts`, `el-templo-api/test/tenancy/con-06-lint.test.ts`, los 4 fixtures de `el-templo-api/test/tenancy/__fixtures__/lint/` y este SUMMARY existen en disco.
- Commits: `e021c9eb`, `99cdac3f` y `9d47087d` existen en `feat/170-sentinel-lint`.
- `STATE.md` y `ROADMAP.md` NO fueron modificados por este ejecutor (los escribe el orquestador).

---

_Phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci_
_Plan: 03_
_Completed: 2026-07-28_
