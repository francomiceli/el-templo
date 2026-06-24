---
phase: 140
slug: carga-nica-que-propaga-cobro-suelto-rol-profe
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-24
---

# Phase 140 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Carga única que propaga + cobro suelto + rol profe (corazón del milestone v5.2).

---

## Test Infrastructure

| Property               | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| **Framework**          | Vitest (API integration tests against real MySQL `eltemplo_test`)      |
| **Config file**        | `el-templo-api/vitest.config.*` (existing)                             |
| **Quick run command**  | `cd el-templo-api && npx tsc --noEmit` (fast, local — per task commit) |
| **Full suite command** | `cd el-templo-api && npx vitest run test/finance/coach-load.test.ts`   |
| **Estimated runtime**  | ~30–60 seconds (single integration file vs. test DB)                   |

Notes:

- No `pnpm typecheck` script — typecheck via `npx tsc --noEmit` (API) / `npx vue-tsc --noEmit` (admin).
- Full Vitest suite runs in CI on push to staging (MEMORY: no local full-suite run); the phase gate is CI green.
- No new dependencies installed this phase (RESEARCH Package Legitimacy Audit: zero new deps).

---

## Sampling Rate

- **After every task commit:** Run `cd el-templo-api && npx tsc --noEmit` (admin tasks: `npx vue-tsc --noEmit`).
- **After every plan wave:** Run `cd el-templo-api && npx vitest run test/finance/coach-load.test.ts` (Wave 2 onward; Wave 1 is verified transitively by this suite — see Wave 0 Requirements).
- **Before `/gsd:verify-work`:** Full `coach-load.test.ts` green + both typechecks green + plan 03 human-verify checkpoint approved.
- **Max feedback latency:** ~60 seconds (typecheck < 15s; integration file < 60s).

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement                  | Threat Ref                   | Secure Behavior                                                                                                                                                                                                                    | Test Type             | Automated Command                                                                                                                                                                | File Exists                   | Status     |
| --------- | ---- | ---- | ---------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------- |
| 140-01-01 | 01   | 1    | CARGA-02                     | T-140-02                     | idempotency_key nullable UNIQUE persisted; duplicate non-null key rejected at DB; no `;` in SQL comments                                                                                                                           | migration + typecheck | `cd el-templo-api && npx tsc --noEmit && ! grep -nE '^\s*--.*;' src/db/migrations/0156_idempotency_key.sql`                                                                      | ✅ (0156 created by task)     | ⬜ pending |
| 140-01-02 | 01   | 1    | CARGA-04, CARGA-03           | T-140-03                     | FINANCE_LOAD_ROLES = WRITE + coach; coach NOT added to VOID/ADJUSTMENT/READ; create() persists idempotencyKey                                                                                                                      | typecheck + grep      | `cd el-templo-api && npx tsc --noEmit && grep -q FINANCE_LOAD_ROLES src/modules/shared/permissions.ts`                                                                           | ✅                            | ⬜ pending |
| 140-01-03 | 01   | 1    | CARGA-02                     | T-140-01                     | renewSubscription forwards recorderRole → coach renewal born `pendiente`; admin path unchanged (`validado`)                                                                                                                        | typecheck + grep      | `cd el-templo-api && npx tsc --noEmit && grep -q 'recorderRole: input.recorderRole' src/modules/subscriptions/service.ts`                                                        | ✅                            | ⬜ pending |
| 140-02-00 | 02   | 2    | CARGA-01..04                 | —                            | Wave 0 scaffold: failing `coach-load.test.ts` covering all CARGA cases + Pitfall 2                                                                                                                                                 | test scaffold (RED)   | `cd el-templo-api && npx tsc --noEmit && test -f test/finance/coach-load.test.ts`                                                                                                | ❌ W0 → ✅ this task          | ⬜ pending |
| 140-02-01 | 02   | 2    | CARGA-01, CARGA-02, CARGA-03 | T-140-05, T-140-06, T-140-08 | coach renew (201) → new sub active + charge pendiente; cobro suelto via `advance_payment` empty links; autocompletar plan+amount+currency; mis-cargas forced recordedBy=self; route schema rejects validationStatus/cashRegisterId | integration           | `cd el-templo-api && npx tsc --noEmit && grep -q coach-load src/app.ts && npx vitest run test/finance/coach-load.test.ts -t "renew"`                                             | ✅ (test file from 140-02-00) | ⬜ pending |
| 140-02-02 | 02   | 2    | CARGA-02, CARGA-04           | T-140-04, T-140-07           | same idempotency_key twice → ONE row, second returns existing (200, not 500); coach 403 on validate/observe/void/full-list/summary                                                                                                 | integration           | `cd el-templo-api && npx tsc --noEmit && npx vitest run test/finance/coach-load.test.ts`                                                                                         | ✅                            | ⬜ pending |
| 140-03-01 | 03   | 3    | CARGA-01, CARGA-03           | T-140-10                     | composable cleanup(); no onUnmounted; typed bodies; never sends validationStatus/cashRegisterId                                                                                                                                    | typecheck + grep      | `cd el-templo-admin && (npx vue-tsc --noEmit \|\| npx tsc --noEmit) && ! grep -q onUnmounted src/composables/useFinanceLoadApi.ts`                                               | ✅                            | ⬜ pending |
| 140-03-02 | 03   | 3    | CARGA-01, CARGA-03           | T-140-09, T-140-11           | PoS screen two modes; client idempotency key per attempt + disabled-button guard; route+nav gated by isLoadRole (coach in, /caja out)                                                                                              | typecheck + grep      | `cd el-templo-admin && (npx vue-tsc --noEmit \|\| npx tsc --noEmit) && grep -q crypto.randomUUID src/pages/CargarPagoPage.vue && grep -q isLoadRole src/layouts/AdminLayout.vue` | ✅                            | ⬜ pending |
| 140-03-03 | 03   | 3    | CARGA-01, CARGA-03           | —                            | PoS visual + functional flow on a phone (mode A/B, idempotent double-tap, coach cannot reach saldos)                                                                                                                               | manual (human-verify) | manual — see Manual-Only Verifications                                                                                                                                           | n/a                           | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

