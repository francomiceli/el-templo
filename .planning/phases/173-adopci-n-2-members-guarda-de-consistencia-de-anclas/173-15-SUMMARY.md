---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 15
subsystem: auth
tags: [tenancy, multi-tenant, drizzle, wellhub, fastify, vitest]

requires:
  - phase: 173-11
    provides: "resolveBranchDelGimnasio / assertBranchDelGimnasio (shared/branch-consistency.ts)"
  - phase: 173-09
    provides: "patron attachCountryScope + assertTenant en rutas member-facing (bar-challenge/routes.ts)"
provides:
  - "POST /api/auth/register estampa tenantId: branchTenantId en el insert(users) — cierra WR-01/D-12"
  - "Las 3 rutas JWT de auth/routes.ts (GET /me, POST /me/change-password, POST /me/delete-account) resuelven ctx via attachCountryScope + assertTenant"
  - "wellhub findOrCreateVisitor recibe ctx y valida el branchId con assertBranchDelGimnasio (sitio de ancla #11)"
  - "Fix real (no solo lint) de fuga cross-tenant en el lookup de visitante Wellhub por email"
  - "test/tenancy/ancla-autorregistro.test.ts — evidencia con 2 gimnasios de que el autorregistro nace en la sede elegida"
  - "4 entradas de allowlist migradas: auth/routes.ts{users,member_profiles}, wellhub/service.ts{users,user_status_history}"
affects: [173-14, 173-16, 173-30]

tech-stack:
  added: []
  patterns:
    - "ctx unico por handler en rutas publicas sin JWT, construido una vez y reusado (auth/register)"
    - "attachCountryScope + assertTenant en rutas member-facing con JWT, mismo patron que bar-challenge (T-173-09-01)"
    - "exenciones tenant-safe para lookups deliberadamente cross-tenant (M8 TENANT_GLOBAL_UNIQUES, y deuda pre-existente fase 168 de email/dni)"

key-files:
  created:
    - el-templo-api/test/tenancy/ancla-autorregistro.test.ts
  modified:
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/wellhub/service.ts

key-decisions:
  - "No se migró subscriptions/service.ts (D-13/assignPlan) aunque el test de promo lo rozó: es deuda con dueño explícito en 173-14 (wave 5, aún no ejecutado) y arreglarla ahora habría puesto en rojo antes de tiempo el it autodestructivo de iso-03-finance-coach-load.test.ts:1326"
  - "Las búsquedas globales por email/dni/telefono en /register y /login quedan exentas (tenant-safe) documentando que es deuda pre-existente de la fase 168 (CON-01), no una decisión nueva de este plan"
  - "wellhub: la búsqueda de visitante por email se re-scopeó con tenantWhere — era un fix real de una fuga cross-tenant, no solo un requisito de lint"
  - "No se tocó test/helpers.ts (createTestMember) aunque su docblock quedó desactualizado (afirma que /register no conoce el tenant, y ahora lo conoce) — está fuera del alcance de archivos del plan y su mecánica sigue siendo válida"

requirements-completed: [ADO-02, ADO-07]

duration: ~70min
completed: 2026-08-08
---

# Phase 173 Plan 15: Autorregistro + Wellhub — guarda de consistencia de anclas Summary

**El insert de `POST /api/auth/register` estampa `tenantValues(ctx, ...)` con el gimnasio ya resuelto server-side, y el webhook de Wellhub valida la sede del visitante con `assertBranchDelGimnasio` antes de escribir `users`/`user_status_history` — los dos caminos sin JWT que podían crear un socio cross-tenant quedan cerrados, con test dirigido de 2 gimnasios y mutación verificada.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3/3 completed
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments

