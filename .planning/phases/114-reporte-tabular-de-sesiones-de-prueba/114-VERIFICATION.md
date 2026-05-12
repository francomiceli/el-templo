---
phase: 114-reporte-tabular-de-sesiones-de-prueba
verified: 2026-05-12
status: passed
score: 7/7 must-haves verified
re_verification: false
human_verification:
  - test: "End-to-end browser walkthrough — owner role"
    expected: "Log in as owner → /reportes?tab=sesiones-de-prueba → 11 columns render in correct order; Gestiona filter visible; all 8 filters work; inline edit chip+textarea persists; CSV exports + opens in Excel without mojibake."
    why_human: "Visual + browser/runtime behavior; requires running dev server. Plan 06 T4 + Plan 07 T3 explicitly deferred to human verification."
  - test: "End-to-end browser walkthrough — admin (non-owner) role"
    expected: "Gestiona filter NOT in DOM; hand-crafted ?gestionaUserId=N URL still returns full unfiltered result set (D-44 silent strip)."
    why_human: "Defense-in-depth verification of UI gate; integration test 15 covers the server-side strip but only a browser run confirms isOwner v-if behavior."
  - test: "AlumnoDetailPage Datos de Lead block"
    expected: "User with status='prueba' shows block (select + textarea + 'Gestiona: <name>'); user with status='activo' hides block; edits persist via PATCH; D-34 invariant — manual leadStatus='cerrado' does NOT overwrite existing leadNotes."
    why_human: "Plan 07 T3 explicitly marked checkpoint:human-verify. Static checks pass."
---

# Phase 114: Reporte tabular de sesiones de prueba — Verification Report

**Phase Goal:** Replace the manual `.docs/Sesiones de Prueba - SP - Base de datos.csv` planilla with an auto-populated, paginated, filterable, CSV-exportable trial-sessions report in admin/Reportes. 11 columns from existing DB data plus 3 new soft fields (lead_status, lead_notes, users.created_by) plus auto-close-on-conversion hook plus admin UI tab + AlumnoDetailPage "Datos de Lead" block.

