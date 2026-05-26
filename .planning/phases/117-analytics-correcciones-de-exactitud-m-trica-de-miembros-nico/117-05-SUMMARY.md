---
phase: 117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico
plan: 05
subsystem: analytics
tags:
  [
    analytics,
    renewals,
    attention-list,
    financial-transactions,
    segmentation,
    scope,
    pii,
    tdd,
  ]
requires:
  - "analytics/scope.ts::applyScope (Plan 01)"
  - "shared/active-member.ts::activeMemberExists (Plan 01)"
  - "segmentation/types.ts::MemberSegment (reuse, no redefine)"
  - "member_profiles.segment (segmentation module)"
  - "financial_transactions (kind/direction/voided_at — flag yaPago)"
provides:
  - "analytics/service.ts::getAttentionList extendido (expiring + overdue buckets, daysOverdue real, yaPago, segment)"
  - "analytics/service.ts::getRenewalRate (7/14/30)"
  - "types AttentionMember.type 'expiring'|'overdue' + yaPago + segment; RenewalRate; MemberAnalytics.renewalRate"
  - "GET /api/admin/analytics/members extiende el contrato sin romper daysUntilExpiry"
affects:
  - el-templo-admin (MiembrosTab — frontend ya renderiza type 'overdue' con daysOverdue; ahora el backend lo alimenta)
tech-stack:
  added: []
  patterns:
    - "Reutiliza applyScope sobre subscriptions.branchId en ambos bloques (expiring/overdue) — corte de PII por sede (T-117-01)"
    - "'vencido sin renovar' = NOT activeMemberExists(user) sobre subs con end_date 1..30d pasada"
    - "yaPago derivado vía EXISTS de financial_transactions (plan_charge inflow no anulada, ventana 30d) — sin schema nuevo"
    - "segment vía LEFT JOIN member_profiles; priorización ghost/en_riesgo primero, luego urgencia"
    - "Schema Fastify declara todos los campos nuevos (fast-json-stringify strips undeclared — lección 106-04/109-02)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/src/modules/analytics/types.ts
    - el-templo-api/src/modules/analytics/schemas.ts
    - el-templo-api/test/analytics/analytics.test.ts
decisions: [D-14, D-15, D-16, D-17, D-18]
metrics:
  duration: ~25min
  completed: 2026-05-26
---

# Phase 117 Plan 05: Panel de Vencimientos y Renovaciones (attentionList completo + renewalRate) Summary

Completé el panel de Vencimientos/Renovaciones extendiendo `getAttentionList`
in-place (sin tocar el monolito) y agregando `getRenewalRate`. Los vencidos sin
renovar ahora aparecen con `daysOverdue` REAL (ya no siempre `null`), cada miembro
trae el flag `yaPago` derivado de `financial_transactions` recientes y su
`segment` de engagement para priorizar, y el backend expone la tasa de renovación
7/14/30. "Habló con coach" queda DIFERIDO (D-16) con comentario explícito.

## What Was Built

