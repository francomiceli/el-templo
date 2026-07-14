---
phase: 158-visibilidad-y-comunicaci-n
plan: 01
subsystem: referrals
tags: [referrals, api, read-layer, idor, rbac]
requires:
  - ReferralService (fase 157): generateReferralCode, getReferralConfig, computeReferralDiscountPercent
  - deriveCoveredUntil (subscriptions/service, fase 144/157)
provides:
  - getReferralOverview(userId) — composición pura del overview de referidos
  - GET /api/members/referrals — member self-scoped (VIS-01 backend)
  - GET /api/admin/members/:userId/referrals — ficha admin, guard ADMIN_ROLES (VIS-03 backend)
  - ReferralOverview / ReferralLinkView / ReferralDiscountView (contrato de respuesta)
affects:
  - 158-03 (app "Mis referidos") y 158-04 (admin ficha) espejan este contrato
tech-stack:
  added: []
  patterns:
    - member-facing route self-scoped (id server-derived, IDOR)
    - per-route ADMIN_ROLES guard sobre el plugin MEMBER_ROLES de members
    - reuso de la mecánica de 157 sin reimplementar (D-30)
key-files:
  created:
    - el-templo-api/src/modules/referrals/routes.ts
    - el-templo-api/test/referrals/member-endpoint.test.ts
    - el-templo-api/test/referrals/admin-referrals-endpoint.test.ts
  modified:
    - el-templo-api/src/modules/referrals/types.ts
    - el-templo-api/src/modules/referrals/service.ts
    - el-templo-api/src/app.ts
    - el-templo-api/src/modules/members/routes.ts
decisions:
  - "discount.percent se obtiene LLAMANDO a computeReferralDiscountPercent (D-30), no se reimplementa la fórmula"
  - "estado por vínculo derivado con deriveCoveredUntil de la contraparte (D-28), nunca users.status"
  - "guard admin = ADMIN_ROLES (admin/owner) por el plan; el socio no-admin ni llega (plugin MEMBER_ROLES) — doble barrera"
  - "VIS-01/VIS-03 NO se marcan completos: son requirements de UI que cierran los planes 03/04; este plan es solo el backend de datos"
metrics:
  duration: ~20min
  completed: 2026-07-11
---

# Phase 158 Plan 01: Backend de lectura de referidos Summary

`getReferralOverview` compone en un shape único el código lazy, el descuento vigente con desglose (reusando `computeReferralDiscountPercent`, cero drift con el cobro) y ambos lados del vínculo con estado derivado por `deriveCoveredUntil`; se sirve por una ruta member self-scoped y una ruta admin de la ficha guardada por `ADMIN_ROLES`.

## What Was Built

- **`ReferralOverview` + `ReferralLinkView` + `ReferralDiscountView`** (`referrals/types.ts`): el contrato de respuesta que los planes 03 (app) y 04 (admin) van a espejar.
- **`ReferralService.getReferralOverview(userId)`**: composición pura sobre las piezas de la fase 157. Selecciona los vínculos no-`revoked` en ambas direcciones, deriva el `state` por vínculo con el MISMO criterio del cómputo del descuento (`deriveCoveredUntil` de la contraparte vs today), separa `referred[]` (soy referidor) de `referredBy` (me trajo, único por el UNIQUE de `referredId`), y obtiene `discount.percent` LLAMANDO a `computeReferralDiscountPercent` (D-30 — no reimplementa `Math.min`). El desglose (`perLinkPercent`/`capPercent`) sale de `getReferralConfig` (fallback 10/40), nunca hardcodeado.
- **`GET /api/members/referrals`** (`referrals/routes.ts` NEW, registrada en `app.ts`): overview del socio autenticado, `userId` server-derived del token (IDOR, T-158-01).
- **`GET /api/admin/members/:userId/referrals`** (`members/routes.ts`): datos de la sección "Referidos" de la ficha (D-34), con guard `ADMIN_ROLES` → `403` para no-admin (T-158-02).
- **Tests de integración** (9 casos, todos verdes): código lazy, estados pending/active/suspended, exclusión de revoked, lado `referredBy`, desglose desde config, paridad `discount.percent === computeReferralDiscountPercent` (red de seguridad D-30), IDOR, guard admin 403 y 401 sin token.

## Task Commits

| Task | Name                        | Commit     | Files                                                                                               |
| ---- | --------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| 1    | getReferralOverview + tipos | `1e281778` | referrals/types.ts, referrals/service.ts                                                            |
| 2    | rutas member + ficha admin  | `2b52fac7` | referrals/routes.ts (new), app.ts, members/routes.ts                                                |
| 3    | tests de integración        | `98e97c88` | test/referrals/member-endpoint.test.ts (new), test/referrals/admin-referrals-endpoint.test.ts (new) |

## Verification

- `npx tsc --noEmit` limpio en `el-templo-api` tras cada tarea.
- `pnpm test test/referrals/member-endpoint.test.ts test/referrals/admin-referrals-endpoint.test.ts` → **9/9 verdes** (2 archivos).
- `discount.percent` proviene de `computeReferralDiscountPercent` (grep confirma la llamada; sin `Math.min` propio) — paridad testeada.
- Estado por vínculo derivado con `deriveCoveredUntil`; sin uso de `users.status` en `getReferralOverview` (la única aparición es una línea de docstring que refuerza la regla).

## Deviations from Plan

**1. [Rule 2 - Validación] Guard de `:userId` inválido en la ruta admin**

- **Encontrado durante:** Task 2.
- **Motivo:** la ruta admin no usa un `schema` de coerción (a diferencia del molde `notes` que sí lo tiene), así que `request.params.userId` llega como string. Se agregó `Number(...)` + `Number.isInteger` → `400 id inválido` antes de pegarle a la DB.
- **Archivos:** `el-templo-api/src/modules/members/routes.ts`.
- **Commit:** `2b52fac7`.

Fuera de eso, el plan se ejecutó tal cual.

## Notes for Downstream Plans

- **VIS-01 / VIS-03 NO marcados completos:** son requirements de UI. Este plan entrega solo el backend de datos; los cierran 158-03 (pantalla app) y 158-04 (ficha admin), que consumen el contrato `ReferralOverview`.
- **Guard admin = `ADMIN_ROLES` (admin/owner)** por decisión del plan/threat-model, más estricto que el `MEMBER_ROLES` del plugin. Si gestión (`gestion`) debiera ver la ficha de referidos, revisar en 158-04 (hoy quedaría fuera del guard per-route, aunque pasa el plugin). No es un bug — es lo que pidió el plan (T-158-02).

## Self-Check: PASSED

- Archivos creados verificados en disco: `referrals/routes.ts`, `test/referrals/member-endpoint.test.ts`, `test/referrals/admin-referrals-endpoint.test.ts` — FOUND.
- Archivos modificados presentes: `types.ts`, `service.ts`, `app.ts`, `members/routes.ts` — FOUND.
- Commits verificados en git log: `1e281778`, `2b52fac7`, `98e97c88` — FOUND.
