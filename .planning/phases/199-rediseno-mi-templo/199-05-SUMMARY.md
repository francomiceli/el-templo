---
phase: 199-rediseno-mi-templo
plan: 05
subsystem: api-subscriptions
tags: [plan-status, tenancy, iso-03, manifest, d-05]
requires: [199-04]
provides:
  - GET /api/members/subscription/me/plan-status (nunca tuvo plan vs. tuvo y venció)
  - SubscriptionService.getMemberPlanStatus (lectura pura)
  - test de integración + caso ISO-03 + entrada de manifiesto (473)
affects: [199-06]
key-files:
  created:
    - el-templo-api/test/subscriptions/plan-status.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/test/tenancy/iso-03-subs-lecturas.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura-subs-sched.test.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "Lectura pura: getMemberPlanStatus NO llama a autoExpireSubscriptions; una active con endDate < hoy UTC se informa como expired"
  - "Ruta nueva y /me/subscription (204) intacto"
requirements-completed: [D-05]
completed: 2026-10-15
---

# Phase 199 Plan 05: GET /me/plan-status Summary

Ruta nueva `GET /api/members/subscription/me/plan-status` que devuelve `{ hasActivePlan, hasScheduledPlan, scheduledStartDate, hadPlan, lastPlan }` para que la app muestre "Arrancá tu plan" o "Renová tu plan", sin tocar el 204 de `/me/subscription`.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `f9319af8f` feat(199-05): GET /me/plan-status — distingue nunca tuvo plan de venció (D-05)
- Task 2: `1369d41c3` test(199-05): integración de /me/plan-status + caso ISO-03 (71 -> 72) + manifiesto (472 -> 473)

## Regla implementada

`getMemberPlanStatus(ctx, userId)`: una query de `subscriptions ⋈ subscription_plans` con `tenantWhere` en ambas tablas, filtrada por `userId` (siempre del token), ordenada `endDate DESC, id DESC`. Clasificación:

- `paused` -> plan activo (aunque su `endDate` sea pasado).
- `active` con `endDate` nulo o `>= hoy UTC` -> plan activo.
- `active` con `endDate < hoy UTC` (no barrida) -> cuenta como vencida: entra a `hadPlan`/`lastPlan` con `status: "expired"`.
- `scheduled` -> `hasScheduledPlan` y `scheduledStartDate` = la más próxima; no cuenta como plan ni como "tuvo".
- `expired|completed|cancelled|changed` -> `hadPlan`; `lastPlan` = la de `endDate` más reciente (los `null` al final).
- `membership_kind` staff/bonificada son filas normales: cuentan igual.

## Resultados de verificación

