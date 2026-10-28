---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 05
subsystem: tenancy
tags:
  [
    tenancy,
    member-search,
    covered-until,
    ctx-first,
    tenantWhere,
    d-01,
    d-02,
    ado-02,
  ]

# Dependency graph
requires:
  - phase: 173-04
    provides: "shared/audit-log.ts + shared/country-scope.ts migrados; patrón ctx-primero + assertTenant en el borde ya establecido en la fase"
provides:
  - "shared/member-search.ts: buildMemberNameSearchCondition(ctx, search, options) — tenantWhere(users) embebido DENTRO de la condición devuelta (no un elemento aparte); cierra T-173-05-01, la búsqueda por NOMBRE que el piloto identificó como la query más cara"
  - "shared/covered-until.ts: memberCoveredUntilSql(ctx) — subconsulta con FROM subscriptions propio (sin alias), tenantWhere(subscriptions, ctx) inline porque el WHERE de afuera sobre users no alcanza sus filas"
  - "reports/service.ts: buildAccessConditions/buildChargeConditions con su propia entrada de users migrada; getAccessLog/exportAccessLog con ctx nuevo (antes no migrados)"
affects:
  [
    "173-17 (members/service.ts, 23 firmas): HALLAZGO — searchMembers (`/api/admin/members/search`) y exportMembers quedaron con una copia LOCAL sin gimnasio de la búsqueda por nombre; searchMembers es LITERALMENTE T-173-05-01 y debería ser lo primero que 173-17 migre",
    "173-07 / 173-14 (scheduling/service.ts, attendance/service.ts): sus otros accesos a `users` (los innerJoin de getSlotDetail/getSlotAttendance para nombre/apellido) siguen sin scopear — quedan para esos planes, D-02",
    "173-30 (el switch): member-search.ts y covered-until.ts quedan sin una sola entrada de `users`/`subscriptions` en la allowlist de trabajo; el archivo real todavía las tiene (dueño único 173-30)",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "helper que retorna UNA condición (no SQL[]): el tenantWhere va DENTRO de cada `return sql\`...\`` que nombra la tabla strict, incluidos los que viven dentro de un `.map()` — el lint razona por STATEMENT y cada `return` de un callback es su propio statement, así que un tenantWhere en el `return` final del helper NO cubre los `return` internos (mordió 2x en member-search.ts antes de detectarlo con el lint)"
    - "subconsulta correlacionada con FROM propio: sin alias (`FROM subscriptions` pelado) para poder nombrar la tabla físicamente con `tenantWhere(schema.subscriptions, ctx)` sin chocar con un alias tipo `AS s`"
    - "cuando el call site no tiene `ctx` y tocar su firma pública está fuera de alcance (D-02, reservado a otro plan), la salida es una copia LOCAL no exportada de la lógica previa (`legacyUnscopedNameSearchCondition` en members/service.ts, e inline en getExpiredMembers y goal-plans/routes.ts) — preserva el comportamiento exacto sin adelantar la migración de un archivo ajeno"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/shared/member-search.ts
    - el-templo-api/src/modules/shared/covered-until.ts
    - el-templo-api/src/modules/coach/service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/routes.ts
    - el-templo-api/src/modules/goal-plans/routes.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/attendance/routes.ts

key-decisions:
  - "DESVIACION Rule 2/4 (documentada, no bloqueante): el plan dice 'reports/service.ts — solo esa query, nada más del archivo'. Medido con el lint en modo inventario, el archivo tiene ~14 accesos no-compliant a `users` (getAccessLog sin ctx, getExpiredMembers, getTrialConversionReport, getTrialSessionsReport, loadRosterAttribution — ninguno relacionado con member-search). Se migraron SOLO los 2 que el plan nombra (buildAccessConditions, buildChargeConditions) más getAccessLog/exportAccessLog (que SÍ eran la misma query, solo les faltaba ctx threading). El resto queda fuera — la entrada `{reports/service.ts, users}` de la allowlist NO puede desaparecer con este plan solo; ver 'Hallazgos' abajo."
  - "DESVIACION (plan inexacto): 'subscriptions/service.ts' figuraba en el plan como uno de los 4 call sites de covered-until.ts. Verificado con grep: NO existe ningún call site — el archivo tiene su PROPIA función distinta (`deriveCoveredUntil`, semántica diferente: active+scheduled sin 'paused', usada por notification-cron y referrals). No se tocó subscriptions/service.ts en este plan."
  - "searchMembers y exportMembers (members/service.ts) no reciben `ctx` — D-02 reserva las 23 firmas de este archivo al plan 173-17, y las dos ya estaban explícitamente fuera de los 3 call sites que el plan nombra para member-search.ts. Se preservó el comportamiento EXACTO con una copia local (`legacyUnscopedNameSearchCondition`) en vez de importar el helper migrado. searchMembers sirve `/api/admin/members/search` — es LITERALMENTE la query T-173-05-01 (búsqueda por nombre) que el objetivo del plan señala como la más peligrosa. Queda documentado como el hallazgo de más alta prioridad para 173-17."
  - "goal-plans/routes.ts (call site no listado en el plan, forzado por el cambio de firma): no registra `attachCountryScope`/`request.scope` en absoluto (es un módulo aún no migrado a tenancy). Se replicó localmente la misma lógica tokenizada sin gimnasio, en vez de agregar el hook de scope a todo el plugin (fuera de alcance de este plan)."
  - "reports/service.ts getExpiredMembers (call site no listado, forzado por el cambio de firma): tampoco tiene `ctx` y el resto del método tiene deuda de `subscriptions`/`users` sin migrar (fuera de alcance). Copia local tokenizada idéntica a la previa."
  - "El filtro de `member-search.ts` va DENTRO de cada `return sql\`...\`` (incluidos los 2 que viven en el `.map()` de tokens), no solo en el `return` final que combina todo — detectado por el lint (2 violaciones inesperadas en la primera corrida), corregido antes de commitear."
  - "getAccessLog/exportAccessLog (reports/service.ts) y buildAccessConditions no tenían `ctx` — se agregó threading completo (ctx primero, assertTenant en las 2 rutas) porque el plan pide migrar 'su entrada propia de users' y `request.scope` SÍ está disponible ahí (attachCountryScope registrado en el plugin). Se aprovechó para también scopear el innerJoin a `users` de las 2 queries de getAccessLog (D-08: el filtro de la tabla joineada va en el ON) — mismo statement, mismo call chain, costo marginal."

requirements-completed: [ADO-02]

# Metrics
duration: ~230min
completed: 2026-08-08
---

# Phase 173 Plan 05: member-search.ts + covered-until.ts (2 helpers compartidos) — Summary

**Los dos helpers de members que consumen el resto del sistema — `member-search.ts` (búsqueda por nombre/email/DNI, la query más cara del piloto) y `covered-until.ts` (fuente única de "hasta cuándo está cubierto")— migraron a `ctx` primero con `tenantWhere` embebido en la condición devuelta, y en el camino se migró también la entrada propia de `users` de `reports/service.ts` (2 duplicados locales + `getAccessLog`/`exportAccessLog`, que no tenían `ctx` en absoluto).**

## Performance

- **Duration:** ~230 min
- **Tasks:** 2/2
- **Files modified:** 12

## Task Commits

1. **Task 1: `member-search.ts` — ctx primero, filtro inline, barrido de búsquedas por nombre** — `4440e4bb`
2. **Task 2: `covered-until.ts` — lectura de `users`/`subscriptions` filtrada, 4 call sites** — `520fec6c`

---

## Task 1 — `shared/member-search.ts`

`buildMemberNameSearchCondition(ctx, search, options)` — `ctx: TenantContext` PRIMERO. El helper **hace la condición, no la query** (devuelve `SQL | null`), así que ninguna de las tres formas del doc 07 §4(b) aplica textualmente; se optó por embeber `tenantWhere(schema.users, ctx)` **dentro** de cada fragmento devuelto, para que ningún consumidor pueda "olvidarse" de sumarlo por separado (T-173-05-04).

`grep -c "tenantWhere" member-search.ts` → **6**. `grep -rnE "tenantId!|tenantId\s*\?\?"` sobre los 12 archivos tocados por el plan → **0 líneas**.

### La trampa: el lint razona por STATEMENT, no por función

Primera corrida de `pnpm lint:tenant` con el helper "arreglado" (tenantWhere solo en el `return` final que combina los tokens): **2 violaciones inesperadas**, ambas en `member-search.ts` líneas de los `return sql\`...\``DENTRO del`.map()`de tokens (uno para`includeDni=true`, otro para `false`). Cada uno es su propio `ReturnStatement`dentro del bloque de la arrow function — el`tenantWhere`del`return`exterior no los cubre. Fix: el filtro va **también** dentro de cada uno de esos dos`return`, con un comentario explicando el porqué (mismo criterio que "el join va en el ON, también en INNER" — acá es "el filtro va en CADA statement que nombra la tabla, no solo en el que combina").

### Los call sites — más de "3", el plan contaba los explícitos

El plan nombra 3 call sites externos (`coach/service.ts`, `finance/transaction-service.ts`, `reports/service.ts`), pero el cambio de firma **fuerza a compilar** a TODOS los consumidores del helper. Medidos con grep: **8 call sites reales** en 6 archivos.

| Archivo                              | ¿`ctx` a mano?                                                                                            | Acción                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `coach/service.ts` (1)               | Sí (172)                                                                                                  | 1 línea: pasar `ctx`                                                                                                                                   |
| `finance/transaction-service.ts` (1) | Sí (`buildListConditions`, 172)                                                                           | 1 línea: pasar `ctx`                                                                                                                                   |
| `reports/service.ts` (2)             | 1 sí (`buildOutstandingBaseConds`, con `ctx` agregado como parámetro privado), 1 no (`getExpiredMembers`) | 1er caso: threading completo. 2do: copia local tokenizada (fuera de alcance, ver Deviations)                                                           |
| `members/service.ts` (3)             | 1 sí (`listMembers`), 2 no (`searchMembers`, `exportMembers`)                                             | `listMembers`: 1 línea. Los otros 2: copia local `legacyUnscopedNameSearchCondition` (D-02 protege las 23 firmas de este archivo, reservadas a 173-17) |
| `goal-plans/routes.ts` (1)           | No (el módulo no monta `attachCountryScope`)                                                              | Copia local tokenizada inline en la ruta (fuera de alcance expandir tenancy a todo el plugin)                                                          |

### `reports/service.ts` — su propia entrada de `users` (D-02 acotado)

El plan pedía migrar "su entrada propia de `users`" en `reports/service.ts`. Medido con el lint en modo inventario **antes** de tocar nada: **~14 accesos no-compliant** a `users` en el archivo, repartidos en `getAccessLog` (sin `ctx`), `getExpiredMembers`, `getTrialConversionReport`, `getTrialSessionsReport` y `loadRosterAttribution` — ninguno de estos últimos 3 relacionado con la búsqueda por nombre. Se migraron:

- `buildAccessConditions` / `buildChargeConditions` — sus dos duplicados LOCALES de la búsqueda por nombre (CONCAT+LIKE, sin usar el helper compartido — semántica distinta, sin tokenización) recibieron `tenantWhere(schema.users, ctx)` inline (cada `.push()` es su propio statement, mismo hallazgo que member-search.ts).
- `getAccessLog` / `exportAccessLog` — no tenían `ctx` en absoluto. Se agregó threading completo (`assertTenant(request.scope, "reports.access-log")` / `"reports.export-access-log"` en las 2 rutas) y se aprovechó para scopear también el `innerJoin(schema.users, ...)` de sus 2 queries (D-08: el filtro de la tabla joineada va en el ON, no solo en el array de `conditions`).

**Lo que quedó fuera** (getExpiredMembers, getTrialConversionReport, getTrialSessionsReport, loadRosterAttribution): la entrada `{reports/service.ts, users}` de la allowlist real **no puede desaparecer solo con este plan**. Ver "Hallazgos para planes siguientes".

---

## Task 2 — `shared/covered-until.ts`

`memberCoveredUntilSql(ctx)` — `ctx: TenantContext` como **único** parámetro. El helper es una subconsulta correlacionada con **FROM propio** (`FROM subscriptions`), así que el `tenantWhere` de la query de AFUERA (sobre `users`) no alcanza sus filas (doc 07 §4(b)). Se quitó el alias `AS s` (innecesario, sin joins dentro de la subconsulta) para poder nombrar la tabla físicamente con `tenantWhere(schema.subscriptions, ctx)` sin chocar con un alias.

`grep -c "tenantWhere" covered-until.ts` → **4**.

### Los 4 call sites — 3 archivos reales, no 4

El plan lista "attendance/service.ts, scheduling/service.ts, subscriptions/service.ts y members/service.ts" como los 4 call sites. **`subscriptions/service.ts` no existe como call site**: verificado con grep, el archivo no importa ni llama a `memberCoveredUntilSql`. Tiene su PROPIA función `deriveCoveredUntil` (semántica distinta: `active+scheduled` sin `paused`, porque decide si suprimir un push, no si pintar un pill) usada por `notification-cron.ts` y `referrals/service.ts` — un helper hermano, no un consumidor de éste. No se tocó `subscriptions/service.ts`.

Los 4 call sites reales, en 3 archivos:

| Archivo                 | Método              | ¿`ctx` a mano?                                      | Acción                                                                     |
| ----------------------- | ------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| `members/service.ts`    | `listMembers`       | Sí (172)                                            | 1 línea: pasar `ctx`                                                       |
| `members/service.ts`    | `exportMembers`     | No (D-02, 173-17)                                   | Copia local sin gimnasio, query IDÉNTICA a la previa                       |
| `scheduling/service.ts` | `getSlotDetail`     | No (único call site, ruta con `attachCountryScope`) | `ctx` primero + `assertTenant(request.scope, "scheduling.slotDetail")`     |
| `attendance/service.ts` | `getSlotAttendance` | No (único call site, ruta con `attachCountryScope`) | `ctx` primero + `assertTenant(request.scope, "attendance.slotAttendance")` |

`getSlotDetail` y `getSlotAttendance` solo tienen 1 call site cada uno (verificado con grep), así que agregar `ctx` como primer parámetro fue de bajo riesgo. **D-02 se respetó**: el resto de los accesos a `users` de estos 2 métodos (los `innerJoin(schema.users, ...)` para nombre/apellido de socio) **no se tocaron** — quedan para los planes 173-07 (scheduling) y 173-14 (attendance), tal como el plan indica explícitamente.

---

## Verificación

| Comando                                                                                                                                                                                               | Resultado                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec tsc -p tsconfig.json --noEmit`                                                                                                                                                             | limpio                                                                                                                      |
| `pnpm exec tsc -p tsconfig.test-check.json --noEmit` (vía `pnpm typecheck:tests`)                                                                                                                     | 185 errores (== baseline, **0 nuevos**, 0 `TS2554`)                                                                         |
| `pnpm lint:tenant --allowlist=/tmp/allowlist-173-05.json` (copia sin `{member-search.ts,users}`, `{covered-until.ts,users}`, `{covered-until.ts,subscriptions}`)                                      | `unlistedViolations: 0` — 12 `staleNoLongerViolating` preexistentes de planes anteriores (173-01/04/10/11, no de este plan) |
| `pnpm exec vitest run --no-file-parallelism test/reports test/coach`                                                                                                                                  | **107/107** verde                                                                                                           |
| `pnpm exec vitest run --no-file-parallelism test/scheduling test/attendance`                                                                                                                          | **194/194** verde                                                                                                           |
| `pnpm exec vitest run --no-file-parallelism test/members test/goal-plans test/finance/transactions-api.test.ts` (extra, no pedido por el plan — cubre los call sites forzados por el cambio de firma) | **260/260** verde                                                                                                           |

Ningún proceso vitest huérfano antes de correr (`pgrep -f vitest` limpio). `--no-file-parallelism` en las 3 corridas.

### Búsquedas por nombre/email/DNI arregladas — lista una por una

1. `shared/member-search.ts` — `buildMemberNameSearchCondition` (firstName/lastName/email/dni, tokenizado) — **arreglada** (helper).
2. `coach/service.ts` — `getOutstandingBalances` (consumidor) — **arreglada** (hereda del helper).
3. `finance/transaction-service.ts` — `buildListConditions` (consumidor) — **arreglada** (hereda del helper).
4. `reports/service.ts` — `buildOutstandingBaseConds` (consumidor del helper) — **arreglada**.
5. `reports/service.ts` — `buildAccessConditions` (duplicado propio, CONCAT+LIKE) — **arreglada** (filtro inline).
6. `reports/service.ts` — `buildChargeConditions` (duplicado propio, CONCAT+LIKE) — **arreglada** (filtro inline).
7. `members/service.ts` — `listMembers` (consumidor del helper) — **arreglada**.
8. `members/service.ts` — `searchMembers` — **NO arreglada** (D-02, ver Deviations — hallazgo de alta prioridad para 173-17).
9. `members/service.ts` — `exportMembers` — **NO arreglada** (D-02, ver Deviations).
10. `goal-plans/routes.ts` — `/admin/goal-plans/members` — **NO arreglada** (el plugin no tiene `request.scope`, ver Deviations).
11. `reports/service.ts` — `getExpiredMembers` — **NO arreglada** (fuera de alcance, deuda preexistente más amplia en el mismo método, ver Deviations).

---

## Deviations from Plan

### [Rule 4 — hallazgo de alcance, no auto-fix] `reports/service.ts` tiene más deuda de `users` de la que el plan asumía

- **Found during:** Task 1, medición previa con el lint en modo inventario.
- **Issue:** el plan dice "D-02: solo esa query, nada más del archivo" asumiendo una única entrada. Medido: ~14 accesos no-compliant a `users`, solo 2 relacionados con member-search (`buildAccessConditions`, `buildChargeConditions`).
- **Acción:** se migraron exactamente esos 2, más `getAccessLog`/`exportAccessLog` (mismo concepto — su propia búsqueda por nombre — que solo necesitaban `ctx` threading). El resto (`getExpiredMembers`, `getTrialConversionReport`, `getTrialSessionsReport`, `loadRosterAttribution`) queda fuera, documentado abajo en "Hallazgos".
- **Archivos:** `el-templo-api/src/modules/reports/service.ts`, `el-templo-api/src/modules/reports/routes.ts`.
- **Commit:** `4440e4bb`.

### [Nota, no desviación bloqueante] `subscriptions/service.ts` no es un call site real de `covered-until.ts`

- El plan lo lista como uno de los "4 call sites"; no existe. Tiene su propia función `deriveCoveredUntil` con semántica distinta. No se tocó el archivo.

### [Nota, no desviación bloqueante] `searchMembers`/`exportMembers` (members/service.ts) y `/admin/goal-plans/members` quedan sin gimnasio

- D-02 protege las 23 firmas de `members/service.ts` (reservadas a 173-17); `goal-plans/routes.ts` no tiene infraestructura de tenancy en absoluto (fuera de alcance expandirla en este plan). Los 3 call sites forzados por el cambio de firma usan una copia LOCAL, sin gimnasio, IDÉNTICA en comportamiento a la query previa a esta fase — cero regresión funcional, cero mitigación de tenancy en esos 3 sitios.
- **`searchMembers` es el hallazgo de mayor prioridad**: sirve `/api/admin/members/search`, que es LITERALMENTE la clase de query (T-173-05-01) que el objetivo de este plan describe como la más cara del piloto.

## Hallazgos para planes siguientes

1. **173-17 (members/service.ts):** priorizar `searchMembers` (`/api/admin/members/search`) sobre el resto de las 23 firmas — es el caso de manual del propio objetivo de esta fase (búsqueda por nombre sin filtro). `exportMembers` también sigue sin `ctx`.
2. **173-07 / 173-14:** `scheduling/service.ts` (`getSlotDetail`) y `attendance/service.ts` (`getSlotAttendance`) ya reciben `ctx` (agregado en este plan solo para el `endDateExpr`), pero sus `innerJoin(schema.users, ...)` para nombre/apellido siguen sin `tenantWhere`. El `ctx` ya está a mano — el costo marginal de scopear esos joins cuando esos planes toquen el archivo es bajo.
3. **173-30 (el switch):** `reports/service.ts` mantiene su entrada de `users` en la allowlist real (no se puede borrar todavía) por la deuda de `getExpiredMembers`/`getTrialConversionReport`/`getTrialSessionsReport`/`loadRosterAttribution` descripta arriba — ninguno de esos 4 es responsabilidad de este plan, pero alguien tiene que asignarles dueño antes de que `users` entre a `TENANT_STRICT_MODULES` (o el switch se atrasa).
4. **coach/service.ts (`getOutstandingBalances`):** su `innerJoin(schema.users, ...)` no tiene `tenantWhere` propio — hoy es "compliant" ante el lint solo porque comparte statement con el filtro de `balances` (efecto colateral, no protección real). Si `balances` alguna vez deja de filtrar primero, el join queda expuesto. No es de este plan (users. no era strict cuando 172 escribió este archivo), pero vale la pena que 173-30 lo revise en el mismo pase que active el sentinel de `users`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno nuevo. Las 4 mitigaciones del threat model del plan quedaron verificadas:

| Threat ID   | Mitigación                                                                          | Evidencia                                                                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-173-05-01 | `tenantWhere` inline en CADA statement que nombra `users` en la búsqueda por nombre | `member-search.ts` (6 ocurrencias), `reports/service.ts` (buildAccessConditions/buildChargeConditions)                                                                                                                                   |
| T-173-05-02 | Mismo filtro cubre DNI/email; contrato de rechazo es vacío, nunca 403               | `grep -rn "403" src/modules/shared/member-search.ts src/modules/shared/covered-until.ts` → 1 línea, es el docblock de `member-search.ts` explicando "sin 403, sin error" (prosa, no código); cero statements de código que devuelvan 403 |
| T-173-05-03 | `covered-until.ts` filtra la tabla de su FROM propio (`subscriptions`), no `users`  | `tenantWhere(schema.subscriptions, ctx)` inline en la subconsulta                                                                                                                                                                        |
| T-173-05-04 | El filtro NO se duplica en los llamadores (coach/finance/reports/members)           | Verificado por diff: ningún consumidor agrega un segundo `tenantWhere(users,...)` para la búsqueda                                                                                                                                       |

## Self-Check: PASSED

- `el-templo-api/src/modules/shared/member-search.ts` — FOUND, `ctx` primero, `tenantWhere` embebido
- `el-templo-api/src/modules/shared/covered-until.ts` — FOUND, `ctx` único parámetro, `FROM subscriptions` sin alias
- `el-templo-api/src/modules/coach/service.ts` — FOUND, call site actualizado
- `el-templo-api/src/modules/finance/transaction-service.ts` — FOUND, call site actualizado
- `el-templo-api/src/modules/reports/service.ts` — FOUND, `buildAccessConditions`/`buildChargeConditions`/`getAccessLog`/`exportAccessLog`/`buildOutstandingBaseConds` actualizados
- `el-templo-api/src/modules/reports/routes.ts` — FOUND, `assertTenant` en 2 rutas
- `el-templo-api/src/modules/goal-plans/routes.ts` — FOUND, copia local
- `el-templo-api/src/modules/members/service.ts` — FOUND, `legacyUnscopedNameSearchCondition` + 3 call sites de member-search + 2 de covered-until
- `el-templo-api/src/modules/scheduling/service.ts` + `routes.ts` — FOUND, `ctx` threaded
- `el-templo-api/src/modules/attendance/service.ts` + `routes.ts` — FOUND, `ctx` threaded
- Commit `4440e4bb` — FOUND (`git log --oneline`)
- Commit `520fec6c` — FOUND (`git log --oneline`)
- `pnpm typecheck:tests` → `DISCREPANCIAS: 0`
- `pnpm lint:tenant --allowlist=/tmp/allowlist-173-05.json` → `unlistedViolations: 0`
- `pnpm exec vitest run --no-file-parallelism test/reports test/coach` → 107/107
- `pnpm exec vitest run --no-file-parallelism test/scheduling test/attendance` → 194/194
- `git status --porcelain` (worktree) — vacío
