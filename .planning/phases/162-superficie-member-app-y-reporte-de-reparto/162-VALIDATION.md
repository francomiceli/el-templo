---
phase: 162
slug: superficie-member-app-y-reporte-de-reparto
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-14
---

# Phase 162 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | vitest (integration tests contra MySQL real `eltemplo_test`) para API; vitest unit (mock Pinia+axios) para el store del app; sin e2e en frontends                          |
| **Config file**        | `el-templo-api/vitest.config.ts` (API); `el-templo-app/vitest.config.ts` (unit del store)                                                                                  |
| **Quick run command**  | `cd el-templo-api && npx tsc --noEmit`; frontends: `cd el-templo-app && npx vue-tsc --noEmit` / `cd el-templo-admin && npx vue-tsc --noEmit` (CI NO typechequea frontends) |
| **Full suite command** | CI (`pnpm test` en pipeline — NO correr la suite completa local, regla del repo)                                                                                           |
| **Estimated runtime**  | typecheck ~20-40s c/u; tests puntuales nuevos ~30s c/u                                                                                                                     |
| **Targeted test run**  | `cd el-templo-api && npx vitest run test/<archivo-nuevo>.test.ts`; `cd el-templo-app && npx vitest run test/user-store-especial-pass.test.ts`                              |

---

## Sampling Rate

- **After every task commit:** typecheck del paquete tocado (tsc para api, vue-tsc para app/admin)
- **After every plan wave:** tests nuevos de la fase en forma puntual
- **Before `/gsd:verify-work`:** CI verde en la rama
- **Max feedback latency:** ~60s

---

## Per-Task Verification Map

