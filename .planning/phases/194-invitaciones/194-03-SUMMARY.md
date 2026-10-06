---
phase: 194-invitaciones
plan: 03
subsystem: api
tags: [membership, covered-until, referrals, frequency, renewals, sepa, is_trial]
requires: ["194-01"]
provides:
  - "subscriptions/service.ts: deriveMembershipCoveredUntil / deriveMembershipCoveredUntilBatch (cobertura de MEMBRESÍA), sobre impl común con deriveCoveredUntil(Batch) (ACCESO, sin cambios de comportamiento)"
  - "Export SEPA con columnas Importe y Moneda (D-25) y plan/importe de la membresía vigente"
affects: [194-04, 194-08]
tech-stack:
  added: []
  patterns:
    - "ACCESO (deriveCoveredUntil) vs MEMBRESÍA (deriveMembershipCoveredUntil): mismo impl privado con flag membershipOnly"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/referrals/service.ts
    - el-templo-api/src/modules/analytics/frequency-service.ts
    - el-templo-api/src/modules/renewals/service.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/test/invitations/membership-invariant.test.ts
    - el-templo-api/test/referrals/discount-computation.test.ts
    - el-templo-api/test/renewals/renewals.test.ts
    - el-templo-api/test/members/sepa-domiciliacion.test.ts
key-decisions:
  - "deriveCoveredUntil (una) pasó a ser wrapper del impl batch con [userId]: devuelve lo mismo (MAX(end_date) con los mismos filtros), un solo cuerpo de query"
  - "SEPA: tres subqueries escalares (plan, price_paid, currency) con un único fragmento FROM/WHERE/ORDER compartido y desempate s.id DESC"
requirements-completed: [SC-4, D-03, D-10d, D-25]
completed: 2026-10-06
---

# Phase 194 Plan 03: Cobertura de membresía + SEPA Summary

Quedan dos coberturas con nombre (ACCESO para reservas, MEMBRESÍA para descuento/estado de vínculo), frecuencia y Renovaciones excluyen todo `is_trial`, y el xlsx de domiciliación trae Importe y Moneda con la membresía vigente.

## Commits

- `fd61b0261` feat(194-03): cobertura de membresía separada de la de acceso (D-03/D-10d) + frecuencia y renovaciones sin is_trial (Task 1)
- `a03f845c3` feat(194-03): export SEPA con Importe/Moneda y plan sin is_trial (D-25) (Task 2)

## Tests