**Verified:** 2026-05-12
**Status:** passed (with 3 human-verification items deferred to live browser run)
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                                           | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Schema: `users.lead_status`, `users.lead_notes`, `users.created_by` exist with FK SET NULL + 2 indexes; migration 0121 tracked.                                                                                                 | ✓ VERIFIED | `el-templo-api/src/db/schema/users.ts:60,116,119,126,145-146`; `el-templo-api/src/db/migrations/0121_users_lead_fields.sql` (4 ALTER + 2 CREATE INDEX, comment safety honored — no `;` in `--` lines); Plan 01 SUMMARY confirms `_migrations` row applied.                                                                                                                                                                                                                                         |
| 2   | Trial creation auto-stamps `lead_status='en_seguimiento'` + `created_by=request.user.userId`.                                                                                                                                   | ✓ VERIFIED | `service.ts:559-560` (literal `"en_seguimiento" as const, createdBy: input.createdBy`); `routes.ts:599-602` injects `createdBy: request.user.userId`; spoofing guard via `additionalProperties:false` + Fastify default removeAdditional; 10/10 tests pass in `members-trial.test.ts`.                                                                                                                                                                                                             |
| 3   | Conversion hook auto-sets `lead_status='cerrado'` and prefills empty `lead_notes` with plan name, transactionally with the existing `converted_at` write.                                                                       | ✓ VERIFIED | `subscriptions/service.ts:4124-4165` — two CASE branches inside the existing single-statement UPDATE in `recomputeUserStatus`; SET ordering deliberately status→lead_status→lead_notes→converted_at to guard MySQL left-to-right evaluation; 5/5 hook tests pass including idempotence regression.                                                                                                                                                                                                 |
| 4   | `PATCH /api/admin/leads/:userId` mounted, branch-scoped, CAJA_ROLES-gated, edits leadStatus + leadNotes; 409 if not `status='prueba'`; D-34 invariant respected (manual edit never auto-touches lead_notes).                    | ✓ VERIFIED | `leads-routes.ts` registered at `/api/admin/leads` (`app.ts:20,118`); 10/10 tests pass in `admin-leads-patch.test.ts` covering 200/400/403 (with `code:BRANCH_OUT_OF_SCOPE` in response schema)/404/409 + D-34 regression.                                                                                                                                                                                                                                                                         |
| 5   | `GET /api/admin/reports/trial-sessions` — paginated, one-row-per-lead (D-03/D-42/D-43), all filters incl. D-44 owner-only `gestionaUserId` with silent strip; CSV export with UTF-8 BOM + 10000 cap.                            | ✓ VERIFIED | `reports/service.ts:1130,1149-1151,1207-1209,1269-1275` — `latest_trial` derived subquery via `MAX(b2.id) ... WHERE is_trial=1 AND booking_status<>'cancelado'`; `routes.ts:653,676,698` registers JSON + CSV routes, emits BOM via `"\uFEFF" + csv`; `buildTrialSessionsFilters` at `routes.ts:812-822` silently strips `gestionaUserId` for non-owners with `request.log.warn`; 16/16 tests pass.                                                                                                |
| 6   | Admin UI: "Sesiones de Prueba" tab in Reportes; 11 columns in correct order; inline edit (chip + textarea); 8 filters with Gestiona owner-only; CSV export; AlumnoDetailPage shows "Datos de Lead" only when `status='prueba'`. | ✓ VERIFIED | `ReportesPage.vue:64,674-675,705,874` (tab/panel/import/VALID_TABS); `TrialSessionsReport.vue` — 11 column labels match D-01 order exactly (lines 423-494: Lead/Fecha/Hora/Sucursal/Asistió/Estado del Lead/Gestiona/Comentarios/Turno/Periodo/Semana); `isOwner` computed (line 266) gates Gestiona `<div v-if="isOwner">` (line 75); `AlumnoDetailPage.vue:163` `<q-card v-if="memberProfile.status === 'prueba'">` with select+textarea+Gestiona caption + `leadDraft` revert-on-error pattern. |
| 7   | Conventions: no console.\* in new code; no `any` types in new code; API tsc clean; relevant tests pass.                                                                                                                         | ✓ VERIFIED | `grep console.` on new files → 0 matches; `grep ':\s*any\b'` on new files → 0 matches; `cd el-templo-api && pnpm exec tsc --noEmit` → exit 0; `cd el-templo-admin && pnpm exec tsc --noEmit` → only the pre-existing `session-pdf-builder.ts` baseline errors (documented in Plan 06+07 SUMMARYs as unchanged); 31/31 Phase 114 tests pass (`admin-leads-patch` 10 + `subscriptions-conversion-hook` 5 + `reports-trial-sessions` 16).                                                             |

**Score:** 7/7 truths verified.

### Required Artifacts

