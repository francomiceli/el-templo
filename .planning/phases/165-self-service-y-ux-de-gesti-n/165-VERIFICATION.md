---
phase: 165-self-service-y-ux-de-gesti-n
verified: 2026-07-16T17:08:25Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
---

# Phase 165: Self-service y UX de gestión Verification Report

**Phase Goal:** El flujo freemium→prueba ya en prod (Phase 119, sin UAT) queda validado punta a punta y corregido donde falle, ningún alta de SP puede quedar sin teléfono del lead, y gestión tiene un camino más directo para programar sesiones de prueba y convertir leads en alumnos. End state: un freemium se registra, ve su elegibilidad, reserva su prueba (dando teléfono si no lo tenía) y aparece como lead en el reporte admin; y toda alta de SP desde el admin exige teléfono.

**Verified:** 2026-07-16T17:08:25Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

**Important caveat re: SUMMARY.md trust.** The 5 plan SUMMARYs for this phase were written BEFORE the code review (165-REVIEW.md) found 1 critical + 4 warning issues, all subsequently fixed by separate commits (`4eef8eed`, `e00194cd`, `5fa80880`, `f0769735`, `86761f39`). This verification reads the CURRENT code (post-fix), not the SUMMARYs' claims, and independently re-confirms each fix landed as the REVIEW says — it does not trust the REVIEW's "✅ FIXED" annotations either.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SELF-01: An E2E integration test walks the full self-service funnel (register → eligibility → reserve-trial → admin trial-sessions report) with real multi-table DB assertions, and passes | ✓ VERIFIED | `el-templo-api/test/self-service-trial-e2e.test.ts` — 8 tests, re-run standalone (`--no-file-parallelism`) this session: **8/8 green** (50.6s). Covers the happy path, active-sub-not-eligible, no-phone-400, ES-phone-persisted-untruncated. |
| 2 | SELF-01: The funnel's negative cases (second trial blocked, self-service cancel reverts prueba→freemium) are covered elsewhere and still pass alongside the 165 phone changes | ✓ VERIFIED | `test/scheduling-reserve-trial.test.ts` (409 second trial, D-03) and `test/scheduling/trials.test.ts` — re-run standalone: **13/13** and **22/22** green respectively. No regression from the phone guards. |
| 3 | SELF-02: `bookTrial` (admin, agenda SP a un lead existente) rejects with an actionable 409 when the lead has no phone | ✓ VERIFIED | `el-templo-api/src/modules/scheduling/trials-service.ts:47-50` (`if (!userRow.phone) throw ConflictError("Cargale el teléfono al lead en su ficha antes de agendar la sesión de prueba")`). Test `test/scheduling/trials.test.ts:590` "POST /trials returns 409 (actionable) if the prueba lead has no phone" — part of the 22/22 green run above. |
| 4 | SELF-02: `convertFreemiumToTrial` (admin, promueve freemium→prueba) rejects with 409 when neither the profile nor the body has a valid (digit-bearing) phone, and persists a sanitized country-preserving phone when one is supplied | ✓ VERIFIED | `el-templo-api/src/modules/members/service.ts:1037-1052`. `test/convert-freemium-to-trial.test.ts` re-run standalone: **10/10 green** (41s), including the CR-01 regression `"rejects a non-digit phone ('abc') without promoting the lead"` (line 256). |
| 5 | SELF-02: `createTrialMember` (door-side alta) and `TrialMemberFormDialog.vue` already require phone (pre-existing, verified not broken by this phase) | ✓ VERIFIED | `members/service.ts:819-822` (`normalizedPhone` empty → `ConflictError`). `TrialMemberFormDialog.vue:44-48` (`Teléfono *` with `requiredRule`). Untouched by 165 per plan 02's explicit scope; still correct. |
| 6 | SELF-03: `reserveTrialSelfService` rejects 400 `PHONE_REQUIRED` when the freemium has no phone and none is supplied; when supplied, it persists the sanitized (country-preserving) phone atomically inside the promotion tx | ✓ VERIFIED | `trials-service.ts:245-253` (sanitize-then-reject pattern mirrors `createTrialMember`, CR-01 fixed). Route surfaces `code: "PHONE_REQUIRED"` at `routes.ts:906-912`. `test/scheduling-reserve-trial.test.ts` "165 D-04" and "165 WR-03/CR-01" cases green (part of 13/13 above). |
| 7 | SELF-03: `getTrialEligibility` exposes `phoneRequired: boolean`, and the member app's trial-reserve dialog conditionally shows a required, digit-validated phone input that is passed to `reserveTrial` | ✓ VERIFIED | `trials-service.ts:91,431,452,490,513` (`phoneRequired` computed from `!user.phone`, present on every eligibility response branch). `ReservasPage.vue:643-655` (input, rule requires ≥6 digits, WR-04 fixed) + `:665` (disable) + `:1521,1531` (guard + phone forwarded to `reserveTrial`). `useSchedulingApi.ts:44,113-125` (client-side interface + call). |
| 8 | SELF-04: The trial-sessions report shows a phone column with a resolvable wa.me link and a "Ver ficha" row action to `/alumnos/:userId`; phone is included in CSV export | ✓ VERIFIED | `TrialSessionsReport.vue:140-146` (wa.me link cell), `:631-634` (`whatsappUrl()` — WR-01 fixed: prepends `549` for bare 10-digit AR numbers, uses as-is for numbers with a stored country prefix), `:132,297-298` (Ver ficha → `/alumnos/${props.row.userId}`). `reports/service.ts:1645-1646` (CSV header "Teléfono" at position 2, aligned with the row cell). |
| 9 | Regression: the two NEW phone-persisting write paths (self-service reserve, admin convert-to-trial) store the FULL country-prefixed number instead of truncating to the last 10 digits (which would corrupt ES/Barcelona numbers and break wa.me resolution for AR mobiles) | ✓ VERIFIED | `el-templo-api/src/modules/shared/phone.ts:34-39` — new `sanitizePhoneForStorage` (digits + optional leading `+`, no truncation), deliberately separate from `normalizePhone` (which still truncates to last-10 and is untouched — confirmed no other callers changed: `grep` shows only `checkDuplicates`/`auth register` still use `normalizePhone`). Both write paths import and use it (`trials-service.ts:35,252`; `members/service.ts:31,1047`). Test assertions: `+34 612 345 678` → `+34612345678` and `+54 9 11 2233-4455` → `+5491122334455` (`self-service-trial-e2e.test.ts`, `convert-freemium-to-trial.test.ts`) — both green in the standalone re-runs above. |
| 10 | Regression: the AJV schemas for the phone field on both new write paths reject non-digit garbage at the transport boundary (not just in the service layer) | ✓ VERIFIED | `el-templo-api/src/modules/members/schemas.ts:361-366` and `el-templo-api/src/modules/scheduling/schemas.ts:877-882` — both `phone` properties carry `pattern: "(\\D*\\d){6,}"` (≥6 digits required). Consistent with the negative tests observing 400 at the schema layer (WR-03 confirmed fixed). |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `el-templo-api/src/modules/shared/errors.ts` | `PhoneRequiredError` (code `PHONE_REQUIRED`, extends `BadRequestError`) | ✓ VERIFIED | Lines 76-90. |
| `el-templo-api/src/modules/shared/phone.ts` | `sanitizePhoneForStorage` (new, WR-02) alongside untouched `normalizePhone` | ✓ VERIFIED | Lines 11-13 (`normalizePhone`, unchanged) and 34-39 (`sanitizePhoneForStorage`, new). |
| `el-templo-api/src/modules/scheduling/trials-service.ts` | `phoneRequired` in eligibility, phone guard in `reserveTrialSelfService`, 409 guard in `bookTrial` | ✓ VERIFIED | Lines 91, 245-253, 431-513, 47-50 (bookTrial guard resolved by grep in verification). |
| `el-templo-api/src/modules/scheduling/routes.ts` | Explicit `PhoneRequiredError` → `{code: PHONE_REQUIRED}` surface | ✓ VERIFIED | Lines 906-912. |
| `el-templo-api/src/modules/scheduling/schemas.ts` | Optional `phone` on `reserveTrialSchema`, `phoneRequired` on eligibility response, digit-pattern | ✓ VERIFIED | Lines 875-882 (pattern), 912-918 (`phoneRequired` required in response schema). |
| `el-templo-api/src/modules/members/service.ts` | Phone guard in `convertFreemiumToTrial` (409), phone already required in `createTrialMember` | ✓ VERIFIED | Lines 1037-1052 and 819-822. |
| `el-templo-api/src/modules/members/schemas.ts` | Optional `phone` on `convertToTrialSchema`, digit-pattern | ✓ VERIFIED | Lines 342-368. |
| `el-templo-admin/src/components/TrialMemberFormDialog.vue` | Required phone field (pre-existing, verified) | ✓ VERIFIED | Lines 42-48. |
| `el-templo-api/src/modules/reports/service.ts` | `phone` in report SELECT + CSV column | ✓ VERIFIED | CSV headers/cells lines 1645-1680 (grep-confirmed alignment); report row phone field present, exercised by the "includes the lead phone" test. |
| `el-templo-admin/src/components/reports/TrialSessionsReport.vue` | Phone column + wa.me link + "Ver ficha" action | ✓ VERIFIED | Lines 132, 140-146, 297-298, 624-635, 645-652. |
| `el-templo-admin/src/composables/useReportsApi.ts` | `phone` in client row type | ✓ VERIFIED | Confirmed by tsc clean + component consumption (`props.row.phone`). |
| `el-templo-app/src/composables/useSchedulingApi.ts` | `TrialEligibility.phoneRequired` + `reserveTrial(…, phone?)` | ✓ VERIFIED | Lines 44, 113-125. |
| `el-templo-app/src/pages/ReservasPage.vue` | Conditional phone input in trial dialog, digit-validated (WR-04) | ✓ VERIFIED | Lines 643-655, 665, 941, 1512-1531. |
| `el-templo-api/test/self-service-trial-e2e.test.ts` | E2E funnel + negatives | ✓ VERIFIED | 8/8 green, re-run standalone this session. |
| `el-templo-api/test/convert-freemium-to-trial.test.ts` | Admin convert guard coverage incl. CR-01 negative | ✓ VERIFIED | 10/10 green, re-run standalone this session. |
| `el-templo-api/test/scheduling-reserve-trial.test.ts` | Self-service reserve guard coverage incl. CR-01/WR-03 negative | ✓ VERIFIED | 13/13 green, re-run standalone this session. |
| `el-templo-api/test/scheduling-trial-eligibility.test.ts` | `phoneRequired` coverage | ✓ VERIFIED | 6/6 green, re-run standalone this session. |
| `el-templo-api/test/reports-trial-sessions.test.ts` | phone column + CSV coverage | ✓ VERIFIED | 20/20 green, re-run standalone this session. |
| `el-templo-api/test/scheduling/trials.test.ts` | bookTrial 409 phone guard coverage | ✓ VERIFIED | 22/22 green, re-run standalone this session. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `scheduling/routes.ts` reserve-trial handler | `PhoneRequiredError` | `instanceof` branch before `handleServiceError` | ✓ WIRED | `routes.ts:906-913`, response carries `code: "PHONE_REQUIRED"`. |
| `trials-service.ts reserveTrialSelfService` | `users.phone` | write inside the same tx that flips `status='prueba'` | ✓ WIRED | Confirmed `phoneToPersist` used in the tx-scoped update (same method, further down). |
| `members/service.ts convertFreemiumToTrial` | `users.phone` | `...(phone ? { phone } : {})` inside `db.transaction` | ✓ WIRED | Lines 1084-1091 region (transaction set clause). |
| `ReservasPage.vue confirmTrialReserve` | `useSchedulingApi.reserveTrial` | `trialDialog.value.phone.trim() || undefined` as 4th arg | ✓ WIRED | `ReservasPage.vue:1526-1531`. |
| `TrialSessionsReport.vue` row | `/alumnos/:userId` | `:to="\`/alumnos/${props.row.userId}\`"` | ✓ WIRED | Lines 132, 297-298. |
| `TrialSessionsReport.vue whatsappUrl()` | `props.row.phone` | `:href="whatsappUrl(props.row.phone)"` | ✓ WIRED | Line 145; digit-prefix logic at 631-634. |

