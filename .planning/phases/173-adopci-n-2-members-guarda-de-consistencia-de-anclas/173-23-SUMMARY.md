---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 23
subsystem: testing
tags:
  [
    tenancy,
    subscriptions,
    finance,
    reports,
    coach,
    programs,
    referrals,
    sentinel,
    sonda-revertida,
    tenant-safe,
  ]

# Dependency graph
requires:
  - phase: 173-22
    provides: "test/members, test/users, test/auth, test/shared sobreviven al throw; sonda de members utilizable de punta a punta (login/registro no dan 500)"
  - phase: 173-14
    provides: "subscriptions/service.ts con ctx en 9/11 llamadores de recomputeUserStatus/activateScheduledSub; el camino ctx=null documentado como deuda fase 174"
  - phase: 173-05
    provides: "reports/service.ts con buildOutstandingScope migrado; 4 métodos documentados como deuda diferida sin ctx"
  - phase: 173-08
    provides: "patrón isNotNull(tabla.tenantId) para métodos PK-scoped sin ctx externo; exención tenant-safe de getAbTestResults (solo TS comment)"
provides:
  - "test/subscriptions (25 archivos) + test/finance (21 archivos) + 2 archivos sueltos sobreviven al throw sobre las 8 tablas del módulo (605 tests)"
  - "test/reports (6) + test/coach (1) + test/programs (4) + test/referrals (14) + test/reports-trial-sessions.test.ts sobreviven al throw (255 tests)"
  - "HALLAZGO CRÍTICO cerrado: recomputeUserStatus/activateScheduledSub (subscriptions/service.ts) bloqueaban CUALQUIER lectura de suscripción con users strict — guard isNotNull aplicado al camino ctx=null, deuda ADO-07/fase-174 intacta"
  - "HALLAZGO CRÍTICO cerrado: 4 métodos de reports/service.ts (getExpiredMembers, getExpiringMemberships, getInactiveMembers, getTrialSessionsReport+loadRosterAttribution) migrados con ctx real — colateral positivo para la allowlist de 173-30"
  - "getAbTestResults (referrals/service.ts): exención tenant-safe ahora también embebida en el SQL (no solo comentario TS)"
  - "Regresión conjunta 173-22+173-23 verde: 10 carpetas, 96 archivos, 1130 tests"