| Artifact                                                         | Expected                                                                                                    | Status     | Details                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/users.ts`                           | leadStatusEnum + 3 columns + 2 indexes                                                                      | ✓ VERIFIED | lines 60, 116, 119, 126, 145-146. Self-ref via `AnyMySqlColumn` callback.                                                                          |
| `el-templo-api/src/db/migrations/0121_users_lead_fields.sql`     | 4 ALTER + 2 CREATE INDEX, comment safety                                                                    | ✓ VERIFIED | Inspected; no `;` inside `--` lines; FK named `users_created_by_users_id_fk` for db:generate convergence.                                          |
| `el-templo-api/src/modules/members/service.ts`                   | createTrialMember sets lead_status + createdBy; updateLead exists; getMemberById extended with creator JOIN | ✓ VERIFIED | createTrialMember lines 512-560; updateLead lines 607-651; getMemberById lines 389-427 with `leftJoin(creator, ...)` materializing createdBy.name. |
| `el-templo-api/src/modules/members/leads-routes.ts`              | PATCH /:userId plugin, CAJA_ROLES, canAccessBranch                                                          | ✓ VERIFIED | Exists, exports `leadsRoutes`, registered at `/api/admin/leads`.                                                                                   |
| `el-templo-api/src/modules/subscriptions/service.ts`             | Conversion hook with CASE for lead_status + lead_notes inside recomputeUserStatus                           | ✓ VERIFIED | Lines 4124-4165; SET ordering documented; correlated subquery extracts plan name.                                                                  |
| `el-templo-api/src/modules/reports/service.ts`                   | getTrialSessionsReport + exportTrialSessions with latest_trial derived table                                | ✓ VERIFIED | Lines 1130, 1149-1151, 1207-1209, 1269-1275; HARD_CAP=10000.                                                                                       |
| `el-templo-api/src/modules/reports/routes.ts`                    | GET /trial-sessions + /trial-sessions/export; D-44 silent strip                                             | ✓ VERIFIED | Lines 653, 676, 689-698 (BOM via `"\uFEFF"` JS escape), 812-822 (silent strip with `request.log.warn`).                                            |
| `el-templo-api/src/modules/reports/schemas.ts`                   | trialSessionsReportSchema + trialSessionsExportSchema                                                       | ✓ VERIFIED | Exports present (referenced from routes.ts route definitions).                                                                                     |
| `el-templo-admin/src/components/reports/TrialSessionsReport.vue` | 11 columns, inline edit, 8 filters, CSV export, owner-only Gestiona                                         | ✓ VERIFIED | 11 column labels at lines 423-494 match D-01 exactly; row-key="userId" (line 134); `v-if="isOwner"` wraps Gestiona (line 75).                      |
| `el-templo-admin/src/pages/ReportesPage.vue`                     | New tab + panel wired                                                                                       | ✓ VERIFIED | Tab at line 64, panel at lines 674-675, import at 705, VALID_TABS entry at 874.                                                                    |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue`                 | "Datos de Lead" q-card v-if status='prueba'                                                                 | ✓ VERIFIED | Lines 156-180 q-card with q-select + textarea + Gestiona caption; leadDraft state at lines 547-565; revert-on-error at 583, 607.                   |
| `el-templo-admin/src/composables/useReportsApi.ts`               | fetchTrialSessions + exportTrialSessions                                                                    | ✓ VERIFIED | Called from `TrialSessionsReport.vue:530, 665`.                                                                                                    |
| `el-templo-admin/src/composables/useMembersApi.ts`               | updateLead                                                                                                  | ✓ VERIFIED | Called from `TrialSessionsReport.vue:581,626` and `AlumnoDetailPage.vue:575,601`.                                                                  |
| `el-templo-admin/src/composables/useUsersApi.ts`                 | fetchStaff                                                                                                  | ✓ VERIFIED | Called from `TrialSessionsReport.vue:392`.                                                                                                         |

### Key Link Verification

