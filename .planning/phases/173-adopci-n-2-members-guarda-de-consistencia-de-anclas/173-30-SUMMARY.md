---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 30
subsystem: tenancy
tags:
  [
    tenancy,
    ado-02,
    ado-07,
    members,
    sentinel,
    strict,
    allowlist,
    ratchet,
    fail-closed,
    switch,
    d-15,
  ]

# Dependency graph
requires:
  - phase: 173-01..29
    provides: "members migrado al patron completo (services con TenantContext/helpers, ~50 archivos ajenos con cirugia minima, bateria ISO-03 verde, guarda de anclas ADO-07) — todo lo que este plan enciende"
  - phase: 172-21
    provides: "la receta del switch (orden allowlist-primero/strict-despues, gate de forma contra segunda copia escrita a mano, demo del fail-closed sobre query de una sola tabla)"
provides:
  - "TENANT_STRICT_MODULES.members con las 8 tablas fisicas (audit_log, member_logins, member_notes, member_profiles, user_branches, user_sepa_details, user_status_history, users) — el sentinel hace THROW en test/dev sobre toda query sin tenant_id a esas tablas"
  - "tenant-lint-allowlist.json 450 -> 339 entradas (111 borradas): cero por tabla strict del modulo, cero por archivo bajo src/modules/members/. pnpm lint:tenant sale 0 con DISCREPANCIAS: 0"
  - "2 accesos reales a users que ningun plan anterior habia migrado, cerrados: reports/service.ts:1530 (exencion) y backfill-historical-payments.ts:386 (tenantWhere real)"
  - "gate de forma actualizado (test/db/tenant-tables.test.ts): members en la SEGUNDA COPIA (MODULOS_DECLARADOS) con sus 8 tablas"
  - "con-06-lint.test.ts reparado en 2 frentes independientes: el umbral de la lente estatica (81->73, contabilizado) y 6 fixtures sinteticos que usaban member_profiles/users como ejemplo generico de tabla no-strict"
  - "fail-closed demostrado en vivo: TenantSentinelError real sobre member_notes, transcripto completo, sonda revertida"
affects: [173-31, 174, 175]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El criterio del plan es un PISO, no un techo: se borraron 111 entradas (104 stale + 7 'vivas' solo por exencion legitima), no las 90 estimadas — mismo hallazgo que 172-21 (47 planeadas, 51 reales)"
    - "Una entrada de allowlist con SOLO accesos exentos (tenant-safe) sigue contando como 'viva' para el gate de staleness (D-14: 'esté eximido o no'), pero de todos modos hay que borrarla para el switch: D-15 (strictWithAllowlist) no distingue exento de violador, solo mira si la tabla esta en el registro. Borrarla es seguro porque los accesos exentos nunca entran a `violations` (unlistedViolations no sube)"
    - "Migrar el ultimo acceso real de una tabla y achicar su allowlist son el MISMO acto (D-14), asi que el commit del switch (Task 1) tiene que incluir el fix de codigo que hace la entrada prescindible — separarlos en dos commits deja al primero con una entrada stale sin borrar (discrepancia)"
    - "Un fixture sintetico que usa una tabla NO-strict como ejemplo generico se rompe en cuanto esa tabla entra a TENANT_STRICT_MODULES de verdad (mismo criterio ya documentado en con-06-lint.test.ts para `bookings`): la salida es cambiar la tabla del fixture (schedules, subscription_plans), nunca bajar la asercion"
    - "El gate de la lente estatica (tablasConDeuda.size) puede quedar desincronizado durante VARIOS planes de un mismo milestone si nadie corre con-06-lint.test.ts completo entre medio — al arrancar este plan ya estaba en 74, no en 81, por el trabajo acumulado de 173-01..29 que nadie habia vuelto a medir contra ese gate especifico"