| Task ID   | Plan   | Wave | Requirement         | Threat Ref  | Secure Behavior                                              | Test Type           | Automated Command                                                                    | File Exists                                                               | Status     |
| --------- | ------ | ---- | ------------------- | ----------- | ------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------- |
| 162-01-T1 | 162-01 | 1    | APP-01              | T-162-01-01 | isSpecial solo display; gating server-side (161-06)          | typecheck (tdd)     | `cd el-templo-api && npx tsc --noEmit`                                               | `api/scheduling/{service,types,schemas}.ts`                               | ⬜ pending |
| 162-01-T2 | 162-01 | 1    | APP-01              | T-162-01-01 | grid asierta isSpecial server-side (no del request)          | integ (API)         | `cd el-templo-api && npx vitest run test/scheduling/especial-gating.test.ts`         | `api/test/scheduling/especial-gating.test.ts`                             | ⬜ pending |
| 162-02-T1 | 162-02 | 1    | APP-02              | T-162-02-01 | userId server-derived de request.user (IDOR)                 | typecheck (tdd)     | `cd el-templo-api && npx tsc --noEmit`                                               | `api/subscriptions/{member-routes,schemas}.ts`                            | ⬜ pending |
| 162-02-T2 | 162-02 | 1    | APP-02              | T-162-02-01 | cobertura socio/externo/sin-pase del propio member           | integ (API)         | `cd el-templo-api && npx vitest run test/subscriptions/especial-pass-member.test.ts` | `api/test/subscriptions/especial-pass-member.test.ts`                     | ⬜ pending |
| 162-03-T1 | 162-03 | 1    | REP-01              | T-162-03-02 | sin montos (D-04); no joinea transactions/caja               | typecheck (tdd)     | `cd el-templo-api && npx tsc --noEmit`                                               | `api/analytics/especial-report-service.ts`                                | ⬜ pending |
| 162-03-T2 | 162-03 | 1    | REP-01              | T-162-03-01 | requireAdminAnalytics + requireBranchAccess; month validado  | typecheck           | `cd el-templo-api && npx tsc --noEmit`                                               | `api/analytics/routes.ts`                                                 | ⬜ pending |
| 162-03-T3 | 162-03 | 1    | REP-01              | T-162-03-01 | clasificacion socio/externo + anti-fanout + export protegido | integ (API)         | `cd el-templo-api && npx vitest run test/analytics/especial-report.test.ts`          | `api/test/analytics/especial-report.test.ts`                              | ⬜ pending |
| 162-04-T1 | 162-04 | 2    | APP-01              | T-162-04-01 | mirror de type sin autoridad de acceso                       | typecheck (vue-tsc) | `cd el-templo-app && npx vue-tsc --noEmit`                                           | `app/src/types/scheduling.ts`                                             | ⬜ pending |
| 162-04-T2 | 162-04 | 2    | APP-02              | T-162-04-01 | capabilities son UX de pantalla, no autorizacion             | typecheck (vue-tsc) | `cd el-templo-app && npx vue-tsc --noEmit`                                           | `app/src/stores/useUserStore.ts`                                          | ⬜ pending |
| 162-04-T3 | 162-04 | 2    | APP-02              | T-162-04-01 | capabilities del pase independientes del singular            | unit (vitest)       | `cd el-templo-app && npx vitest run test/user-store-especial-pass.test.ts`           | `app/test/user-store-especial-pass.test.ts`                               | ⬜ pending |
| 162-05-T1 | 162-05 | 3    | APP-01/02/03        | T-162-05-01 | render/gate son UX; backend re-valida cada reserva           | typecheck (vue-tsc) | `cd el-templo-app && npx vue-tsc --noEmit`                                           | `app/src/pages/ReservasPage.vue`                                          | ⬜ pending |
| 162-05-T2 | 162-05 | 3    | APP-02              | T-162-05-01 | card solo display; sin PII nueva                             | typecheck (vue-tsc) | `cd el-templo-app && npx vue-tsc --noEmit`                                           | `app/src/modules/progression/pages/MiTemplo.vue`                          | ⬜ pending |
| 162-05-T3 | 162-05 | 3    | APP-01/02/03 REP-01 | T-162-05-01 | UAT visual member+admin; vue-tsc como precondicion           | human-verify        | manual (UAT — `vue-tsc --noEmit` app+admin como precondicion)                        | N/A (checkpoint)                                                          | ⬜ pending |
| 162-06-T1 | 162-06 | 2    | REP-01              | T-162-06-01 | tab gateado por rol; backend re-valida                       | typecheck (vue-tsc) | `cd el-templo-admin && npx vue-tsc --noEmit`                                         | `admin/types/analytics.ts + composables/useAnalyticsApi.ts`               | ⬜ pending |
| 162-06-T2 | 162-06 | 2    | REP-01              | T-162-06-01 | sin montos (D-04); naming lock D-01                          | typecheck (vue-tsc) | `cd el-templo-admin && npx vue-tsc --noEmit`                                         | `admin/components/analytics/EspecialesTab.vue + pages/AnaliticasPage.vue` | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- Infraestructura existente cubre la fase: `el-templo-api/test/helpers.ts`, DB `eltemplo_test`, tests de fase 161 (`especial-*.test.ts`) como fixtures/patrones; `el-templo-app/test/user-store-level-selection.test.ts` como patron del unit del store (mock Pinia+axios).
- Cero referencias MISSING: cada task auto tiene `<automated>` verify sobre infra ya presente (tsc/vue-tsc/vitest); el unico task manual es el checkpoint humano de UAT (162-05-T3), exento por naturaleza. **wave_0_complete: true.**

---

## Manual-Only Verifications

| Behavior                                                           | Requirement | Why Manual         | Test Instructions                                                      |
| ------------------------------------------------------------------ | ----------- | ------------------ | ---------------------------------------------------------------------- |
| Grilla member app: badge/estados de especiales por tipo de usuario | APP-01      | member app sin e2e | Abrir Reservas como socio con pase, socio sin pase y externo-solo-pase |
| Contador x/2 visible (grilla y Mi Templo)                          | APP-02      | member app sin e2e | Ver chip/card con pase activo; consumir 1 y verificar 1/2              |
| Dialog informativo sin CTA de pago                                 | APP-03      | member app sin e2e | Intentar reservar especial sin pase                                    |
| Tab "Especiales" en Analíticas + export                            | REP-01      | admin sin e2e      | Abrir Analíticas → Especiales; exportar xlsx                           |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (unico task manual: checkpoint UAT 162-05-T3, exento)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (ninguna — infra existente)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ✅ approved (planner)