- `npx tsc --noEmit` (el-templo-api): 0 errores, tras cada task y al final.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0`.
- `grep -c '"/me/plan-status"' member-routes.ts` = 1; `getMemberPlanStatus` en service.ts presente; el `code(204)` de `/me/subscription` sin cambios (el diff solo agrega).
- `pnpm -s typecheck:tests`: 14 discrepancias de base (preexistentes, idénticas); 0 líneas que mencionen `plan-status`, `iso-03-subs-lecturas`, `iso-03-cobertura-subs-sched`, `tenant-manifest` ni `iso-01-manifiesto`. Confirmado también con `tsc -p tsconfig.test-check.json`.
- Greps Task 2: `CASOS_BASELINE = 72` = 1, `exactamente las 72 rutas` = 1, `ENTRADAS_BASELINE = 473` = 1, clave del manifiesto = 1, `toBe(204)` = 2 en plan-status.test.ts, `describe("estado de plan del socio — GET ...")` presente.
- No se corrió vitest (corre en CI). Worktree limpio.

## Casos de test

`plan-status.test.ts`: 19 `it` (24 efectivos con los `it.each`):

1. socio nuevo sin filas
2. expired -> nombre del plan y fecha de fin
3. active vigente (+ `/me/subscription` sigue 200 con la sub)
4. active vencida sin barrer -> `hasActivePlan false`, `hadPlan true`, status `expired`; la fila sigue `active` en la base (prueba de lectura pura)
5. borde: `endDate = hoy`
6. `endDate` nulo
7. `paused` con `endDate` pasado
8. dos vencidas -> `lastPlan` por `endDate`, cargada en orden inverso para que el orden por id falle
9. vigente + vencida anterior
10. scheduled
11. dos scheduled -> la más próxima
12. vencida + programada (hueco de renovación)
13. `it.each` cancelled / completed / changed
14. `it.each` membership_kind staff / bonificada
15. regresión: `/me/subscription` da 204 y plan-status no cambia tras el barrido que éste hace
16. nunca tuvo plan: 204 en `/me/subscription`, `hadPlan false`
17. aislamiento entre socios
18. `?userId=` en la query se ignora (responde por el token)
19. sin token -> 401

ISO-03 (`iso-03-subs-lecturas.test.ts`): 1 `describe` con la clave exacta y 2 `it`: aislamiento (socio nuevo creado en el gimnasio 2 vía `createTestMember({ tenantId: TENANT_DOS })`, sin filas, mientras existen subs activas en ambos gimnasios -> todo en false/null) y control positivo (`gym2.socios[0]` ve `hasActivePlan true`).

## Deviations from Plan

1. **[Pedido del orquestador, L10 sobre el plan] No se llama a `autoExpireSubscriptions` desde el GET.** El plan decía invocarlo primero; se reemplazó por la misma comparación de fecha sin escribir (`active` con `endDate < hoy UTC` = vencida). Es el criterio que `SponsorsService.hasActivePlan` (plan 02) ya documentaba como espejo de plan-status, así que canje y card no divergen. Consecuencia: el threat T-199-19 (tampering por autoExpire en lectura) deja de aplicar. Test explícito de que la fila no cambia, y de que el resultado es idéntico antes y después del barrido.
2. **[Menor] Sin `try/catch` + `handleServiceError`** en el handler: ese helper no existe en `member-routes.ts` y `/me/especial-pass` (el molde) tampoco lo usa; los errores los mapea el handler global.
3. **[Menor] Fechas del test con aritmética UTC propia (`utcOffset`)** en vez de `dateOffsetStr`: `dateOffsetStr` mezcla `setDate` local con `toISOString` (UTC) y podría correrse un día fuera de UTC. La intención del plan (UTC, no `todayInTz`) se mantiene; `-1` queda exactamente "ayer UTC".
4. **[Menor] ISO-03 aislamiento con socio nuevo del gimnasio 2** en lugar de uno ya sembrado: en la fixture ambos `gym2.socios` tienen suscripción (principal y pase especial), no existe uno "sin historial".
5. **[Menor] Casos extra** sobre lo pedido: borde `endDate = hoy`, `endDate` nulo, `paused`, dos scheduled, vencida + programada, cancelled/completed/changed, staff/bonificada, `?userId=`.

No se encontraron bugs reales en código previo.

## Dudas abiertas (no bloqueantes)

- La app deberá decidir qué hacer con `hasScheduledPlan` (plan 06+): un socio con plan vencido y uno programado quizás no deba ver "Renová tu plan".
- `lastPlan.status` es `string` en el schema de respuesta (como pedía el plan) aunque el tipo TS lo restringe a 4 valores.
- Primera corrida de los 24 casos + 2 ISO-03 en CI: si falla algo será por runtime (p. ej. `createTestMember` con `tenantId: TENANT_DOS` en el aislamiento ISO-03).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-18 mitigado (`userId` del token, `tenantWhere` en subscriptions y subscription_plans, caso ISO-03 con control positivo).

## Self-Check: PASSED

- `plan-status.test.ts` existe; commits `f9319af8f` y `1369d41c3` presentes en `git log`; `git status --porcelain` vacío en el worktree.
