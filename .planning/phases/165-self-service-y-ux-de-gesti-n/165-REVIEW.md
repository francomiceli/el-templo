---
phase: 165-self-service-y-ux-de-gesti-n
reviewed: 2026-07-16T04:10:05Z
depth: deep
files_reviewed: 22
files_reviewed_list:
  - el-templo-api/src/modules/shared/errors.ts
  - el-templo-api/src/modules/scheduling/trials-service.ts
  - el-templo-api/src/modules/scheduling/schemas.ts
  - el-templo-api/src/modules/scheduling/routes.ts
  - el-templo-api/src/modules/members/service.ts
  - el-templo-api/src/modules/members/schemas.ts
  - el-templo-api/src/modules/members/routes.ts
  - el-templo-api/src/modules/members/types.ts
  - el-templo-api/src/modules/reports/service.ts
  - el-templo-api/src/modules/reports/schemas.ts
  - el-templo-api/src/modules/reports/types.ts
  - el-templo-admin/src/components/reports/TrialSessionsReport.vue
  - el-templo-admin/src/composables/useReportsApi.ts
  - el-templo-app/src/composables/useSchedulingApi.ts
  - el-templo-app/src/pages/ReservasPage.vue
  - el-templo-api/test/self-service-trial-e2e.test.ts
  - el-templo-api/test/convert-freemium-to-trial.test.ts
  - el-templo-api/test/scheduling/trials.test.ts
  - el-templo-api/test/helpers.ts
  - el-templo-api/test/reports-trial-sessions.test.ts
  - el-templo-api/test/scheduling-reserve-trial.test.ts
  - el-templo-api/test/scheduling-trial-eligibility.test.ts
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 165: Code Review Report

**Reviewed:** 2026-07-16T04:10:05Z
**Depth:** deep
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 165 makes the phone number mandatory across every trial-session creation
path (self-service reserve, admin convert-to-trial, admin bookTrial), surfaces a
typed `PHONE_REQUIRED` code to the member app so it can prompt inline, adds a
`phoneRequired` flag to eligibility, and extends the trial-sessions report with a
phone column + wa.me link + "Ver ficha" action. The error-code taxonomy is clean
(400 typed `PHONE_REQUIRED` for self-service, 409 actionable `ConflictError` for
admin — exactly matching D-02/D-03/D-04), the E2E funnel test is strong (real DB
assertions on `users`, `user_status_history`, `bookings` and the report row, not
smoke), the local-date/skip-Sunday helper is sound, the app catch uses
`extractError` + `log.warn` (no `console.*`), and the reserve-trial /
eligibility schema changes are backward-compatible with the old app.

Two substantive problems dominate: (1) a **business-rule bypass** — a phone made
of non-digit characters passes the "not empty" guard, gets normalized to `""`,
is silently dropped, and the lead is promoted to `prueba` with **no phone** — the
exact state D-02/D-04 exist to forbid; and (2) the report's flagship wa.me link,
built from `normalizePhone`-stored numbers, will not resolve for AR mobiles (and
corrupts ES/Barcelona numbers), because `normalizePhone` keeps only the last 10
digits and strips the country/mobile prefix that wa.me requires.

## Critical Issues

### CR-01: Non-digit phone silently bypasses the mandatory-phone rule → lead promoted to `prueba` with NULL phone

**File:** `el-templo-api/src/modules/scheduling/trials-service.ts:245-251` (self-service) and `el-templo-api/src/modules/members/service.ts:1037-1045` (admin convert)

**Issue:** Both guards only check that the submitted string is non-empty after
`.trim()`, then run `normalizePhone` (which strips everything non-digit and keeps
the last 10). A payload like `phone: "abc"`, `"----"`, `"()"` or `"n/a"`:

