---
phase: 161
slug: n-cleo-actividades-gateadas-pase-mensual-y-enforcement
status: draft
nyquist_compliant: false
wave_0_complete: false
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

| Task ID               | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status     |
| --------------------- | ---- | ---- | ----------- | ---------- | --------------- | --------- | ----------------- | ----------- | ---------- |
| (completa el planner) |      |      |             |            |                 |           |                   |             | ⬜ pending |

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