key-files:
  created: []
  modified:
    - el-templo-api/tenant-lint-allowlist.json
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/scripts/backfill-historical-payments.ts
    - el-templo-api/test/tenancy/con-06-lint.test.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/tenancy/__fixtures__/lint/accesos.ts
    - el-templo-api/test/tenancy/__fixtures__/lint/exenciones.ts

key-decisions:
  - "Se borraron 111 entradas y no las 90 estimadas por el plan: 104 stale reales + 7 que seguian 'vivas' solo por una exencion legitima (auth/routes.ts, analytics/engagement-service.ts, campaigns/service.ts, goal-plans/routes.ts, referrals/service.ts, reports/service.ts, wellhub/service.ts, todas sobre `users`). El criterio del plan es un piso: dejarlas habria dejado D-15 rojo apenas `members` entrara a strict."
  - "2 accesos reales a `users` bloqueaban el cierre y NINGUN plan anterior los habia migrado: reports/service.ts:1530 (falso positivo del lint por statement, cerrado con exencion analoga a goal-plans/routes.ts:484) y backfill-historical-payments.ts:386 (bug real, tenantWhere agregado). Sin este fix, borrar sus 2 entradas de la allowlist habria dejado unlistedViolations > 0."
  - "El orden de los 2 commits del switch es allowlist-primero-strict-despues (172-21), pero el commit 1 (allowlist) tuvo que absorber TAMBIEN los 2 fixes de codigo de arriba: sin ellos, borrar esas 2 entradas especificas habria sido un commit rojo (staleNoLongerViolating/unlistedViolations > 0). Migrar el acceso y achicar la allowlist son el mismo acto (D-14), asi que van en el mismo commit aunque el plan diga 'el commit contiene SOLO tenant-lint-allowlist.json' — verificado en aislamiento (git checkout de los otros 5 archivos a HEAD) que el commit 1 solo es 100% verde por si mismo."
  - "con-06-lint.test.ts se toco en DOS frentes independientes, secuenciados en los 2 commits distintos segun su causa real: el umbral de la lente estatica (81->73) fue a Commit 1 porque lo causan los 2 fixes de codigo (independiente de si `members` esta declarado strict); los 6 fixtures que usaban `member_profiles`/`users` como ejemplo no-strict fueron a Commit 2 porque solo se rompen cuando `members` entra a TENANT_STRICT_MODULES."
  - "La sonda del fail-closed no fue sobre `getById` (no tiene call sites en src/, mismo hallazgo que 172-21) ni sobre una ruta HTTP (el error handler aplana todo a 500 generico sin exponer el cause — logger en modo silent en test). Se uso un test standalone temporal que instancia `MemberService` directo y llama `deleteNote(ctx, noteId)` sin pasar por HTTP, para que el rechazo crudo (con `cause` completo) llegue a la asercion. Test y archivo borrados despues, sonda de codigo revertida, `git status --porcelain` vacio."

requirements-touched: [ADO-02, ADO-07]
# Ninguno de los dos se marca 100% completo por este plan solo: ADO-02 (patron
# completo de tenancy para members) queda demostrado por el switch + la suite
# completa verde, pero la QUINTA condicion de "modulo adoptado" (mismos numeros
# para el staff, D-11) es del plan 173-31. ADO-07 (guarda de anclas) fue
# implementada por planes anteriores (173-11/173-12); este plan solo confirma
# que su throw esta activo end-to-end.

# Metrics
duration: ~2h30min
completed: 2026-08-09
---

# Phase 173 Plan 30: El switch — `members` entra en modo throw Summary

**`members` es el segundo módulo del milestone v6.0 en `TENANT_STRICT_MODULES`: desde el commit `afc4fe78`, toda query sin `tenant_id` sobre `audit_log`, `member_logins`, `member_notes`, `member_profiles`, `user_branches`, `user_sepa_details`, `user_status_history` o `users` revienta en test y dev, y la allowlist no tiene una sola excusa viva para ninguna de las ocho (450 → 339 entradas, `DISCREPANCIAS: 0`). El hallazgo real del plan no fueron los números estimados (79/90 entradas) sino que 2 accesos genuinos a `users` —uno en `reports/service.ts`, otro en un script de backfill— habían sobrevivido a los 29 planes anteriores de la fase sin que nadie los migrara, y que el gate de la lente estática de `con-06-lint.test.ts` ya estaba roto (74, no 81) antes de que este plan tocara una línea, porque ningún plan de la fase había vuelto a correrlo completo. El fail-closed se demostró en vivo con un `TenantSentinelError` real sobre `member_notes`, transcripto completo y con la sonda revertida.**

