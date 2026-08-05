---
phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id
plan: 04
subsystem: testing
tags:
  [vitest, mysql, drizzle, multi-tenancy, unique-constraints, integration-tests]

# Dependency graph
requires:
  - plan: 168-01
    provides: "migración 0196 aplicada a la base local (y al provisioning de la base de test) con los contratos compuestos"
  - plan: 168-02
    provides: "schema Drizzle con las uniques compuestas — los inserts del test pasan por estas declaraciones"
  - plan: 168-03
    provides: "el 12º contrato subscription_plans (tenant_id, name, country) y el verificador que lo encontró"
provides:
  - "test/tenancy/con-01-uniques-cross-tenant.test.ts: los 12 contratos de CON-01 probados por COMPORTAMIENTO en sus dos direcciones (acepta cross-tenant / rechaza intra-tenant)"
  - "Helper local de rechazo que exige ER_DUP_ENTRY / errno 1062 específicamente, recorriendo la cadena de `cause`"
  - "Patrón de seeding + teardown de un segundo tenant con id fijo alto, sin tocar test/helpers.ts"
  - "Mina M3 (campaign_unsubscribes) cubierta con su caso de user_id NULL"
affects:
  - "168-06 (el rollout a staging y prod deja este archivo como red de seguridad de CI)"
  - "171 (ISO-03: las fixtures 2-tenant completas reemplazan estos helpers locales — este archivo es su prototipo mínimo)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Aserción de rechazo por unicidad que exige el errno de MySQL, no un error genérico: un test que acepte 'falló por lo que sea' pasa en verde con una FK rota"
    - "Fixtures que exigen `tenantId` como primer parámetro obligatorio: la mitigación anti-DEFAULT-1 movida al compilador en vez de a la revisión visual"
    - "Segundo tenant con id fijo ALTO (90168), sembrado en beforeAll y barrido en afterAll con un limpiador propio en orden seguro de FKs"

key-files:
  created:
    - el-templo-api/test/tenancy/con-01-uniques-cross-tenant.test.ts
  modified: []

key-decisions:
  - "Se probaron 12 contratos, no 11: el handoff de 168-03 manda que todo assert que cuente contratos convertidos diga 12, así que subscription_plans (name, country) tiene su propio describe con la procedencia del hallazgo escrita"
  - "Los contratos de dos columnas prueban ADEMÁS que cambiar una sola columna sigue siendo legal — sin esa aserción, una unique degradada a (tenant_id, name) pasaría en verde"
  - "day_modes usa como fila del tenant 1 la que ya sembró la migración 0080 en vez de insertar una nueva: la tabla viene poblada y no está en TABLES_TO_CLEAN, así que un insert propio chocaría contra el seed y probaría el rechazo por el motivo equivocado"
  - "El invariante 'todo insert estampa tenantId' se implementó como parámetro obligatorio de las 8 fixtures (lo verifica tsc) en vez de repetir `tenantId:` en los 44 inserts — más fuerte que el grep que pedía el criterio de aceptación, y sin la repetición que CLAUDE.md manda flaggear"
  - "CON-01 sigue en Pending en REQUIREMENTS.md, igual que en 168-01/02/03: el contrato está probado en la base de test, no en staging ni en prod"

patterns-established:
  - "Un archivo de contratos prueba las DOS direcciones y las dos valen lo mismo: la mitad 'sigue rechazando' es el criterio de cero-cambio-de-comportamiento, no un extra"
  - "Test de cierre que verifica que el tenant de prueba no dejó filas colgadas, con la excepción documentada explícita (la sede del beforeAll) en vez de un umbral laxo"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-07-27
---

# Phase 168 Plan 04: CON-01 probado por comportamiento Summary

**Los 12 contratos de unicidad de la fase dejaron de estar probados solo por metadata: un segundo tenant sembrado en la base de test inserta los mismos valores que El Templo en las diez tablas convertidas y MySQL los acepta, mientras que repetirlos dentro del mismo tenant sigue explotando con `ER_DUP_ENTRY` — la mitad que garantiza que el alta de alumno no cambió de comportamiento.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-27T20:00:18Z
- **Completed:** 2026-07-27T20:15Z
- **Tasks:** 2/2
- **Files modified:** 1 creado (`test/tenancy/con-01-uniques-cross-tenant.test.ts`, 941 líneas)

## Accomplishments

