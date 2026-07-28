---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
plan: 05
subsystem: database
tags:
  [multi-tenancy, tenant-id, lint, allowlist, ratchet, ci-gate, cli, fail-closed, git]

# Dependency graph
requires:
  - phase: 170-01
    provides: "strictTablesSet() — el default inyectable del gate de coherencia D-15"
  - phase: 170-03
    provides: "lintTenantSources / TenantAccess / ExemptionRecord — el motor que este plan convierte en gate"
provides:
  - "tenant-lint-allowlist.json — la allowlist decreciente (archivo + tabla, sin lineas), arrancando vacia"
  - "lintTenant(opts) — los cuatro gates del ratchet compuestos sobre el motor, funcion pura sin git ni MySQL"
  - "formatReport(report) — reporte con un renglon 'Que hacer' por hallazgo y el inventario D-12"
  - "runLint(argv) — la CLI sin process.exit adentro, con el contrato 0/1/2 del repo"
  - "resolveBaseRef / readBaseAllowlist — la resolucion fail-closed de la rama base (SHA nulo y clone shallow contemplados)"
  - "pnpm lint:tenant — el comando local"
  - "16 tests nuevos (35 en el archivo) que congelan los gates y los tres exit codes"
affects: [170-06, 170-07, 170-08, 172-adopcion-finance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registro en JSON y no en .ts cuando el consumidor tiene que leerlo en OTRA revision de git: JSON.parse no ejecuta lo que lee"
    - "Excepcion fail-open UNICA, acotada y ruidosa (el commit que introduce la allowlist) escrita como tal, en un camino que por lo demas es fail-closed"
    - "La CLI devuelve { code, output } y el process.exit vive solo en el guard require.main: es lo que hace testeable el contrato de exit codes"
    - "Arbol temporal con la forma que el lint espera (schema copiado + scripts vacio) para probar el exit code 0 sin inventar un flag de alcance"

key-files:
  created:
    - el-templo-api/tenant-lint-allowlist.json
  modified:
    - el-templo-api/src/db/scripts/lint-tenant.ts
    - el-templo-api/test/tenancy/con-06-lint.test.ts
    - el-templo-api/package.json

key-decisions:
  - "El reporte NO imprime numeros de linea (D-13): la unidad accionable es el par (archivo, tabla) que se escribe en la allowlist, y una linea impresa invita a pegarla en la entrada — que es justo lo que hace podrirse la lista con cada reformateo"
  - "Una entrada sigue VIVA si el par (archivo, tabla) tiene algun acceso no cumplidor, este eximido o no: escribir una exencion no obliga a tocar la allowlist en el mismo PR, y ese rojo seria ruido que empuja a desactivar el gate"
  - "unanchoredTags entra al reporte como ADVERTENCIA y nunca como discrepancia: hoy incluye a require-tenant.ts (documenta la convencion), a analyze.ts y al propio lint-tenant.ts (el tag es un dato dentro de una regex)"
  - "runLint atrapa LintArgError y devuelve code 2 en vez de rechazar la promesa: es lo que permite afirmar los tres exit codes desde Vitest sin matar al worker"

patterns-established:
  - "Prueba negativa del fail-closed registrada: se hace que la resolucion de la base asuma 'sin cambios' y se verifica que el it dedicado se pone rojo, revirtiendo sin commitear el estado roto"

requirements-completed: [CON-06]

# Metrics
duration: 70min
completed: 2026-07-28
---

# Phase 170 Plan 05: Allowlist, ratchet y CLI del lint de tenancy Summary

**El motor del plan 03 es ahora un gate ejecutable: `pnpm lint:tenant` sale 0/1/2 con el contrato del repo, la allowlist arranca vacía y solo puede achicarse, y el ratchet no puede pasar en verde por no haber podido mirar la rama base — está demostrado en vivo poniendo el `it` en rojo.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-07-28T17:20Z
- **Completed:** 2026-07-28T18:30Z
- **Tasks:** 3/3
- **Diff:** 4 archivos, +1149/-6

## Accomplishments

- **Los cuatro gates del ratchet están vivos y cada uno tiene su `it`.** Violación no listada (D-13), entrada podrida por archivo inexistente y entrada podrida por deuda ya pagada (D-14, **dos arrays distintos con dos mensajes distintos** a propósito), entrada ganada contra la base (D-14) y tabla strict con entradas vivas (D-15).
- **La distinción entre los dos stale es la que decide si el gate se respeta o se esquiva** (Open Question 4 del RESEARCH). Si los dos dijeran lo mismo, la salida barata sería reapuntar rutas para siempre. Ahora uno dice `ACTUALIZA LA RUTA` (el archivo se movió) y el otro `BORRA LA ENTRADA` (la deuda se pagó), y hay un `it` por cada texto.
- **El gate no puede pasar en verde por ceguera.** `--base` irresoluble, `git` que no responde, JSON que no parsea, allowlist ausente: todo eso es **exit 2**, con el mensaje nombrando `fetch-depth: 0`, que es la causa real el 90 % de las veces (el checkout de GitHub Actions trae `1` por default). Los dos casos que la CI produce sola —el **SHA nulo** de `github.event.before` en el primer push de una rama y el string vacío— se normalizan al `merge-base` con master en vez de reventar.
- **La única excepción fail-open está escrita, acotada y es ruidosa.** Si la allowlist **no existe** en la base, éste es el commit que la introduce: el gate de entradas ganadas se saltea con una advertencia que dice cuántas entradas trae el baseline y que **borrar el archivo es la forma de resetear el ratchet, y se ve en el diff**. Cualquier otro error de lectura sigue siendo 2.
- **No hay ejecución de código ajeno en el camino del ratchet** (T-170-16). La allowlist es JSON, se lee con `git show` vía `execFileSync` **con los argumentos como array, nunca un string de shell**, y se parsea con `JSON.parse`. El docblock explica por qué se rompió el idioma `.ts` del milestone: parsear un `.ts` de una revisión arbitraria exigiría un pase de AST extra o —peor— importarlo, o sea correr código de esa revisión adentro del job de CI.
- **Una ref que empieza con `-` se rechaza antes de llegar a `git`**, para que un valor de `--base` no se cuele como flag del comando.
- **La CLI es testeable de verdad.** `runLint(argv)` devuelve `{ code, output }` y **no llama `process.exit`**: los dos `process.exit` del archivo viven dentro del guard `require.main === module`. Por eso los tres códigos de salida están cubiertos por tests en vez de por confianza.

## Task Commits

1. **Task 1: Allowlist + gates de stale y de coherencia strict + reporte** — `96d2a25d` (feat)
2. **Task 2: Ratchet contra la rama base + CLI con exit codes + pnpm script** — `31bc9f6a` (feat)
3. **Task 3: Batería de los cuatro gates y de los exit codes** — `39d117ae` (test)

## Files Created/Modified

- `el-templo-api/tenant-lint-allowlist.json` — **nuevo**, 14 líneas, `entries: []`. El campo `note` (7 párrafos, la única documentación que admite un JSON) lleva escrito: el formato archivo+tabla sin líneas y por qué, que la lista **solo puede achicarse**, que dejarla quieta tampoco alcanza, que **no existe comando que la regenere** (D-16) y por qué el archivo es JSON.
- `el-templo-api/src/db/scripts/lint-tenant.ts` — **+803 líneas** (1.594 en total). Agrega `AllowlistEntry`, `Allowlist`, `LintArgError`, `parseAllowlist`, `loadAllowlist`, `TenantLintReport`, `LintTenantOptions`, `lintTenant`, `formatReport`, `resolveRepoRoot`, `resolveBaseRef`, `readBaseAllowlist`, `runLint`, `ALLOWLIST_PATH_FROM_ROOT` y el guard de la CLI. Dos secciones nuevas de docblock: `POR QUÉ LA ALLOWLIST ES JSON Y NO UN REGISTRO .ts` y `CÓMO SE CORRE` con los tres modos (local, CI, y **nunca en pre-commit** con el motivo de D-11 escrito).
- `el-templo-api/test/tenancy/con-06-lint.test.ts` — **+337 líneas**, **35 tests** (19 del plan 03 + **16 nuevos**) en cuatro `describe`.
- `el-templo-api/package.json` — **una línea**: `"lint:tenant": "tsx src/db/scripts/lint-tenant.ts"` junto a los `db:verify-*`. Cero cambios en `dependencies`, `devDependencies` y `pnpm-lock.yaml`.

## Decisions Made

- **El reporte no imprime números de línea.** El `must_have` lo pide y además tiene su razón: la unidad accionable es el par `(archivo, tabla)` que se escribe en la allowlist, y una línea impresa invita a pegarla en la entrada — justo lo que D-13 prohíbe porque haría podrirse la lista con cada reformateo. Las líneas siguen en `report.unlistedViolations` para quien las quiera; el texto agrupa por par y muestra el conteo.
- **Una entrada sigue viva aunque el acceso esté eximido.** El plan lo dice ("ningún acceso no cumplidor **ni exento**") y es la lectura tolerante correcta: escribir una exención no debería obligar a tocar la allowlist en el mismo PR. Un rojo por eso sería ruido, y el ruido es lo que termina en alguien desactivando el gate. El error caro (no ver una violación) va por el otro camino, que es estricto.
- **`unanchoredTags` es advertencia, nunca discrepancia** — el aviso explícito del 170-03-SUMMARY. Hoy la lista incluye `require-tenant.ts` (documenta la convención), `sentinel/analyze.ts` (5, el tag es un dato adentro de una regex) y el propio `lint-tenant.ts`. Convertirla en rojo rompería los archivos que explican la regla. Sale agrupada por archivo en las advertencias, para que nadie escriba la anotación de una forma que no exime y se entere en el rojo de CI sin saber por qué.
- **`runLint` atrapa `LintArgError` y devuelve `code: 2`** en vez de rechazar la promesa. Es lo que permite afirmar los tres códigos desde Vitest sin espiar `process.exit`. Los errores que **no** son de uso siguen propagándose y los agarra el `catch` del guard, que también sale 2.
- **El orden de la CLI es deliberado:** flags → root → allowlist → base → escaneo. Los tres caminos de exit 2 fallan **antes** del pase por el repo, así que un error de uso cuesta milisegundos y no 1,1 s.
- **La lista strict es inyectable por parámetro** (`strictTables`), igual que en el sentinel (D-07). El test de D-15 le pasa `bookings` y afirma en el mismo `it` que `strictTablesSet()` sigue vacío: declarar migrado un módulo real para probar un gate sería mentir en el registro canónico.

## Deviations from Plan

### 1. [Rule 1 - Bug] Un byte NUL crudo en el fuente dejaba el archivo como binario para git y grep

- **Found during:** Task 2 (verificación de los criterios grepeables)
- **Issue:** El separador de la clave `(archivo, tabla)` quedó escrito como un **byte NUL literal** dentro del template string, en vez de como secuencia de escape. Compilaba, corría y daba el resultado correcto, pero `grep` respondía `binary file matches` y `git`/GitHub tratan el archivo entero como binario: **el diff de un gate de seguridad dejaba de ser legible**, que es la peor forma de romper un archivo cuyo valor entero es que se revise.
- **Fix:** `const KEY_SEPARATOR = " "` como escape, con el motivo escrito arriba. Verificado: `0` bytes NUL en el archivo y los criterios grepeables del plan vuelven a poder evaluarse.
- **Files modified:** `el-templo-api/src/db/scripts/lint-tenant.ts`
- **Committed in:** `31bc9f6a` (el commit del Task 1, `96d2a25d`, quedó con el byte; el fix llega en el siguiente y está anotado en su mensaje)

### 2. [Rule 2 - Missing critical] `exemptionInventory` en `TenantLintReport`

- **Found during:** Task 1
- **Issue:** El `<interfaces>` del plan tipa el inventario de D-12 como `exemptions: TenantAccess[]`, pero uno de los `must_haves` es que **"el inventario completo de exenciones sale en una sola corrida revisable"**. Con el contrato literal, el inventario del repo real saldría con **3 de 10 entradas**: las 6 exenciones de archivo de los scripts de plataforma y la de `notification-cron.ts` no tienen ningún acceso debajo y por lo tanto no pueden existir como `TenantAccess`. Es el mismo desvío que el plan 03 registró en su propio contrato.
- **Fix:** Se mantuvo `exemptions: TenantAccess[]` tal cual y se **agregó** `exemptionInventory: ExemptionRecord[]`, que el motor del plan 03 ya expone. `formatReport` imprime desde ahí, con las de alcance de archivo marcadas `[ARCHIVO ENTERO]`.
- **Files modified:** `el-templo-api/src/db/scripts/lint-tenant.ts`
- **Verification:** `pnpm lint:tenant` lista las **10** exenciones del repo, 4 de ellas con `covers=0`.
- **Committed in:** `96d2a25d`

### 3. [Rule 2 - Missing critical] `extraWarnings` y un `baseSkipReason` distinto por causa

- **Found during:** Task 2
- **Issue:** La advertencia ruidosa de "la allowlist no existe en la base" la produce `runLint` (es quien habla con git), pero el reporte lo arma `lintTenant`. Sin un canal, la única salida era mutar `report.warnings` después de construirlo. Peor: con un solo texto de "el gate no corrió", el caso "no pasaste `--base`" y el caso "pasaste `--base` pero el archivo no está en la base" salían con el **mismo mensaje**, que además terminaba en "en CI el step tiene que pasar `--base`" cuando el operador **sí** lo había pasado.
- **Fix:** `extraWarnings?: readonly string[]` y `baseSkipReason?: string` en `LintTenantOptions`; dos textos distintos según la causa. Un mensaje que le dice al operador que haga lo que ya hizo es un mensaje que enseña a ignorar los mensajes.
- **Files modified:** `el-templo-api/src/db/scripts/lint-tenant.ts`
- **Committed in:** `31bc9f6a`

### 4. [Rule 3 - Blocking] El árbol temporal para probar el exit code 0

- **Found during:** Task 3
- **Issue:** El plan pide un `it` de "fixture limpio => 0" por `runLint`, pero `runLint` **no** acepta un flag de alcance: usa `DEFAULT_SCOPE_DIRS` (`el-templo-api/src` + `el-templo-api/scripts`) relativo a `--root`. Apuntado al directorio de fixtures, el motor lanza porque esos directorios no existen (fail-closed del plan 03). Y apuntado al repo real, un exit 0 exigiría una allowlist con las ~1.600 entradas del baseline, que es del plan 07.
- **Fix:** Se descartó agregar un `--scope=` (agrandar la superficie de la CLI para complacer a un test es exactamente lo que el plan evita). En su lugar el test arma en `os.tmpdir()` un árbol con **la forma que el lint espera** —`el-templo-api/src/db/schema` copiado y `el-templo-api/scripts` vacío—, que tiene 79 archivos y **cero accesos**. Así el `it` ejercita el alcance por default de verdad, con la allowlist real (vacía) y sin flags inventados. `afterAll` lo borra.
- **Files modified:** `el-templo-api/test/tenancy/con-06-lint.test.ts`
- **Committed in:** `39d117ae`

### 5. [Rule 3 - Blocking] El worktree es `et-170-sentinel`, no `et-170-deteccion`

- **Found during:** arranque
- **Issue:** El `<context>` del plan y sus tres bloques `<verify>` referencian `/home/franco/projects/et-170-deteccion`, que no existe.
- **Fix:** Se trabajó en `/home/franco/projects/et-170-sentinel` (rama `feat/170-sentinel-lint`), el worktree real de la fase — mismo desvío ya registrado en los SUMMARY 01, 02, 03 y 04. Cero worktrees nuevos. **Se hereda tal cual para los planes 06, 07 y 08.**
- **Files modified:** ninguno
- **Committed in:** n/a

---

**Total deviations:** 5 (1 × Rule 1 — bug propio del Task 1; 2 × Rule 2 — el contrato del plan no alcanzaba para sus propios `must_haves`; 2 × Rule 3 — bloqueos de entorno/proceso)
**Impact on plan:** Ninguno sobre el contrato entregado. `lintTenant`, `formatReport`, `runLint`, `LintArgError`, `Allowlist`, `AllowlistEntry` y `TenantLintReport` salieron con las firmas del plan; lo agregado es aditivo. Cero dependencias, cero migraciones.

## Issues Encountered

- **El `grep` del entorno mentía sobre el archivo.** Los criterios de aceptación grepeables del plan (`process.exit` solo en el guard, cero `child_process.exec(`) daban **cero matches de todo** por el byte NUL del desvío 1: la herramienta clasificaba el archivo como binario y ni siquiera lo miraba. El síntoma parecía "grep roto"; era el archivo. Lección para los gates grepeables de esta fase: **un criterio que no puede evaluarse es indistinguible de uno que pasa**.
- **Una aserción de texto se cayó por la mayúscula.** `toContain("La allowlist CRECIO")` contra un renglón que empieza con `Que hacer: la allowlist CRECIO`. Se corrigió la aserción, no el mensaje: el reporte se lee de corrido y la mayúscula habría quedado en el medio de la frase.
- **La corrida del archivo tarda ~104 s** y los 35 tests corren en ~1 s de eso: el resto es el `setupFiles` de Vitest provisionando MySQL para un archivo que **no toca la base**. Cuarta fase consecutiva que reconfirma el hallazgo 169-07, y es literalmente el motivo de D-09 de que el lint sea un step propio de CI y no un gate de Vitest.
- **Los hooks de husky no corren en este worktree** (`core.hooksPath` apunta a `.husky/_`, inexistente en el checkout linkeado). Se corrió `prettier --write` a mano con el binario de `el-templo-api/node_modules/.bin` antes de cada commit, igual que en el plan 04.
- **`console.` en `lint-tenant.ts` pasó de 0 a 4**, todas dentro del guard `require.main === module`. Es lo que el plan pide y CLAUDE.md permite para tooling CLI (precedente escrito en `require-tenant.ts` y en `verify-tenant-uniques.ts`), y quedó dicho en el docblock. Si el 170-06 o el verifier miran ese conteo, éste es el motivo.

## Verification Results

| Verificación                                                          | Resultado                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                              | ✅ exit 0 (después de cada task y al cierre, con la sonda revertida)    |
| `pnpm exec vitest run test/tenancy/con-06-lint.test.ts`               | ✅ **35 tests passed** (el plan pide ≥ 12)                              |
| `pnpm lint:tenant`                                                    | ✅ exit **1** — 1.597 violaciones sin listar, allowlist vacía           |
| `pnpm lint:tenant --base=deadbeef…` (ref inexistente)                 | ✅ exit **2**, y el mensaje nombra `fetch-depth: 0`                     |
| `pnpm lint:tenant --flag-inventado`                                   | ✅ exit **2**                                                           |
| `pnpm lint:tenant --base=origin/master`                               | ✅ excepción única: advertencia ruidosa, gate de ganadas salteado       |
| `pnpm lint:tenant --base=` (string vacío → merge-base)                | ✅ resuelve por fallback, sin error                                     |
| Forma de la allowlist (`entries` vacío, `note` y `scope` con texto)   | ✅ `ALLOWLIST_SHAPE_OK`                                                 |
| `grep -c 'child_process\.exec('`                                      | ✅ 0 — `execFileSync` con argumentos como array (T-170-16)              |
| `process.exit` fuera del guard `require.main === module`              | ✅ 0 — los dos únicos están adentro                                     |
| Bytes NUL en el fuente                                                | ✅ 0 (ver desvío 1)                                                     |
| Ocurrencias de `any` en los dos archivos                              | ✅ 0                                                                    |
| `git status --porcelain el-templo-api/tenant-lint-allowlist.json`     | ✅ vacío después de correr la suite — ningún test la escribe            |
| `pnpm-lock.yaml` / `dependencies` / `devDependencies`                 | ✅ sin cambios — cero paquetes instalados o actualizados (T-170-SC)     |
| Migraciones de DB                                                     | ✅ ninguna (la numeración sigue reservada desde 0197)                   |
| Diff acotado                                                          | ✅ 4 archivos, +1149/-6                                                 |
| `STATE.md` / `ROADMAP.md`                                             | ✅ NO modificados por este ejecutor                                     |

### Prueba negativa del ratchet (fail-closed demostrado en vivo)

Sonda temporal en `runLint`, envolviendo la resolución de la base para que **asuma "sin cambios"** en vez de salir 2 — el modo de falla exacto de T-170-04, que es el que convierte al ratchet en decoración:

```ts
      } catch {
        // SONDA TEMPORAL: "asumir sin cambios" en vez de exit 2.
        baseAllowlist = allowlist;
      }
```

Resultado: `pnpm exec vitest run test/tenancy/con-06-lint.test.ts -t "irresoluble"` quedó en **1 failed** con `esperado 2, recibido 1`. O sea: con la sonda puesta, un `--base` que no se resuelve —lo que produce cualquier clone shallow— dejaría el lint reportando **normalmente y en un código de salida "sano"**, sin haber comparado nada contra la base. Es exactamente el escenario que el `it` existe para impedir.

Sonda **revertida sin commitear el estado roto** (idioma 168-05 / 169-04 / 170-02 / 170-04): `git checkout -- el-templo-api/src/db/scripts/lint-tenant.ts`, `tsc --noEmit` en 0 y `pnpm lint:tenant --base=deadbeef…` de vuelta en **2** antes de escribir el commit del Task 3.

### Salida real de `pnpm lint:tenant` (cabecera)

```
========================================================================
Lint de tenancy (CON-06) — accesos a tablas gym-owned sin gimnasio
========================================================================
Archivos analizados:            429
Entradas de la allowlist:       0

Violaciones NO listadas en la allowlist (unlistedViolations): 1597
```

## User Setup Required

Ninguna. Cero variables de entorno nuevas, cero servicios, cero configuración manual. El comando local es `pnpm lint:tenant` desde `el-templo-api/`.

## Next Phase Readiness

**Listo para el plan 06 (integración del sentinel) y sobre todo para el 07 (baseline) y el 08 (step de CI):**

- **Para el plan 07 (baseline one-shot, D-16):** la allowlist ya existe con `entries: []` y el `note` escrito. El baseline tiene que quedar en **1.597 entradas de acceso agrupadas por par `(file, table)`** — el conteo de pares únicos hay que sacarlo de `report.unlistedViolations`, no de su `length`. El snippet generador es **descartable y no se commitea**: no puede quedar ningún comando que regenere el archivo. Conviene además llenar el campo `generated` y ordenar por `(file, table)`: si queda desordenado, el lint lo dice en una advertencia (no es discrepancia).
- **Para el plan 08 (step de CI):** el step necesita `--base=${{ github.event.before }}` (o el SHA de la base del PR) **y** `fetch-depth: 0` en el checkout del job del API. Con el default `1` el lint sale **2** a propósito. El SHA nulo del primer push ya está contemplado. Ojo con la trampa de `paths-filter` (`event.before`) que la memoria del repo ya tiene documentada.
- **Contrato exportado y estable:** `lintTenant(opts) → TenantLintReport`, `formatReport(report) → string`, `runLint(argv) → { code, output }`, `LintArgError`, `parseAllowlist`, `loadAllowlist`, `resolveBaseRef`, `readBaseAllowlist`.
- **Para las fases de adopción (172+):** activar una tabla en `TENANT_STRICT_MODULES` **obliga** a vaciar sus entradas de la allowlist en el mismo PR (D-15), y el gate ya está probado. El docblock de `TENANT_STRICT_MODULES` ya apuntaba a `tenant-lint-allowlist.json` por nombre desde el plan 01: ese archivo ahora existe.
- **Aviso heredado y todavía vigente:** `unanchoredTags` **no** debe convertirse en rojo tal cual; hoy incluye a `require-tenant.ts`, a `sentinel/analyze.ts` y al propio `lint-tenant.ts`.

**Sin blockers.** Nada se pusheó, nada se mergeó a `staging` ni a `master`: los tres commits viven en la rama local `feat/170-sentinel-lint` del worktree.

## Threat Flags

Ninguna superficie nueva de la aplicación: cero endpoints, cero rutas de auth, cero cambios de schema, cero dependencias. El plan **mitiga** T-170-05 (gate de entradas ganadas + el `note` del JSON + el docblock del test que dice que agrandar la allowlist no es una salida válida), T-170-04 (fail-closed con exit 2 nombrando `fetch-depth: 0`, con `it` dedicado y **prueba negativa registrada arriba**), T-170-15 (no hay modo de generación en el script: la allowlist solo se edita a mano), T-170-16 (JSON + `git show` + `JSON.parse` con `execFileSync` sin shell, y refs que empiezan con `-` rechazadas antes de llegar a git), T-170-01 (la lista solo puede achicarse; los dos stale fuerzan el achique), T-170-17 (gate D-15) y T-170-SC (cero paquetes instalados).

Superficie nueva **de ejecución de procesos**, ya prevista por el threat model y no un flag: el lint invoca `git` (`rev-parse`, `merge-base`, `ls-tree`, `show`). Siempre con `execFileSync` y argumentos como array —nunca un string interpolado por un shell—, y el único valor que viene de afuera (`--base`) se valida contra una forma de ref antes de usarse.

## Self-Check: PASSED

- Archivos: `el-templo-api/tenant-lint-allowlist.json`, `el-templo-api/src/db/scripts/lint-tenant.ts`, `el-templo-api/test/tenancy/con-06-lint.test.ts`, `el-templo-api/package.json` y este SUMMARY existen en disco.
- Commits: `96d2a25d`, `31bc9f6a` y `39d117ae` existen en `feat/170-sentinel-lint`.
- `STATE.md` y `ROADMAP.md` NO fueron modificados por este ejecutor (los escribe el orquestador).

---

_Phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci_
_Plan: 05_
_Completed: 2026-07-28_