## Performance

- **Duration:** ~2h30min (la mayor parte: 7 lotes de la suite completa a `--no-file-parallelism`, ~260 archivos)
- **Completed:** 2026-08-09
- **Tasks:** 3/3 (la 3 no produce commit por diseño — la sonda se revierte)
- **Files modified:** 8 (3 del plan literal + 5 por deviations Rule 1/3)

## Task Commits

| Task                     | Nombre                                               | Commit     | Archivos                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 (+ fixes prerequisito) | la allowlist se queda sin una sola excusa de members | `f5874215` | `tenant-lint-allowlist.json`, `src/modules/reports/service.ts`, `src/scripts/backfill-historical-payments.ts`, `test/tenancy/con-06-lint.test.ts` (umbral)                                             |
| 2 (+ fix de fixtures)    | members entra a TENANT_STRICT_MODULES                | `afc4fe78` | `src/db/tenant-tables.ts`, `test/db/tenant-tables.test.ts`, `test/tenancy/con-06-lint.test.ts` (fixtures), `test/tenancy/__fixtures__/lint/accesos.ts`, `test/tenancy/__fixtures__/lint/exenciones.ts` |
| 3                        | demo del fail-closed                                 | —          | ninguno (sonda revertida sin commitear)                                                                                                                                                                |

Ambos commits viven en `/home/franco/projects/et-173` (rama `feat/173-adopcion-members`, sobre `15ec3ba1` del plan 29).

---

## Task 1 — la allowlist, saldada (y el bloqueador que el plan no anticipaba)

### Medición real vs. la estimada por el plan

El plan/PATTERNS estimaban **90** entradas a borrar (79 por tabla + 11 por archivo bajo `src/modules/members/`). `pnpm lint:tenant` contra el árbol real reportó **103** `staleNoLongerViolating` — no 90, y no restringidas al módulo: incluían colaterales de TODA la fase (23 archivos ajenos ya migrados por planes anteriores, desde `import-fecha-ingreso.ts` hasta `wellhub/service.ts`). Mismo patrón que 172-21 (47 estimadas, 51 reales): **el criterio del plan es un piso**.

### El bloqueador: 7 entradas "vivas" solo por exención, y 2 accesos reales sin migrar

Restando las 103 stale del universo de 79 entradas por-tabla del módulo, quedaban **8 entradas que el lint NO reportaba como stale** (por lo tanto, aparentemente "todavía violan"). Investigando con el motor del lint directamente (`lintTenantSources`, no solo el reporte agregado):