- WR-01/D-12 cerrado: `insert(users)` de `POST /register` estampa el gimnasio ya resuelto (`branchTenantId`), en vez de caer en el `DEFAULT 1`. Un `ctx` único construido una vez en el handler, reusado por el insert, la actualización de `referredBy` y `assignPlan`.
- Las 4 entradas de allowlist del alcance del plan desaparecieron (`auth/routes.ts{users,member_profiles}`, `wellhub/service.ts{users,user_status_history}`), confirmado con `pnpm lint:tenant` dando 0 `unlistedViolations` para esos 4 pares.
- Las 3 rutas JWT de `auth/routes.ts` (`GET /me`, `POST /me/change-password`, `POST /me/delete-account`) ahora resuelven su propio `ctx` vía `attachCountryScope` + `assertTenant`, mismo patrón que `bar-challenge/routes.ts` (T-173-09-01) — un gimnasio suspendido ahora también corta estas 3 rutas del socio (antes no las tocaba el enforcement de `attachScope`).
- Sitio de ancla #11 (Wellhub) resuelto: `findOrCreateVisitor` recibe `ctx` y valida el `branchId` del gym de Wellhub con `assertBranchDelGimnasio` dentro de la misma transacción del alta, escribiendo el `id` de la fila resuelta.
- Fix REAL (no solo de lint) descubierto en Wellhub: la búsqueda de visitante por email no filtraba por gimnasio — desde la fase 168 el email es único POR TENANT, así que un email coincidente de otro gimnasio quedaba vinculado al `gympass_id` de este webhook, mezclando identidades entre gimnasios. Ahora usa `tenantWhere(users, ctx)`.
- Test dirigido `test/tenancy/ancla-autorregistro.test.ts` (6 `it`): precondición de país compartido, el usuario nace en `TENANT_DOS` (evidencia leída de la base, 2 asserts independientes), control positivo con El Templo, fail-closed con sede inexistente, y el promo aplicándose en el branch correcto del gimnasio 2.
- Mutación de cierre verificada a mano: revertir `tenantValues(ctx, ...)` del insert puso en rojo 3 de los 6 `it` (no 2 — el FK compuesta `(tenant_id, branch_id)` del plan 173-12 convierte el intento de insert cross-tenant en un `500` por violación de FK en vez de una fila silenciosa) y la mutación quedó revertida (`git diff` vacío verificado).

## Task Commits

1. **Task 1: WR-01 — el insert del autorregistro estampa el gimnasio (D-12)** - `edede74e` (feat)
2. **Task 2: Test dirigido del autorregistro con 2 gimnasios (D-12)** - `63239811` (test)
3. **Task 3: wellhub/service.ts — 2 entradas y el sitio de ancla #11** - `a9e3ebaa` (feat)

_Nota: Task 3 se implementó y verificó antes que Task 2 en el orden de trabajo real (para tener el helper de branch-consistency probado antes de escribir el test), pero los commits documentan cada task por separado tal como pide el plan._

## Files Created/Modified

- `el-templo-api/src/modules/auth/routes.ts` - insert(users) con tenantValues; ctx único del handler; tenantWhere en member_profiles/users de /login y /me; attachCountryScope+assertTenant en las 3 rutas JWT; 3 exenciones tenant-safe documentadas (duplicado email/dni/telefono en /register, login por email, refresh por userId server-resuelto)
- `el-templo-api/src/modules/wellhub/service.ts` - findOrCreateVisitor(ctx, user, branchId); assertBranchDelGimnasio en el insert de users; tenantWhere en el lookup por email (fix real de fuga cross-tenant); tenantValues en los inserts de users/userStatusHistory; 2 exenciones tenant-safe (M8, gympass_id global)
- `el-templo-api/test/tenancy/ancla-autorregistro.test.ts` (nuevo) - test dirigido de D-12 con 2 gimnasios, mutación de cierre documentada en el docblock

## Decisions Made