- passes the guard `!user.phone && !input.phone?.trim()` → `true && !"abc"` → `false` → **no throw**;
- `normalizePhone("abc")` returns `""` (verified);
- the persist is gated `...(phoneToPersist ? { phone } : {})` → `""` is falsy → **phone is NOT written**.

Result: the user is flipped `freemium → prueba`, the trial booking is created,
and `users.phone` stays `NULL` — precisely the "SP sin teléfono" state that
LOCKED decisions D-02 and D-04 ("toda reserva de prueba exige teléfono") were
written to prevent. It is reachable from the member app (the input rule is only
`!!v?.trim()`, no digit requirement — see WR-04) and trivially via the API. The
existing sibling path `createTrialMember` (`service.ts:819-821`) does this
correctly: `if (!normalizedPhone) throw new ConflictError(...)`. The two new
guards diverge from that established pattern. No test covers a non-digit phone,
so CI is green on a broken invariant.

**Fix:** Normalize first, then reject on empty result — mirror `createTrialMember`:
```ts
// self-service (trials-service.ts)
const phoneFromBody = input.phone?.trim() ? normalizePhone(input.phone) : "";
if (!user.phone && !phoneFromBody) {
  throw new PhoneRequiredError(); // covers "" (garbage) AND missing
}
const phoneToPersist = !user.phone ? phoneFromBody : null;
```
```ts
// admin convert (members/service.ts) — same shape, throwing ConflictError
const phoneFromBody = input.phone?.trim() ? normalizePhone(input.phone) : "";
if (!user.phone && !phoneFromBody) {
  throw new ConflictError("Cargale el teléfono al lead antes de convertirlo a sesión de prueba");
}
const phone = !user.phone ? phoneFromBody : undefined;
```
Add a negative test (`phone: "abc"` → `PHONE_REQUIRED` / 409, status stays freemium, no booking).

## Warnings

### WR-01: wa.me link built from `normalizePhone`-stored numbers will not resolve (AR mobiles lose the `549` prefix)

**File:** `el-templo-admin/src/components/reports/TrialSessionsReport.vue:626-628` (link) fed by phone persisted via `normalizePhone` (`trials-service.ts:250`, `members/service.ts:1044`)

**Issue:** `normalizePhone` keeps only the **last 10 digits**. AR mobiles need
`54 9 …` in front for a valid `wa.me/<intl>` link. The phase's own E2E test
proves the loss: `+54 9 11 2233-4455` is stored as `1122334455`
(`self-service-trial-e2e.test.ts:416`), so the report renders
`https://wa.me/1122334455` — not a resolvable international number. D-06's entire
purpose is a working WhatsApp recovery link; as stored it is broken for every
lead captured through these paths. This is *consistent* with the pre-existing
`SesionesDePruebaDialog.openWhatsapp` (same `replace(/[^0-9]/g,'')` + no prefix),
so it is not a regression — but the phase adopted the broken pattern for its
headline feature without addressing it.