- **7 de las 8 eran falsos bloqueos**: sus únicos accesos a `users` estaban **exentos** (`tenant-safe`) — `auth/routes.ts`, `analytics/engagement-service.ts`, `campaigns/service.ts`, `goal-plans/routes.ts`, `referrals/service.ts`, `reports/service.ts` (parcialmente, ver abajo), `wellhub/service.ts`. El motor cuenta un acceso exento como "vivo" para el gate de staleness (D-14: _"esté eximido o no"_) — es intencional (no obliga a tocar la allowlist en el mismo PR que se escribe una exención) — pero **no impide borrar la entrada**: los accesos exentos nunca entran a `violations`, así que borrar la entrada no genera `unlistedViolations`. Se borraron las 7 sin tocar código.
- **1 (la octava) era un bloqueador real**: `reports/service.ts` tenía, ADEMÁS de los accesos ya migrados, **un acceso genuino sin exención ni filtro** en `getExpiredMembers` (línea 1530): un fragmento `sql` de búsqueda por nombre/email que arma `tokenConds`, exactamente el mismo patrón que `goal-plans/routes.ts:484` ya tenía resuelto con una exención (el fragmento se ANDea con el `tenantWhere` real del `innerJoin` de la misma query — el lint lo marca porque juzga por _statement_, no por query completa). Se cerró con la misma exención, documentando la analogía.
- **Un segundo acceso real, en un archivo que la re-derivación por-tabla no había nombrado explícitamente**: `src/scripts/backfill-historical-payments.ts:386` — el pre-flight `existingMembers` (`SELECT id FROM users WHERE id IN (...)`) no llevaba `tenantWhere(users, ctx)` pese a que el script ya resuelve `ctx` con `requireTenant` tres líneas antes. Bug real, cerrado con `and(tenantWhere(users, ctx), inArray(...))`.

**Total borrado: 111 entradas (104 stale tras el fix + 7 manuales) — 450 → 339.**

### Consecuencia contabilizada: la lente estática de `con-06-lint.test.ts`

Al medir `tablasConDeuda.size` (el conteo agregado de tablas con al menos una violación genuina en TODO el repo, independiente de la allowlist) en el HEAD de arranque de este plan (`15ec3ba1`, **antes** de tocar una línea), el número ya era **74**, no 81: 7 de las 8 tablas de `members` ya habían quedado sin ningún acceso vivo por el trabajo acumulado de los planes 173-01..29 — **ningún plan de la fase había vuelto a correr `con-06-lint.test.ts` completo** contra el árbol real después de sus propios cambios (cada uno verificó su propio recorte). Con el fix de `backfill-historical-payments.ts` (la única tabla que aún tenía deuda real: `users`), el número bajó a **73**. Actualizado el `it` con contabilidad explícita: _"172 pagó la de las 6 de finance (81) y la 173 pagó la de las 8 de members (73)"_ — mismo patrón que 172-21 estableció (87→81).

### Verificación de Task 1 (aislada — `git checkout` de los otros 5 archivos a HEAD para confirmar que el commit 1 es verde por sí solo)

| Comando                                                                                                                        | Resultado                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `pnpm lint:tenant`                                                                                                             | `Entradas de la allowlist: 339` · `DISCREPANCIAS: 0`                                       |
| `node -e "..."` (target 8 tablas + archivos members/)                                                                          | `total 339`, 0 entradas del módulo                                                         |
| `git show origin/staging:.../tenant-lint-allowlist.json` vs. actual                                                            | subconjunto estricto confirmado (`cur_set.issubset(base_set)` → `True`, `added` → `set()`) |
| `git diff -U0 tenant-lint-allowlist.json \| grep -c '^+[^+]'`                                                                  | `0` (diff puro borrado)                                                                    |
| `pnpm exec tsc --noEmit`                                                                                                       | limpio                                                                                     |
| `pnpm exec vitest run --no-file-parallelism test/tenancy/con-06-lint.test.ts test/db/tenant-tables.test.ts` (commit 1 aislado) | **56/56**                                                                                  |

---

## Task 2 — `members` entra a `TENANT_STRICT_MODULES`, y el gate de forma

Entrada agregada con las 8 tablas físicas en orden alfabético, formato idéntico al de `finance` (`src/db/tenant-tables.ts:524-533` → ahora `:524-543`). Docblock actualizado: la sección "ARRANCÓ VACÍA" ahora documenta también quién escribió la **segunda** entrada y por qué `users` cubre también `user_branches` (ADO-07).

`test/db/tenant-tables.test.ts`: `members` con sus 8 tablas agregado a `MODULOS_DECLARADOS` (la segunda copia escrita a mano); el `it` renombrado de _"172-21: finance es el primero"_ a _"172-21: finance; 173-30: members"_. El `it` de coherencia D-15 nació verde (la allowlist ya estaba limpia desde el commit 1).