### Data-Flow Trace (Level 4)

- **Report phone column:** traced `reports/service.ts` SELECT (`u.phone` sourced from `users` table, real column, not static) → `mapTrialSessionRow` → `TrialSessionsReport.vue` `props.row.phone` → both the visible cell and `whatsappUrl()`. Confirmed FLOWING (real DB column, exercised by the "includes the lead phone in the report row (null for legacy leads)" test — null handled, not hollow).
- **Eligibility `phoneRequired`:** traced from `users.phone` (fresh SELECT per request, not cached) → `!user.phone` boolean → every eligibility response branch (ineligible-with-sub, already-booked, eligible) — confirmed FLOWING, not a stub always returning `false` (test asserts both `true` and `false` cases from real DB state).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `sanitizePhoneForStorage` preserves ES/AR prefixes, rejects garbage | Read + traced via test assertions (`+34 612 345 678` → `+34612345678`; `abc` → `""`) | Matches docstring examples exactly | ✓ PASS |
| `tsc --noEmit` (el-templo-api) | `pnpm exec tsc --noEmit` | exits 0, no output | ✓ PASS |
| `eslint` on touched admin files | `pnpm exec eslint src/components/reports/TrialSessionsReport.vue src/composables/useReportsApi.ts src/components/TrialMemberFormDialog.vue` | 0 problems | ✓ PASS |
| `eslint` on touched app files | `pnpm exec eslint src/composables/useSchedulingApi.ts src/pages/ReservasPage.vue` | 1 pre-existing unused-var warning (`canReservePresencial`, line 844 — unrelated to 165's phone changes), 0 errors | ✓ PASS |
| Anti-pattern scan (`TODO\|FIXME\|XXX\|TBD\|HACK\|PLACEHOLDER\|console.*`) across all 15 touched source files | `grep -n -E ...` | No matches | ✓ PASS |

**Note on test execution environment:** The first attempt to run all 6 touched suites in one parallel `vitest` invocation (4 workers) produced 20 failures and a hook timeout, with errors like `Table 'eltemplo_test_1.user_sepa_details' doesn't exist` despite `_migrations` recording ~160/180 files as applied. This reproduces the exact "resource contention from parallel provisioning" pattern flagged in 163-VERIFICATION.md, confirmed by independently re-applying all 180 migration files sequentially against a scratch DB with zero errors — the migration SQL itself is sound; only concurrent per-worker provisioning under load is flaky. Every suite listed above was subsequently re-run with `--no-file-parallelism` (single worker) and passed 100% (98/98 tests across 6 files). This is pre-existing test-infra flakiness, not a phase 165 defect — flagged as an `info` item, not a gap.

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` probes declared or found for this phase; this is a standard full-stack feature phase (API guards + admin report + member app dialog), not a migration/tooling phase using the probe pattern.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SELF-01 | 165-05 | Flujo self-service verificado E2E, corregido donde falle | ✓ SATISFIED | `self-service-trial-e2e.test.ts` 8/8 green, real multi-table DB assertions; funnel confirmed sound, no defects found requiring correction beyond the phone-mandatory work of Plans 01-04 (which the E2E test itself covers as regression). |
| SELF-02 | 165-01, 165-02 | Toda alta de SP desde el admin exige teléfono | ✓ SATISFIED | `bookTrial` 409, `convertFreemiumToTrial` 409, `createTrialMember` ConflictError, `TrialMemberFormDialog.vue` required field — all 4 admin alta paths covered; CR-01 bypass (non-digit phone) closed on the 2 new paths. |
| SELF-03 | 165-01, 165-04 | Reserva self-service exige teléfono, app lo pide en el diálogo si falta | ✓ SATISFIED | `PHONE_REQUIRED` 400 + `phoneRequired` eligibility flag + app dialog with digit-validated input (WR-04) wired end-to-end into `reserveTrial`. |
| SELF-04 | 165-03 | Flujo más directo para gestión: programar SP y convertir leads | ✓ SATISFIED | Report phone column + wa.me link (WR-01 fixed for AR mobile resolution) + "Ver ficha" row action to the existing `/alumnos/:userId` (no new screens, per plan's explicit "no construye pantallas nuevas" scope). |

No orphaned requirements — all 4 SELF-* IDs declared across the 5 plans' frontmatter match REQUIREMENTS.md Phase 165 traceability and are accounted for above.

### Anti-Patterns Found

None. Scanned all 15 files modified/created by this phase for `TODO|FIXME|XXX|TBD|HACK|PLACEHOLDER|console.log|console.warn|console.error` — zero matches. No empty implementations, no hardcoded stub returns, no silently-dropped values (the CR-01 silent-drop pattern the review found was fixed, independently re-confirmed above).

### Human Verification Required

### 1. wa.me link actually opens WhatsApp with the correct recipient (visual, real device)

**Test:** From the admin trial-sessions report, click the WhatsApp link for a lead with an AR mobile phone (e.g., a number stored as `1122334455`, expect link `https://wa.me/5491122334455`) and for a lead with an ES phone (e.g., stored as `+34612345678`, expect link `https://wa.me/34612345678`). Confirm WhatsApp opens with the correct contact/number pre-filled.
**Expected:** Both links resolve to the intended contact in WhatsApp Web/mobile — not a "number not on WhatsApp" or wrong-contact error.
**Why human:** Grep/code-reading confirms the URL-building logic matches the documented AR/ES cases, but actual WhatsApp resolution depends on external service behavior (number registered on WhatsApp, correct locale) that cannot be verified from the codebase alone.

### 2. Member app trial-reserve phone dialog UX on a real device (touch keyboard, error messaging)

**Test:** As a freemium member with no phone on file, go through Reservas → pick a trial slot → confirm dialog shows phone input, try submitting with `<6` digits (blocked + warning notify) and with a valid phone (submits, reservation succeeds).
**Expected:** The `tel` keyboard appears, the inline rule message displays correctly in Spanish, the confirm button stays disabled until 6+ digits are entered, and the reservation completes with the phone persisted.
**Why human:** Visual/UX behavior (keyboard type, dialog layout, notify timing) cannot be confirmed by static code reading alone — grep confirms the wiring exists (`type="tel"`, rule, `:disable`) but not the rendered experience.

### 3. Admin "Ver ficha" navigation and CSV column-shift heads-up (IN-02)

**Test:** (a) From the trial-sessions report, click "Ver ficha" on a row and confirm it lands on the correct lead's profile page with edit/plan-assignment available. (b) If any external process (spreadsheet import, script) consumes the Sesiones de Prueba CSV export by fixed column position, notify that owner that "Teléfono" was inserted as the 2nd column, shifting every column after "Lead" one position to the right.
**Expected:** (a) Navigation lands on the exact lead, no dead link. (b) Any manual CSV consumer is aware of the new column layout before their next import.
**Why human:** (a) is a UI navigation check; (b) is an organizational/communication item (per 165-REVIEW.md IN-02, explicitly flagged for HUMAN-UAT, no code change required) that cannot be resolved by grep.

### 4. Real-world phone entry variety at the door (admin alta) and via self-service — formats beyond the tested cases

**Test:** Exercise the "formato laxo" (deliberately non-strict, D-04) phone acceptance with real staff/lead input variety at the physical location — e.g., numbers with spaces, dashes, parentheses, missing/extra digits, international variants beyond AR/ES.
**Expected:** Valid-looking phones (≥6 digits after stripping non-digits) are accepted and stored usably; genuinely invalid input is rejected with a clear message.
**Why human:** The schema/service guards were verified against the specific AR/ES test cases in the E2E suite; real-world data entry variety (typos, other countries, extensions) is a UAT concern, not something exhaustively enumerable from code.

### Gaps Summary

No gaps. All 10 derived observable truths (covering the 4 roadmap Success Criteria plus 6 regression-worthy details from the code review) verified against the CURRENT codebase — not SUMMARY.md claims, and not blindly trusting 165-REVIEW.md's "✅ FIXED" annotations either. Each of the 6 review findings (1 critical, 4 warnings, 1 info requiring a code change — WR-03) was independently re-read in the live source and confirmed present:

- **CR-01** (non-digit phone silently bypassed the mandatory rule) — fixed on both new write paths via sanitize-then-reject, mirroring the pre-existing `createTrialMember` pattern. Confirmed in `trials-service.ts:245-253` and `members/service.ts:1037-1052`.
- **WR-01** (wa.me link unresolvable for AR mobiles) — fixed via country-prefix-aware `whatsappUrl()` in `TrialSessionsReport.vue:631-634`.
- **WR-02** (`normalizePhone` truncation corrupting ES numbers) — fixed via new, deliberately separate `sanitizePhoneForStorage` helper (`shared/phone.ts:34-39`); `normalizePhone` itself and its other callers are untouched, confirmed by grep.
- **WR-03** (schemas accepted zero-digit garbage) — fixed via `pattern: "(\\D*\\d){6,}"` on both `convertToTrialSchema.phone` and `reserveTrialSchema.phone`.
- **WR-04** (app phone input had no digit validation) — fixed: rule, `:disable`, and the `confirmTrialReserve` guard all now require ≥6 digits.
- **IN-01** (missing non-digit-phone test coverage) — fixed: negative `phone: "abc"` cases added to 3 test suites, all confirmed green in this session's standalone re-runs.
- **IN-02** (CSV column shift) — correctly left as a no-code-change heads-up, surfaced in the human verification section above.

All 6 test suites touched by this phase (98 tests total across `self-service-trial-e2e`, `convert-freemium-to-trial`, `scheduling-reserve-trial`, `scheduling-trial-eligibility`, `reports-trial-sessions`, `scheduling/trials`) were re-run standalone in this verification session (not merely trusted from the gate note) and are 100% green. `tsc --noEmit` is clean; `eslint` is clean on the touched admin/app files (one pre-existing, unrelated warning). The status is `human_needed` rather than `passed` solely because of genuine UAT-only concerns (WhatsApp link resolution on a real device, in-app dialog UX, navigation click-through, and real-world phone-format variety at the door) — no implementation gap is outstanding.

---

_Verified: 2026-07-16T17:08:25Z_
_Verifier: Claude (gsd-verifier)_