- **`getAttentionList` extendido** (`service.ts`):
  - Bloque **expiring** existente (subs activas que vencen en ≤7d) ahora trae
    `yaPago` + `segment` (LEFT JOIN `member_profiles`), `daysOverdue` sigue null.
  - Bloque **overdue** NUEVO: subs con `end_date` entre 1 y 30 días en el pasado
    Y el usuario **NO activo** (`NOT activeMemberExists(userId)` = "vencido sin
    renovar"). `daysOverdue = DATEDIFF(CURDATE(), end_date)` real; `daysUntilExpiry`
    null. Vencidos >30 días se excluyen (fuera de los buckets 1-7/8-14/15-30, que
    son clasificación de frontend). Dedup por usuario quedándose con la mora menor.
  - **`yaPago`** vía `EXISTS` de `financial_transactions` (`kind='plan_charge'`,
    `direction='inflow'`, `voided_at IS NULL`, `transaction_date` en los últimos
    30 días — constante documentada `YA_PAGO_WINDOW_DAYS`). Sin schema nuevo (D-16).
  - **Priorización**: `ghost` → `en_riesgo` → resto; dentro de cada grupo, mayor
    mora (overdue) o vencimiento más próximo (expiring) primero. `slice(0,20)`.
  - **"habló con coach" DIFERIDO** (D-16): comentario explícito de que no se
    implementa por requerir schema/UI nuevos.
  - `applyScope` sobre `subscriptions.branchId` en ambos bloques (T-117-01).
- **`getRenewalRate(branchId, country)`** (D-15): para ventanas 7/14/30, de los
  miembros cuya sub venció en los últimos N días, % (0..100) que renovó
  (`activeMemberExists` ahora true). `COUNT(DISTINCT ...)` con un `CASE` para los
  renovados en una sola query por ventana; 0 si no hubo vencimientos. `applyScope`.
- **Tipos** (`types.ts`): `AttentionMember.type` pasa a `'expiring' | 'overdue'`,
  - `yaPago: boolean` + `segment: MemberSegment | null` (import del módulo
    segmentation, NO redefine). Nuevo `RenewalRate { last7, last14, last30 }` y
    `MemberAnalytics.renewalRate`.
- **Schema Fastify** (`schemas.ts`): `memberAnalyticsSchema` declara `yaPago`,
  `segment` (enum + null), `type` con `'overdue'`, y el objeto `renewalRate` —
  fast-json-stringify strippea campos no declarados. `daysUntilExpiry` intacto.
- **Tests** (`analytics.test.ts`, MySQL real, reloj real): overdue buckets
  3/10/20 con daysOverdue real + 40d excluido; yaPago true/false; cruce segment;
  renewalRate last7/14/30 (50% con 1 de 2 renovados); contrato (campos nuevos no
  stripeados, type='overdue', daysUntilExpiry presente); scope (admin AR → 403 en
  sede ES, 200 en AR). Suite analytics 31/31 verde; engagement 11/11 sin regresión.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug en el plan de test de scope] El test de scope usa admin cross-country, no coach**

- **Found during:** Task 2
- **Issue:** El plan sugería "coach de sede X no ve attentionList de sede Y". El
  módulo analytics está gateado a `ADMIN_ROLES = [admin, owner]` — un coach recibe
  403 en el `onRequest` hook ANTES de llegar al scope de sede (mismo hallazgo que
  117-03/117-04).
- **Fix:** El test de no-fuga de PII usa un admin AR denegado (403) al consultar
  una sede ES y permitido (200) en su país — el mecanismo real de scope para los
  roles que sí acceden a analytics.
- **Files modified:** test/analytics/analytics.test.ts
- **Commit:** a60bd3ca

### Decisión de diseño (documentada)

- **Ventana `yaPago` = 30 días** (D-16, "definir ventana"): coincide con el ciclo
  de plan más corto, así un pago reciente cuya sub aún no fue renovada se reconoce.
  Constante `AnalyticsService.YA_PAGO_WINDOW_DAYS` documentada en el JSDoc.
- **Buckets 1-7/8-14/15-30 son clasificación de frontend**: el backend entrega
  `daysOverdue` real y limita el rango a 1..30; el agrupamiento en buckets lo hace
  el front (MiembrosTab ya renderiza `${daysOverdue} dias de mora`).

## Known Stubs

Ninguno. "Habló con coach" es un DIFERIMIENTO explícito (D-16), no un stub: no se
expone ningún campo placeholder en el contrato.

## Threat Flags

Ninguno nuevo. El endpoint hereda el guard (ADMIN_ROLES + attachCountryScope +
requireBranchAccess) y `applyScope` se aplica en ambos bloques de getAttentionList
y en getRenewalRate. T-117-01 mitigado y verificado por test de scope cross-country
(admin AR → 403 en sede ES). T-117-07 (flag yaPago) es `accept` por diseño — solo
expone un booleano derivado, sin montos, dentro del scope ya autorizado.

## Self-Check: PASSED

- Archivos modificados: service.ts, types.ts, schemas.ts, analytics.test.ts (FOUND).
- Commits: 04838068 (RED test), 31749021 (Task 1 feat service), a60bd3ca (Task 2
  schema + contract/scope tests) — verificados en git log.
- `pnpm tsc --noEmit` limpio.
- `pnpm vitest run test/analytics/analytics.test.ts` 31/31 verde; engagement 11/11.
- Grep gates: `overdue` en types=3 (>=1), `DATEDIFF` (daysOverdue real) en
  service=1, `financial_transactions` en service=2 (flag yaPago), comentario
  "habló con coach" diferido=1.
