---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 19
subsystem: api
tags: [tenancy, multi-tenant, drizzle, mysql, members, tenant-lint]

# Dependency graph
requires:
  - phase: 173-18
    provides: "createMember/createTrialMember/createMinimalMember/updateLead/updateMember/softDeleteMember/resetMemberPassword/updatePhoto/notes-writes scopeados con tenantValues/tenantWhere + guarda de ancla D-05"
  - phase: 173-17
    provides: "ctx TenantContext primero en los 23 métodos de members/service.ts; buildMemberNameSearchCondition/memberCoveredUntilSql ya scopeados"
provides:
  - "listMembers, exportMembers, exportSepaMembers, searchMembers, getMemberById, checkDniUniqueness, checkDuplicates, getNotes y getSessionLevelCounts scopeados por gimnasio (users, branches, subscriptions, subscription_plans, member_profiles, bookings, schedules, attendance, member_notes, completed_sessions, user_sepa_details)"
  - "el insert de referrals en createMember (alta asistida) estampado con tenantValues"
  - "members/service.ts sin una sola entrada en la allowlist de trabajo, ni por tabla del módulo ni por archivo (los dos criterios del doc 07 §0.3)"
affects: [173-30, 173-22]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tenantWhere(table, ctx) como primer elemento de conditions[] cuando la query final referencia esa condición vía variable (whereClause); si la query final no comparte statement con esa variable (sin join a otra tabla scopeada), el tenantWhere se repite INLINE en el statement que hace .from()/.where() — el lint razona por statement, no por variable"
    - "subqueries correlacionadas con FROM propio (raw sql) llevan el gimnasio como literal `<alias>.tenant_id = ${ctx.tenantId}` en su propio WHERE/ON, nunca heredado de la query externa"
    - "LEFT JOIN siempre filtrado en el ON, nunca en el WHERE (evita que un LEFT se comporte como INNER y borre filas legítimas sin la relación)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/service.ts

key-decisions:
  - "getNotes: se agregó `desc(memberNotes.id)` como desempate del ORDER BY porque `created_at` es un `timestamp` sin fracción de segundo — dos notas creadas en el mismo segundo empataban, y el nuevo INNER JOIN scopeado (tenantWhere en el ON de authorUsers) cambió el plan de MySQL que antes resolvía el empate por casualidad en el orden esperado por el test."
  - "activeMemberExists (shared/active-member.ts) NO se tocó: es un helper compartido con reports/advanced-finance sin ctx en su firma; darle ctx es cambio de firma fuera de members (D-02, cirugía mínima). Documentado inline en exportSepaMembers, no es una fuga real porque su EXISTS correlaciona por user_id (un id de usuario pertenece a un solo gimnasio)."
  - "createMember: el insert de referrals (atribución asistida) se corrigió con tenantValues aunque createMember no es uno de los 11 métodos de lectura del plan — era necesario para el cierre file-level de la allowlist (task 2 exige CERO entradas de members/service.ts por cualquier tabla, y ese insert era la única escritura sin tenantValues que quedaba en el archivo)."

patterns-established:
  - "Cuando un join scopeado (tenantWhere en el ON) convive en el mismo statement con un .from()/.where() de otra tabla del módulo, ese único join alcanza para que el lint (que razona por presencia textual dentro del statement, no por tabla específica) marque compliant TODA la query — pero la correctness real sigue viniendo del filtro lógico correcto, no del lint."

requirements-completed: [ADO-02]

# Metrics
duration: ~75min
completed: 2026-08-08
---

# Phase 173 Plan 19: Members lecturas — listado, ficha, búsqueda, exports y notas Summary

**listMembers/exportMembers/exportSepaMembers/searchMembers/getMemberById/checkDniUniqueness/checkDuplicates/getNotes/getSessionLevelCounts en `members/service.ts` quedan scopeados por gimnasio, con los 9 joins ajenos filtrados en el ON y las 9 entradas de allowlist por archivo cerradas.**

## Performance

- **Duration:** ~75 min
- **Tasks:** 2/2 completados
- **Files modified:** 1 (`el-templo-api/src/modules/members/service.ts`)

## Accomplishments