### El hallazgo de Task 2: 6 fixtures sintéticos rotos por `member_profiles`/`users`

`test/tenancy/con-06-lint.test.ts` tiene un `describe` ("los cuatro gates del ratchet") que corre sobre fixtures **sintéticos** (`test/tenancy/__fixtures__/lint/accesos.ts`, `exenciones.ts`), no contra el repo real. Esos fixtures usaban `member_profiles` (el JOIN sin filtro de `joinSinFiltro`/`joinConTenantWhere`) y `users` (`insertConTenantValues`, `conMotivoVacio`) como ejemplos genéricos de "tabla gym-owned NO strict" — exactamente el mismo rol que `bookings` cumple en el `it` de D-15 (`test/tenancy/con-06-lint.test.ts:613-641`), que **ya documenta explícitamente** qué hacer si su tabla de ejemplo entra a strict: _"cambiar la tabla del fixture, no bajar la aserción"_.

Al declarar `members` strict, esas 6 aserciones rompieron (`strictWithAllowlist` contaminaba `discrepancies` en 2 de cada test, porque `lintFixture()` no pasa `strictTables` explícito y usa el registro real por default). Se aplicó el mismo criterio que el propio archivo prescribe: `member_profiles` → `schedules` (en el JOIN, ajustando también la condición: `eq(schedules.id, bookings.scheduleId)` en vez de `eq(memberProfiles.userId, bookings.memberId)`); `users` → `subscription_plans` (en `conMotivoVacio`) y `branches` (en `insertConTenantValues`, el caso compliant vía `tenantValues`). Las 6 aserciones de `con-06-lint.test.ts` que citaban las tablas viejas se actualizaron en paralelo, con comentario explicando el porqué del reemplazo.

### Verificación de Task 2

| Comando                                                                                                                            | Resultado                                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `grep -A10 "members: \[" src/db/tenant-tables.ts`                                                                                  | 8 tablas físicas, orden alfabético             |
| `pnpm exec prettier --write` (solo los 5 archivos del commit — el glob completo reformateó ~40 archivos AJENOS que se revirtieron) | sin cambios en los 5 archivos (ya formateados) |
| `pnpm exec tsc --noEmit`                                                                                                           | limpio                                         |
| `pnpm typecheck:tests`                                                                                                             | `DISCREPANCIAS: 0`, 175/175 baseline exacto    |
| `pnpm exec vitest run --no-file-parallelism test/db/tenant-tables.test.ts test/tenancy/con-06-lint.test.ts`                        | **56/56**                                      |
| **Suite completa, sin sonda, en 7 lotes (`--no-file-parallelism`)**                                                                | ver tabla abajo                                |

### La suite completa, con el throw real encendido

| Lote | Contenido                                                                                                                                                                                                                                                                        | Archivos    | Tests                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------- |
| 1    | `test/subscriptions test/finance`                                                                                                                                                                                                                                                | 47          | 599 ✅                |
| 2    | `test/analytics test/tenancy`                                                                                                                                                                                                                                                    | 39          | 586 ✅                |
| 3    | `test/unit test/referrals test/members`                                                                                                                                                                                                                                          | 38          | 714 ✅                |
| 4    | `test/tv test/migrations test/exercises test/admin`                                                                                                                                                                                                                              | 35          | 343 ✅                |
| 5    | `test/scheduling test/reports test/users test/shared test/sessions test/programs test/auth`                                                                                                                                                                                      | 39          | 469 ✅                |
| 6    | 23 directorios chicos (wellhub, tree-editor, attendance, settings, jobs, franchise, db, check-ins, blog, tree-progress, streaks, segmentation, ratings, progression, onboarding, kairos, improvement-proposals, goal-plans, gladius, coach, app-landing, anniversaries, academy) | 35          | 445 ✅                |
| 7    | 28 archivos sueltos bajo `test/` (root)                                                                                                                                                                                                                                          | 27 + 1 skip | 287 + 1 skip + 6 todo |

