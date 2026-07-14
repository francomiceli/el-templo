---
phase: 161
slug: n-cleo-actividades-gateadas-pase-mensual-y-enforcement
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-14
---

# Phase 161 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Framework**          | vitest (integration tests contra MySQL real `eltemplo_test`)                                                     |
| **Config file**        | `el-templo-api/vitest.config.ts`                                                                                 |
| **Quick run command**  | `cd el-templo-api && npx tsc --noEmit` (typecheck local; regla del repo: la suite corre en CI)                   |
| **Full suite command** | CI (`pnpm test` en pipeline — NO correr la suite completa local, regla del repo)                                 |
| **Estimated runtime**  | typecheck ~20s; tests puntuales del archivo nuevo ~30s c/u                                                       |
| **Targeted test run**  | `cd el-templo-api && npx vitest run test/<archivo-nuevo>.test.ts` (solo archivos nuevos de esta fase, permitido) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` (el-templo-api) / `npx vue-tsc --noEmit` (el-templo-admin — CI no typechequea frontends)
- **After every plan wave:** Run los tests nuevos de la fase en forma puntual (`npx vitest run test/<nuevos>.test.ts`)
- **Before `/gsd:verify-work`:** CI verde en la rama
- **Max feedback latency:** ~60s

---

## Per-Task Verification Map

| Task ID                                                                                  | Plan | Wave | Requirement        | Threat Ref                   | Secure Behavior                                                                                                    | Test Type           | Automated Command                                                                   | File Exists                                                                    | Status     |
| ---------------------------------------------------------------------------------------- | ---- | ---- | ------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- | ------- | --- | ----------------- | ---------- |
| 01-T1 Schema+migración 0179                                                              | 01   | 1    | PASE-01            | T-161-01                     | enum MODIFY byte-for-byte, sin `;` en comentarios, INSERT IGNORE idempotente                                       | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                              | 0179_especial_pass_core.sql                                                    | ⬜ pending |
| 01-T2 Aplicar migración [BLOCKING]                                                       | 01   | 1    | PASE-01            | T-161-02                     | migración aplicada+verificada local antes de merge                                                                 | migration run       | `cd el-templo-api && pnpm db:migrate`                                               | fila en `_migrations`                                                          | ⬜ pending |
| 01-T3 Contratos (categoryGroup/whitelists/PassRequiredError/pickSubscriptionForActivity) | 01   | 1    | PASE-01            | T-161-01                     | whitelists JSON-schema sincronizadas, error tipado, routing incluye `scheduled`                                    | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                              | types.ts / schemas.ts / errors.ts / service.ts                                 | ⬜ pending |
| 02-T1 assignPlan (conflicto grupo, budget, D-01, guard D-09 assign)                      | 02   | 2    | PASE-01/02/03      | T-161-03, T-161-05           | validación presencial server-side; guard referral en assign :1377                                                  | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                              | subscriptions/service.ts                                                       | ⬜ pending |
| 02-T2 renew+changePlan (subscriptionId, D-01 renew, guard D-09 x3)                       | 02   | 2    | PASE-04            | T-161-04, T-161-05           | `subscription.userId===userId`; guard referral en changePlanNow :3128 + changePlanAfterCurrent :3626 + renew :3966 | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                              | subscriptions/service.ts / schemas.ts / routes.ts                              | ⬜ pending |
| 02-T3 Tests especial-pass                                                                | 02   | 2    | PASE-02/03/04      | T-161-03, T-161-05           | cobertura D-01/D-09 (assign+renew) server-side                                                                     | integration         | `cd el-templo-api && npx vitest run test/subscriptions/especial-pass.test.ts`       | test/subscriptions/especial-pass.test.ts                                       | ⬜ pending |
| 03-T1 Routing decremento 4 pts attendance                                                | 03   | 2    | GATE-02            | T-161-06, T-161-07           | `is_special` server-side por scheduleId; decremento a la sub correcta                                              | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                              | attendance/service.ts                                                          | ⬜ pending |
| 03-T2 Routing no-shows job (analog auto-resume-pauses)                                   | 03   | 2    | GATE-02            | T-161-06, T-161-07           | `SubscriptionService` instanciado como el job analog; decremento por actividad                                     | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                              | jobs/mark-no-shows.ts                                                          | ⬜ pending |
| 03-T3 Tests especial-consumption                                                         | 03   | 2    | GATE-02            | T-161-06, T-161-07           | presencial NO baja al consumir especial                                                                            | integration         | `cd el-templo-api && npx vitest run test/attendance/especial-consumption.test.ts`   | test/attendance/especial-consumption.test.ts                                   | ⬜ pending |
| 04-T1 Excluir 'especial' en métricas de membresía                                        | 04   | 2    | PASE-04 (D-11)     | T-161-08, T-161-09           | filtro `ne(planCategory,'especial')` sólo en consumidores de membresía                                             | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                              | analytics/member-flows                                                         | churn      | renewal | ltv | ticket-service.ts | ⬜ pending |
| 04-T2 Tests exclusión de métricas                                                        | 04   | 2    | PASE-04            | T-161-08, T-161-09           | métricas excluyen especial; caja/cobros sí lo cuentan                                                              | integration         | `cd el-templo-api && npx vitest run test/analytics/especial-exclusion.test.ts`      | test/analytics/especial-exclusion.test.ts                                      | ⬜ pending |
| 05-T1 CRUD actividades persiste is_special                                               | 05   | 2    | ACT-01/02          | T-161-10                     | is_special editable sólo por staff (auth de rutas existente)                                                       | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                              | scheduling/activity-service.ts / routes.ts / schemas.ts                        | ⬜ pending |
| 05-T2 getScheduleSlotRaw trae isSpecial + tests CRUD flag                                | 05   | 2    | ACT-01/02          | T-161-11                     | isSpecial resuelto server-side por JOIN (contrato para Plan 06)                                                    | integration         | `cd el-templo-api && npx vitest run test/scheduling/schedule-activity-crud.test.ts` | test/scheduling/schedule-activity-crud.test.ts                                 | ⬜ pending |
| 06-T1 Gating reserve() (GATE-01/03/04, D-04, D-06)                                       | 06   | 3    | GATE-01/03/04      | T-161-12, T-161-13, T-161-14 | gating por scheduleId→activity y rol server-derived; conteo de reservas futuras                                    | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                              | scheduling/booking-service.ts                                                  | ⬜ pending |
| 06-T2 Bypass staff (D-07) + surface PASS_REQUIRED                                        | 06   | 3    | GATE-01 (D-07)     | T-161-15                     | bypass sólo si actorRole!=='member'; code en la ruta                                                               | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                              | scheduling/booking-service.ts / routes.ts                                      | ⬜ pending |
| 06-T3 Tests especial-gating                                                              | 06   | 3    | GATE-01/03/04      | T-161-12..15                 | gating duro server-side; regresión sub scheduled; D-05 mezclable                                                   | integration         | `cd el-templo-api && npx vitest run test/scheduling/especial-gating.test.ts`        | test/scheduling/especial-gating.test.ts                                        | ⬜ pending |
| 07-T1 Toggle 'especial' en ABM actividades                                               | 07   | 3    | ACT-01             | T-161-10                     | reglas server-side; UI sólo togglea el flag                                                                        | typecheck           | `cd el-templo-admin && npx vue-tsc --noEmit`                                        | admin ActivitiesDialog.vue / types/scheduling.ts                               | ⬜ pending |
| 07-T2 Venta/renovación pase + aviso D-07                                                 | 07   | 3    | PASE-02/03         | T-161-16, T-161-17           | reglas viven server-side (Plan 02); admin pasa categoría/subscriptionId                                            | typecheck           | `cd el-templo-admin && npx vue-tsc --noEmit`                                        | admin AssignPlanDialog.vue / MemberSubscriptionTab.vue / types/subscription.ts | ⬜ pending |
| 07-T3 Verificación humana (ABM + venta)                                                  | 07   | 3    | ACT-01, PASE-02/03 | T-161-16, T-161-17           | checkpoint human-verify (UI admin sin e2e)                                                                         | manual/human-verify | — (checkpoint, sin automated)                                                       | manual                                                                         | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- Infraestructura existente cubre la fase: `el-templo-api/test/helpers.ts` (auth/request), DB `eltemplo_test`, patrones en `dual-subscription.test.ts`, `class-tracking.test.ts` y tests de booking.

---

## Manual-Only Verifications

| Behavior                                                         | Requirement | Why Manual          | Test Instructions                                      |
| ---------------------------------------------------------------- | ----------- | ------------------- | ------------------------------------------------------ |
| Flag "especial" visible/editable en ABM de actividades del admin | ACT-01      | UI de admin sin e2e | Crear/editar actividad en Horarios y togglear el flag  |
| Venta del pase desde el admin (AssignPlanDialog)                 | PASE-02/03  | UI de admin sin e2e | Asignar pase Socio a socio activo y Externo a freemium |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (07-T3 es checkpoint human-verify — permitido)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (infra existente cubre la fase; sin MISSING)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
