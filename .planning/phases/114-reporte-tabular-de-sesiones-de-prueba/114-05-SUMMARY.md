---
phase: 114
plan: 05
subsystem: api/reports
tags: [reports, trial-sessions, leads, csv-export, d-44, country-scope]
requires:
  - users.lead_status / users.lead_notes / users.created_by columns (Plan 01)
  - createTrialMember sets lead_status='en_seguimiento' + createdBy (Plan 02)
  - Subscription conversion hook flips lead_status='cerrado' (Plan 03)
  - PATCH /api/admin/leads/:userId mutates leadStatus/leadNotes (Plan 04)
provides:
  - GET /api/admin/reports/trial-sessions (paginated JSON)
  - GET /api/admin/reports/trial-sessions/export (CSV, BOM + UTF-8)
  - TrialSessionsFilters / TrialSessionsRow / TrialSessionsReport types
  - ReportsService.getTrialSessionsReport + exportTrialSessions
affects:
  - el-templo-api/src/modules/reports/types.ts
  - el-templo-api/src/modules/reports/schemas.ts
  - el-templo-api/src/modules/reports/service.ts
  - el-templo-api/src/modules/reports/routes.ts
  - el-templo-api/test/reports-trial-sessions.test.ts
tech-stack:
  added:
    - none (no new packages)
  patterns:
    - Derived-table subquery picks the latest non-cancelado trial per user
      (MAX(id) GROUP BY member_id) — one row per LEAD, not per booking
    - Raw `sql\`\`` template with explicit AS aliases (mirrors
      getTrialConversionReport precedent — no drizzle `alias()` here)
    - Two-query pagination (count + page) sharing the same derived table
      so `total` reflects deduplicated leads
    - Local inline search predicate against the `u.` alias (the shared
      buildMemberNameSearchCondition references the un-aliased
      `users.first_name` which conflicts with our `users AS u` / `users AS
      creator` self-join)
    - BOM via the SIX-character JS escape `<U+FEFF>` — never the literal
      invisible byte (plan invisible-character policy)
    - Route-layer D-44 silent strip (request.user.role !== "owner" → drop
      gestionaUserId from filters with request.log.warn, no 403)
key-files:
  created:
    - el-templo-api/test/reports-trial-sessions.test.ts
  modified:
    - el-templo-api/src/modules/reports/types.ts
    - el-templo-api/src/modules/reports/schemas.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/routes.ts