- **No se migró `subscriptions/service.ts` (D-13/assignPlan) aunque el test de promo lo tocó de cerca.** D-13 (`getMemberSubscription` con `ctx`, `assignPlan` con `tenantValues` en su insert) tiene dueño explícito: `173-14-PLAN.md`, wave 5, todavía NO ejecutado (este plan es wave 3). Verificado en vivo: si se arreglara acá, `assignPlan` insertaría la sub con `tenant_id` correcto, la validación de "concepto enlazado" de `TransactionService.create` (que SÍ filtra por gimnasio) empezaría a encontrarla, y el `it` autodestructivo de `test/tenancy/iso-03-finance-coach-load.test.ts:1326` —marcado explícitamente "dueño: fase 173"— se pondría en rojo ANTES de que 173-14 lo convierta en su control positivo. El test de promo de este plan usa un plan con precio $0 (mismo patrón que `promo-registration.test.ts`) para evitar tocar esa validación, y verifica lo que hoy SÍ es cierto: `promoApplied: true` y la suscripción creada con el `branch_id` correcto del gimnasio 2 — sin afirmar el `tenant_id` de `subscriptions`, documentado extensamente en el docblock del test.
- **Las búsquedas globales por email/dni/teléfono en `/register` y por email en `/login` quedan exentas (`tenant-safe`), no resueltas.** Son deuda pre-existente de la fase 168 (CON-01, que volvió `email`/`dni` únicos POR gimnasio en vez de global): ninguna de las dos rutas recibe un selector de gimnasio, así que hoy buscan a propósito cross-tenant. Documentado en comentario de bloque en ambos sitios; no se resuelve en este plan (arreglarlo requeriría decidir cómo el login distingue cuentas homónimas entre gimnasios — decisión de producto, no de tenancy).
- **wellhub: el fix del lookup por email es real, no cosmético.** Sin `tenantWhere`, un visitante de Wellhub del gimnasio A con el mismo email que un socio del gimnasio B quedaba vinculado al `gympass_id` del webhook de A, mezclando identidades. Se corrigió con el mismo helper que ya usa el resto del archivo.
- **`test/helpers.ts` (`createTestMember`) no se tocó.** Su docblock (fase 171) afirma que "`POST /api/auth/register` NO conoce el tenant" — eso dejó de ser cierto con este plan. No está en el alcance de archivos de 173-15 y su mecánica (INSERT directo para `tenantId !== 1`) sigue siendo válida y necesaria (register no genera los efectos colaterales de `member_profiles`/referidos que un fixture 2-tenant necesitaría simular de todos modos). Queda anotado como hallazgo menor, no como bug.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fuga cross-tenant en `findOrCreateVisitor` de Wellhub (lookup por email)**

- **Found during:** Task 3
- **Issue:** La búsqueda de visitante por email (`src/modules/wellhub/service.ts`) no filtraba por gimnasio. Desde la fase 168, `email` es único POR TENANT (no global), así que un email coincidente de OTRO gimnasio podía quedar vinculado al `gympass_id` de un webhook de un gimnasio distinto, mezclando la identidad de un socio ajeno con una visita de este gimnasio.
- **Fix:** Agregado `tenantWhere(schema.users, ctx)` al `SELECT` y al `UPDATE` de vinculación por email.
- **Files modified:** `el-templo-api/src/modules/wellhub/service.ts`
- **Verification:** `pnpm exec vitest run --no-file-parallelism test/wellhub` (29/29 verde, incluido el caso "vincula por email a un usuario existente en vez de duplicarlo").
- **Committed in:** `a9e3ebaa` (Task 3 commit)

**2. [Rule 4 - decisión, NO auto-fix] D-13/assignPlan descubierto como bloqueante para la aserción literal del plan sobre `subscriptions.tenant_id`**

- **Found during:** Task 2
- **Issue:** El acceptance criteria de Task 2 pide afirmar que la suscripción del promo "nació en TENANT_DOS" leyendo la base. `assignPlan` (`subscriptions/service.ts`) no estampa `tenantValues` en su insert — es la deuda D-13, con dueño 173-14 (wave 5, posterior a este plan).
- **Decisión:** NO se arregló acá (evaluado y descartado explícitamente — ver "Decisions Made" arriba: el fix rompería en cadena el `it` autodestructivo de `iso-03-finance-coach-load.test.ts:1326`, propiedad de 173-14). El test de promo se ajustó para verificar lo que es cierto HOY (branch_id correcto, promoApplied true) y documenta la deuda explícitamente.
- **Files modified:** ninguno fuera del alcance original (subscriptions/service.ts NO se tocó)
- **Committed in:** `63239811` (Task 2 commit, docblock explica la decisión)