### Task 1 — Scaffold, tenant 2 y los contratos de `users` / `branches` (`2c1af25f`)

`test/tenancy/con-01-uniques-cross-tenant.test.ts` nace con la cabecera que explica por qué existe: la fase 168 ya tiene **dos** redes estructurales —la introspección de `INFORMATION_SCHEMA` y el verificador fail-closed del 168-03— y **las dos miran metadata**. Ninguna prueba que el contrato que le importa al staff siga vivo. Este archivo lo prueba con inserts reales.

Las dos mitades valen lo mismo y la cabecera lo dice explícitamente: aceptar cross-tenant es lo que la fase vino a habilitar, pero **seguir rechazando intra-tenant es el criterio 5 del ROADMAP** (cero cambio de comportamiento). Si el alta de alumno dejara de frenar un DNI repetido, la conversión habría sido una regresión disfrazada de feature.

**Las dos trampas del archivo, escritas arriba de todo:**

- **(a) el DEFAULT 1 de la fase 167.** Un insert que se olvide de `tenantId` cae en el tenant 1 en silencio y el test pasa en verde probando nada (T-168-15). La mitigación no quedó en "acordate de escribirlo": las **8 fixtures locales exigen `tenantId: number` como primer parámetro**, así que `tsc` no compila un payload sin tenant. Es más fuerte que revisar a ojo.
- **(b) la aserción de rechazo laxa.** `esperarRechazoPorDuplicado` hace **dos** aserciones separadas —que falló, y que falló **por duplicado**— y `buscarDuplicado` recorre el error y su cadena de `cause` buscando `ER_DUP_ENTRY` / errno 1062 / `Duplicate entry`. Un `ER_NO_REFERENCED_ROW_2` (FK rota), un `ER_BAD_FIELD_ERROR` (columna inexistente) o un enum mal escrito **no pueden** hacer pasar la aserción (T-168-16).

Seeding: `tenants id = 90168` (fijo y alto a propósito, no colisiona con el autoincremento ni con la fila 1 de la 0190) más una sede propia del tenant 2. `TENANT_TEMPLO` y `TENANT_SEGUNDO` son constantes: ninguna aserción usa un número mágico suelto.

Cuatro contratos cubiertos, cada uno con el triple insert (tenant 1 → tenant 2 con el MISMO valor → segundo del tenant 1 con el mismo valor): `users.email`, `users.dni`, `users.referral_code`, `branches.code`. El de `users.dni` cita en su comentario la carrera de unicidad que `members/service.ts:908` documenta como T-148-02 — ese es el contrato concreto que no puede cambiar.

Limpieza: `branches` **no** está en `TABLES_TO_CLEAN` (verificado leyendo la constante, no asumido), así que sus filas se borran en un `finally`.

### Task 2 — Los 8 contratos restantes, la mina M3 y el 12º (`a0216641`)

Ocho `describe` más, reutilizando el helper de duplicado y las constantes sin duplicar el ciclo de vida:

| Contrato                              | Nota                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `cost_centers (name, country)`        | repite el **par completo**; y prueba que el mismo nombre en otro país sigue siendo legal |
| `promo_plans.promo_code`              | con un `subscription_plans` real del mismo tenant, por si una fase futura le pone la FK  |
| `campaign_unsubscribes.email`         | describe propio, mina M3, más el caso `user_id` NULL                                     |
| `notification_templates.template_key` | cada gimnasio con su propio juego de templates                                           |
| `day_modes.day_of_week`               | usa la fila del tenant 1 que **ya existe** (seed de la 0080)                             |
| `holidays (country, date)`            | repite el **par completo**; y la misma fecha en otro país sigue siendo legal             |
| `formats.name`                        | —                                                                                        |
| `subscription_plans (name, country)`  | **el 12º contrato** del handoff de 168-03                                                |

**La mina M3 tiene su propio `describe` y su propio párrafo** porque el bug era cualitativamente peor que una colisión molesta: con la unique global sobre `email`, una baja de campañas en UN gimnasio **suprimía los envíos de TODOS**. No era un duplicate-key al alta, era supresión silenciosa de marketing ajeno. El segundo test del describe cubre `user_id` NULL —la baja de alguien que no es socio, llegada por un link de unsubscribe— que es exactamente el motivo por el que el backfill de esa tabla en la fase 167 fue directo a 1 y no derivado del socio: no hay socio del que derivarlo.

