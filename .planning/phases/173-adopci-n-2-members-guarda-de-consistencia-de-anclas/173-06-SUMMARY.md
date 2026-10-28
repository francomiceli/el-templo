---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 06
subsystem: tenancy
tags:
  [tenancy, analytics, ctx-first, tenantWhere, d-01, d-02, ado-02, lint-tenant]

# Dependency graph
requires:
  - phase: 173-01
    provides: "worktree et-173, tsconfig.test-check.json, pnpm typecheck:tests (ratchet)"
  - phase: 173-02
    provides: "inventario medido de las 6 líneas de analytics (archivo:línea:tabla) que este plan consume como lista de trabajo"
provides:
  - "Los 6 services de analytics (service.ts, engagement-service.ts, funnel-service.ts, advanced-finance-service.ts, frequency-service.ts, member-flows-service.ts) dejan de violar sobre users/member_profiles/user_status_history"
  - "9 entradas de allowlist de analytics sobre tablas del módulo (no 10, ver Deviations) desaparecen contra la allowlist de trabajo"
  - "Patrón documentado para el trampa `let query = ...$dynamic(); if (needsBranchJoin) {...}`: el `.where(...)` con el tenantWhere inline va ANTES del join condicional, no después — así el `.from(schema.X)` y el filtro quedan en el MISMO statement de JS que el lint (que juzga por statement, no por dataflow) necesita ver juntos"
