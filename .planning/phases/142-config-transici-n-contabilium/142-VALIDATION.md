---
phase: 142
slug: config-transici-n-contabilium
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-24
---

# Phase 142 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **Framework**          | API integration tests (el-templo-api/test/, real `eltemplo_test` MySQL; see test/helpers.ts)          |
| **Config file**        | Existing project test runner (no install)                                                             |
| **Quick run command**  | `cd el-templo-api && npx tsc --noEmit` (typecheck local; behavioral tests run in CI per project rule) |
| **Full suite command** | `cd el-templo-api && pnpm test` (runs in CI on push to staging — NOT run locally)                     |
| **Estimated runtime**  | typecheck ~10-20s local; full suite in CI                                                             |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` (el-templo-api) / `npx vue-tsc --noEmit` (el-templo-admin)
- **After every plan wave:** Push to staging → CI runs `pnpm test` (full integration suite)
- **Before `/gsd:verify-work`:** Full suite green in CI; manual UAT for the admin page (no admin unit-test harness in scope)
- **Max feedback latency:** ~20s local typecheck; CI for behavioral assertions

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement | Threat Ref          | Secure Behavior                                                                                                                                                                                                                                                                                                            | Test Type              | Automated Command                                                                                                                                                                                                                | File Exists                     | Status     |
| --------- | ---- | ---- | ----------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------- |
| 142-01-01 | 01   | 1    | MIG-01      | T-142-03            | `getOverdueThreshold` reads `finance.pending_overdue_days` and falls back to 3 on absent/NaN; `setOverdueThreshold` uses parameterized `onDuplicateKeyUpdate` (no string concat, race-safe); both `listPendingTray` seam sites (:1162/:1166) use the dynamic threshold; migration 0157 idempotent, no `;` in `--` comments | unit/typecheck         | `cd el-templo-api && npx tsc --noEmit`                                                                                                                                                                                           | ✅ (config-service.ts, 0157)    | ⬜ pending |
| 142-01-02 | 01   | 1    | MIG-01      | T-142-01 / T-142-02 | GET+PUT `/config/overdue-threshold` 403 for gestion/coach/recepcion (per-handler ADMIN_ROLES closes the FINANCE_READ_ROLES trap); owner/admin 200 round-trip; PUT validates 1..365 → 400; fallback-to-3 when row absent; dynamic threshold (PUT 5 → /pending-tray thresholdDays=5 AND isOverdue reflects 5)                | integration            | `cd el-templo-api && pnpm test` (finance-config.test.ts — CI)                                                                                                                                                                    | ❌ W0 → created this task       | ⬜ pending |
| 142-02-01 | 02   | 1    | MIG-02      | T-142-05            | Transition doc exists in `.docs/modulo-contable/`; opening-balance template exists and is NOT under `src/db/migrations/` (runner cannot execute placeholder/zero on deploy); template has no `;` in `--` comments                                                                                                          | doc / file-existence   | `test -f .docs/modulo-contable/TRANSICION-CONTABILIUM.md && test -f .docs/modulo-contable/opening-balance-migration-template.sql && ! test -f el-templo-api/src/db/migrations/opening-balance-migration-template.sql && echo OK` | N/A (deliverable)               | ⬜ pending |
| 142-03-01 | 03   | 2    | MIG-01      | T-142-08            | `useFinanceConfigApi` calls the FULL path `/admin/finance/config/overdue-threshold` (GET+PUT); single-field page per 142-UI-SPEC (no invented fields); `:rules` integer min 1 block submit; loads on mount, saves with notify; composable `cleanup()` not `onUnmounted`; no any/console; warm palette                      | typecheck + manual UAT | `cd el-templo-admin && npx tsc --noEmit \|\| npx vue-tsc --noEmit`                                                                                                                                                               | ❌ W0 → created this task       | ⬜ pending |
| 142-03-02 | 03   | 2    | MIG-01      | T-142-07            | `/configuracion-caja` route + nav gated `['admin','owner']` (gestion/recepcion/coach excluded client-side; backend ADMIN_ROLES is the authority)                                                                                                                                                                           | typecheck + manual UAT | `cd el-templo-admin && npx tsc --noEmit \|\| npx vue-tsc --noEmit`                                                                                                                                                               | ✅ (routes.ts, AdminLayout.vue) | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/finance-config.test.ts` — covers MIG-01: config GET/PUT, RBAC (gestion/coach/recepcion → 403; owner/admin → 200), PUT 1..365 validation (→ 400), fallback-to-3 (delete row), dynamic-threshold flow into `/pending-tray` (seed a pendiente of known age). Created in 142-01 Task 2. Reuses `test/helpers.ts` auth utilities; runs in CI on push (not locally, per project rule).

_No new framework install needed — the integration harness exists. Frontend (admin) has no unit-test harness in scope; the one-field page is verified by typecheck/vue-tsc + manual UAT._

---

## Manual-Only Verifications

| Behavior                                                                                       | Requirement | Why Manual                                           | Test Instructions                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Configuración de Caja" page loads current threshold, edits, saves, shows success/error notify | MIG-01      | No admin unit-test harness in scope; single-field UI | As owner/admin: open `/configuracion-caja`, confirm field shows current value (e.g. 3), change to e.g. 5, Guardar → "Configuración guardada"; reload → value persists; confirm the 141 bandeja "superan los N días" reflects the new value                  |
| MIG-02 transition doc content review                                                           | MIG-02      | Written deliverable, not runtime-testable            | Review `.docs/modulo-contable/TRANSICION-CONTABILIUM.md` covers corte limpio + qué dato manda + estrategia de corte (deferred to Franco) + mecanismo de apertura; confirm opening-balance template is fill-in-the-blanks and NOT under `src/db/migrations/` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (finance-config.test.ts)
- [ ] No watch-mode flags
- [ ] Feedback latency < ~20s (local typecheck); behavioral assertions in CI
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
