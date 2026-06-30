---
phase: 142-config-transicion-contabilium
verified: 2026-06-24T00:00:00Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
overrides:
  - must_have: "Perillas de validación (todos/dudosos) y activación (instantánea/diferida) tienen casa de config; tabla finance_settings o equivalente (SC#1, ROADMAP)"
    reason: "Locked CONTEXT D-01/D-02/D-03 narrow MIG-01 to the ONLY real knob (umbral de pendientes). Validation/activation knobs are deliberately DISCARDED as speculative scope (lección cobro suelto): 'validar todos' (137) and 'activación instantánea' (137) stay hardcoded at their correct defaults — building a switch with no automatic-rules backend would be premature abstraction. SC#1's 'o equivalente' wording explicitly permits reusing the existing system_settings key-value table instead of a new finance_settings table (D-04). The config house exists, is functional from the admin, and is NOT hardcoded — the SC's actual intent (a defined, functional, admin-driven config home, not code-wired) is satisfied for the one knob that has real value today."
    accepted_by: "locked-context-D-01..D-04"
    accepted_at: "2026-06-24T00:00:00Z"
human_verification:
  - test: "Open the admin app as owner/admin → Administracion → 'Configuración de Caja'. Confirm one numeric field 'Umbral de pendientes (días)' loads the current value (3), accepts an integer ≥1, Guardar shows a positive notify, and the warm palette (terracotta, no blue) renders correctly."
    expected: "Single field pre-filled with current threshold; Guardar persists and shows 'Configuración guardada'; invalid (<1 / non-integer) blocks submit; no blue in the UI."
    why_human: "Visual appearance + form-state UX (single-field render, notify feedback, palette) cannot be verified by grep; the admin app has no unit-test harness for this page (manual UAT by Franco per plan 142-03)."
  - test: "Log in as gestion/recepcion/coach and confirm the 'Configuración de Caja' nav item is absent and navigating directly to /configuracion-caja is blocked."
    expected: "Nav item hidden for non-admin roles; route guard prevents direct access; backend returns 403 even if reached."
    why_human: "Client-side role gating + live route guard behavior is a runtime check; backend 403 is covered by integration tests (CI), but the end-to-end nav/route experience needs a human session."
---

# Phase 142: Config + transición Contabilium Verification Report

**Phase Goal:** La única perilla real (umbral de pendientes) tiene una casa funcional desde el admin (reusa system_settings), no cableada en código; está documentada la regla "qué dato manda" con Contabilium + el mecanismo de aperturas. Depends on 137.