affects: ["173-30"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El lint (`isCompliantText`) juzga por ENCLOSING STATEMENT, no por función ni por tabla: un `tenantWhere(...)` en CUALQUIER lugar del statement limpia TODAS las referencias a tablas gym-owned de ESE statement (trampa (h) en su forma más literal). Consecuencia práctica: un `const conditions = [...]` construido en un statement SEPARADO del `.from(schema.X)...where(...)` no cubre ese `.from()` aunque el `conditions` termine spreadeado ahí — hace falta un tenantWhere textual en CADA statement que nombre la tabla, no solo en el que arma el WHERE final."
    - "Fix de bajo diff para `let query = ...$dynamic(); if (needsBranchJoin) { query = query.innerJoin(...) }`: mover el `.where(and(tenantWhere(...), ...))` para que ocurra ANTES del `.$dynamic()`/`if`, no después. Drizzle arma el SQL final por config acumulada, no por orden de llamada del builder — el resultado es idéntico, pero ahora `.from(schema.X)` y el `tenantWhere` viven en el mismo statement de JS."
    - "Una `sql\\`...\\`` correlacionada que solo referencia una columna del scope externo (ej. `${schema.users.id}` como valor, sin hacer FROM users adentro) es un falso positivo del lint — exención `/* tenant-safe: <motivo> */` en vez de forzar un tenantWhere que rompería el SQL (no hay tabla `users` en ese scope de subquery)."
    - "Un `eq(schema.X.columna, valor)` o `activeMemberExists(schema.X.id)` NO es un 'acceso' para el lint: solo cuentan las llamadas a métodos de Drizzle (`.from/.insert/.update/.delete/.innerJoin/.leftJoin`) con una tabla gym-owned como argumento, y los `sql\\`...\\`` tagged templates que nombran o interpolan una tabla gym-owned."

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/src/modules/analytics/engagement-service.ts
    - el-templo-api/src/modules/analytics/funnel-service.ts
    - el-templo-api/src/modules/analytics/advanced-finance-service.ts
    - el-templo-api/src/modules/analytics/frequency-service.ts
    - el-templo-api/src/modules/analytics/member-flows-service.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/test/analytics/engagement.test.ts
    - el-templo-api/test/analytics/funnel.test.ts
    - el-templo-api/test/analytics/frequency.test.ts
    - el-templo-api/test/analytics/member-flows.test.ts
    - el-templo-api/test/analytics/especial-exclusion.test.ts
    - el-templo-api/test/analytics/internal-exclusion.test.ts

key-decisions:
  - "DESVIACION Rule 1 (número corregido, no bloqueante): el plan dice 'Entradas objetivo (10)' pero la propia lista que da a continuación ('service.ts → member_profiles, users; engagement-service.ts → member_profiles, users; funnel-service.ts → user_status_history, users; advanced-finance-service.ts → users; frequency-service.ts → users; member-flows-service.ts → users') suma 9 pares (archivo,tabla), no 10. Medido contra tenant-lint-allowlist.json real: exactamente 9 entradas. Se trabajó y verificó contra 9 (el número medido), documentando la discrepancia en vez de forzar un 10 inventado."
  - "DESVIACION Rule 1 (bug de lint descubierto en vivo, corregido): 5 statements quedaron con `tenantWhere` presente en la query pero SIN cubrir el lint, porque el patrón `let query = this.db...from(schema.users)...$dynamic(); if (needsBranchJoin) { query = query.innerJoin(...) }; return query.where(and(tenantWhere(...), ...))` parte el `.from()` y el `.where()` en DOS statements de JS distintos — el lint solo mira el texto del statement que contiene cada referencia, así que `.from(schema.users)` quedaba marcado sin filtrar aunque la query SÍ filtrara en runtime. Fix aplicado en los 3 archivos que tenían este patrón (advanced-finance-service.ts `activeMemberCount`, funnel-service.ts `getFunnel`'s `usersQuery`, member-flows-service.ts `legacyAltasRows`): mover el `.where(...)` para que ocurra ANTES del `.$dynamic()`/`if` condicional, no después — Drizzle arma el SQL por config acumulada, no por orden de llamada, así que el comportamiento es idéntico y los 245 tests de test/analytics lo confirman verdes."
  - "DESVIACION Rule 1 (2 falsos positivos del lint, resueltos con exención + redundancia): engagement-service.ts tenía un `const conditions = [...]` y un `const planNameExpr = sql\\`...\\`` construidos en statements separados del join que sí filtra — el primero recibió un `tenantWhere(schema.memberProfiles, ctx)` redundante (inofensivo: INNER JOIN, mismo resultado con el filtro en ON o en WHERE); el segundo (`${schema.users.id}` como valor correlacionado dentro de una subquery que NO hace FROM users) recibió una exención `/* tenant-safe: subquery correlacionada por valor, no hace FROM users (D-02) */` porque agregar un tenantWhere ahí habría referenciado `users` en un scope de subquery donde esa tabla no existe. service.ts tuvo el mismo caso en `countNewMembers` (dos `sql\\`${schema.users.createdAt}...\\`` en el `const conditions` de la función) — resuelto con un `tenantWhere(schema.users, ctx)` redundante en el mismo array."
  - "coolingOrInactiveUserIds (frequency-service.ts) no tiene NINGÚN caller en código de producción hoy (solo en su propio test) — es código del plan 123 (D-123-01) preparado para un cron de segmentación que nunca se conectó. Se migró igual (ctx primero, tenantWhere en el join) porque D-02 protege archivos AJENOS, no queries sin caller DENTRO del archivo que este plan sí posee; su docblock 'scope-unaware' se corrigió para aclarar que esa ausencia de filtro SIEMPRE fue sobre sede/país, nunca sobre gimnasio — la falta de `ctx` era simplemente código escrito antes de la fase 169, no una decisión de diseño de correr cross-tenant."

requirements-touched: [ADO-02]

# Metrics
duration: ~150min
completed: 2026-08-08
---

# Phase 173 Plan 06: Analytics scopeado por gimnasio — Summary

**Los 6 services de analytics migraron sus 9 accesos a `users`/`member_profiles`/`user_status_history` a `ctx: TenantContext` + `tenantWhere` inline, y en el camino se encontró y corrigió un bug real del lint (5 statements que filtraban correctamente en runtime pero quedaban marcados como violación porque el patrón `let query = ...$dynamic(); if(){...}` parte el `.from()` y el `.where()` en dos statements de JS distintos que el lint audita por separado).**

## Performance

- **Duration:** ~150 min
- **Tasks:** 2/2
- **Files modified:** 13 (7 de código, 6 de test)

## Task Commits

1. **Task 1: `service.ts`, `engagement-service.ts`, `funnel-service.ts`** — `da8ebcab`
2. **Task 2: `advanced-finance-service.ts`, `frequency-service.ts`, `member-flows-service.ts`** — `e5d44579`

Ambos commits incluyen su porción de `routes.ts` (staged con `git add -p` para que cada commit compile solo con lo que migra) y sus archivos de test.

---

## Task 1 — `service.ts`, `engagement-service.ts`, `funnel-service.ts`

### `analytics/service.ts` (KPIs + miembros)

- `countActiveMembers` / `countNewMembers` (privados, usados por `getActiveMembersKpi` y `getMemberAnalytics`): `ctx` PRIMERO, `tenantWhere(schema.users, ctx)` inline en el `and(...)` del `.where()` que ya hacía `.innerJoin(schema.branches, ...)` sin condición.
- `getAttentionList` (ya tenía `ctx` desde la 172, solo para `financial_transactions`): sus DOS bloques (`expiringRows`/`overdueRows`) hacen `.innerJoin(schema.users, ...)` y `.leftJoin(schema.memberProfiles, ...)` — los dos reciben su `tenantWhere` en el ON (el LEFT por la regla de siempre — filtrarlo en WHERE lo vuelve INNER y borra socios sin perfil en silencio — y el INNER por consistencia, mismo idioma).
- Docblocks de `getKpis`/`getMemberAnalytics` reescritos: ya no dicen "el resto se migra en 173-175" sin matizar qué específicamente migró esta fase.

### `analytics/engagement-service.ts`

- `countActiveBySegment`: `ctx` PRIMERO; `member_profiles` (LEFT JOIN) filtrado en el ON; `users` (tabla FROM) filtrado en el `.where()` de cada rama del ternario `needsBranchJoin`.
- `getEngagementNominalList`: mismo tratamiento, `member_profiles` acá es INNER JOIN (mismo idioma que el LEFT de arriba).
- Dos statements "huérfanos" descubiertos por el lint en `getEngagementNominalList` (el `const conditions` con un `sql\`${schema.memberProfiles.segment}...\`` y el `const planNameExpr` con `${schema.users.id}`): ver Deviations.

### `analytics/funnel-service.ts`

- `getFunnel`: `ctx` PRIMERO. Dos consultas del módulo: la cohorte de `users` (con su propio `tenantWhere`) y las transiciones de `user_status_history` (con el SUYO, aunque la de `users` ya filtró — D-02 acceptance: dos tablas del módulo en el mismo método, dos filtros). `subRows` (sobre `subscriptions`, la aproximación histórica de "activo") queda sin tocar, D-02.

### `routes.ts` (porción de Task 1)

`/engagement` y `/funnel`: `assertTenant(request.scope, "analytics.<op>")` en el handler, `ctx` pasado a los services.

---

## Task 2 — `advanced-finance-service.ts`, `frequency-service.ts`, `member-flows-service.ts`

### `analytics/advanced-finance-service.ts`

- `activeMemberCount` (denominador de ARPU, única query de `users` del archivo — el resto ya migró `financial_transactions` en la 172): `ctx` PRIMERO. Docblock de `getAdvancedFinance` corregido (ya no dice que el devengado/ARPU "se migran en su propia fase" sin más — ahora aclara que el denominador SÍ migró acá).

### `analytics/frequency-service.ts`

- `activeMemberPopulation` (población de `getFrequency`): `ctx` PRIMERO, `tenantWhere(schema.users, ctx)` en el ON del INNER JOIN a `users`.
- `coolingOrInactiveUserIds` (golden-case D-123-01, **sin caller en código de producción hoy** — ver Deviations): `ctx` PRIMERO igual, docblock corregido.

### `analytics/member-flows-service.ts`

- `legacyAltasRows` (fuente (b) de altas — personas importadas): `ctx` PRIMERO, `tenantWhere(schema.users, ctx)` en el `.where()`.
- `getChurnedMembers`: `ctx` PRIMERO, `tenantWhere(schema.users, ctx)` en el ON del INNER JOIN a `users`.
- `getMonthlyFlows`/`altasSeries` threading `ctx` hasta `legacyAltasRows` (no a `streakAltasRows`, que solo toca `subscriptions`, fuera de alcance).

### `routes.ts` (porción de Task 2)

`/member-flows`, `/churned-members`, `/churned-members/export`, `/frequency`: `assertTenant(request.scope, "analytics.<op>")` + `ctx` pasado.

---

## El bug de lint que encontró el plan (no un bug de producto)

Tres funciones (`activeMemberCount`, `getFunnel`'s `usersQuery`, `legacyAltasRows`) seguían el patrón:

```ts
let query = this.db.select({...}).from(schema.users).$dynamic();
if (needsBranchJoin) { query = query.innerJoin(schema.branches, ...); }
return query.where(and(tenantWhere(schema.users, ctx), ...conditions));
```

Esto filtra CORRECTAMENTE en runtime (el `tenantWhere` está en el `.where()` real que se ejecuta), pero el lint (`isCompliantText`, `src/db/scripts/lint-tenant.ts:551`) juzga por **enclosing statement de JS**, no por dataflow: el `.from(schema.users)` vive en el statement `let query = ...;` y el `tenantWhere` vive en el statement `return query.where(...);` — DOS statements distintos. El lint marcaba `.from(schema.users)` como sin filtrar, aunque la query sí filtrara.

**Fix, verificado sin cambiar el SQL generado:** mover el `.where(and(tenantWhere(...), ...))` para que ocurra ANTES del `.$dynamic()`/`if` condicional, no después. Drizzle arma el SQL final por la config acumulada del builder, no por el orden en que se llamaron los métodos — así que `.where()` antes o después del `.innerJoin()` condicional produce SQL idéntico, pero ahora `.from(schema.users)` y el `tenantWhere` quedan en el MISMO statement de JS. Los 245 tests de `test/analytics` (incluidos los casos con `branchId`/`needsBranchJoin=true`) confirman que el comportamiento no cambió.

Dos casos más, sin este patrón `$dynamic()`, tuvieron el mismo síntoma por otro motivo — un `const conditions`/`const planNameExpr` construido en su PROPIO statement, separado del join/where que sí filtra:

- `engagement-service.ts`: `const conditions` con un `sql\`${schema.memberProfiles.segment}...\``→ se agregó`tenantWhere(schema.memberProfiles, ctx)`redundante en ese mismo array (inofensivo:`member_profiles` es INNER JOIN en ese método, filtrar en WHERE o en ON da el mismo resultado).
- `engagement-service.ts`: `const planNameExpr = sql\`...${schema.users.id}...\``— una subquery correlacionada que usa`schema.users.id`solo como VALOR (no hace`FROM users`). Acá un `tenantWhere(schema.users, ctx)`habría referenciado una tabla que no existe en el scope de esa subquery (rompe el SQL). Se usó una exención`/_ tenant-safe: subquery correlacionada por valor, no hace FROM users (D-02) _/`.
- `service.ts`: `countNewMembers`'s `const conditions` con dos `sql\`${schema.users.createdAt}...\`` → mismo fix redundante que engagement-service.ts.

## Verificación

| Comando                                                                                                                     | Resultado                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                                                                                    | limpio                                                                                                                                                                                                                    |
| `pnpm typecheck:tests` (ratchet, NO `tsc` a secas)                                                                          | `DISCREPANCIAS: 0` (185 == baseline, 0 nuevos, 0 `TS2554`)                                                                                                                                                                |
| `pnpm lint:tenant --allowlist=/tmp/allowlist-173-06.json` (copia de trabajo, sin las 9 entradas de este plan)               | `unlistedViolations: 0` — 19 `staleNoLongerViolating` preexistentes de planes anteriores (no de este plan; efecto colateral de que un `tenantWhere` en un statement limpia TODAS las tablas de ESE statement, trampa (h)) |
| `grep -rnE "tenantId!\|tenantId\s*\?\?"` en los 6 archivos                                                                  | 0 líneas                                                                                                                                                                                                                  |
| `pnpm exec vitest run --no-file-parallelism test/analytics --hookTimeout=900000` (2 corridas completas tras el fix de lint) | **245/245** verde, 20 archivos                                                                                                                                                                                            |

Ningún proceso vitest huérfano antes de cada corrida (`ps aux | grep vitest` limpio salvo loops de monitoreo de otros agentes en el mismo repo, no tocados). `--no-file-parallelism` en las 3 corridas.

### El diff no toca ninguna query fuera del módulo (D-02)

Verificado por `git diff --stat` de ambos commits: 7 archivos de código (los 6 del plan + `routes.ts`) y 6 de test. Ninguna query sobre `subscriptions`, `subscription_plans`, `branches`, `attendance`, `bookings`, `schedules` fue tocada — las que ya estaban ahí (joins a `branches`/`subscriptions` para país/plan) siguen exactamente igual.

## Deviations from Plan

### [Rule 1 - Bug] El número "10" del plan no coincide con su propia lista, que suma 9

- **Found during:** preparación de la allowlist de trabajo (`/tmp/allowlist-173-06.json`).
- **Issue:** el plan declara "Entradas objetivo (10)" pero enumera exactamente 6 pares archivo→tabla(s) que suman 9 (`service.ts`→2, `engagement-service.ts`→2, `funnel-service.ts`→2, `advanced-finance-service.ts`→1, `frequency-service.ts`→1, `member-flows-service.ts`→1). Medido contra `tenant-lint-allowlist.json` real: exactamente 9 entradas coinciden con la lista.
- **Fix:** se trabajó y verificó contra 9 (el número medido y consistente con la propia enumeración del plan), sin inventar una décima entrada para hacer coincidir el titular.
- **Files:** ninguno (solo afecta la medición, no el código).

### [Rule 1 - Bug] 5 statements filtraban en runtime pero el lint los marcaba como violación

- **Found during:** Task 1 (funnel-service.ts) y Task 2 (advanced-finance-service.ts, member-flows-service.ts), primera corrida de `pnpm lint:tenant` contra la allowlist de trabajo.
- **Issue:** el patrón `let query = ...$dynamic(); if (needsBranchJoin) {...}; return query.where(and(tenantWhere(...), ...))` parte el `.from(schema.X)` y el `tenantWhere` en dos statements de JS distintos. El lint juzga por statement, no por dataflow, así que marcaba el `.from()` como sin filtrar.
- **Fix:** mover el `.where(and(tenantWhere(...), ...))` para que ocurra ANTES del `.$dynamic()`/`if` (Drizzle arma el SQL por config acumulada, no por orden de llamada — mismo SQL final). Aplicado en `advanced-finance-service.ts::activeMemberCount`, `funnel-service.ts::getFunnel` (su `usersQuery`) y `member-flows-service.ts::legacyAltasRows`.
- **Verificación de que no cambió el comportamiento:** los 245 tests de `test/analytics` (incluidos los de `branchId`/scope) siguen en verde tras el reordenamiento.
- **Files:** `el-templo-api/src/modules/analytics/advanced-finance-service.ts`, `el-templo-api/src/modules/analytics/funnel-service.ts`, `el-templo-api/src/modules/analytics/member-flows-service.ts`.
- **Commit:** `e5d44579` (advanced-finance, member-flows) y `da8ebcab` (funnel).

### [Rule 1 - Bug] 3 statements "huérfanos" (arrays/subqueries construidos aparte del join que filtra)

- **Found during:** Task 1 y Task 2, misma corrida de lint.
- **Issue:** `engagement-service.ts::getEngagementNominalList` tiene un `const conditions` (con un `sql` referenciando `member_profiles`) y un `const planNameExpr` (subquery correlacionada referenciando `${schema.users.id}` como valor) construidos en statements separados del join que sí filtra. `service.ts::countNewMembers` tiene el mismo patrón con dos `sql\`${schema.users.createdAt}...\``en su`const conditions`.
- **Fix:** `conditions`/`countNewMembers` recibieron un `tenantWhere` redundante (inofensivo, ya que el filtro real vive en el join/where principal). `planNameExpr` — que SÍ rompería si se le agregara un `tenantWhere(schema.users, ctx)` (esa subquery no hace `FROM users`) — recibió una exención `/* tenant-safe: subquery correlacionada por valor, no hace FROM users (D-02) */`.
- **Files:** `el-templo-api/src/modules/analytics/engagement-service.ts`, `el-templo-api/src/modules/analytics/service.ts`.
- **Commit:** `da8ebcab`.

### [Nota, no desviación bloqueante] `coolingOrInactiveUserIds` no tiene caller en producción

- `frequency-service.ts::coolingOrInactiveUserIds` (D-123-01, el "golden case" para un cron de segmentación) solo se usa hoy desde su propio test — el cron que iba a consumirla nunca se conectó (verificado con `grep -rn "coolingOrInactiveUserIds" src/`). Se migró igual (D-02 protege archivos ajenos, no queries huérfanas dentro de un archivo que el plan sí posee) y se corrigió su docblock: "scope-unaware" siempre se refirió a sede/país, nunca a gimnasio — la ausencia de `ctx` era código pre-169, no una decisión de correr cross-tenant.

## Hallazgos para planes siguientes

1. **173-30 (el switch):** las 9 entradas de analytics (no 10) desaparecen de la allowlist de trabajo. Verificar contra la allowlist REAL en el momento del switch, no contra este número — otros planes de la fase pueden haber tocado archivos compartidos (`branches`, `subscriptions`) en el ínterin.
2. **Cualquier plan futuro que tope el patrón `let query = ...$dynamic(); if (needsBranchJoin) {...}` sobre una tabla strict:** el fix es reordenar el `.where(...)` ANTES del `if` condicional, no reescribir a un ternario duplicado (mucho más verboso para el mismo resultado). Ver "El bug de lint que encontró el plan" arriba para el razonamiento completo.
3. **`coolingOrInactiveUserIds` sigue sin caller.** Si el plan 175 (o quien retome D-123-01) conecta el cron de segmentación, va a necesitar resolver `ctx` vía `forEachActiveTenant` en el call site nuevo — la firma ya está lista.

## Known Stubs

Ninguno. Este plan es cirugía de queries existentes, no agrega funcionalidad nueva ni deja fixtures a medio conectar.

## Threat Flags

Ninguno nuevo. Las 4 mitigaciones del threat model del plan quedaron verificadas:

| Threat ID   | Mitigación                                                                                                                                | Evidencia                                                                                                                                                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-173-06-01 | `tenantWhere` inline en cada statement que nombra `users`/`member_profiles`/`user_status_history`                                         | Ver tabla de verificación — `lint:tenant` da 0 `unlistedViolations` para los 6 archivos                                                                                                                                                                                                                     |
| T-173-06-02 | Un `tenantWhere` por tabla cuando el statement toca 2 tablas del módulo (`funnel-service.ts::getFunnel`: `users` + `user_status_history`) | Cada consulta lleva su propio `tenantWhere`, verificado línea por línea en el diff                                                                                                                                                                                                                          |
| T-173-06-03 | Filtro en el ON para todo join a `users`/`member_profiles`, también los INNER                                                             | `service.ts::getAttentionList` (LEFT a `member_profiles`, INNER a `users`), `engagement-service.ts` (LEFT y INNER a `member_profiles`), `member-flows-service.ts::getChurnedMembers` (INNER a `users`) — los 5 casos verificados con `grep -c "tenantWhere(schema\.\(users\|memberProfiles\)"` en cada join |
| T-173-06-04 | `user_status_history` con su propio `tenantWhere` en el funnel, aunque `users` ya filtró en la misma función                              | `funnel-service.ts:172` (aprox.) — verificado en el diff                                                                                                                                                                                                                                                    |

## Self-Check: PASSED

- `el-templo-api/src/modules/analytics/service.ts` — FOUND, `ctx` primero en `countActiveMembers`/`countNewMembers`/`getActiveMembersKpi`
- `el-templo-api/src/modules/analytics/engagement-service.ts` — FOUND, `ctx` primero en ambos métodos públicos
- `el-templo-api/src/modules/analytics/funnel-service.ts` — FOUND, `ctx` primero en `getFunnel`
- `el-templo-api/src/modules/analytics/advanced-finance-service.ts` — FOUND, `ctx` en `activeMemberCount`
- `el-templo-api/src/modules/analytics/frequency-service.ts` — FOUND, `ctx` en `activeMemberPopulation`/`coolingOrInactiveUserIds`
- `el-templo-api/src/modules/analytics/member-flows-service.ts` — FOUND, `ctx` en `legacyAltasRows`/`getChurnedMembers`
- `el-templo-api/src/modules/analytics/routes.ts` — FOUND, 6 `assertTenant` nuevos (`analytics.engagement`, `analytics.funnel`, `analytics.member-flows`, `analytics.churned-members` ×2, `analytics.frequency`)
- Commit `da8ebcab` — FOUND (`git log --oneline`)
- Commit `e5d44579` — FOUND (`git log --oneline`)
- `pnpm typecheck:tests` → `DISCREPANCIAS: 0`
- `pnpm exec tsc --noEmit` → limpio
- `pnpm lint:tenant --allowlist=/tmp/allowlist-173-06.json` → `unlistedViolations: 0`
- `pnpm exec vitest run --no-file-parallelism test/analytics` → 245/245 (2 corridas independientes, ambas verdes)
- `git status --porcelain` (worktree) — vacío