- El listado paginado (`listMembers`) queda scopeado en sus TRES queries (filas, `total`, `totalDebtByCurrency`), con `tenantWhere(users, ctx)` como primer filtro y el `innerJoin(branches)` filtrado en el `ON` en las tres.
- Las subqueries correlacionadas de `listMembers`/`exportMembers`/`exportSepaMembers`/`searchMembers` (plan activo, segmento, avatar, `hasUsedTrial`, `multiBranch`, filtro de plan) llevan el gimnasio INLINE en el `sql` crudo — cada una con su propio `FROM`, sin heredar el filtro de afuera.
- `getMemberById` queda scopeado en sus tres queries (ficha, último trial, SEPA); los tres `LEFT JOIN` (`creator`, `subscriptionPlans`, `attendance`) llevan el filtro en el `ON`, nunca en el `WHERE`.
- `checkDniUniqueness`/`checkDuplicates` (los checks de unicidad y duplicados) y `searchMembers` — las tres queries que el piloto identificó como las más peligrosas por buscar por nombre/DNI/teléfono — quedan con `tenantWhere(users, ctx)` inline.
- `getNotes` queda scopeado (`memberNotes` + `authorUsers`), con un fix de determinismo en el `ORDER BY` (ver Deviations).
- `getSessionLevelCounts` (agregado sobre `completed_sessions`) queda scopeado.
- El insert de `referrals` en `createMember` (atribución asistida) pasa a usar `tenantValues`.
- `members/service.ts` queda con **cero** entradas en la allowlist de trabajo (`/tmp/allowlist-173-19.json`), por cualquiera de los dos criterios del doc 07 §0.3 (tabla del módulo o archivo).

## Task Commits

1. **Task 1: listMembers y exportMembers — el constructor de filtros y las tablas joineadas** - `a5787fb3` (feat)
2. **Task 2: Búsqueda, ficha, duplicados, notas y conteos — y el cierre de las 11 entradas por archivo** - `37aeeeca` (feat)

_Plan metadata: no se hizo commit en el checkout principal (instrucción explícita del orquestador — este SUMMARY vive sin commit)._

## Files Created/Modified

- `el-templo-api/src/modules/members/service.ts` — 11 métodos de lectura (`listMembers`, `searchMembers`, `getMemberById`, `checkDniUniqueness`, `checkDuplicates`, `exportMembers`, `exportSepaMembers`, `getNotes`, `getSessionLevelCounts`, más el insert de `referrals` en `createMember` y el fix de orden de `getNotes`) scopeados por gimnasio.

## Joins y su filtro (para el registro del plan)

| Método                         | Join                         | Tipo  | Filtro |
| ------------------------------ | ---------------------------- | ----- | ------ |
| `listMembers` (×3 queries)     | `branches`                   | INNER | `ON`   |
| `listMembers` totalDebtPromise | `users`, `branches`          | INNER | `ON`   |
| `searchMembers`                | `branches`                   | INNER | `ON`   |
| `getMemberById` (ficha)        | `branches`                   | INNER | `ON`   |
| `getMemberById` (ficha)        | `creator` (alias de `users`) | LEFT  | `ON`   |
| `getMemberById` (ficha)        | `subscriptionPlans`          | LEFT  | `ON`   |
| `getMemberById` (trial)        | `schedules`, `branches`      | INNER | `ON`   |
| `getMemberById` (trial)        | `attendance`                 | LEFT  | `ON`   |
| `checkDuplicates`              | `branches`                   | INNER | `ON`   |
| `exportMembers`                | `branches`                   | INNER | `ON`   |
| `exportSepaMembers`            | `branches`                   | INNER | `ON`   |
| `exportSepaMembers`            | `userSepaDetails`            | LEFT  | `ON`   |
| `getNotes`                     | `authorUsers` (=`users`)     | INNER | `ON`   |

Entradas colaterales que aparecieron durante el cierre (no estaban en las 9 nombradas por el CONTEXT, pero eran del mismo archivo): ninguna nueva — las 9 tablas por archivo (`attendance`, `bookings`, `branches`, `completed_sessions`, `referrals`, `schedules`, `subscription_plans`, `subscription_schedules`, `subscriptions`) fueron exactamente las que cerró este plan más las 5 tablas propias del módulo (`member_notes`, `member_profiles`, `user_sepa_details`, `user_status_history`, `users`) ya cerradas por 173-18/173-20 y confirmadas cero en este plan.

## Decisions Made