**Fix:** Prepend the branch country dialing prefix when building the link (AR →
`54`, adding the `9` for mobiles; ES → `34`), or store a wa.me-ready
international form alongside the deduplication key. At minimum, reuse a
country-aware helper (cf. `buildWhatsAppUrl(userStore.profile?.branchCountry, …)`
already used in the app's `ReservasPage.vue`) instead of the raw-digits pattern.

### WR-02: `normalizePhone` truncation corrupts Spanish (Barcelona / ES) phone numbers on a new write path

**File:** `el-templo-api/src/modules/scheduling/trials-service.ts:250` and `el-templo-api/src/modules/members/service.ts:1044`

**Issue:** `normalizePhone` slices to the last 10 digits — an AR-mobile
convention baked into the helper's own docstring. A Spanish number entered with
country code, `"+34 612 345 678"` (11 digits), normalizes to `"4612345678"`
(verified) — the leading `3` of `34` is dropped and the number is silently
corrupted; entered without country code it is 9 digits and survives, but is then
ambiguous with AR. The gym has a physical ES branch (Barcelona), and Phase 165
adds `reserveTrialSelfService` as a **new** write path that runs this
normalization on self-service leads — so ES trial leads can have their phone
mangled at persist time, and the resulting value is useless for wa.me (WR-01).
The `normalizePhone` helper itself is pre-existing, but the phase widens its blast
radius to a country where its assumption is wrong.

**Fix:** Make normalization country-aware (branch/user country → keep the correct
national significant number, don't blind-truncate to 10), or store the raw
sanitized string and use a separate normalized key only for the AR duplicate
check. Track as a milestone follow-up if a full fix is out of scope, but do not
leave ES leads silently corrupted.

### WR-03: `convertToTrial` `phone` and self-service `phone` accept any non-empty string ≤30 chars — no minimal format floor

**File:** `el-templo-api/src/modules/members/schemas.ts:356` and `el-templo-api/src/modules/scheduling/schemas.ts:875`

**Issue:** Both AJV schemas use `{ type: "string", minLength: 1, maxLength: 30 }`.
Combined with CR-01 this lets `"."`, `"-"`, `"x"` through the transport layer.
"Formato laxo" was an explicit D-04 decision (no strict E.164 validator), which is
fine — but "laxo" should still mean "at least one digit", otherwise the mandatory
requirement is decorative. A `pattern` requiring at least one digit closes the gap
at the edge instead of relying on the service guard alone.

**Fix:** Add `"pattern": ".*\\d.*"` (or `minLength` after digit-strip in the
service, per CR-01) so a phone with zero digits is rejected at the boundary in
both self-service and admin schemas.

### WR-04: Member-app phone input has no digit validation, only non-empty

**File:** `el-templo-app/src/pages/ReservasPage.vue:650` (rule) and `:663` (disable) and `:1511-1514` (guard)

**Issue:** The confirm guard, the `:disable` and the `q-input` rule all key on
`!!v?.trim()` / `.trim()` only. A user can type any non-digit character, satisfy
the button, and submit — feeding the CR-01 backend bypass. The `type="tel"` /
`inputmode="tel"` only hint the keyboard; they do not restrict input.

**Fix:** Strengthen the rule to require at least one digit, e.g.
`(v) => (/\d/.test(v ?? '')) || 'Ingresá un teléfono válido'`, and mirror it in
the `confirmTrialReserve` early-return guard and the `:disable` expression.

## Info

### IN-01: Coverage gap — no test asserts the phone must contain digits

**File:** `el-templo-api/test/self-service-trial-e2e.test.ts`, `el-templo-api/test/convert-freemium-to-trial.test.ts`

**Issue:** The happy-path and missing-phone negatives are covered, but the
"non-empty-yet-no-digits" case (the CR-01 trigger) is untested in both suites, so
the bypass ships green. The suites are otherwise strong (real DB assertions,
correct cleanup via `cleanAllTestData` in `beforeEach`, no booking on the
rejected path).

**Fix:** Add a negative for `phone: "abc"` in both suites once CR-01 is fixed,
asserting `PHONE_REQUIRED`/409, status unchanged, no booking, phone still NULL.

### IN-02: CSV column insertion is correct but downstream consumers of fixed-position parsing should be re-checked

**File:** `el-templo-api/src/modules/reports/service.ts:1644-1680`

**Issue:** "Teléfono" is inserted as the 2nd header and the matching `row.phone ?? ""`
cell is inserted at the same index, so header/row stay aligned (verified) and the
164 filter/order logic (which operates on typed rows, not CSV positions) is
untouched. This is a heads-up, not a defect: any external script that reads the SP
CSV by fixed column index (e.g. a Nacho spreadsheet import) now sees every column
after "Lead" shifted right by one.

**Fix:** None required in code. Flag in HUMAN-UAT so any manual CSV consumer is
told the column layout changed.

---

_Reviewed: 2026-07-16T04:10:05Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