**Los contratos de dos columnas prueban la compositeness en las dos direcciones.** El rechazo repite el PAR COMPLETO (cambiar una sola columna no probaría nada), y además hay una aserción de que el mismo nombre en otro país / la misma fecha en otro país **sí** se acepta dentro del mismo tenant. Sin esa segunda aserción, una unique degradada a `(tenant_id, name)` pasaría en verde.

**`day_modes` fue el caso que el plan anticipó.** La tabla la sembró la migración 0080 con seis filas (`day_of_week` 1..6, tenant 1) y **no** está en `TABLES_TO_CLEAN`, así que sobreviven a todo el archivo. Insertar una fila propia del tenant 1 habría chocado contra el seed y probado el rechazo **por el motivo equivocado**: el test usa la fila existente como lado tenant-1, lo afirma primero (`COUNT(*) = 1` para ese día) y lo documenta en el comentario. El seed queda intacto: el `finally` borra solo lo del tenant 2.

**El 12º contrato lleva escrita su procedencia** en el JSDoc del describe: el índice `ux_subscription_plans_name_country` existe en MySQL desde la migración 0091 y nunca se declaró en Drizzle (drift schema↔DB), por eso el inventario del doc 05 anotó "name NO es unique" y D-01 no lo listaba. Lo encontró el verificador del 168-03 y Franco decidió el 2026-07-27 convertirlo dentro de la misma 0196. El comentario dice el impacto concreto: un segundo gimnasio en AR que quisiera vender un plan llamado "Flex" o "Foundation" —los nombres que hoy usa El Templo— recibiría un duplicate-key al darlo de alta.

**Test de cierre** (T-168-17): recorre las nueve tablas físicas restantes contando filas del tenant 2 y exige `[]`, con mensaje que explica por qué importa (la base de test la comparten todos los archivos del mismo worker de vitest: `fileParallelism` con `isolate: false`). `branches` es la **excepción documentada** —la única fila permitida es la sede del `beforeAll`, que borra el `afterAll`— y se afirma con un `toBe(1)` explícito en vez de con un umbral laxo. Cierra verificando que El Templo sigue siendo el tenant 1 con su slug intacto.

`limpiarTenantSegundo` barre las diez tablas en orden seguro de FKs y corre **dos veces**: defensivo en `beforeAll` (una corrida anterior abortada dejaría el tenant vivo y el `INSERT` fallaría por PK duplicada) y obligatorio en `afterAll`.

## Task Commits

| Task | Nombre                                   | Commit     | Archivos                                                       |
| ---- | ---------------------------------------- | ---------- | -------------------------------------------------------------- |
| 1    | Scaffold + tenant 2 + `users`/`branches` | `2c1af25f` | `test/tenancy/con-01-uniques-cross-tenant.test.ts` (+430 / −0) |
| 2    | Los 8 contratos restantes + M3 + el 12º  | `a0216641` | mismo archivo (+511 / −0)                                      |

Los dos commits viven en el worktree `/home/franco/projects/et-168-contratos`, rama `feat/168-contratos-sql`, sobre `ba37a148`. **Nada fue pusheado.**

## Verification

- `npx tsc --noEmit` en `el-templo-api`: **exit 0** (corrido después de cada task). El archivo no usa `any` (0 coincidencias).
- `npx vitest run test/tenancy/con-01-uniques-cross-tenant.test.ts`: **14 tests, 14 passed**, corrida angosta de un solo archivo (la suite completa es de CI, regla del repo). El `beforeAll` provisiona la base del worker, de ahí los ~110 s.
- **Cero contaminación, verificado por SQL contra `eltemplo_test_1` después de la corrida:** `SELECT COUNT(*) FROM tenants` = **1**, y la suma de filas con `tenant_id = 90168` en las diez tablas convertidas = **0**. Los seeds del tenant 1 quedaron intactos (`day_modes` 6, `cost_centers` 6, `branches` 4).
- **28 aserciones de contrato** (15 de aceptación cross-tenant + 13 de rechazo por duplicado) sobre 12 contratos — el criterio pedía 22 o más. Todas las de rechazo pasan por el helper que exige el errno de MySQL.
- Prettier `--check` con el binario local del proyecto: `All matched files use Prettier code style`. (El hook de husky no corre en el worktree: `core.hooksPath` apunta a `.husky/_`, que solo existe en el checkout principal — mismo caso que en 168-02.)
- El archivo **no toca** `test/helpers.ts` ni ningún otro archivo de la suite: el `git diff --stat` de la fase es `1 file changed`. No importa ninguna fixture de la fase 171 (no existe todavía).
- Credenciales de MySQL siempre por `MYSQL_PWD`, nunca en la línea de comandos.