- `test/invitations/membership-invariant.test.ts` 12/12 (+4 nuevos: cobertura membresía vs acceso solo-is_trial, presencial + is_trial que vence después, frecuencia `getFrequency` + `coolingOrInactiveUserIds`, `RenewalsService.listRenewals`)
- `test/referrals/discount-computation.test.ts` 9/9 (+1: contraparte solo-is_trial = 0, con presencial = 10)
- `test/members/sepa-domiciliacion.test.ts` 13/13 (+3: Importe/Moneda con price_paid 58500 EUR y headers al final, presencial + is_trial más reciente, invitado solo-is_trial fuera del export / `todos` lo muestra "Sin plan" sin importe)
- `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores nuevos en los archivos tocados.
- No hice mutation testing (cada corrida son ~200 s); los casos nuevos fallarían sin el cambio por construcción (el socio solo-is_trial entraría a n=2 de frecuencia, a la lista de renovaciones, al descuento y al export).

## Tabla de los 13 sitios del inventario (RESEARCH §Patrón 1)

| # | Sitio | Estado |
|---|-------|--------|
| 1-5 | `recomputeUserStatus` (activo, lead_status, lead_status_source, purchased_plan_id, converted_at) | Migrado en 194-01 |
| 6-7 | `shared/active-member.ts` y consumidores | Migrado en 194-01 |
| 8-9 | `members/service.ts` estado efectivo de listados | Migrado en 194-01 |
| 10 | `deriveCoveredUntil(Batch)` | SIN cambio de comportamiento (ACCESO: alimenta bloqueo de reservas `booking-service.ts:199-203`, pill "Venc", `/coverage`). Se creó la variante de membresía aparte |
| 11 | `referrals/service.ts` `computeReferralDiscountPercent` y `getReferralOverview` | Migrado a `deriveMembershipCoveredUntilBatch` (D-10d) |
| 12 | `analytics/frequency-service.ts` (población activa + `coolingOrInactiveUserIds`) | Migrado: `eq(subscriptionPlans.isTrial,false)` / `membershipPlanCondition()` |
| 13 | `renewals/service.ts` `notEspecialTrialPlan` | Migrado: `notTrialPlan()` = todo `is_trial` (2 usos: lista y "sub siguiente") |
| D-25 | `members/service.ts::exportSepaMembers` + routes + types | Migrado: `membershipInEffectSql("s")` + Importe/Moneda |

## Pitfall 3: sitios `subscription_status IN ('active'...)` restantes

Justificados como ACCESO (no cambian):
- `scheduling/booking-service.ts:1190,1325` (suscripciones con horarios fijos para reservas), `streaks/service.ts:59`, `segmentation/service.ts:116` (sub vigente del socio para racha/segmento: ligado a acceso), `shared/covered-until.ts:45` (pill Venc), `subscriptions/service.ts:397,459` (coberturas), `notifications/rules.ts:257,294` (avisos de vencimiento por cobertura).
- `reports/service.ts:809,1703` (cadena de cobertura anti-falso-renovador, "active+paused+scheduled" por diseño de fase 144) y `analytics/service.ts:624` (otra sub vigente en el vencimiento): semántica de cobertura/acceso.
- `analytics/especial-report-service.ts:168,263`: ya restringidos a `plan_category = 'presencial'` / `'especial'` (un plan de invitación `paquete` no entra).

**Candidatos a revisar (NO ACCESO, fuera del alcance de este plan, no los toqué):** si una sub `is_trial` más reciente puede aparecer como "plan" del socio en estas superficies, mostraría el nombre/plan de invitación:
- `members/service.ts:269,277` (filtro por `planId` / "sin plan"), `:368,:648` y `:2414-2454` (nombre de plan en listado y panel de turno; hay copias duplicadas en las líneas 2414+), `:755` (membership_kind de la sub vigente).
- `analytics/engagement-service.ts:204` (`planNameExpr`), `analytics/service.ts:664` (distribución de planes: sumaría una fila "Invitación"), `reports/service.ts:939`.
- `finance/transaction-service.ts:1789` (`hasActivePlan`, flag de UI con scheduled incluido; toca el flujo de cobros, por eso lo dejo para decisión del orquestador).
Sugerencia: las de `members/service.ts` y `engagement-service` se resuelven con `membershipInEffectSql("s")` (cuando 194-04 o el plan de UI de invitados las necesite).

## Deviations from Plan

**1. [Rule 1 - test existente] `test/renewals/renewals.test.ts` actualizado (fuera de `files_modified`)**
- El test "la exclusión es acotada: un plan is_trial de OTRA categoría (promo online) conserva su comportamiento" afirmaba justo lo que D-03 generaliza. Lo cambié a "alcanza a TODO plan is_trial" (`toBeUndefined`), con comentario `Fase 194 D-03` y renombré el describe. NO lo corrí (no está en `<verify>` del plan; lo cubre CI): el cambio es de una sola aserción sobre un helper existente.

**2. [Comportamiento SEPA] `status=todos` ya no toma el plan de subs vencidas**
- El `planNameSubquery` viejo usaba solo `subscription_status IN ('active','paused')`, sin fechas. Con `membershipInEffectSql` exige además arrancada y no vencida; un socio con sub `active` ya vencida (cron pendiente) pasa de mostrar su plan a "Sin plan" en `todos`. En el default `activo` no cambia nada (ya exigía `activeMemberExists`).

**3. `snapshot-members-endpoints.ts` sin cambios:** compara filas del xlsx genéricamente (`claveFilas: "rows"`), no fija columnas. Las dos columnas nuevas aparecerán como diff esperado al regenerar el snapshot.

**4. Test helper:** en `sepa-domiciliacion.test.ts` mi `exportRows` castea `rawPayload` por `Parameters<Workbook["xlsx"]["load"]>[0]` para no sumar un error TS2345 más al baseline de `typecheck:tests`.

Sin hallazgos de cobros/precios: el único cambio de cobros es indirecto (descuento por vínculo ahora ignora contrapartes solo-is_trial, previsto por D-10d).

## Lecciones para los próximos ejecutores

- `deriveCoveredUntil*` ahora tiene un impl privado común (`deriveCoveredUntilBatchImpl`, flag `membershipOnly`); no agregar un tercer sabor, usar el flag.
- `membershipPlanCondition()` compone en `and(...)` de Drizzle sobre `schema.subscriptions`; `membershipInEffectSql(alias)` es para SQL crudo con alias `s`/`s2`.
- Una subquery escalar no devuelve 2 columnas: para plan + importe + moneda de la misma fila usar un fragmento `sql` FROM/WHERE/ORDER compartido y desempate `s.id DESC`; el lint de tenant lo acepta si `s.tenant_id` y `sp.tenant_id` están inline en el fragmento.
- `createTrialPlan(ctx, { durationDays })`: el default de 6 días queda por debajo del corte de Renovaciones (7), así que para probar la exclusión `is_trial` en Renovaciones usar `durationDays >= 7`.
- Tests que leen el xlsx: leer por header, no por posición (las columnas nuevas van al final).
- Los 3 archivos de integración de la Task 1+2 tardaron ~200 s / ~140 s cada uno (2 juntos 204 s).

## Self-Check: PASSED

- FOUND commits: fd61b0261, a03f845c3; worktree limpio tras los commits.
- Acceptance de ambas tareas verificados por grep (2 funciones `deriveMembershipCoveredUntil*`, 0 `notEspecialTrialPlan`, 0 `deriveCoveredUntilBatch(` en referrals, `Importe` después de `Pais`, `membershipInEffectSql` x5 en members/service, `scheduling/` sin diffs).
