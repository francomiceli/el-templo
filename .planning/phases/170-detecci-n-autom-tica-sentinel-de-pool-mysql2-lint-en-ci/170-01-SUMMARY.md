---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
plan: 01
subsystem: database
tags: [multi-tenancy, tenant-id, drizzle, mysql, vitest, fail-closed, registro-canonico]

# Dependency graph
requires:
  - phase: 167-columnas
    provides: "GYM_OWNED_TABLES (87 tablas) + isGymOwnedTable — la lista contra la que se cruza toda tabla strict"
  - phase: 168-contratos-sql
    provides: "El idioma de registro con motivo obligatorio (TENANT_GLOBAL_UNIQUES / TENANT_UNIQUE_ALLOWLIST) y sus gates de forma en test/db/tenant-tables.test.ts"
  - phase: 169-capa-de-escritura
    provides: "tenantWhere / tenantValues — la definición operativa de qué significa 'módulo migrado'"
provides:
  - "TENANT_STRICT_MODULES — registro canónico único módulo → tablas de los módulos ya migrados al patrón de tenant (D-05/D-06), inicializado vacío"
  - "isStrictTable(name) — el predicado que usa el sentinel para decidir throw vs silencio"
  - "strictTablesSet() — el registro aplanado, default del parámetro inyectable strictTables del sentinel (D-07)"
  - "5 gates de forma fail-closed sobre el registro nuevo"