**Total: 260 archivos, ~3.443 tests, 0 fallos, 0 throws del sentinel.** `pnpm exec tsc --noEmit` limpio.

---

## Task 3 — el fail-closed, demostrado

### La sonda

`getById` no tiene call sites en `src/` (mismo hallazgo que 172-21) — descartado. Se eligió el primer `SELECT` de `deleteNote` (`src/modules/members/service.ts:2564-2572`), una query de **UNA SOLA TABLA** (`member_notes`), ejercitada por `test/members/members.test.ts` ("DELETE removes note"). Sacado el `tenantWhere(schema.memberNotes, ctx)`.

**No sirvió correr el test HTTP directamente para transcribir la salida**: el logger de test corre en modo `silent` (`src/app.ts:98`) y `handleServiceError` aplana cualquier error desconocido a un 500 genérico sin exponer el `cause` — el test HTTP solo mostró `expected 500 to be 200`. Se escribió un test standalone **temporal** (`test/tenancy/_tmp-demo-probe.test.ts`, no versionado, borrado después) que instancia `MemberService` directo y llama `deleteNote(ctx, noteId)` sin pasar por HTTP, capturando el rechazo crudo.

### Salida real transcripta

```
DrizzleQueryError: Failed query: select `id` from `member_notes` where `member_notes`.`id` = ?
params: 1
    at MemberService.deleteNote (src/modules/members/service.ts:2564:24)
  query: 'select `id` from `member_notes` where `member_notes`.`id` = ?',
  params: [ 1 ],
  cause: TenantSentinelError: [sentinel de tenancy] query sin tenant_id sobre member_notes
  (módulo ya migrado, ver TENANT_STRICT_MODULES en src/db/tenant-tables.ts).
  SQL: select `id` from `member_notes` where `member_notes`.`id` = ?
  Qué hacer: filtrá con tenantWhere(tabla, ctx) si es una lectura, estampá
  tenantValues(ctx, {...}) si es una escritura, o —si el acceso es global a
  propósito— escribí la exención con su motivo en un comentario de bloque
  "tenant-safe: <motivo>" en el sitio del acceso. NO saques la tabla de
  TENANT_STRICT_MODULES: eso apaga el gate de todo el módulo.
      at evaluar (src/db/sentinel/install.ts:360:15)
      at inspect (src/db/sentinel/install.ts:389:7)
      at PromisePool.wrapped [as query] (src/db/sentinel/install.ts:276:30)
  {
    sql: 'select `id` from `member_notes` where `member_notes`.`id` = ?',
    tables: [ 'member_notes' ]
  }
}
```

Confirma, de nuevo, el hallazgo de 172-21: un `instanceof TenantSentinelError` directo **nunca** entra — el error llega envuelto en `DrizzleQueryError.cause`, con `sql` y `tables` como campos propios del `TenantSentinelError` interno.

### Cierre

- Sonda de código revertida (`git checkout -- src/modules/members/service.ts`).
- Test temporal borrado (`rm test/tenancy/_tmp-demo-probe.test.ts`).
- `git status --porcelain` (worktree `et-173`) → **vacío**.
- `test/members/members.test.ts -t "DELETE removes note"` → verde otra vez (473ms).
- `pnpm lint:tenant` → `DISCREPANCIAS: 0`.

### Checklist de cierre (doc 07 §6), marcado