- **`getNotes` — desempate por `id` en el `ORDER BY`:** `member_notes.created_at` es un `timestamp` sin fracción de segundo. Antes de este plan, dos notas creadas en el mismo segundo empataban en `created_at` pero el plan de MySQL (sin el `INNER JOIN` scopeado) resolvía el empate en el orden que el test esperaba, por casualidad. Al scopear el `innerJoin(authorUsers, ...)` con `tenantWhere` en el `ON`, el plan de ejecución cambió y el empate empezó a resolverse al revés, rompiendo `test/members/members.test.ts > Notes > GET returns notes with author info ordered by most recent`. Se agregó `desc(schema.memberNotes.id)` como segundo criterio de orden — determinístico porque `id` es autoincremental. Verificado contra la versión sin el fix (revertida temporalmente sin commit) que el test fallaba SIN el `tenantWhere`-scoping y pasaba SIN el fix de `id`, confirmando causalidad.
- **`activeMemberExists` no se tocó** (ver key-decisions arriba) — documentado inline en `exportSepaMembers` en vez de arreglado, por D-02 (cirugía mínima, es un helper compartido fuera de `members`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `getNotes` ORDER BY no determinístico expuesto por el scoping**

- **Found during:** Task 2 (getNotes)
- **Issue:** Al agregar `tenantWhere(authorUsers, ctx)` al `innerJoin` de `getNotes`, el test `GET returns notes with author info ordered by most recent` empezó a fallar (`expected 'Nota 1' to be 'Nota 2'`) — dos notas creadas en el mismo segundo empataban en `created_at` (timestamp sin fracción de segundo) y el nuevo plan de MySQL resolvía el empate en el orden contrario al esperado.
- **Fix:** `orderBy(desc(memberNotes.createdAt), desc(memberNotes.id))` — `id` autoincremental como desempate determinístico.
- **Files modified:** `el-templo-api/src/modules/members/service.ts`
- **Verification:** Confirmado por reversión temporal (sin commit) contra la versión HEAD pre-173-19: el test pasa con el código original (sin scoping), falla con el scoping SIN el fix de `id`, y pasa con el scoping + el fix. `pnpm exec vitest run --no-file-parallelism test/members/members.test.ts` verde.
- **Committed in:** `37aeeeca` (Task 2 commit)

**2. [Rule 2 - Missing Critical] `referrals` insert en `createMember` sin `tenantValues`**

- **Found during:** Task 2 (cierre de allowlist)
- **Issue:** El insert de atribución asistida (`this.db.insert(schema.referrals).values({...})` dentro de `createMember`) no usaba `tenantValues`, dejando la fila con `tenant_id` en su `DEFAULT 1` sin importar el gimnasio del alta. `createMember` no es uno de los 11 métodos de lectura de este plan, pero el criterio de cierre de Task 2 (`pnpm lint:tenant` con CERO entradas de `members/service.ts`) lo exige — es una escritura del mismo archivo, dentro del alcance por D-02.
- **Fix:** `this.db.insert(schema.referrals).values(tenantValues(ctx, {...}))`.
- **Files modified:** `el-templo-api/src/modules/members/service.ts`
- **Verification:** `pnpm lint:tenant --allowlist=/tmp/allowlist-173-19.json` da cero entradas de `members/service.ts`; `test/referrals/admin-assign-referrer.test.ts` y `test/referrals/anti-fraud.test.ts` (los que ejercitan `POST /api/admin/members` con `referredBy`) verdes.
- **Committed in:** `37aeeeca` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Ambos necesarios para correctness/determinismo de tests y para cerrar el criterio de allowlist del plan. Sin scope creep — los dos tocan `members/service.ts`, el único archivo del plan.

## Issues Encountered

- El comando de verificación literal del plan (`pnpm exec tsc -p tsconfig.test-check.json --noEmit`) sale con exit code 1 porque el árbol de `test/` arrastra 185 errores de tipos preexistentes (documentados en `test-check-baseline.json`, cero relacionados con `src/`). El gate real del proyecto es el ratchet `pnpm typecheck:tests`, que sí sale 0 (sin drift nuevo) — se usó ese como criterio de aceptación, consistente con el resto de las fases 173-\*.
- La allowlist real (`tenant-lint-allowlist.json`, 450 entradas) **no se tocó** — el plan trabaja contra una copia temporal (`/tmp/allowlist-173-19.json`, 436 entradas tras borrar las 14 de `members/service.ts`) porque el archivo real tiene un solo dueño (el plan del switch, 173-30) y queda "rojo" contra la rama hasta que ese plan cierre — comportamiento esperado, no una regresión.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `members/service.ts` queda con cero entradas de allowlist por cualquiera de los dos criterios (tabla o archivo) — listo para que 173-30 (el switch) borre las 14 entradas reales de la allowlist y agregue `members` a `TENANT_STRICT_MODULES`.
- Pendiente de otros planes de la fase: 173-21..29 (resto de escrituras/lecturas/cirugía en archivos ajenos aún no cubiertos), 173-30 (switch: borrado real de allowlist + entrada strict), 173-22 (dueño de los 5 tests rojos preexistentes en `test/branch-access.test.ts`, no tocados por este plan).
- Sin bloqueos para el resto de la fase.

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_

## Self-Check: PASSED