affects: [170-02, 170-03, 170-04, 170-05, 170-06, 172-adopcion-finance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registro canónico por fase dentro de src/db/tenant-tables.ts: sección propia con separador, registro + Set module-level + helpers que aceptan string"
    - "Lista que arranca vacía con gate de conteo exacto: la primera entrada es una decisión de diseño visible en el diff"

key-files:
  created: []
  modified:
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts

key-decisions:
  - "El registro vive en src/db/tenant-tables.ts como sección propia al cierre del archivo (no intercalada en el bloque de la fase 168), respetando el sectionado por fase que el archivo ya tiene"
  - "El docblock del registro escribe las DOS consecuencias de agregar una entrada (throw del sentinel D-08 + vaciar tenant-lint-allowlist.json D-15) como un solo acto indivisible, no como dos tareas separables"
  - "El gate 5 incluye la aserción negativa isStrictTable('bookings') === false con la instrucción escrita de actualizar el ejemplo en la 172, no de borrar el gate"

patterns-established:
  - "Gate de conteo exacto sobre una lista vacía: el mensaje explica qué habilita la primera entrada, para que agregarla obligue a leer las consecuencias"
  - "Gate de referencia cruzada de un registro anidado (módulo → tablas): los hallazgos se reportan como 'modulo: tabla', nunca la tabla suelta"

requirements-completed: [CON-05, CON-06]

# Metrics
duration: 22min
completed: 2026-07-28
---

# Phase 170 Plan 01: Fuente canónica de módulos migrados (TENANT_STRICT_MODULES) Summary

**El sentinel y el lint de la fase 170 ya tienen su única fuente de verdad para separar "deuda conocida" de "regresión": un registro módulo → tablas que arranca vacío a propósito y que no puede crecer con una tabla inventada, duplicada ni en silencio.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-28T19:28Z
- **Completed:** 2026-07-28T19:50Z
- **Tasks:** 3/3 (Task 1 satisfecho por el worktree preexistente — ver Desvío 1)
- **Files modified:** 2

## Accomplishments

- **`TENANT_STRICT_MODULES` existe y es la única lista** que van a leer los dos vigilantes de la fase (`src/db/sentinel/install.ts` y `src/db/scripts/lint-tenant.ts`). Vive junto a `GYM_OWNED_TABLES`, sin duplicarla: las tablas strict se cruzan contra ella, no se re-listan.
- **Arranca vacía y el gate lo hace explícito.** En la 170 no hay ningún módulo migrado; el gate de conteo exacto convierte a la primera entrada (fase 172, `finance`) en una decisión de diseño que aparece en el diff con sus dos consecuencias escritas.
- **`isStrictTable` / `strictTablesSet` cierran el contrato con el sentinel.** `strictTablesSet()` es el default del parámetro inyectable `strictTables` (D-07): el test del criterio 1 del plan 04 va a poder inyectar una tabla real como strict y afirmar el throw **sin** declarar migrado nada en el código.
- **Los 3 modos de podredumbre del registro quedan cerrados** (T-170-04): tabla inexistente, tabla con dos dueños y helper desalineado dejan la suite roja con un mensaje que nombra la acción concreta.

## Task Commits

1. **Task 1: Worktree de la fase sobre `origin/master`** — sin commit (no toca archivos del repo; ver Desvío 1)
2. **Task 2: `TENANT_STRICT_MODULES` + `isStrictTable` + `strictTablesSet`** — `0745ca73` (feat)
3. **Task 3: Gates de forma en `test/db/tenant-tables.test.ts`** — `79633c2c` (test)

## Files Created/Modified

- `el-templo-api/src/db/tenant-tables.ts` — +84/-1. Sección nueva "Fase 170 (CON-05 / CON-06)" al cierre del archivo: el registro `TENANT_STRICT_MODULES` con su docblock, `STRICT_SET` module-level (mismo patrón que `GYM_OWNED_SET`) y los dos helpers. La única línea borrada es la de la cabecera del módulo, reemplazada por la versión que nombra el registro concreto y sus dos consumidores. Cero cambios en `GYM_OWNED_TABLES`, `TENANT_EXEMPT_TABLES`, `TENANT_GLOBAL_UNIQUES`, `TENANT_UNIQUE_ALLOWLIST` y `PLATFORM_PHYSICAL_TABLES`.
- `el-templo-api/test/db/tenant-tables.test.ts` — +155/-0. `describe("TENANT_STRICT_MODULES (fase 170, D-05/D-06)")` con 5 gates, precedido del docblock `QUÉ PRUEBA` / `POR QUÉ NO ALCANZA CON EL LINT NI CON EL SENTINEL` y de la declaración "este describe NO toca la base de datos".

## Decisions Made

- **Ubicación del bloque nuevo: al cierre del archivo, en sección propia.** El plan admitía dos lugares ("después de `TENANT_UNIQUE_ALLOWLIST`, antes de `PLATFORM_PHYSICAL_TABLES`, o al cierre"). Se eligió el cierre porque el archivo ya está seccionado por fase (fase 166/167 arriba con su helper, fase 168 con su bloque de registros + helpers) e intercalar la 170 en el medio del bloque de la 168 habría partido ese bloque en dos. Resultado: cero deleciones en las listas existentes.
- **El docblock del registro es el que carga la obligación D-15.** El lint la va a hacer cumplir (plan 06), pero el momento en que alguien lee esto es cuando está por agregar una entrada — por eso el "OBLIGA a vaciar `tenant-lint-allowlist.json`" está escrito en el registro y repetido en el mensaje del gate 1, no solo en el lint.
- **El gate 5 lleva una aserción negativa contra una tabla viva (`bookings`).** Sin ella, un `isStrictTable` que devolviera `true` siempre pasaría los otros cuatro gates (que hoy iteran sobre un registro vacío). El comentario dice explícitamente que la 172 actualiza el ejemplo, no borra el gate.

## Deviations from Plan

### 1. [Rule 3 - Blocking] Worktree de la fase: nombre y rama distintos a los del plan

- **Found during:** Task 1
- **Issue:** El plan pide crear `/home/franco/projects/et-170-deteccion` con la rama `feat/170-deteccion-automatica`. El worktree de la fase **ya existía**, creado por el orquestador antes de spawnear al ejecutor, como `/home/franco/projects/et-170-sentinel` en la rama `feat/170-sentinel-lint`, y el contrato de ejecución prohíbe explícitamente trabajar fuera de él.
- **Fix:** No se creó un segundo worktree (el propio plan dice "si el worktree ya existe, NO recrearlo: verificar que su HEAD desciende de `origin/master` y seguir"). Se verificaron las condiciones de aceptación del Task 1 contra el worktree real: aparece en `git worktree list`, `origin/master` es ancestro de su HEAD (base `274f52bd`, sobre `a70ee297`), `git status --porcelain el-templo-api/pnpm-lock.yaml` no imprime nada y `el-templo-api/node_modules/typescript/package.json` existe (o sea: dependencias ya materializadas, no hizo falta correr `pnpm install`). Cero commits en `master`/`staging`, cero `git push`.
- **Files modified:** ninguno
- **Verification:** `git worktree list`, `git merge-base --is-ancestor origin/master HEAD`, `git status --porcelain -- el-templo-api/pnpm-lock.yaml` (vacío), `ls el-templo-api/node_modules/typescript/package.json`
- **Committed in:** n/a (Task 1 no toca archivos del repo)
- **Nota para los planes 02-06:** todas sus referencias a `/home/franco/projects/et-170-deteccion` hay que leerlas como `/home/franco/projects/et-170-sentinel`, rama `feat/170-sentinel-lint`.

### 2. [Rule 3 - Blocking] Faltaban los `.env` locales en el worktree, la suite no podía provisionar MySQL

- **Found during:** Task 3
- **Issue:** `pnpm exec vitest run test/db/tenant-tables.test.ts` moría en `test/setup-global.ts` con `ER_ACCESS_DENIED_ERROR` (`Access denied for user 'root'@'localhost' (using password: NO)`). El worktree solo tenía `.env.example`: `.env` y `.env.development` están gitignoreados (`el-templo-api/.gitignore:8` → `.env*`), así que un worktree nuevo nace sin credenciales y `setup-global.ts` cae a los defaults (`root` sin password).
- **Fix:** Se copiaron `.env` y `.env.development` del worktree hermano `et-169-tenant-layer` (mismo milestone, misma base de test local). **Cero paquetes instalados** y **cero cambios en `pnpm-lock.yaml`**.
- **Files modified:** ninguno versionado — los dos archivos están gitignoreados y `git status` sigue sin verlos (verificado con `git check-ignore -v`).
- **Verification:** `git check-ignore -v .env .env.development` confirma que están ignorados; `git status --porcelain -- el-templo-api/` no los lista; la suite pasó a correr y quedó en verde.
- **Committed in:** n/a (ningún archivo versionado cambió)
- **Nota para los planes 02-06:** un worktree recién creado necesita este paso antes de correr cualquier test. No es un problema de este plan, es una propiedad de los worktrees del repo.

---

**Total deviations:** 2 auto-fixed (2 × Rule 3 - bloqueo)
**Impact on plan:** Ninguno sobre el código entregado. Los dos desvíos son de infraestructura del entorno (identidad del worktree y credenciales locales gitignoreadas), no de diseño: los tres artefactos de código y los cinco gates salieron exactamente como los especifica el plan. Cero scope creep, cero dependencias, cero migraciones.

## Issues Encountered

- **La corrida del archivo de test tarda ~115 s.** No es un problema de este plan: el `setupFiles` de Vitest provisiona MySQL para **todo** archivo de test, incluso para uno que solo hace introspección de objetos importados (hallazgo 169-07, ya documentado en el CONTEXT). Los 17 tests en sí corren en milisegundos. Confirma la elección de D-09 de que el lint **no** sea un gate de Vitest.
- **La prueba negativa dejó rojos DOS gates, no uno.** Esperado y correcto: la sonda `{ finance: ["tabla_que_no_existe"] }` viola a la vez el gate 1 (la lista deja de estar vacía) y el gate 2 (la tabla no existe en `GYM_OWNED_TABLES`). Se registra acá porque el criterio del plan pedía nombrar el gate 2 y conviene que el que lo repita no lea el segundo rojo como un falso positivo.

## Verification Results

| Verificación                                              | Resultado                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm exec tsc --noEmit`                                  | ✅ exit 0 (corrido después del Task 2 y otra vez al cierre, con la sonda ya revertida)             |
| `pnpm exec vitest run test/db/tenant-tables.test.ts`      | ✅ **17 tests passed** (12 preexistentes + 5 nuevos)                                               |
| Exports exactos en `tenant-tables.ts`                     | ✅ `TENANT_STRICT_MODULES`, `isStrictTable`, `strictTablesSet` — una ocurrencia de cada uno        |
| `TENANT_STRICT_MODULES` inicializado vacío                | ✅ `= {}`, sin ninguna clave                                                                       |
| Diff acotado                                              | ✅ exactamente 2 archivos, +239/-1 (la única deleción es la línea de cabecera reemplazada)         |
| Ocurrencias nuevas de `any`                               | ✅ 0 en todo el diff                                                                               |
| `pnpm-lock.yaml`                                          | ✅ sin cambios — cero dependencias instaladas o actualizadas                                       |
| Migraciones de DB                                         | ✅ ninguna (la numeración sigue reservada desde 0197 para quien la necesite)                       |

### Prueba negativa del gate 2 (fail-closed demostrado en vivo)

Sonda temporal en `src/db/tenant-tables.ts`:

```ts
export const TENANT_STRICT_MODULES: Record<string, readonly string[]> = {
  finance: ["tabla_que_no_existe"],
};
```

Resultado: **2 failed | 15 passed**. El gate 2 nombró la tabla en el mensaje —
`Tablas de TENANT_STRICT_MODULES que NO están en GYM_OWNED_TABLES: finance: tabla_que_no_existe` —
y el gate 1 falló en paralelo (`tiene 1 entradas, esperadas 0`). Los 12 gates preexistentes
siguieron en verde, o sea que la sonda no contaminó nada más.

Sonda **revertida sin commitear el estado roto** (idioma 168-05 / 169-04): `git diff` sobre
`src/db/tenant-tables.ts` quedó vacío después de revertir, y el commit `0745ca73` contiene la
versión con `= {}`.

## User Setup Required

None — cero variables de entorno nuevas, cero servicios externos, cero configuración manual.

## Next Phase Readiness

**Listo para los planes 02-06 de la fase 170:**

- El plan 04 (sentinel) puede importar `isStrictTable` y `strictTablesSet` de `../tenant-tables`; `strictTablesSet()` es el default del parámetro `strictTables` de `SentinelOptions` (D-07) y hoy devuelve un `Set` vacío, con lo cual el sentinel arranca sin hacer throw sobre nada real.
- El plan 06 (lint) puede importar `TENANT_STRICT_MODULES` para el gate de coherencia D-15 (tabla strict + entrada viva en la allowlist = rojo). Hoy ese gate no puede disparar, porque no hay tablas strict — es correcto y esperado.
- La fase 172 (adopción de `finance`) tiene el camino escrito en tres lugares que se leen solos: el docblock del registro, el mensaje del gate 1 y el comentario del gate 5.

**Dos avisos para los planes siguientes de esta fase:**

1. El worktree es `/home/franco/projects/et-170-sentinel` (rama `feat/170-sentinel-lint`), **no** `et-170-deteccion` / `feat/170-deteccion-automatica` como dicen los planes 02 y 05. Ver Desvío 1.
2. Un worktree recién creado no trae `.env` / `.env.development` (gitignoreados) y sin ellos ningún test corre. Ver Desvío 2.

**Sin blockers.** Nada se pusheó, nada se mergeó a `staging` ni a `master`: el trabajo vive en la rama local del worktree, como manda el skill de change-control.

## Threat Flags

Ninguna superficie nueva. Los dos archivos tocados son metadata y test — cero endpoints, cero rutas de auth, cero acceso a archivos, cero cambios de schema. El plan aporta a la mitigación de T-170-01 (habilita el throw del sentinel y el gate D-15) y cierra T-170-04 con los gates 2, 3 y 5.

---

_Phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci_
_Plan: 01_
_Completed: 2026-07-28_