| From                              | To                                   | Via                                             | Status | Details                                                                                                                                                                  |
| --------------------------------- | ------------------------------------ | ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /admin/members/trial` route | `createTrialMember` service          | `request.user.userId → createdBy`               | WIRED  | `routes.ts:600-602` injects JWT id; service inserts at line 560. Test 10 in `members-trial.test.ts` verifies DB write.                                                   |
| `recomputeUserStatus` hook        | `users.lead_status / lead_notes`     | single-statement UPDATE in `db.transaction(tx)` | WIRED  | 5/5 conversion hook tests verify the gate fires on first conversion and is idempotent on re-runs.                                                                        |
| Admin `TrialSessionsReport.vue`   | `GET /admin/reports/trial-sessions`  | `useReportsApi.fetchTrialSessions`              | WIRED  | Line 530 awaits + populates rows ref.                                                                                                                                    |
| Admin inline edit                 | `PATCH /admin/leads/:userId`         | `useMembersApi.updateLead`                      | WIRED  | Lines 581 (status), 626 (notes); optimistic UI with revert on error.                                                                                                     |
| `AlumnoDetailPage` lead edits     | `PATCH /admin/leads/:userId`         | `useMembersApi.updateLead`                      | WIRED  | Lines 575 (status), 601 (notes); leadDraft revert pattern lines 583, 607.                                                                                                |
| `isOwner` flag                    | Gestiona filter visibility + payload | `authStore.user?.role === 'owner'`              | WIRED  | UI v-if at line 75; payload gate at line 514 (`isOwner.value && filters.gestionaUserId !== null`). Server-side strip at `reports/routes.ts:812-822` is defense in depth. |
| CSV export                        | UTF-8 BOM + 10000 cap                | `"\uFEFF" + csv` JS-escape                      | WIRED  | `routes.ts:689-698`; `service.ts:1271` HARD_CAP. Test 16 confirms BOM byte + header.                                                                                     |

### Data-Flow Trace (Level 4)

| Artifact                               | Data Variable                                      | Source                                                                                                                                        | Produces Real Data                                                                                                                                           | Status    |
| -------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `TrialSessionsReport.vue`              | `rows`, `total`                                    | `reportsApi.fetchTrialSessions` → `GET /trial-sessions` → `getTrialSessionsReport` (real Drizzle SELECT with `latest_trial` derived subquery) | Yes — JOINs `bookings`, `attendance`, `schedules`, `branches`, `users` (self-join on creator); 16 integration tests assert real DB data flows end-to-end.    | ✓ FLOWING |
| `AlumnoDetailPage.vue` "Datos de Lead" | `memberProfile.leadStatus / leadNotes / createdBy` | `getMemberById` with creator self-JOIN + `memberProfileSchema` declaring the 3 fields                                                         | Yes — Plan 07 T1 explicitly extended both the SELECT and the Fastify serializer; test in `members-trial.test.ts` asserts wire payload contains the 3 fields. | ✓ FLOWING |
| Inline-edit chip + textarea            | `row.leadStatus / leadNotes`                       | Reactive update from snapshot returned by PATCH                                                                                               | Yes — `updateLead` returns `LeadSnapshot` including server-echoed `leadStatusEffective` so optimistic-revert is correct.                                     | ✓ FLOWING |
| CSV export                             | response body                                      | Streaming string from `exportTrialSessions` (same query, no pagination, +BOM)                                                                 | Yes — Test 16 reads response body and confirms first byte = U+FEFF + Spanish header.                                                                         | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                          | Command                                                                                                                   | Result                                                                                       | Status                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| New endpoint tests pass           | `pnpm test test/admin-leads-patch.test.ts test/subscriptions-conversion-hook.test.ts test/reports-trial-sessions.test.ts` | 31/31 passed in ~114s                                                                        | ✓ PASS                          |
| API tsc clean                     | `cd el-templo-api && pnpm exec tsc --noEmit`                                                                              | exit 0                                                                                       | ✓ PASS                          |
| Admin tsc — no NEW errors         | `cd el-templo-admin && pnpm exec tsc --noEmit`                                                                            | Only pre-existing `session-pdf-builder.ts` baseline (documented Plan 06+07); zero new errors | ✓ PASS                          |
| 11 column labels in correct order | `grep -nE "label:.*'(Lead\|Fecha\|...)'"`                                                                                 | 11 hits in D-01 order                                                                        | ✓ PASS                          |
| No console.\* in new code         | grep new files                                                                                                            | 0 matches                                                                                    | ✓ PASS                          |
| No `any` types in new code        | grep `:\s*any\b`                                                                                                          | 0 matches                                                                                    | ✓ PASS                          |
| Browser flow (owner + non-owner)  | requires running dev server                                                                                               | n/a                                                                                          | ? SKIP — see human verification |

### Requirements Coverage

No `requirements:` field declared in any of the 7 plan frontmatters; CONTEXT lockings (D-01..D-44) are the source of truth. Each D-XX maps to an Observable Truth above:

- D-01/D-02 → Truth 6 (11 columns, correct order, no Rep/Profe columns)
- D-03/D-42/D-43 → Truth 5 (one-row-per-lead via `latest_trial` derived table)
- D-04..D-14 → Truths 5+6 (column derivations in SELECT + JS attendance derivation + UI formatting)
- D-15..D-20 → Truth 1 (schema + migration + indexes, no backfill)
- D-21..D-26 → Truth 5 (paginated JSON endpoint + filters + CSV export)
- D-27..D-30 → Truth 4 (PATCH endpoint + validations + branch scope)
- D-31..D-34 → Truths 2+3 (create-trial hook + conversion hook + D-34 invariant)
- D-35..D-39 → Truth 6 (Admin UI tab + inline edits + Gestiona owner-only + Datos de Lead block)
- D-40 → Truth 5 (daysWithoutConvertingMin filter, applied to representative booking)
- D-41/D-43 → Truth 5 (booking-driven, cancelled-only leads excluded)
- D-44 → Truths 5+6 (silent strip server-side + v-if owner UI)

### Anti-Patterns Found

None. Specifically:

- No `console.*` calls in any of the new files (compliance with Pino/createLogger convention).
- No `any` types in new code.
- No empty handlers or `return null` stubs.
- No hardcoded empty data arrays (server returns real rows from real JOIN; UI state is bound to API response).
- Migrations comply with project pattern: no `;` inside `--` comments (Plan 01 explicitly documents this; verified in 0121 file).

### Human Verification Required

Three items deferred (already documented in Plan 06 T4 + Plan 07 T3 as `checkpoint:human-verify`):

1. **Owner-role browser walkthrough** — log in as owner → /reportes?tab=sesiones-de-prueba → verify all 11 columns + 8 filters + inline edit + CSV download in Excel.
2. **Admin-role (non-owner) browser walkthrough** — confirm Gestiona filter absent in DOM; confirm hand-crafted `?gestionaUserId=N` returns unfiltered set (server-side strip).
3. **AlumnoDetailPage Datos de Lead** — confirm block visible only for `status='prueba'`, edits persist, D-34 invariant holds.

All three are runtime/visual checks; all server-side equivalents are covered by integration tests.

### Gaps Summary

No actionable gaps. The phase delivers the full goal: every column, filter, hook, endpoint, and UI surface described in CONTEXT (D-01 through D-44) exists, is wired, and produces real data flowing through real JOINs. End-to-end story is intact:

1. Admin clicks "Nuevo en prueba" → `POST /admin/members/trial` inserts user with `lead_status='en_seguimiento'` and `created_by=<admin id>`. (Truth 2)
2. Admin opens Reportes → Sesiones de Prueba → sees the lead in row 1 with all 11 columns auto-derived. (Truths 5+6)
3. Admin clicks the Estado chip → selects "Perdido" → PATCH persists; `lead_notes` left untouched (D-34). (Truth 4)
4. Admin clicks Comentarios → types a note → blur → PATCH persists. (Truth 4)
5. Later, admin assigns a paid plan → `recomputeUserStatus` flips `lead_status='cerrado'` and prefills `lead_notes='<plan.name>'` IFF empty. (Truth 3)
6. Admin clicks "Exportar CSV" → downloads `sesiones-de-prueba-YYYY-MM-DD.csv` with BOM + Spanish header — matches the CSV planilla shape. (Truth 5)

The planilla replacement is structurally complete. The 3 human-verification items are visual/runtime confirmations; the autonomous run cannot perform them but all underlying assertions are covered by the 31 integration tests.

---

_Verified: 2026-05-12_
_Verifier: Claude (gsd-verifier)_