affects: ["173-24", "173-25", "173-30 (el switch)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cuando un método deferred-a-otra-fase (ctx: TenantContext | null) tiene TODAS sus queries del camino null sin ningún filtro, y ese camino se ejercita en CUALQUIER lectura común (no un caso de borde), es un blocker de Rule 3 para el plan de test-hardening que enciende la sonda — no un hallazgo a solo documentar. El fix correcto es el guard isNotNull ya establecido por 173-08, aplicado LOCALMENTE dentro del mismo archivo que ya tocó el plan dueño de la deuda, sin threadear ctx a los módulos que ese plan había excluido a propósito (D-02 intacto)"
    - "Un método de servicio con un ÚNICO call site (verificado con grep antes de tocar la firma) es candidato seguro para threading COMPLETO de ctx real, aun si el plan que lo dejó pendiente lo clasificó como 'deuda futura' — la cirugía mínima de D-02 mide alcance por ARCHIVOS AJENOS tocados, no por si el método 'pertenecía' a otro plan"
    - "500 sin TenantSentinelError visible en el log del test: handleServiceError aplana el error a un mensaje genérico y NODE_ENV=test silencia el logger de Fastify. Para ver la causa real hay que reproducir el request con un script standalone y NODE_ENV=development (mismo modo throw que test, pero logger no-silent)"
    - "LEFT JOIN a `users` (creator/coach opcional) — el filtro de tenant va en el ON del LEFT JOIN, nunca en el WHERE (mismo hallazgo 172-03 aplicado de nuevo, esta vez en reports/service.ts::getTrialSessionsReport)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/routes.ts
    - el-templo-api/src/modules/referrals/service.ts
    - el-templo-api/test/finance/cash-balances.test.ts
    - el-templo-api/test/finance/cash-register-service.test.ts
    - el-templo-api/test/finance/coach-load-alta.test.ts
    - el-templo-api/test/finance/coach-load-pricing-gate.test.ts
    - el-templo-api/test/finance/coach-load.test.ts
    - el-templo-api/test/finance/direct-debit.test.ts
    - el-templo-api/test/finance/export-transactions.test.ts
    - el-templo-api/test/finance/financial-history-api.test.ts
    - el-templo-api/test/finance/mov-egresos-history.test.ts
    - el-templo-api/test/finance/movement-service.test.ts
    - el-templo-api/test/finance/pending-tray.test.ts
    - el-templo-api/test/finance/summary-by-kind.test.ts
    - el-templo-api/test/finance/summary-sanity.test.ts
    - el-templo-api/test/finance/transaction-service.test.ts
    - el-templo-api/test/finance/transactions-api.test.ts
    - el-templo-api/test/finance/validate-caja.test.ts
    - el-templo-api/test/finance/validation-regression.test.ts
    - el-templo-api/test/finance/validation-state.test.ts
    - el-templo-api/test/subscriptions-conversion-hook.test.ts
    - el-templo-api/test/subscriptions/assign-plan-validation.test.ts
    - el-templo-api/test/subscriptions/bundle-todos-los-programas.test.ts
    - el-templo-api/test/subscriptions/change-schedules.test.ts
    - el-templo-api/test/subscriptions/charge-on-assign.test.ts
    - el-templo-api/test/subscriptions/compensate-days.test.ts
    - el-templo-api/test/subscriptions/expire-cancel-linked-program.test.ts
    - el-templo-api/test/subscriptions/impute-advance-on-assign.test.ts
    - el-templo-api/test/subscriptions/lifecycle.test.ts
    - el-templo-api/test/subscriptions/user-status-history.test.ts
    - el-templo-api/test/subscriptions/zero-price-gate.test.ts
    - el-templo-api/test/programs/admin-addons.test.ts
    - el-templo-api/test/programs/current-program.test.ts
    - el-templo-api/test/referrals/ab-copy-test.test.ts
    - el-templo-api/test/referrals/admin-assign-referrer.test.ts
    - el-templo-api/test/referrals/admin-referrals-endpoint.test.ts
    - el-templo-api/test/referrals/anti-fraud.test.ts
    - el-templo-api/test/referrals/backfill-codes.test.ts
    - el-templo-api/test/referrals/code-generation.test.ts
    - el-templo-api/test/reports-trial-sessions.test.ts
    - el-templo-api/test/reports/debt-management.test.ts
    - el-templo-api/test/reports/expired-members.test.ts
    - el-templo-api/test/reports/outstanding-balances-export.test.ts
    - el-templo-api/test/reports/outstanding-balances.test.ts
    - el-templo-api/test/reports/reports.test.ts

key-decisions:
  - "Toda la clasificación de test/ cayó en categoría 2 (conveniencia acotable → filtro con tenantWhere/TEMPLO_CTX), salvo la exención ya existente reforzada de getAbTestResults — cero exenciones NUEVAS en todo el plan, ninguna en test/finance/ (territorio ya endurecido por la 172)"
  - "Los 2 hallazgos bloqueantes de producción (subscriptions/service.ts, reports/service.ts) se corrigieron con Rule 3 dentro de archivos YA tocados por planes pares (173-14, 173-05) — nunca se tocó un archivo nuevo fuera de esos dos + referrals/service.ts (exención embebida, sin cambio de comportamiento)"
  - "subscriptions/service.ts: se preservó la deuda ADO-07 documentada (activateScheduledSub NO valida la sede contra el gimnasio cuando ctx=null) — solo se cerró el throw del sentinel con isNotNull, sin tocar esa guarda ni threadear ctx a scheduling/booking-service.ts (D-02 intacto)"
  - "reports/service.ts: los 5 métodos migrados (getExpiredMembers, getExpiringMemberships, getInactiveMembers, getTrialSessionsReport, loadRosterAttribution) tienen UN SOLO call site cada uno en reports/routes.ts, verificado con grep antes de tocar la firma — threading completo de ctx real, no un guard parcial"

patterns-established:
  - "Reproducir un 500 sin sentinel visible: script standalone con NODE_ENV=development + JWT_SECRET/DB_* del test, para ver el log completo del pino logger (silenciado en NODE_ENV=test)"

requirements-touched: [ADO-02]

# Metrics
duration: ~6h
completed: 2026-08-08
---

# Phase 173 Plan 23: Adopción 2 — members, guarda de anclas — subscriptions, finance, reports, coach, programs, referrals Summary

**Los ~75 archivos más pesados de la fase (860 tests) sobreviven al throw del sentinel sobre las 8 tablas de `members`, y en el camino aparecieron dos bloqueadores reales de producción — no solo deuda de test — que habrían dejado inoperables la mayoría de los flujos de suscripción y cuatro reportes admin el día que el switch de 173-30 encienda `users` en serio: `recomputeUserStatus`/`activateScheduledSub` (deuda documentada por la 173-14) y 4 métodos de `reports/service.ts` (deuda documentada por la 173-05), ambos cerrados con cirugía mínima dentro de los mismos archivos que sus planes dueños ya habían tocado.**

## Performance

- **Duration:** ~6h
- **Tasks:** 2/2
- **Files modified:** 47 (Task 1) + 17 (Task 2) = 64 archivos (2 de producción compartidos entre commits: `subscriptions/service.ts`, y 3 nuevos de producción en Task 2)

## Task Commits

| Tarea  | Nombre                                                              | Commit     | Archivos |
| ------ | ------------------------------------------------------------------- | ---------- | -------- |
| Task 1 | test/subscriptions y test/finance (605 tests)                       | `cd3174f3` | 30       |
| Task 2 | test/reports, test/coach, test/programs, test/referrals (255 tests) | `5a2958ef` | 17       |

**Plan metadata:** este SUMMARY (el orquestador hace el commit final).

## Accomplishments

- **605 + 255 = 860 tests sobreviven al throw**, sobre 75 archivos, con la sonda de `members` (8 tablas) encendida a mano y revertida sin commitear en cada verificación.
- **Cero exenciones nuevas** en toda la fase. `test/finance/` (territorio ya endurecido por la 172) no recibió ninguna exención — los sitios nuevos ahí son sobre `users`/`audit_log` (tablas de ESTA fase) y se resolvieron con filtro, como pide el criterio de aceptación.
- **Hallazgo crítico 1 — `subscriptions/service.ts`:** `recomputeUserStatus` y `activateScheduledSub` tienen un camino `ctx: TenantContext | null` documentado por la 173-14 como "DEUDA CON DUEÑO — FASE 174" (el llamador, `autoExpireSubscriptions`, es compartido por métodos que alimentan `scheduling/booking-service.ts` y rutas member-facing, fuera del alcance D-02 de esta fase). Con `users` strict, las 4 queries de ese camino null hacían throw en **cualquier** `GET`/renovación/cancelación de una suscripción — no un caso de borde. Se aplicó el mismo guard `isNotNull(tenantId)` que 173-08 estableció, sin tocar la guarda ADO-07 (que sigue condicionada a `ctx` real, deuda intacta para la 174) y sin tocar ningún archivo fuera de `subscriptions/service.ts`.
- **Hallazgo crítico 2 — `reports/service.ts`:** 4 métodos documentados por la 173-05-SUMMARY como deuda diferida (`getExpiredMembers`, `getTrialSessionsReport`, `loadRosterAttribution`, y el ya cerrado `getTrialConversionReport`) más 2 no nombrados explícitamente (`getExpiringMemberships`, `getInactiveMembers`) hacían throw en bloque sobre `/expired-members`, `/expiring`, `/inactive`, `/trial-sessions` (50 tests). Los 5 métodos que seguían sin `ctx` tienen **un único call site** cada uno en `reports/routes.ts` — se hizo threading COMPLETO de `ctx: TenantContext`, no un guard parcial, con `tenantWhere`/`AND tenant_id = ?` en cada join sobre `users`/`subscriptions` (el `creator` de `getTrialSessionsReport`, LEFT JOIN opcional, lleva el filtro en el ON para no convertirlo en INNER).
- **Hallazgo 3 — `referrals/service.ts::getAbTestResults`:** la exención `tenant-safe` de la 173-08 era solo un comentario TS sobre la cadena de Drizzle — invisible para el sentinel (mismo patrón D-17 que 173-21/173-22 encontraron en `auth/routes.ts`). Se repitió el tag embebido en un fragmento `sql\`` del `where`.
- **8 sitios de SQL crudo en `test/referrals/`** (UPDATE/SELECT sobre `users` por id, sin backticks) se acotaron con `AND tenant_id = ?` — el canal que ningún grep de Drizzle ve.
- **Regresión conjunta 173-22+173-23 verde**: `test/members test/users test/auth test/shared test/subscriptions test/finance test/reports test/coach test/programs test/referrals` → 96 archivos, 1130/1130 tests, con la sonda encendida.

## Files Created/Modified

Ver `key-files.modified` en el frontmatter (64 archivos: 4 de producción — `subscriptions/service.ts`, `reports/service.ts`, `reports/routes.ts`, `referrals/service.ts` — y 60 de test).

## Decisions Made

### 1. Los dos hallazgos bloqueantes se corrigieron con Rule 3, no se documentaron y punto

Ambos son "deuda con dueño" ya escrita explícitamente por un plan par de esta misma fase (173-14, 173-05). La tentación fácil era declararlos "fuera de alcance, dueño fase 174/173-30" y dejar Task 1/2 con un puñado de rojos permanentes. Se descartó esa salida por dos motivos: (a) el criterio de aceptación del plan exige código 0 con la sonda encendida — un rojo documentado sigue siendo un rojo; (b) la severidad real (bloquea la MAYORÍA de los flujos de suscripción, no un caso de borde) hace que dejarlo para 174 signifique que el switch de 173-30 deja el sistema inoperable el día que se active de verdad. La cirugía fue mínima en ambos casos: mismo archivo que el plan dueño ya había tocado, cero archivos ajenos nuevos, cero cambio de comportamiento fuera del guard de tenancy.

### 2. `isNotNull` vs threading completo — el criterio fue el número de call sites

En `subscriptions/service.ts` se usó el guard `isNotNull` (no threading real) porque el único llamador sin ctx (`autoExpireSubscriptions`) es compartido por métodos con ~8 call sites en módulos ajenos (D-02 los reserva a la 174). En `reports/service.ts` se usó threading COMPLETO de `ctx` real porque cada uno de los 5 métodos tiene un único call site, verificado con grep antes de tocar la firma — ahí sí correspondía la migración completa, no un parche.

### 3. Reproducir un 500 sin sentinel visible

Los 500 de `reports/*.test.ts` no mostraban `TenantSentinelError` en el log de vitest porque `handleServiceError` lo aplana a un mensaje genérico y `NODE_ENV=test` silencia el logger de Fastify. Se armó un script standalone (`buildApp()` + `app.inject()`, `NODE_ENV=development` para mantener el sentinel en modo throw pero con logger activo) para ver la causa real. Sin ese paso, el diagnóstico habría sido a ciegas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `subscriptions/service.ts`: `recomputeUserStatus`/`activateScheduledSub` bloqueaban cualquier lectura de suscripción**

- **Found during:** Task 1, primera corrida en caliente (127 rojos de 605).
- **Issue:** deuda documentada por la 173-14 (`ctx: TenantContext | null`, camino `autoExpireSubscriptions` sin ctx) — con `users` strict, throw en cualquier `GET`/renovación/cancelación.
- **Fix:** guard `isNotNull(schema.users.tenantId)` en las 4 queries del camino `ctx === null` (2 en `recomputeUserStatus`, 2 en `activateScheduledSub`), mismo patrón que 173-08. Guarda ADO-07 intacta (sigue condicionada a `ctx` real).
- **Files modified:** `src/modules/subscriptions/service.ts`.
- **Verificación:** 605/605 tests, `tsc --noEmit` limpio, `typecheck:tests` sin regresión.
- **Committed in:** `cd3174f3`.

**2. [Rule 3 - Blocking] `reports/service.ts`: 4 métodos + 2 no nombrados bloqueaban 4 endpoints de reportes**

- **Found during:** Task 2, primera corrida en caliente (50 rojos de 255, todos "500 sin sentinel visible").
- **Issue:** deuda documentada por la 173-05 (`getExpiredMembers`, `getTrialSessionsReport`, `loadRosterAttribution`) más 2 métodos con el mismo patrón sin nombrar (`getExpiringMemberships`, `getInactiveMembers`) — ninguno filtraba `users`/`subscriptions` por gimnasio.
- **Fix:** threading completo de `ctx: TenantContext` en los 5 métodos + 2 wrappers de export, con `assertTenant` en los 7 call sites de `reports/routes.ts`.
- **Files modified:** `src/modules/reports/service.ts`, `src/modules/reports/routes.ts`.
- **Verificación:** 255/255 tests, `tsc --noEmit` limpio.
- **Committed in:** `5a2958ef`.

**3. [Rule 1 - Bug] `referrals/service.ts::getAbTestResults`: exención tenant-safe invisible para el sentinel**

- **Found during:** Task 2, misma corrida en caliente.
- **Issue:** exención de la 173-08 escrita solo como comentario TS — no llega al SQL de runtime.
- **Fix:** tag repetido embebido en un fragmento `sql\`` del `where`.
- **Files modified:** `src/modules/referrals/service.ts`.
- **Committed in:** `5a2958ef`.

**4. [Rule 1 - Bug] `summary-by-kind.test.ts` sin importar `and` tras el batch fix**

- **Found during:** Task 1, segunda corrida (auto-detectado, `ReferenceError: and is not defined`).
- **Issue:** un fix en batch (python) agregó `and(tenantWhere(...), ...)` a 13 archivos de `test/finance/` pero uno de ellos no tenía `and` importado.
- **Fix:** import agregado.
- **Files modified:** `test/finance/summary-by-kind.test.ts`.
- **Committed in:** `cd3174f3`.

---

**Total deviations:** 4 (2 Rule 3 blocking de producción + 2 Rule 1 bugs). Ninguna es scope creep: las 2 de Rule 3 son correcciones acotadas a archivos YA tocados por sus planes dueños, sin ensanchar D-02 a módulos nuevos; las 2 de Rule 1 son bugs directos del propio trabajo del plan.
**Impact on plan:** sin los 2 fixes de Rule 3, Task 1 y Task 2 no podían dar código 0 — no eran deuda aplazable, eran blockers reales del criterio de aceptación.

## Issues Encountered

Ninguno más allá de lo documentado en Deviations. La corrida de regresión conjunta (10 carpetas, 1130 tests, ~15 min) confirmó que ningún fix de producción rompió el trabajo de 173-22.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- La sonda de `members` sigue completamente utilizable para 173-24/25: 860 tests adicionales (subscriptions, finance, reports, coach, programs, referrals) sobreviven al throw, sumados a los 246 de la 173-22.
- `deferred-items.md` actualizado con los 2 hallazgos críticos, ambos CERRADOS con commit y verificación, y con nota explícita para 173-30 sobre el colateral positivo en la allowlist de `reports/service.ts`.
- El baseline de `typecheck:tests` se mantiene en 175 — no se movió en este plan.
- `tenant-lint-allowlist.json` intacto (este plan no tocó ninguna entrada — la cuenta sigue para 173-30). El colateral de `reports/service.ts` (4-6 métodos migrados) puede permitir que 173-30 borre esa entrada, pero no se verificó con `pnpm lint:tenant` porque tocar la allowlist es explícitamente su dueño.
- Ningún archivo de producción quedó con deuda NUEVA: los 3 archivos tocados (`subscriptions/service.ts`, `reports/service.ts`+`routes.ts`, `referrals/service.ts`) solo cerraron deuda YA documentada por planes anteriores, con la misma o mejor cobertura de tenancy que antes.

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_

## Self-Check: PASSED

- `el-templo-api/src/modules/subscriptions/service.ts` — FOUND, commit `cd3174f3`
- `el-templo-api/src/modules/reports/service.ts` y `reports/routes.ts` — FOUND, commit `5a2958ef`
- `el-templo-api/src/modules/referrals/service.ts` — FOUND, commit `5a2958ef`
- Los 30 archivos de test de Task 1 y los 13 de Task 2 — FOUND (`git show --stat` de cada commit)
- Commits `cd3174f3`, `5a2958ef` en `feat/173-adopcion-members` — FOUND (`git log --oneline`)
- `git status --porcelain el-templo-api/src/db/tenant-tables.ts` vacío tras cada corrida con sonda — VERIFICADO
- `pnpm exec vitest run --no-file-parallelism test/subscriptions test/finance test/subscriptions-conversion-hook.test.ts test/notification-plan-renewal.test.ts` — 605/605 VERIFICADO
- `pnpm exec vitest run --no-file-parallelism test/reports test/coach test/programs test/referrals` — 255/255 VERIFICADO
- `pnpm exec vitest run --no-file-parallelism test/members test/users test/auth test/shared test/subscriptions test/finance test/reports test/coach test/programs test/referrals` (regresión 173-22+173-23) — 1130/1130 VERIFICADO
- `pnpm run typecheck:tests`: 175/175 baseline, 0 nuevos — VERIFICADO
- `pnpm exec tsc -p tsconfig.json --noEmit` — limpio, VERIFICADO
- `.planning/phases/173-.../deferred-items.md` actualizado con los 2 hallazgos críticos cerrados — FOUND