### Requirement → Test Case Map (from 140-RESEARCH.md "Validation Architecture")

| Req ID   | Behavior                                                                                                                                                                                                               | Test tag in `coach-load.test.ts`            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| CARGA-01 | autocompletar returns current plan name + amount + currency                                                                                                                                                            | `-t "autocompletar"`                        |
| CARGA-02 | coach renew → new sub period active + charge born `pendiente`                                                                                                                                                          | `-t "renew"`                                |
| CARGA-02 | same idempotencyKey twice → one charge row, second returns existing (no dup, no 500)                                                                                                                                   | `-t "idempotency"`                          |
| CARGA-03 | cobro suelto → `advance_payment` pendiente, empty links, balance untouched; pendiente advance_payment does NOT move getSummary `monthlyRevenue` (Pitfall 2: `revenueByKind.advance_payment` unchanged while pendiente) | `-t "cobro suelto"`                         |
| CARGA-04 | coach can load (201); coach 403 on validate/observe/void/full-list/summary/saldos                                                                                                                                      | `-t "auth"`                                 |
| CARGA-04 | mis-cargas returns ONLY the calling coach's loads (recordedBy forced to self server-side)                                                                                                                              | `-t "auth"` / `-t "renew"` (assert scoping) |

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/finance/coach-load.test.ts` — stubs for CARGA-01..04 + Pitfall 2 (created in **140-02 Task 0**; reuses `createStaffUser({role:'coach'})`, `getAuthToken`, `ensureEfectivoCaja`, `createTestMember`, `assignTestPlan`, `cleanAllTestData` from `test/helpers.ts`). Resolves the exact mysql2 ER_DUP_ENTRY shape empirically (A1/Q3).
- [ ] No framework install needed — Vitest + helpers already present in `el-templo-api`.

**Transitive verification of plan 01 (per checker warning 1):** Plan 01's foundation tasks (migration 0156, FINANCE_LOAD_ROLES, recorderRole/idempotencyKey threading, create() persistence) have NO standalone integration test of their own — they are verified per-task by `npx tsc --noEmit` + targeted greps, and verified **transitively** end-to-end by plan 02's `coach-load.test.ts` suite: the `renew` case proves recorderRole→pendiente, the `idempotency` case proves the 0156 UNIQUE column + persisted key, the `cobro suelto` case proves the advance_payment path, and the `auth` case proves FINANCE_LOAD_ROLES gating. The Wave 0 scaffold therefore lives in 140-02 Task 0, not in plan 01. This is intentional: plan 01 has no HTTP surface to integration-test until plan 02 mounts the endpoints.

---

## Manual-Only Verifications

| Behavior                                                     | Requirement        | Why Manual                                                                                                                                                                                                                                         | Test Instructions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coach PoS "Cargar pago" screen visual + flow on a real phone | CARGA-01, CARGA-03 | Mobile-web PoS layout/usability (big buttons, warm palette, sticky one-handed Confirmar, idempotent double-tap UX) cannot be asserted by an automated test; Franco was away during the UI-SPEC so the visuals/flow need a real-device sanity check | Run admin dev server, log in as `coach`, open `/cargar` at ~375px. (1) Renovar plan: search socio w/ active plan → plan vigente + monto pre-fill → edit monto → Efectivo → Confirmar → expect positive notify "pendiente de validación" + gold "Pendiente" ticket in "Mis cargas de hoy". (2) Double-tap / slow-connection retry → still exactly ONE ticket. (3) Cobro suelto: switch mode → pick socio → monto + concepto libre → Transferencia → Confirmar → ticket shows concepto, no plan touched. (4) Confirm coach does NOT see/reach `/caja` (saldos). This is the 140-03 Task 3 `checkpoint:human-verify` (blocking). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (plan 01 transitive via 140-02 suite; plan 03 Task 3 is the single manual checkpoint)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every auto task carries a `<verify><automated>` command)
- [x] Wave 0 covers all MISSING references (`coach-load.test.ts` scaffold in 140-02 Task 0)
- [x] No watch-mode flags (all commands use `vitest run`, not watch)
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
