---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
plan: 04
subsystem: database
tags:
  [
    multi-tenancy,
    tenant-id,
    sentinel,
    mysql2,
    pool,
    monkeypatch,
    dedup,
    setinterval,
    vitest,
    fail-closed,
  ]

# Dependency graph
requires:
  - phase: 170-01
    provides: "strictTablesSet() — el default de la lista strict inyectable (D-07)"
  - phase: 170-02
    provides: "analyzeSql + fingerprint — la decisión pura sobre la que este plan monta el mecanismo"
provides:
  - "installSentinel(pool, opts) — envuelve pool.query, pool.execute y pool.getConnection por debajo de Drizzle y devuelve el handle"
  - "TenantSentinelError — error tipado con sql y tables, con el SQL y la acción concreta en el mensaje (D-07)"
  - "SentinelHandle (inspect / snapshot / report / stop) + SentinelOptions + SentinelMode + SentinelCounters — el contrato que consume el plan 06 en plugins/database.ts"
  - "Matriz de severidad completa: throw solo para strict en test/dev, log deduplicado por fingerprint en prod, silencio contado para el resto"
  - "Resumen periódico por log.info con .unref() y stop() idempotente + report() del modo inventario"
  - "24 tests unitarios que congelan el wrap y la severidad sin abrir MySQL"