decisions:
  - "D-03 / D-42 / D-43 implemented: one row per lead via a `latest_trial`
    derived subquery selecting MAX(id) grouped by member_id, restricted to
    non-cancelado trial bookings."
  - "D-40 implemented at the SQL level: `u.converted_at IS NULL AND
    DATEDIFF(CURDATE(), b.booking_date) >= ${val}`. Because the
    representative trial is already collapsed to one booking per user, the
    per-user vs per-row ambiguity is resolved automatically — DATEDIFF
    operates on the single chosen booking, no MIN() needed at this layer."
  - "D-44 silent-ignore at the route layer: gestionaUserId is stripped from
    the filters when request.user.role !== 'owner'. A request.log.warn is
    emitted for observability. NO 403 — silently behaving as if the filter
    were absent avoids leaking the existence of an owner-only filter."
  - "Pagination strategy: two queries (count + page), same derived-table
    subquery in both. Mirrors getChargeHistory; rejected COUNT(*) OVER ()
    because the codebase precedent is two-query."
  - "MySQL form: derived table (inline subquery) rather than CTE — matches
    getTrialConversionReport style and works on 5.7 / 8.x."
  - "CSV hard cap: 10000 rows, hard-coded inside exportTrialSessions
    (T-114-05-03). Not configurable in this plan; promote to env var if a
    future plan requires."
  - "Spanish header line uses literal accented characters (Asistió, Mañana,
    Sí) and CRLF line endings (RFC 4180 / Excel-friendly)."
metrics:
  tasks_completed: 3
  files_created: 1
  files_modified: 4
  tests_added: 16
  tests_passing: 16
  completed_date: 2026-05-12
---

# Phase 114 Plan 05: Trial Sessions Report — service + endpoints Summary

Ships the data path the admin tabular report (Plan 06) will consume:
`GET /api/admin/reports/trial-sessions` (paginated JSON) and
`GET /api/admin/reports/trial-sessions/export` (CSV with UTF-8 BOM). The
query is driven by a `latest_trial` derived-table subquery that picks the
single latest non-cancelado trial booking per user (D-03 / D-42 / D-43) so
each lead appears exactly once. D-08 attended derivation runs in JS over a
single LEFT JOIN; D-24 country scope mirrors getTrialConversionReport; D-44
is enforced at the route layer with a silent strip for non-owners.

## Tasks Completed

| Task | Name                                           | Commit   | Files                                                                                                                                        |
| ---- | ---------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | TrialSessions types + Fastify schemas          | 31dd889f | el-templo-api/src/modules/reports/types.ts, el-templo-api/src/modules/reports/schemas.ts                                                     |
| T2   | ReportsService.getTrialSessionsReport + export | 06be3228 | el-templo-api/src/modules/reports/service.ts                                                                                                 |
| T3   | Routes + integration tests                     | 56f696a3 | el-templo-api/src/modules/reports/routes.ts, el-templo-api/src/modules/reports/service.ts, el-templo-api/test/reports-trial-sessions.test.ts |

## Output Directives (per plan `<output>` block)

**1. One-row-per-lead confirmation (D-03 / D-42).**

The driver of the SELECT is an inline derived table:

```sql
SELECT b2.member_id, MAX(b2.id) AS booking_id
FROM bookings b2
WHERE b2.is_trial = 1 AND b2.booking_status <> 'cancelado'
GROUP BY b2.member_id
```

This collapses every user's trial-booking history down to exactly one
representative booking — the latest non-cancelado one (`MAX(id)` is the
auto-increment tiebreaker; on ties of booking_date the larger id is the
most recently inserted, which matches "most recent reactivation"). The
outer SELECT joins this table once to `bookings` so the response rows
expose booking-level fields (bookingDate, startTime, branchName, attended)
from the chosen booking. User-level fields (leadStatus, leadNotes,
createdBy, converted) come straight from the user row.

The count query uses the SAME derived table, so `total` reflects
deduplicated leads — not raw booking rows. Tests 3 and 4 cover the
cancelled+active and multiple-active cases and verify the count.

**2. D-44 silent-ignore behaviour.**

Implemented in `buildTrialSessionsFilters()` at the bottom of
`reports/routes.ts`. When `request.user.role !== "owner"` AND
`query.gestionaUserId !== undefined`, the helper drops the value and emits
`request.log.warn({ userId, role, attemptedFilter }, "gestionaUserId
filter ignored: owner-only")`. The handler does NOT 403 — silently
behaving as if the filter were absent avoids leaking the existence of an
owner-only filter to non-owners. Test 15 asserts that a non-owner request
with `?gestionaUserId=...` returns the FULL unfiltered result set (not a
single-row response and not a 403).

**3. CSV cap.**

Hard-coded at 10000 rows inside `ReportsService.exportTrialSessions` (the
`HARD_CAP` const). Not configurable in this plan. T-114-05-03 mitigation
documented inline; promote to env-var if a future plan requires.

**4. Pagination strategy + MySQL form.**

Two separate queries (count + page), each using the same `latest_trial`
inline derived table. Chosen over `COUNT(*) OVER ()` because the existing
reports module uses the two-query form (see `getChargeHistory`). The
derived-table form is used rather than a CTE — matches the inline-subquery
style of `getTrialConversionReport` and works identically on MySQL 5.7
and 8.x.

**5. Test pass count.**

`pnpm test test/reports-trial-sessions.test.ts` → **16/16 tests passing**.
`pnpm test test/reports/` (regression) → 34/34 passing.

| #   | Scenario                                                                               | Result |
| --- | -------------------------------------------------------------------------------------- | ------ |
| 1   | Happy path — multiple leads return rows with correctly derived fields                  | PASS   |
| 2   | Cancelled-only lead excluded (D-43)                                                    | PASS   |
| 3   | One-row-per-lead: cancelled + active → 1 row from the active booking (D-42)            | PASS   |
| 4   | One-row-per-lead: multiple active → latest wins (D-42)                                 | PASS   |
| 5   | Country scope: non-owner AR sees AR rows only; non-owner ES sees ES rows only (D-24)   | PASS   |
| 6   | Branch filter narrows the row set                                                      | PASS   |
| 7   | dateFrom / dateTo restricts to representative bookings in range                        | PASS   |
| 8   | leadStatus multi-value (`?leadStatus=cerrado&leadStatus=perdido`)                      | PASS   |
| 9   | attended=true / false / pending filter (D-08 derivation)                               | PASS   |
| 10  | shift=TM / shift=TT                                                                    | PASS   |
| 11  | daysWithoutConvertingMin excludes converted leads (D-40)                               | PASS   |
| 12  | search by partial first/last name                                                      | PASS   |
| 13  | page + limit honored; total reflects deduplicated leads                                | PASS   |
| 14  | gestionaUserId owner-accepted (D-44)                                                   | PASS   |
| 15  | gestionaUserId silently stripped for non-owner; full unfiltered result returned (D-44) | PASS   |
| 16  | CSV export: BOM byte (0xFEFF) + Spanish header + DD/MM/YYYY + Mañana / No row contents | PASS   |

**6. `file -bi` UTF-8 sanity.**

```
$ file -bi el-templo-api/src/modules/reports/service.ts
text/x-java; charset=utf-8
```

(The `text/x-java` mimetype is `file`'s heuristic guess for the syntax —
TypeScript shares enough lexical structure with Java that `file` mis-detects.
The `charset=utf-8` part is what we care about: the source is plain UTF-8
with no BOM mid-file, no Latin-1 contamination from the accented Spanish
header strings, and no stray U+FEFF bytes embedded in the source itself.
The literal U+FEFF only appears at runtime in the CSV response body via the
SIX-character JS escape `"<U+FEFF>"` in `routes.ts`.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Drizzle enum column names: `booking_status` / `attendance_status`, not `status`**

- **Found during:** Task 3 (first integration test run; all 16 tests returned 500).
- **Issue:** The bookings schema declares its status field via
  `mysqlEnum("booking_status", [...])`, which makes the DB column name
  `booking_status` rather than `status`. Same for attendance (`attendance_status`).
  Existing code in the project always references these via Drizzle's
  `schema.bookings.status` / `schema.attendance.status` which compile to the
  correct DB column name automatically. Our hand-rolled raw SQL in the new
  `latest_trial` derived table and the LEFT JOIN predicate used bare
  `b2.status` and `a.status`, which 500ed with
  `ER_BAD_FIELD_ERROR: Unknown column 'b2.status' in 'where clause'`.
- **Fix:** Updated four occurrences in `service.ts` to use the actual DB
  column names: `b2.booking_status` (×2 in the derived-table predicate) and
  `a.attendance_status` (×2 in the LEFT JOIN ON-clause).
- **Files modified:** `el-templo-api/src/modules/reports/service.ts`
- **Commit:** `56f696a3` (bundled with T3)

**2. [Rule 1 — Bug] Search predicate column alias conflict**

- **Found during:** Task 3 (test 12 still 500ed after the column-name fix).
- **Issue:** The shared `buildMemberNameSearchCondition` helper emits
  `users.first_name` bare-column references via Drizzle's `schema.users.firstName`.
  Our trial-sessions query aliases `users AS u` for the lead and `users AS creator`
  for the self-join — so the bare `users.first_name` is ambiguous (and in fact
  there is no un-aliased `users` table in the FROM clause). MySQL emitted
  `Unknown column 'users.first_name' in 'where clause'`.
- **Fix:** Inlined a local token-AND predicate against the `u.` alias inside
  `buildTrialSessionsConditions`. Preserves the same multi-token-AND search
  semantics (firstName / lastName / concatenated full name) without DNI
  (consistent with the shared helper's `includeDni: false` flag we were
  originally passing).
- **Files modified:** `el-templo-api/src/modules/reports/service.ts`
- **Commit:** `56f696a3` (bundled with T3)

Both fixes are clean Rule-1 bugs (broken SQL in code that I just wrote, not
pre-existing). The plan's invariants and threat model are unchanged.

### Auth gates encountered

None.

## D-40 Per-User vs Per-Row Note (per plan `<output>`)

The plan called out a potential per-user vs per-row ambiguity for the
`daysWithoutConvertingMin` filter: if the report exposed multiple bookings
per lead, the question "is this lead `daysWithoutConvertingMin` days old?"
could be answered as min-of-bookings, max-of-bookings, or
chosen-booking. The CTE / derived-table pattern resolves this
automatically: the report is collapsed to one row per lead via the
`latest_trial` subquery (D-03 / D-42 / D-43) BEFORE this predicate runs,
so `DATEDIFF(CURDATE(), b.booking_date)` operates on a single
representative booking per user. There is no aggregation choice to make —
the filter evaluates "days since the lead's latest non-cancelado trial,
provided they haven't converted". Test 11 verifies this against three
seeded leads (one not-converted with old trial, one converted with old
trial, one not-converted with recent trial) and confirms only the
not-converted-old-trial lead survives `?daysWithoutConvertingMin=7`.

## Threat Model Verification (per plan's `<threat_model>`)

| Threat ID   | Mitigation                                                                                                                    | Status                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| T-114-05-01 | attachCountryScope + `(br.country = ${country} OR br.is_virtual = 1)` predicate                                               | MITIGATED (test 5)        |
| T-114-05-02 | onRequest CAJA_ROLES gate inherited from the parent reports plugin                                                            | MITIGATED                 |
| T-114-05-03 | Hard cap 10000 rows in `exportTrialSessions`                                                                                  | MITIGATED                 |
| T-114-05-04 | All filter values bound via drizzle template-tag `${val}` parameterization; no `sql.raw`, no string concat. Verified via grep | MITIGATED                 |
| T-114-05-05 | LEFT JOIN on `(member_id, schedule_id, session_date)` — same contract as Phase 102-07                                         | ACCEPTED                  |
| T-114-05-06 | D-44 route-layer silent strip + warn log. Tested by Test 15                                                                   | MITIGATED (test verifies) |

## Downstream Unblocked

- **Plan 114-06 (UI):** The admin Reportes tab can now wire the listing +
  export endpoints. The `createdBy.name` field is materialised
  server-side; inline-editing of `leadStatus` / `leadNotes` uses the
  PATCH endpoint shipped by Plan 04. The owner-only "Gestiona" filter
  has a populated `?gestionaUserId=` parameter on the server (silently
  ignored for non-owners).

## Self-Check: PASSED

- File `el-templo-api/src/modules/reports/types.ts` contains
  `TrialSessionsFilters`, `TrialSessionsRow`, `TrialSessionsReport`,
  `AttendedFilter`, `ShiftFilter`, `LeadStatusValue` exports (verified via grep).
- File `el-templo-api/src/modules/reports/schemas.ts` exports
  `trialSessionsReportSchema` and `trialSessionsExportSchema`.
- File `el-templo-api/src/modules/reports/service.ts` contains
  `async getTrialSessionsReport` and `async exportTrialSessions` methods
  inside `ReportsService` (verified via grep). `file -bi` reports
  `charset=utf-8`.
- File `el-templo-api/src/modules/reports/routes.ts` registers both
  `/trial-sessions` and `/trial-sessions/export`. Contains
  `"gestionaUserId filter ignored: owner-only"` warn message. Contains
  `\\uFEFF` JS-escape (NOT the literal byte) on lines 684 and 693.
- File `el-templo-api/test/reports-trial-sessions.test.ts` exists with
  16 `it(...)` blocks; all 16 pass.
- Commits `31dd889f`, `06be3228`, `56f696a3` present in `git log
--oneline -5`.
- `pnpm exec tsc --noEmit` exits 0 (clean).
- `pnpm test test/reports-trial-sessions.test.ts` exits 0 with 16
  passing.
- `pnpm test test/reports/` regression: 34/34 pass.