## Deviations from Plan

### Derivadas del handoff de 168-03

**1. Se probaron 12 contratos, no los 11 que enumera el plan**

- **Found during:** lectura del handoff, antes del Task 1
- **Issue:** el `<interfaces>` del plan lista 11 contratos y el criterio de aceptación del Task 2 pide "los 11 contratos cubiertos". El plan se escribió antes de que el gate del 168-03 encontrara `subscription_plans (name, country)`. El handoff es explícito: _"todo test o assert que cuente contratos convertidos tiene que decir 12"_.
- **Fix:** se agregó un `describe` propio para el 12º contrato, con la procedencia del hallazgo (drift schema↔DB desde la migración 0091) y el impacto concreto escritos en su JSDoc. Los conteos de este SUMMARY dicen 12.
- **Files modified:** `test/tenancy/con-01-uniques-cross-tenant.test.ts`
- **Commit:** `a0216641`

### Auto-fixed / decisiones de implementación

**2. [Rule 2 - Correctness] El invariante de `tenantId` se movió al compilador en vez de al grep**

- **Found during:** Task 1
- **Issue:** el criterio de aceptación proponía como prueba `grep -c "tenantId" >= cantidad de inserts`. Es un proxy pensado para payloads inline; con fixtures compartidas el conteo da 38 sobre 44 inserts aunque **todos** pasen el tenant. Cumplir el grep literal exigía repetir `tenantId:` en los 44 sitios — repetición que CLAUDE.md manda flaggear, y que además seguiría siendo verificable solo a ojo.
- **Fix:** las 8 fixtures (`usuario`, `sede`, `centroDeCosto`, `planDeSuscripcion`, `promo`, `baja`, `template`, `feriado`) declaran `tenantId: number` como **primer parámetro obligatorio**, así que no existe forma de construir un payload sin decir de qué tenant es: `tsc` lo rechaza. El invariante quedó documentado en un bloque propio arriba de las fixtures. Referencias a `TENANT_TEMPLO` / `TENANT_SEGUNDO`: 57, sobre 44 inserts.
- **Files modified:** `test/tenancy/con-01-uniques-cross-tenant.test.ts`
- **Commit:** `2c1af25f` (fixtures) y `a0216641` (el bloque que lo explica)

**3. [Rule 2 - Correctness] Aserciones extra de compositeness en los contratos de dos columnas**

El plan pedía repetir el PAR COMPLETO en el rechazo. Se agregó además, en `cost_centers` y `holidays`, una aserción de que cambiar **una sola** de las dos columnas sigue siendo aceptado dentro del mismo tenant. Sin ella, una unique degradada a `(tenant_id, name)` —más restrictiva de lo que el contrato dice— pasaría en verde: el rechazo del par completo también se cumpliría.

**4. El test de cierre tiene una excepción documentada, no un cero absoluto**

El criterio pedía "cero filas con `tenant_id = 2` en ninguna de las 11 tablas" al terminar el archivo. La sede del tenant 2 la crea el `beforeAll` y la borra el `afterAll`, así que **mientras corre el último `it` sigue existiendo por diseño** (los usuarios del tenant 2 necesitan un `branch_id` y `branches` no se limpia entre tests). Se afirmó como excepción explícita `toBe(1)` con su comentario, en vez de bajar el listón del resto. El cero real —el que pide el criterio— se verificó por SQL **después** de la corrida: `tenants` = 1 y 0 filas del tenant 2 en las diez tablas.

**5. `npx prettier` intentó descargar el paquete — se abortó y se usó el binario local**

- **Found during:** validación de formato del Task 1
- **Issue:** `npx prettier --check` no encontró prettier en el `node_modules` raíz del worktree y npm avisó que iba a instalar `prettier@3.9.6` desde el registry. Eso es exactamente lo que T-168-SC y el skill de change-control prohíben (nada de instalar paquetes sin OK).
- **Fix:** se cambió a `el-templo-api/node_modules/.bin/prettier` (**3.8.1**, el del proyecto, vía el symlink al worktree 167) para todas las corridas posteriores. **`package.json`, `pnpm-lock.yaml` y `node_modules` del proyecto no se tocaron** — lo único que quedó fue una entrada en el caché de `npx`, fuera del repo. Cero `pnpm install` / `npm install`.
- **Files modified:** ninguno
- **Commit:** —