```
CÓDIGO
[x] pnpm lint:tenant → exit 0, DISCREPANCIAS: 0 contra la allowlist REAL
[x] 0 entradas de la allowlist con `file` bajo src/modules/members/
[x] 0 entradas de la allowlist con `table` entre las tablas strict del módulo
[x] Inventario de exenciones tenant-safe: ninguna NUEVA dentro del módulo
    (la única exención nueva de este plan es en reports/service.ts, archivo
    AJENO — cirugía mínima D-02, misma categoría que goal-plans/routes.ts)
[x] grep -nE "tenantId!|tenantId\s*\?\?" en members/, users/, branch-consistency.ts → sin líneas
[x] pnpm exec tsc --noEmit → exit 0

EL SWITCH (dos commits, en este orden)
[x] 1º commit: allowlist — lint corrido, 111 stale/vivas-solo-por-exención listadas y borradas
[x] 2º commit: entrada en TENANT_STRICT_MODULES con los nombres FÍSICOS
[x] Gate de forma actualizado: SEGUNDA COPIA escrita a mano (MODULOS_DECLARADOS)
[x] `it` de coherencia D-15: ninguna tabla strict con entradas vivas — nació verde
[x] Baja del gate numérico (con-06-lint.test.ts, 81→73) CONTABILIZADA tabla por tabla

FAIL-CLOSED, DEMOSTRADO
[x] Sonda sobre query de UNA SOLA TABLA (member_notes) de un método ejercitado por un test
[x] Salida real del TenantSentinelError transcripta (SQL + cadena de cause)
[x] Sonda REVERTIDA: git status --porcelain vacío

TESTS
[x] Suite completa verde en 7 lotes, 260 archivos, ~3.443 tests, 0 throws del sentinel
[ ] Mutation testing formal de las rutas del módulo — no es parte de este plan
    (ya ejercitado por los planes 173-26/27/28 de la fase, ver deferred-items.md)

NÚMEROS Y GENTE — plan 173-31, no de este plan
ONBOARDING DEL GIMNASIO NUEVO — no de esta fase
```

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `backfill-historical-payments.ts:386` — pre-flight de `users` sin `tenantWhere`**

- **Found during:** Task 1 (investigando por qué 8 entradas del módulo no salían como stale)
- **Issue:** `existingMembers` (`SELECT id FROM users WHERE id IN (...)`) no filtraba por gimnasio pese a que `ctx` ya está resuelto por `requireTenant` tres líneas antes.
- **Fix:** `and(tenantWhere(users, ctx), inArray(users.id, [...]))`.
- **Files:** `el-templo-api/src/scripts/backfill-historical-payments.ts`
- **Commit:** `f5874215`

**2. [Rule 3 - Blocking] `reports/service.ts:1530` — falso positivo del lint sin exención**

- **Found during:** Task 1
- **Issue:** fragmento `sql` de búsqueda por nombre/email en `getExpiredMembers`, ANDeado con el `tenantWhere` real de la misma query pero marcado violación porque el lint juzga por statement — bloqueaba borrar la última entrada real de `users`.
- **Fix:** exención `tenant-safe` idéntica en forma a `goal-plans/routes.ts:484`.
- **Files:** `el-templo-api/src/modules/reports/service.ts`
- **Commit:** `f5874215`

**3. [Rule 3 - Blocking] `con-06-lint.test.ts` — umbral de la lente estática desactualizado (81, real 73)**

- **Found during:** Task 1 (verificación con-06-lint.test.ts antes de comitear)
- **Issue:** el gate ya estaba roto (74) antes de tocar código, por trabajo acumulado de planes anteriores nunca vuelto a verificar contra este `it`; con los 2 fixes de arriba bajó a 73.
- **Fix:** número actualizado con contabilidad explícita (172: 81, 173: 73), mismo patrón que 172-21.
- **Files:** `el-templo-api/test/tenancy/con-06-lint.test.ts`
- **Commit:** `f5874215`

**4. [Rule 3 - Blocking] 6 fixtures sintéticos de `con-06-lint.test.ts` usaban tablas que pasaron a ser strict**

- **Found during:** Task 2 (verificación tras declarar `members` strict)
- **Issue:** `member_profiles`/`users` eran los ejemplos genéricos de "tabla no-strict" en `accesos.ts`/`exenciones.ts`; al declarar `members`, 6 `it` rompieron por contaminación de `strictWithAllowlist`.
- **Fix:** reemplazo por `schedules`/`subscription_plans`/`branches`, mismo criterio que el archivo ya documentaba para `bookings`.
- **Files:** `el-templo-api/test/tenancy/__fixtures__/lint/accesos.ts`, `exenciones.ts`, `el-templo-api/test/tenancy/con-06-lint.test.ts`
- **Commit:** `afc4fe78`