**Verified:** 2026-06-24
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                    | Status                          | Evidence                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Owner/admin can read the current pending-overdue threshold via GET config endpoint                       | ✓ VERIFIED                      | `routes.ts:998-1016` GET `/config/overdue-threshold` returns `{ thresholdDays }` from `getOverdueThreshold()`. Test `finance-config.test.ts:260-269` owner/admin → 200.                                                                                                       |
| 2   | Owner/admin can set the threshold via PUT; gestion/recepcion/coach get 403                               | ✓ VERIFIED                      | `routes.ts:1018-1040` PUT; per-handler `ADMIN_ROLES` check FIRST (`:1002`, `:1022`). Tests `:272-284`, `:312-326` gestion/coach/recepcion → 403 on GET and PUT.                                                                                                               |
| 3   | Setting threshold N flows to /pending-tray: thresholdDays=N and isOverdue reflects N                     | ✓ VERIFIED                      | `transaction-service.ts:1157` reads threshold ONCE; `:1184` `isOverdue: ageInDays > threshold`, `:1188` `thresholdDays: threshold`. Test `:353-367` PUT 5 → thresholdDays=5, fresh row not overdue, old row overdue.                                                          |
| 4   | When the setting row is absent, reads fall back to the canonical default (3)                             | ✓ VERIFIED                      | `config-service.ts:54` absent → `OVERDUE_DAYS`; `:56` NaN → `OVERDUE_DAYS`. Tests `:287-291` (config) and `:370-376` (pending-tray) fall back to 3.                                                                                                                           |
| 5   | PUT with out-of-range/non-integer value returns 400 (no write)                                           | ✓ VERIFIED                      | `schemas.ts:780-788` body `integer, minimum 1, maximum 365, additionalProperties:false`. Tests `:329-348` 0/negative/>365/non-integer → 400; round-trip confirms no write.                                                                                                    |
| 6   | Owner/admin can open 'Configuración de Caja', see threshold, edit, save (single field, warm palette)     | ✓ VERIFIED (code) / UAT pending | `ConfiguracionCajaPage.vue` single `q-input`, GET on mount (`:80`), PUT on save (`:68`), `cleanup()` on unmount (`:90`), warm palette (`color="primary"`, positive/negative notify, no blue). Visual = light UAT.                                                             |
| 7   | Route + nav gated to owner/admin (isAdminRole); coach/gestion/recepcion cannot reach it                  | ✓ VERIFIED                      | `routes.ts:175-177` `meta.allowedRoles ['admin','owner']`; `AdminLayout.vue:164/179` nav inside `<template v-if="isAdminRole">`; `:233` isAdminRole=['admin','owner'].                                                                                                        |
| 8   | An ops doc records 'qué dato manda', clean-cutoff, opening-balance mechanism; cutoff date deferred       | ✓ VERIFIED                      | `.docs/modulo-contable/TRANSICION-CONTABILIUM.md` §a corte limpio + sin backfill, §b qué dato manda (Admin=ingresos/caja, Contabilium=AFIP only), §c cutoff deferred to Franco at go-live, §d opening-balance by migration. Tracked copy: `142-02-TRANSICION-CONTABILIUM.md`. |
| 9   | Opening-balance migration TEMPLATE exists OUTSIDE src/db/migrations/ (runner can't execute placeholders) | ✓ VERIFIED                      | Template at `.docs/modulo-contable/` + tracked `142-02-opening-balance-migration-template.sql`; NOT in `src/db/migrations/` (confirmed via ls). One `UPDATE cash_registers SET opening_balance/cutoff_date` per caja; no `;` in comment lines.                                |

**Score:** 9/9 truths verified (Truth 6 visual is a light UAT; the code is verified)

### Required Artifacts

| Artifact                                                       | Expected                               | Status     | Details                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/finance/config-service.ts`          | read-with-fallback + upsert            | ✓ VERIFIED | Mirrors `getStreakMilestoneConfig` parseOrDefault (absent+NaN guards); onDuplicateKeyUpdate; no `any`; Pino logger. |
| `el-templo-api/src/db/migrations/0157_*.sql`                   | idempotent data-only seed of default 3 | ✓ VERIFIED | `INSERT…SELECT…WHERE NOT EXISTS`; no `;` in `--` comments; not auto-generated.                                      |
| `el-templo-api/test/finance-config.test.ts`                    | get/set, RBAC, fallback, dynamic, 400  | ✓ VERIFIED | 378 lines, 17 cases; covers all paths. Runs in CI on push.                                                          |
| `el-templo-admin/src/composables/useFinanceConfigApi.ts`       | getThreshold/setThreshold + cleanup()  | ✓ VERIFIED | Full path `/admin/finance/config/overdue-threshold`; cleanup(); NO onUnmounted inside; no `any`; createLogger.      |
| `el-templo-admin/src/pages/ConfiguracionCajaPage.vue`          | single-field config form               | ✓ VERIFIED | One numeric field, no invented fields/reset/upper-bound; warm palette.                                              |
| `el-templo-admin/src/router/routes.ts`                         | /configuracion-caja owner/admin        | ✓ VERIFIED | `allowedRoles ['admin','owner']`.                                                                                   |
| `.docs/modulo-contable/TRANSICION-CONTABILIUM.md`              | MIG-02 transition rule                 | ✓ VERIFIED | All four D-07 contents; tracked copy in phase dir.                                                                  |
| `.docs/modulo-contable/opening-balance-migration-template.sql` | opening-balance template               | ✓ VERIFIED | Outside src/db/migrations/; per-caja UPDATEs.                                                                       |

### Key Link Verification

| From                                      | To                                           | Via                                           | Status  | Details                                                                                         |
| ----------------------------------------- | -------------------------------------------- | --------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `transaction-service.ts::listPendingTray` | `getOverdueThreshold()`                      | awaited once before .map(), both seam sites   | ✓ WIRED | `:1157` read; `:1184` isOverdue; `:1188` thresholdDays. OVERDUE_DAYS literal removed from seam. |
| `routes.ts` config handlers               | `ADMIN_ROLES`                                | per-handler owner/admin check FIRST           | ✓ WIRED | `:1002`, `:1022` — excludes gestion (in FINANCE_READ_ROLES).                                    |
| `ConfiguracionCajaPage.vue`               | `useFinanceConfigApi`                        | getThreshold on mount, setThreshold on submit | ✓ WIRED | `:49`, `:68`, `:80`.                                                                            |
| `useFinanceConfigApi.ts`                  | GET/PUT `/admin/finance/config/...`          | api (boot/axios), full path                   | ✓ WIRED | `:30` full path; `:52` GET, `:71` PUT.                                                          |
| `opening-balance-template.sql`            | `cash_registers.opening_balance/cutoff_date` | UPDATE per caja                               | ✓ WIRED | 4× `UPDATE cash_registers SET opening_balance=<CONTEO>, cutoff_date='<YYYY-MM-DD>'`.            |

### Behavioral Spot-Checks

| Behavior                             | Command                            | Result                         | Status              |
| ------------------------------------ | ---------------------------------- | ------------------------------ | ------------------- |
| API typecheck (no `any`, compiles)   | `npx tsc --noEmit` (el-templo-api) | exit 0                         | ✓ PASS              |
| Admin phase files typecheck          | `vue-tsc --noEmit`, phase files    | 0 errors in 4 phase files      | ✓ PASS              |
| Template absent from migrations dir  | `ls src/db/migrations/`            | not present                    | ✓ PASS              |
| No `;` in template comment lines     | `grep -nE '^\s*--.*;'`             | none                           | ✓ PASS              |
| Integration suite (RBAC/400/dynamic) | `pnpm test` (CI on push)           | not run locally (project rule) | ? SKIP — runs in CI |

### Requirements Coverage

| Requirement | Source Plan    | Description                                     | Status      | Evidence                                                                                                                        |
| ----------- | -------------- | ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| MIG-01      | 142-01, 142-03 | Casa de config funcional, no cableada en código | ✓ SATISFIED | config-service + GET/PUT (owner/admin) + ConfiguracionCajaPage + seam wired. See override note re: validation/activation knobs. |
| MIG-02      | 142-02         | Doc "qué dato manda" + corte + aperturas        | ✓ SATISFIED | TRANSICION-CONTABILIUM.md + opening-balance template.                                                                           |

### Anti-Patterns Found

| File                       | Line | Pattern                                                                | Severity | Impact                                                                                                                   |
| -------------------------- | ---- | ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `finance/constants.ts`     | 13   | Stale comment refers to `finance_settings` (impl uses system_settings) | ℹ️ Info  | Cosmetic only — comment describes the pre-142 plan; behavior is correct (system_settings). Not a stub, not load-bearing. |
| `BandejaPendientesTab.vue` | —    | Pre-existing vue-tsc error                                             | ℹ️ Info  | NOT a 142 change (last touched 141-04 `9037a0e5`). Confirms "zero 141 frontend changes". Out of scope.                   |

No 🛑 blockers. No debt markers (TBD/FIXME/XXX) in phase files. No console.\*. No `any`. No empty-data stubs (cajas at opening_balance=0 is intentional by D-09, documented).

### Human Verification Required

#### 1. Configuración de Caja page visual + form UX (light UAT)

**Test:** As owner/admin → Administracion → "Configuración de Caja". Confirm one numeric field "Umbral de pendientes (días)" loads the current value (3), accepts integer ≥1, Guardar shows positive notify, warm palette (no blue).
**Expected:** Field pre-filled; Guardar persists + 'Configuración guardada'; invalid input blocks submit; no blue.
**Why human:** Visual appearance + form-state UX; no admin unit-test harness for this page.

#### 2. Non-admin role gating (nav + route)

**Test:** Log in as gestion/recepcion/coach; confirm the nav item is absent and /configuracion-caja is blocked.
**Expected:** Nav hidden; route guard blocks direct access; backend 403 even if reached.
**Why human:** Runtime client gating + live route guard; backend 403 is CI-covered, the e2e nav/route experience needs a human session.

### Gaps Summary

No gaps. All 9 observable truths are verified in the live code, all artifacts exist and are substantive and wired, both seam sites in `listPendingTray` consume the dynamic threshold (read once), and the RBAC trap is correctly closed — each config handler re-checks `ADMIN_ROLES` FIRST, so `gestion` (which passes the FINANCE_READ_ROLES module guard) is rejected with 403. Integration tests cover RBAC, 400 bounds, the dynamic-threshold flow into /pending-tray, and the absent-setting fallback; API typecheck is clean and the four admin phase files produce zero tsc errors. Scope discipline is intact: only the threshold knob was built (validation/activation knobs discarded per D-01/D-02/D-03), the settings module was NOT resurrected, no opening-balance UI was built (template only, D-09), and there are zero changes to 141's BandejaPendientesTab.

**One documented deviation (override-accepted):** ROADMAP SC#1 literally names "perillas de validación/activación" and a "tabla finance_settings o equivalente". The locked CONTEXT (D-01..D-04) deliberately narrows MIG-01 to the only knob with real value (the umbral), reuses the existing `system_settings` table (the SC's "o equivalente"), and discards the validation/activation switches as speculative scope. The SC's intent — a defined, functional, admin-driven, non-hardcoded config house — is satisfied. Recorded in the `overrides` frontmatter.

**Status is `human_needed`** (not `passed`) because two human verification items exist: the single-field page visual/UX (a light UAT, explicitly deferred to Franco in plan 142-03) and the live non-admin nav/route gating. The code is fully verified; these are runtime/visual confirmations only.

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
