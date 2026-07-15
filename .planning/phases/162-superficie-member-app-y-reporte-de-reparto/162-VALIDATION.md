---
phase: 162
slug: superficie-member-app-y-reporte-de-reparto
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-14
---

# Phase 162 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | vitest (integration tests contra MySQL real `eltemplo_test`) para API; sin e2e en frontends                                                                                |
| **Config file**        | `el-templo-api/vitest.config.ts`                                                                                                                                           |
| **Quick run command**  | `cd el-templo-api && npx tsc --noEmit`; frontends: `cd el-templo-app && npx vue-tsc --noEmit` / `cd el-templo-admin && npx vue-tsc --noEmit` (CI NO typechequea frontends) |
| **Full suite command** | CI (`pnpm test` en pipeline — NO correr la suite completa local, regla del repo)                                                                                           |
| **Estimated runtime**  | typecheck ~20-40s c/u; tests puntuales nuevos ~30s c/u                                                                                                                     |
| **Targeted test run**  | `cd el-templo-api && npx vitest run test/<archivo-nuevo>.test.ts` (solo archivos nuevos de esta fase)                                                                      |

---

## Sampling Rate

- **After every task commit:** typecheck del paquete tocado (tsc para api, vue-tsc para app/admin)
- **After every plan wave:** tests nuevos de la fase en forma puntual
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

- Infraestructura existente cubre la fase: `el-templo-api/test/helpers.ts`, DB `eltemplo_test`, tests de fase 161 (`especial-*.test.ts`) como fixtures/patrones.

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