---

**Total deviations:** 2 (1 auto-fixed por Rule 1, 1 decisión documentada por Rule 4 sin tocar código fuera de alcance)
**Impact on plan:** El fix de Rule 1 es una corrección de seguridad real dentro del archivo en alcance. La decisión de Rule 4 evitó romper el estado esperado de un plan posterior (173-14) y dejó rastro explícito para que su ejecutor no se sorprenda.

## Issues Encountered

- El acceptance criteria de Task 2 ("mutación pone en rojo al menos 2 `it`") se cumplió con 3 `it` en rojo, no 2 — la FK compuesta `(tenant_id, branch_id)` de `users→branches` (plan 173-12) convierte el intento de insert sin `tenant_id` correcto en un `500` (violación de FK), no en una fila silenciosa con `tenant_id` equivocado. Es una demostración MÁS fuerte de la protección (la capa DB actúa incluso si la capa app fallara), documentada en el mensaje de commit de Task 2.
- El texto literal de la verificación del plan pide `pnpm exec tsc -p tsconfig.test-check.json --noEmit` — se corrió en su lugar `pnpm typecheck:tests` (el mismo `tsconfig`, pero con el ratchet de baseline), porque `tsc` a secas reporta 185 errores preexistentes en `test/` ajenos a este plan (regla dura del proyecto). Resultado: 0 errores nuevos, 0 empeorados.
- No se corrió `pnpm exec vitest run --no-file-parallelism test/auth test/wellhub test/tenancy` como un solo comando (el directorio `test/tenancy` tiene decenas de archivos de la batería ISO-03/CON-0x que tardarían mucho más que el timeout razonable y violarían la regla dura de no correr la suite completa local). Se corrieron `test/auth` (51/51), `test/wellhub` (29/29) y específicamente `test/tenancy/ancla-autorregistro.test.ts` (6/6) por separado.

## User Setup Required

None - no external service configuration required. La integración de Wellhub sigue dormida en producción (503 esperado, secrets vacíos) — el criterio de verificación de Task 3 es la suite, no una prueba en vivo, tal como pedía el plan.

## Next Phase Readiness

- ADO-02/ADO-07 avanzan: el autorregistro público y el webhook de Wellhub —los dos caminos que crean/mueven socios sin JWT— ya derivan el gimnasio de una fila del servidor y no pueden apuntar a una sede ajena.
- **173-14 (wave 5)** hereda una nota explícita: cuando arregle D-13 (`assignPlan` con `tenantValues`), el test de promo de este plan (`ancla-autorregistro.test.ts`) puede extenderse para afirmar también el `tenant_id` de `subscriptions` — no es obligatorio, pero cerraría el círculo iniciado acá.
- **173-30** (dueño de la allowlist final) no se ve afectado: las 4 entradas que este plan tenía que borrar de su copia de trabajo desaparecieron limpiamente; el archivo real committeado (`tenant-lint-allowlist.json`, 450 entradas) no se tocó.
- Hallazgo menor sin dueño asignado: `test/helpers.ts` (`createTestMember`) tiene un docblock desactualizado que afirma que `/register` no conoce el tenant — ya no es cierto. No bloquea nada (la mecánica de INSERT directo para gimnasio≠1 sigue siendo la correcta), pero alguien debería actualizar el comentario cuando toque ese archivo.

## Self-Check: PASSED

- FOUND: `el-templo-api/src/modules/auth/routes.ts` (modificado, tsc limpio)
- FOUND: `el-templo-api/src/modules/wellhub/service.ts` (modificado, tsc limpio)
- FOUND: `el-templo-api/test/tenancy/ancla-autorregistro.test.ts` (creado, 6/6 tests verdes)
- FOUND commit `edede74e` (Task 1)
- FOUND commit `63239811` (Task 2)
- FOUND commit `a9e3ebaa` (Task 3)
- Allowlist real (`tenant-lint-allowlist.json`) sin modificar: confirmado por `git diff --stat` vacío
- `git status --porcelain` en el worktree: limpio tras los 3 commits (verificado antes de escribir este SUMMARY)

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_