---

**Total deviations:** 4 auto-fixed (1 bug, 3 bloqueantes)
**Impact on plan:** las 4 eran prerrequisito mecánico para que los 2 commits del switch fueran verdes por separado — sin ellas, Task 1 hubiera dejado discrepancias o Task 2 hubiera roto tests preexistentes. Ninguna es scope creep: las 2 primeras son cirugía mínima D-02 sobre archivos ajenos que tocan tablas del módulo; las 2 últimas son mantenimiento del propio arnés de gates de tenancy, exigido por declarar un módulo nuevo strict (precedente idéntico en 172-21).

## Issues Encountered

- **Contaminación de un lote de tests por un proceso vitest concurrente**: al ejecutar en background por timeout del tooling, dos corridas de `pnpm exec vitest` corrieron sobre la MISMA base MySQL de test simultáneamente, produciendo un falso rojo (`Login failed`, `Table 'wellhub_bookings' doesn't exist`). Diagnosticado como carrera de proceso (no una regresión real) y resuelto re-corriendo en serie, sin procesos superpuestos. Ningún archivo de este plan estaba involucrado en la causa.
- **`pnpm exec prettier --write` sobre el glob completo (`src/**/\*.ts`) reformateó ~40 archivos ajenos** (no tocados por este plan, aparentemente con drift de formato preexistente en el repo). Revertidos con `git checkout --` antes de comitear; se corrió prettier apuntado solo a los 5 archivos del commit para el resto de la verificación.

## Known Stubs

Ninguno. Este plan es puro código de infraestructura de tenancy (allowlist, registro de módulos strict, gates de test) — no toca UI ni introduce datos mock.

## Threat Flags

Ninguno nuevo. Las 6 mitigaciones del `<threat_model>` del plan quedaron verificadas:

| Threat ID   | Mitigación                          | Evidencia                                                                                                     |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| T-173-30-01 | orden allowlist→strict              | commit 1 verificado verde en aislamiento (`git checkout` de los otros 5 archivos), commit 2 nace verde (D-15) |
| T-173-30-02 | allowlist sin entradas agregadas    | `cur_set.issubset(base_set)` contra `origin/staging` → `True`, diff puro borrado                              |
| T-173-30-03 | gate de forma contra segunda copia  | `MODULOS_DECLARADOS` escrita a mano, verificado que un módulo de más/menos rompe el `it`                      |
| T-173-30-04 | demo sin falso verde multi-tabla    | sonda sobre `member_notes` (una sola tabla), método con call site real y test que lo ejercita                 |
| T-173-30-05 | sonda no commiteada                 | `git status --porcelain` vacío verificado tras revertir                                                       |
| T-173-30-06 | baja de gate numérico contabilizada | umbral de `con-06-lint.test.ts` (81→73) con docblock explicando cada tabla que sale                           |

## Self-Check: PASSED

- `el-templo-api/tenant-lint-allowlist.json` — FOUND, 339 entradas
- `el-templo-api/src/db/tenant-tables.ts` — FOUND, `members:` con 8 tablas
- `el-templo-api/test/db/tenant-tables.test.ts` — FOUND, `MODULOS_DECLARADOS.members`
- Commit `f5874215` — FOUND (`git log --oneline`)
- Commit `afc4fe78` — FOUND (`git log --oneline`)
- `pnpm lint:tenant` → `DISCREPANCIAS: 0`
- `pnpm exec vitest run --no-file-parallelism test/db/tenant-tables.test.ts test/tenancy/con-06-lint.test.ts` → 56/56
- Suite completa (7 lotes, 260 archivos) → 0 fallos
- `git status --porcelain` (worktree `et-173`) → vacío

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-09_