affects: [170-05, 170-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Monkeypatch de propiedades propias de la instancia (no Proxy) para envolver un objeto que ya está decorado en Fastify y cuya identidad asumen 18 sitios de test"
    - "Marca por Symbol module-level sobre objetos que un pool REUSA, para decorarlos una sola vez en vez de apilar wrappers por checkout"
    - "Timer de proceso con .unref() obligatorio + stop() idempotente: primer setInterval del repo, en un proyecto cuyo Vitest reutiliza el fork entre archivos"
    - "Dobles con métodos en el PROTOTIPO para que hasOwnProperty pueda afirmar el sombreado"

key-files:
  created:
    - el-templo-api/src/db/sentinel/install.ts
    - el-templo-api/test/unit/sentinel-install.test.ts
  modified: []

key-decisions:
  - "El throw del sentinel es SINCRÓNICO (no una promesa rechazada): conserva el stack del call site, que es lo que hace accionable al error, y para Drizzle es indistinto porque llama a query/execute desde funciones async"
  - "Los contadores acumulan SIEMPRE (también en el silencio de D-08); el flag inventory levanta el tope de statements distintos en vez de activar la acumulación"
  - "Tope de 2000 fingerprints distintos fuera del modo inventario: un sql.raw con un valor interpolado genera un fingerprint nuevo por ejecución y este proceso vive semanas en pm2"
  - "inspect() envuelve la evaluación en try/catch y deja pasar solo el TenantSentinelError: un bug del propio vigilante no puede tirar una query legítima"

patterns-established:
  - "Prueba negativa del wrap de getConnection registrada en el SUMMARY: desactivarlo deja rojos exactamente los dos it de la conexión, y el estado roto se revierte sin commitear"
  - "El unref se prueba con hasRef() === false sobre el Timeout real, no espiando el método"

requirements-completed: [CON-05]

# Metrics
duration: 55min
completed: 2026-07-28
---

# Phase 170 Plan 04: Instalación del sentinel (wrap del pool + severidad) Summary

**El sentinel ya está montado: `installSentinel` vigila las TRES puertas por las que entra el SQL —`pool.query`, `pool.execute` y `pool.getConnection`—, decide throw / log deduplicado / silencio según (entorno × lista strict), y lleva la métrica sin colgar la suite ni ensuciar Sentry.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-07-28T20:15Z
- **Completed:** 2026-07-28T21:10Z
- **Tasks:** 3/3
- **Files created:** 2 (1148 líneas, cero deleciones)

## Accomplishments

- **La tercera puerta está tapada.** El doc 03 §3 dice "envolver `pool.query/execute`" y eso deja **100 % ciego el camino de escritura**: `MySql2Session.transaction()` hace `new MySql2Session(await this.client.getConnection(), …)` y a partir de ahí `pool.query` no se llama nunca más. `getConnection` envuelto es lo que pone bajo vigilancia las **65 llamadas a `.transaction(` de 25 archivos** (Pitfall 1, T-170-01). Su `it` dedicado se pone rojo si alguien saca el wrap — demostrado en vivo, ver abajo.
- **La conexión se decora UNA sola vez.** El pool **reusa** los objetos `PoolConnection`: sin marca, cada checkout apila un wrapper más sobre el mismo objeto y la misma query se inspecciona N veces (contadores inflados y una pila de llamadas que crece mientras viva el proceso). La marca es un `Symbol` module-level y tiene su `it` de doble checkout.
- **Identidad del pool conservada.** Monkeypatch de propiedades propias, **cero `new Proxy`**: `fastify.decorate("dbPool", pool)`, el `onClose` que hace `pool.end()` y 18 sitios de test operan sobre esa misma instancia. Un `Proxy` devuelve otro objeto y rompería todo eso en silencio.
- **La matriz de severidad está completa y congelada por tests.** `strict × throw` → `TenantSentinelError` **con el SQL en el mensaje** (D-07); `no-strict × throw` → silencio pero contada (D-08); `mode: "log"` → `log.error` solo en la primera aparición de cada fingerprint (D-01) y **jamás throw**, ni siquiera sobre una tabla strict (T-170-14).
- **El primer `setInterval` del repo no cuelga nada.** Solo existe en modo log, siempre lleva `.unref()` y `stop()` es idempotente. El test lo prueba con `hasRef() === false` sobre el `Timeout` real (Pitfall 4, T-170-07).
- **La métrica no entra a Sentry.** El resumen sale por `log.info` a propósito: `instrument.ts` manda a Sentry los `error` de Pino y esta deuda es CONOCIDA — meterla ahí taparía los errores reales, que es exactamente lo que D-01 y D-02 vienen a evitar (T-170-13).
- **Nada de `params`, nunca.** El wrap los ve (son el segundo argumento) y deliberadamente no los lee ni los propaga al log; el SQL logueado va truncado a 2000 caracteres. Hay aserción negativa: el payload no tiene la clave `params` y el valor `12345` que viajó como parámetro no aparece ni serializando el objeto entero (T-170-02).

## Task Commits

1. **Task 1: Wrap del pool (query + execute + getConnection) y severidad** — `65f9d4d4` (feat)
2. **Task 2: Resumen periódico con unref + modo inventario** — `518d7053` (feat)
3. **Task 3: Batería del wrap y de la severidad con pool y logger falsos** — `d7699edb` (test)

## Files Created/Modified

- `el-templo-api/src/db/sentinel/install.ts` — **nuevo**, 542 líneas. Exporta `installSentinel`, `TenantSentinelError`, `SentinelHandle`, `SentinelOptions`, `SentinelMode`, `SentinelCounters` y `SentinelFingerprintCount`. Docblock de cabecera con `LAS TRES PUERTAS POR LAS QUE ENTRA EL SQL` (la traza real de Drizzle en transacción), `POR QUÉ MONKEYPATCH Y NO Proxy`, `LA MATRIZ DE SEVERIDAD` en tabla, `QUÉ SE LOGUEA Y QUÉ NO`, `LA MÉTRICA, Y POR QUÉ NO ES SENTRY`, `EL MODO INVENTARIO`, `LA LIMITACIÓN, ESCRITA` y `QUÉ HACER CUANDO ESTO SE CAIGA`.
- `el-templo-api/test/unit/sentinel-install.test.ts` — **nuevo**, 606 líneas, **24 tests** en 5 `describe` (el plan pide ≥ 14). Sin `createTestApp`, sin `../helpers`, sin conexión.

## Decisions Made

- **El throw es sincrónico, no un rejection.** El wrap inspecciona antes de delegar, así que en modo throw la excepción sale en el mismo tick que la llamada. Se evaluó devolver `Promise.reject` para imitar el contrato de `mysql2/promise`: se descartó porque el valor del gate es el **stack del call site** (el stack desde adentro del driver no dice qué query fue) y porque un rejection puede perderse en una promesa flotante. Para Drizzle es indistinto: llama a `query`/`execute` desde funciones `async`, así que en el `await` ya es un rejection y el `rollback` de `transaction()` corre normal. Quedó escrito en el código y tiene un `it` propio.
- **Los contadores acumulan siempre; `inventory` levanta el tope.** El plan describe el flag como "acumula todas las violaciones, incluidas las no-strict que en modo throw quedan en silencio". Acumular es gratis y además la dedup de D-01 lo necesita, así que se acumula siempre y el flag hace lo único que cambia de verdad: sacar el tope de statements distintos rastreados. El `report()` deja escrito en la cabecera si el inventario está activo, para que nadie lea números capados creyéndolos completos.
- **Tope de 2000 fingerprints fuera del modo inventario** (ver Desvío 1).
- **`inspect()` no puede matar una query por un bug propio.** La evaluación va dentro de un `try/catch` que deja pasar el `TenantSentinelError` (el throw deliberado) y absorbe cualquier otra cosa con un `log.warn`. Un vigilante que tira producción por un bug suyo es peor que la deuda que vigila (T-170-14).
- **`SentinelCounters` quedó exactamente con los 4 campos del contrato.** El contador de statements omitidos por el tope es interno y se ve en `report()` y en el resumen periódico, para no ensanchar la interfaz que consume el plan 06.

## Deviations from Plan

### 1. [Rule 2 - Missing critical] Tope de statements distintos rastreados (memoria del proceso de prod)

- **Found during:** Task 1
- **Issue:** El plan pide contadores in-memory "por fingerprint (con sql, tablas y count)" sin techo. El texto que ve el pool normalmente viene parametrizado, así que la cantidad de fingerprints está acotada por las formas de query de la app… **salvo un `sql.raw` con un valor interpolado**, que genera un fingerprint nuevo por ejecución. Este proceso vive semanas en pm2: un `Map` sin techo crece sin límite, y encima cada fingerprint nuevo emitiría su `log.error`.
- **Fix:** `MAX_TRACKED_FINGERPRINTS = 2000` fuera del modo inventario (en modo inventario el tope es infinito: la corrida de la suite quiere el inventario completo de D-04). Al llegar al tope se siguen contando el total y el desglose por tabla, no se agregan entradas nuevas y no se emite un `log.error` nuevo. El contador de omitidos sale en `report()` y en el resumen.
- **Files modified:** `el-templo-api/src/db/sentinel/install.ts`
- **Verification:** `pnpm exec tsc --noEmit` en 0; el motivo está escrito arriba de la constante.
- **Committed in:** `65f9d4d4`

### 2. [Rule 2 - Missing critical] `try/catch` alrededor de la evaluación y del resumen periódico

- **Found during:** Task 1 y Task 2
- **Issue:** El plan no dice qué pasa si `analyzeSql` lanza (un bug de regex, un input raro). En `mode: "log"` eso tiraría **toda query de producción** — exactamente T-170-14 al revés. Y una excepción adentro del callback del `setInterval` no tiene quién la capture: mata el proceso.
- **Fix:** `inspect()` envuelve `evaluar()` en `try/catch`, re-lanza el `TenantSentinelError` (el throw deliberado del gate) y absorbe cualquier otra cosa con un `log.warn` que aclara que la query no se vio afectada. `emitirResumen()` tiene su propio `try/catch` con `log.warn`.
- **Files modified:** `el-templo-api/src/db/sentinel/install.ts`
- **Verification:** los 24 tests siguen distinguiendo el throw deliberado del absorbido (el `it` de strict + throw sigue en verde).
- **Committed in:** `65f9d4d4` y `518d7053`

### 3. [Rule 3 - Blocking] El worktree es `et-170-sentinel`, no `et-170-deteccion`

- **Found during:** arranque
- **Issue:** El `<context>` del plan y sus tres bloques `<verify>` referencian `/home/franco/projects/et-170-deteccion`, que no existe.
- **Fix:** Se trabajó en `/home/franco/projects/et-170-sentinel` (rama `feat/170-sentinel-lint`), el worktree real de la fase — mismo desvío ya registrado en los SUMMARY 01, 02 y 03. Los comandos de verificación se corrieron con esa ruta. Cero worktrees nuevos.
- **Files modified:** ninguno
- **Committed in:** n/a
- **Nota:** se hereda tal cual para los planes 05 y 06.

### 4. [Rule 3 - Blocking] `stop()` y `report()` existen desde el Task 1 aunque el timer lo agrega el Task 2

- **Found during:** Task 1
- **Issue:** `SentinelHandle` es un contrato de cuatro métodos, pero el timer que `stop()` limpia pertenece al Task 2. Un Task 1 que no los exportara no typechearía contra el contrato del plan.
- **Fix:** El Task 1 dejó `stop()` con el comentario de que el timer llega en el Task 2, y el Task 2 lo completó con el `clearInterval`. Los dos commits typechean por separado y ninguno estuvo "verde por casualidad".
- **Files modified:** ninguno más allá de lo ya listado
- **Committed in:** n/a

---

**Total deviations:** 4 (2 × Rule 2 — robustez de runtime que el plan no cubría; 2 × Rule 3 — bloqueos de entorno/proceso)
**Impact on plan:** Ninguno sobre el contrato entregado. Los exports, la firma de `installSentinel`, la matriz de severidad, el timer y el modo inventario salieron como los especifica el plan. Cero dependencias, cero migraciones, cero `any`, cero `console.`.

## Issues Encountered

- **Los tres primeros tests del throw fallaron por asumir un rejection.** Estaban escritos con `await expect(...).rejects.toBeInstanceOf(...)` y el sentinel lanza **sincrónicamente**. No se cambió el código para acomodar el test: se decidió (y se documentó) que el throw sincrónico es lo correcto, y se reescribieron los tres `it` con `expect(() => …).toThrow(...)` más un `it` nuevo que fija ese contrato explícitamente.
- **La primera corrida del archivo murió con `Hook timed out in 120000ms`** provisionando la base del worker. Es el hallazgo 169-07 otra vez (el `setupFiles` del repo provisiona MySQL para TODO archivo de test, incluido uno que no la toca): la corrida siguiente, idéntica, tardó ~99 s y pasó. Se corrió con `--hookTimeout=420000` para no volver a rozar el límite. Los 24 tests corren en milisegundos; el resto es provisioning. Reconfirma D-09: el lint de la fase no puede ser un gate de Vitest.
- **Los hooks de husky no corren en este worktree** (`core.hooksPath` apunta a `.husky/_`, que no existe en el checkout linkeado, y no hay `node_modules` en la raíz). Se corrió `prettier --write` a mano con el binario de `el-templo-api/node_modules/.bin` sobre los dos archivos antes de cada commit, para que el formato quede igual que si el hook hubiera corrido.

## Verification Results

| Verificación                                                                | Resultado                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm exec tsc --noEmit`                                                    | ✅ exit 0 (después de cada task y al cierre)                 |
| `pnpm exec vitest run test/unit/sentinel-install.test.ts`                   | ✅ **24 tests passed** (el plan pide ≥ 14)                   |
| `grep -c "console\." src/db/sentinel/install.ts`                            | ✅ 0                                                         |
| `grep -c "new Proxy" src/db/sentinel/install.ts`                            | ✅ 0                                                         |
| Ocurrencias de `any` (código) en los dos archivos                           | ✅ 0 (la única aparición es la palabra en un comentario)     |
| `grep -c "getConnection" src/db/sentinel/install.ts`                        | ✅ > 0 — los tres métodos envueltos                          |
| `grep -c "unref()"` / `grep -c "clearInterval"`                             | ✅ > 0 en ambos                                              |
| `grep -cE "createTestApp\|\.\./helpers" test/unit/sentinel-install.test.ts` | ✅ 0                                                         |
| `TenantLogger` importado de `../../modules/shared/tenant`                   | ✅ sin interface de logger nueva                             |
| Default de `strictTables` = `strictTablesSet()` de `../tenant-tables`       | ✅                                                           |
| El resumen periódico usa `log.info` (no `log.error`)                        | ✅ con el motivo escrito (Sentry recibe los `error` de Pino) |
| El payload del resumen y el del `log.error` sin clave `params`              | ✅ aserciones negativas dedicadas                            |
| Tamaño de los artefactos                                                    | ✅ 542 líneas (mín. 150) y 606 líneas (mín. 150)             |
| Diff acotado                                                                | ✅ 2 archivos, +1148/-0, cero deleciones                     |
| `pnpm-lock.yaml`                                                            | ✅ sin cambios — cero dependencias instaladas o actualizadas |
| Migraciones de DB                                                           | ✅ ninguna (la numeración sigue reservada desde 0197)        |
| `STATE.md` / `ROADMAP.md`                                                   | ✅ NO modificados por este ejecutor                          |

### Prueba negativa del wrap de `getConnection` (fail-closed demostrado en vivo)

Sonda temporal en `src/db/sentinel/install.ts` — se desactivó la decoración de la
conexión devuelta, dejando el `getConnection` envuelto pero inofensivo:

```ts
const conn: MarkedConnection = await originalGetConnection();
if (false as boolean) {   // SONDA TEMPORAL: decoración de la conexión desactivada
```

Resultado: **2 failed | 22 passed**. Los dos rojos son exactamente los que protegen
la mitigación de T-170-01:

- `getConnection devuelve la MISMA conexión, con query y execute envueltos`
- `un segundo checkout NO apila wrappers sobre la misma conexión`

Los 22 restantes —severidad, dedup, truncado, timer, reporte— siguieron en verde: la
sonda no contaminó nada más y el rojo señala la causa exacta.

Sonda **revertida sin commitear el estado roto** (idioma 168-05 / 169-04 / 170-02):
`git diff` quedó limpio sobre esa línea y el commit `65f9d4d4` contiene la versión
con la marca en pie.

## User Setup Required

Ninguna. El flag `SENTINEL_INVENTORY` (D-08) se lee con `=== "1"` y su ausencia
significa "modo normal", así que no hace falta tocar `.env` ni `.env.example`
todavía: **el sentinel no está instalado en ningún lado hasta el plan 06**, que es
el que lo monta en `plugins/database.ts` y el que tiene que documentar la variable.

## Next Phase Readiness

**Listo para el plan 06 (integración en `plugins/database.ts`):**

- El contrato está exportado y estable: `installSentinel(pool, { log }) → SentinelHandle`.
- **Lo que el plan 06 tiene que hacer y este deliberadamente NO hace:** llamar
  `installSentinel(pool, { log: fastify.log })` **antes** de `drizzle(pool)`, y
  llamar `handle.stop()` en el `onClose` que ya existe al lado de `pool.end()`
  (sin eso, el timer sobrevive al cierre de la app en los tests que crean y
  destruyen apps).
- **Regresión obligatoria del plan 06:** una query adentro de `db.transaction()`
  que el sentinel VEA. El test unitario prueba el wrap contra un pool falso; que
  el SQL real de Drizzle pase por esos métodos solo lo puede probar la
  integración (Pitfall 1).
- **Para el inventario de D-04:** correr la suite con `SENTINEL_INVENTORY=1` y
  volcar `handle.report()`. Recordar el hallazgo del 170-02: las 9 exenciones
  `tenant-safe:` de la fase 169 **no viajan en el SQL** (D-17), así que van a
  aparecer como violaciones no-strict. Es correcto y es deuda real.
- **Ojo con `createDbConnection()` de `src/db/index.ts`** (Pitfall 8): es código
  muerto con cero consumidores y su comentario dice "Used by the main
  application" — miente. El plan 06 tiene que borrarlo o anotarlo apuntando a
  `plugins/database.ts` como el único pool vigilado.

**Sin blockers.** Nada se pusheó, nada se mergeó a `staging` ni a `master`: los tres
commits viven en la rama local `feat/170-sentinel-lint` del worktree.

## Threat Flags

Ninguna superficie nueva: cero endpoints, cero rutas de auth, cero acceso a
archivos, cero cambios de schema, cero dependencias. El plan **mitiga** T-170-01
(wrap de `getConnection` + marca contra el apilado, con prueba negativa
registrada), T-170-02 (nunca los `params`, SQL truncado a 2000, aserciones
negativas), T-170-03 (monkeypatch sin allocations extra en vez de `Proxy`),
T-170-07 (timer solo en modo log, `.unref()`, `stop()` idempotente y `it` que
verifica que en modo throw no hay timer), T-170-13 (dedup por fingerprint +
resumen por `log.info`, fuera del canal que llega a Sentry) y T-170-14 (en modo
log jamás lanza, ni sobre tablas strict; y un bug interno del sentinel no puede
tirar una query). T-170-SC queda cerrado: cero paquetes instalados.

Nota de superficie nueva **de logging** (ya prevista por el threat model, no es un
flag): el sentinel escribe texto de SQL a un canal que persiste (pm2/Pino). Es
seguro porque el texto que ve el pool viene con placeholders `?` y los `params`
nunca se leen.

## Self-Check: PASSED

- Archivos: `el-templo-api/src/db/sentinel/install.ts`, `el-templo-api/test/unit/sentinel-install.test.ts` y este SUMMARY existen en disco.
- Commits: `65f9d4d4`, `518d7053` y `d7699edb` existen en `feat/170-sentinel-lint`.
- `STATE.md` y `ROADMAP.md` NO fueron modificados por este ejecutor (los escribe el orquestador).

---

_Phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci_
_Plan: 04_
_Completed: 2026-07-28_