**6. CON-01 no se marcó completo en REQUIREMENTS.md**

Mismo criterio que 168-01, 168-02 y 168-03: el frontmatter del plan declara `requirements: [CON-01]`, pero el contrato está probado contra la base de test, no contra `eltemplo_staging` ni `eltemplo`. Lo cierra el 168-06 (rollout) o el verificador de fase.

## Threat Model — resultado

| Threat ID | Resultado                                                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-168-15  | **Mitigada en el compilador, no en la revisión.** Las 8 fixtures exigen `tenantId` como primer parámetro obligatorio: un payload sin tenant no compila. 57 referencias a las constantes de tenant sobre 44 inserts.                                                            |
| T-168-16  | Mitigada. `buscarDuplicado` exige `ER_DUP_ENTRY` / errno 1062 / `Duplicate entry` recorriendo la cadena de `cause`, y el helper hace dos aserciones separadas (que falló / que falló por duplicado). Un `ER_NO_REFERENCED_ROW_2` o un `ER_BAD_FIELD_ERROR` no pueden pasarla.  |
| T-168-17  | Mitigada y verificada por SQL después de la corrida. `limpiarTenantSegundo` barre las diez tablas en orden de FKs (defensivo en `beforeAll`, obligatorio en `afterAll`), los `finally` cubren `branches`, `cost_centers` y `day_modes`, y el test de cierre lo afirma en vivo. |
| T-168-18  | Aceptada, como estaba previsto. Todos los valores son sintéticos y locales al archivo (`CON01…`, `@tenancy.test`, fechas 2099). Cero dumps y cero datos de producción.                                                                                                         |
| T-168-SC  | Mitigada, con un intento fallido registrado (desviación 5): `npx prettier` iba a descargar el paquete y se abortó a favor del binario local del proyecto. Cero cambios en `package.json` / `pnpm-lock.yaml` / `node_modules`.                                                  |

## Known Stubs

Ninguno. El archivo prueba los 12 contratos de la fase completos, en sus dos direcciones. Lo que falta es alcance explícito de los planes siguientes: el rollout a `eltemplo_staging` y `eltemplo` (168-06) y las fixtures 2-tenant completas (fase 171), que van a reemplazar los helpers locales de este archivo.

## Threat Flags

Ninguna superficie nueva de red, auth o acceso a archivos: el plan agrega un archivo de test.

## Notas para el plan siguiente (168-05 / 168-06)

- El archivo corre en CI como cualquier otro test de la suite. **Si el 168-06 aplica la 0196 a staging o prod y algo sale distinto, este archivo NO lo detecta** —corre contra `eltemplo_test_<POOL_ID>`—: la evidencia contra las bases reales sigue siendo `pnpm db:verify-uniques` (D-12).
- El tenant de prueba es el id **90168**. Si la fase 171 elige otro id para sus fixtures 2-tenant, no hay conflicto: este archivo lo crea y lo borra dentro de su propio ciclo de vida.
- El archivo **no** agregó nada a `test/helpers.ts` a propósito. Cuando la 171 construya las fixtures 2-tenant reales, `limpiarTenantSegundo` y las 8 fixtures locales son el prototipo a promover — con la excepción documentada de `branches` resuelta de otra forma.
- `day_modes` y `cost_centers` vienen **seedeadas por migraciones** y no están en `TABLES_TO_CLEAN`: cualquier test futuro que inserte ahí tiene que borrar solo lo suyo, nunca la tabla entera.

## Self-Check

- `el-templo-api/test/tenancy/con-01-uniques-cross-tenant.test.ts` — FOUND (worktree `et-168-contratos`, 941 líneas)
- Commit `2c1af25f` — FOUND
- Commit `a0216641` — FOUND
- `npx tsc --noEmit` — PASSED (exit 0)
- `npx vitest run test/tenancy/con-01-uniques-cross-tenant.test.ts` — PASSED (14/14)
- `SELECT COUNT(*) FROM tenants` en `eltemplo_test_1` = 1, filas con `tenant_id = 90168` = 0 — PASSED
- Checkout principal en `fix/referral-preview-y-refresh-ficha` con su working tree ajeno intacto — VERIFICADO

## Self-Check: PASSED
