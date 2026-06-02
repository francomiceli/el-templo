---
phase: 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
reviewed: 2026-06-02T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - el-templo-api/src/modules/campaigns/token-service.ts
  - el-templo-api/src/modules/campaigns/tracking-service.ts
  - el-templo-api/src/modules/campaigns/service.ts
  - el-templo-api/src/modules/campaigns/routes.ts
  - el-templo-api/src/modules/campaigns/schemas.ts
  - el-templo-api/src/modules/campaigns/templates.ts
  - el-templo-api/src/modules/email/service.ts
  - el-templo-api/src/modules/scheduling/trials-service.ts
  - el-templo-api/src/modules/scheduling/booking-service.ts
  - el-templo-api/src/modules/scheduling/routes.ts
  - el-templo-api/src/modules/scheduling/schemas.ts
  - el-templo-api/src/db/schema/campaigns.ts
  - el-templo-admin/src/pages/CampaniasPage.vue
  - el-templo-app/src/pages/ReservasPage.vue
  - el-templo-app/src/boot/deep-links.ts
findings:
  critical: 3
  warning: 6
  info: 4
  total: 13
status: issues_found
---

# Phase 119: Code Review Report

**Reviewed:** 2026-06-02
**Depth:** standard
**Files Reviewed:** 16 (booking-service.ts read as a called dependency, not in the explicit file list)
**Status:** issues_found

## Summary

This phase ships a freemium trial campaign with a public unauthenticated tracking surface and a state-mutating self-service trial reservation. I traced the HMAC token, the three public endpoints, the mass-send pipeline, the email template, and the `reserveTrialSelfService` transaction.

The security-sensitive surface mostly holds up: the open-redirect is genuinely closed by construction (host is hardcoded, the token goes into a query param, and `new URL(destination).host` is re-checked), HMAC sign/verify is correct, the token never authorizes (the trial path re-validates server state and rejects extra body fields), and template merge vars are HTML-escaped. Those are not findings.

However I found three blockers and several warnings. The most serious is a **data-integrity / branch-coherence bug in `reserveTrialSelfService`**: the chosen `branchId` is never checked against the `scheduleId`'s branch, so a freemium user can be promoted into one sede while their trial booking lands in another. Two more blockers concern the admin-entered email copy being silently discarded (the campaign body the admin types is never sent) and the HMAC token verification falling back to a non-constant-time comparison.

## Critical Issues

### CR-01: Trial reservation never checks that the schedule belongs to the chosen branch

**File:** `el-templo-api/src/modules/scheduling/trials-service.ts:188-248`
**Issue:** `reserveTrialSelfService` validates that `input.branchId` is a physical branch, then sets `users.branchId = input.branchId` (line 259) and books `input.scheduleId`. But the only date validation, `bookingService.validateTrialBookingDate(input.scheduleId, input.date)`, derives the branch/timezone/holiday from the _schedule's own_ branch — it never asserts `schedule.branchId === input.branchId`. The two inputs are independent and attacker-controllable (both are plain body fields). A freemium user can submit `branchId` = Sede A and `scheduleId` = a slot in Sede B: they get promoted to `prueba` with `branchId` = A, the holiday/timezone checks run against B, and the booking lands on B's slot. This is exactly the cross-sede coherence the admin path `bookTrial` explicitly guards against (`trials-service.ts:449`, "El alumno pertenece a otra sede"), missing here. Result: corrupted member/booking state, a trial that appears in the wrong sede's coach briefing, and a confirmation card (`ReservasPage` state 3) showing the wrong sede address.
**Fix:** Load the schedule's branch and assert it matches `input.branchId` before the transaction. Either fetch it directly, or have `validateTrialBookingDate` return the schedule's `branchId` and compare:

```ts
const scheduleBranchId = await this.bookingService.validateTrialBookingDate(
  input.scheduleId,
  input.date,
); // change signature to return scheduleRow.branchId
if (scheduleBranchId !== input.branchId) {
  throw new ConflictError(
    "El horario elegido no pertenece a la sede seleccionada",
  );
}
```

### CR-02: Admin-entered email copy (headline/subheadline/body) is collected, validated, then silently discarded — the campaign sends an empty body

**File:** `el-templo-api/src/modules/campaigns/service.ts:535-554` (and `create` at 129-163, `schemas.ts:31-40`, `CampaniasPage.vue:471-479`)
**Issue:** The create form requires and sends `copySlots: { headline, subheadline, body }`, and the schema validates them. But `CampaignService.create` never persists them — the `campaigns` table has no `copySlots`/`body` columns (`db/schema/campaigns.ts:36-49`), and `create` only stores `name/subject/country`. At send time, `buildTemplateVars` hard-codes `headline: campaign.subject`, `subheadline: ""`, `body: ""` (lines 543-545). The result: tomorrow's mass email goes out with the headline set to the subject line, **no sub-headline and no body copy at all** — `bodyToParagraphs("")` renders nothing. The admin will believe the copy they typed is in the email; it is not. For a one-shot irreversible mass send, this is a shipping blocker.
**Fix:** Persist the copy slots on the `campaigns` row (add `headline`, `subheadline`, `body` columns via a Drizzle migration) and read them in `buildTemplateVars`:

```ts
return {
  headline: campaign.headline ?? campaign.subject,
  subheadline: campaign.subheadline ?? "",
  body: campaign.body ?? "",
  ...
};
```

Also persist `heroImageUrl` (currently accepted, validated, and dropped the same way — the template hard-codes `EMAIL_IMAGE_BASE/hero.png`).

### CR-03: HMAC token verification uses a non-constant-time string comparison

**File:** `el-templo-api/src/modules/campaigns/token-service.ts:98-99`
**Issue:** The comment claims "Constant-time-ish compare" but the code is `providedSignature !== expectedSignature`, a plain JS string comparison that short-circuits on the first differing byte. The module imports only `createHmac` and never uses `crypto.timingSafeEqual`. For a signed-token verifier this is a timing-oracle: an attacker who can submit many `/track/*` or `/unsubscribe` requests can in principle recover a valid signature byte-by-byte and then forge tokens for arbitrary `sendId`s (enabling unsubscribe of arbitrary recipients by enumerated sendId, or event-log poisoning). The project's sibling `qr-token.ts` (referenced in this file's own header) is the pattern to follow; this one regressed.
**Fix:** Use a length-safe constant-time compare:

```ts
import { createHmac, timingSafeEqual } from "crypto";
// ...
const a = Buffer.from(providedSignature);
const b = Buffer.from(expectedSignature);
if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
```

## Warnings

### WR-01: Mass-send has no campaign-status gate — concurrent or repeat sends rely entirely on Resend's per-batch idempotency

**File:** `el-templo-api/src/modules/campaigns/service.ts:218-332`
**Issue:** `send()` never checks `campaign.status` before sending and never locks the campaign row. Two concurrent owner clicks (or a retry after a slow response) both run `listEligible`, both enroll, and both read overlapping `pending` sends, then both call `sendCampaignBatch`. The only thing preventing duplicate delivery is the deterministic `idempotencyKey` (`campaign-${id}-batch-${i}`), which Resend de-dupes — but DB state can still diverge (double `userStatusHistory`-style writes aren't here, but the `sent`/`sentAt` marking races), and if the idempotency window has lapsed or the key scheme ever changes, a real double-send occurs. For an irreversible mass email this guard is too thin.
**Fix:** Gate on status and flip to `sending` atomically before enrolling: `UPDATE campaigns SET status='sending' WHERE id=? AND status='draft'` and bail if 0 rows affected. Reject `send()` when status is already `sending`/`sent`.

### WR-02: `getMondayInTz` uses `1 - isoDow` so Saturday renders next week's grid for trials

**File:** `el-templo-app/src/pages/ReservasPage.vue:769-778`
**Issue:** For Saturday (`isoDow=6`) the diff is `1 - 6 = -5`, anchoring to _this_ week's Monday — correct. But for Sunday (`isoDow=7`) it special-cases `+1` to jump to tomorrow's Monday. The combination means a trial-eligible freemium opening the page on Sunday sees next week's grid with no way to book the remaining Saturday/Sunday — acceptable for Mon–Sat schedules, but note the day strip then hides today. Lower-severity, but worth confirming against the 30-day window UX: `canGoForward` (line 700) and `changeWeek` reset `selectedDay` to Monday on forward nav, which can land the user on a past day at week boundaries. Verify the trial flow can always reach every bookable day in the 30-day window.
**Fix:** Add a test that, for each weekday-of-open, every in-window bookable date is reachable via the strip; adjust the Monday anchor / `selectedDay` reset if any are stranded.

### WR-03: Click/open/unsubscribe endpoints are public and unthrottled — token-guessing and event-log flooding

**File:** `el-templo-api/src/modules/campaigns/routes.ts:79-157`
**Issue:** No rate-limiting plugin is registered anywhere in the API (`grep` for `rate-limit` returns nothing). The three public endpoints accept a 2048-char `t` and, on a valid token, write to `campaign_events`/`campaign_unsubscribes`. Combined with CR-03's timing oracle, an attacker can brute-force at full speed. Even without forging, an attacker who harvests real tokens from delivered emails can flood `campaign_events` (unbounded append) to skew the funnel, or replay `/unsubscribe` (idempotent, so limited) — but the open/click inserts are not idempotent and have no dedupe.
**Fix:** Add `@fastify/rate-limit` (ask before installing per project policy) scoped to the public tracking routes, and/or dedupe open/click inserts per `(sendId, type)` within a short window. At minimum, cap event inserts per sendId.

### WR-04: `bodyToParagraphs` is invoked on an always-empty body (dead render path tied to CR-02)

**File:** `el-templo-api/src/modules/campaigns/templates.ts:54-65, 196`
**Issue:** Because `body` is always `""` (CR-02), the body `<mj-section>` renders empty. Once CR-02 is fixed and real admin body text flows in, note that `bodyToParagraphs` escapes correctly but `esc` runs _before_ `.replace(/\n/g, "<br />")` — that ordering is correct (escaping first, then injecting safe markup), so no XSS — but verify the body max length (5000, schema line 37) is enforced server-side in `create` too; right now `create` does not re-check copy length and the columns don't exist yet.
**Fix:** When adding the copy columns (CR-02), enforce length in `create` and ensure the DB column is `text`/sized appropriately for 5000 chars.

### WR-05: `send()` is not wrapped in a transaction — partial failure leaves mixed `pending`/`sent` state with no resume guarantee

**File:** `el-templo-api/src/modules/campaigns/service.ts:234-313`
**Issue:** Enrollment, per-chunk batch-send, per-chunk `status='sent'` marking, and the final campaign `status='sent'` are all separate awaited statements with no surrounding transaction. If `sendCampaignBatch` throws mid-run (line 289 re-throws on Resend error), earlier chunks are already marked `sent` and the campaign stays `draft`. A re-run is _mostly_ safe (idempotent enrollment + only-pending reload + Resend idempotencyKey), which is why this is a warning not a blocker — but the campaign-level `status` and `sentAt` can end up inconsistent with the per-send rows, and the funnel's `enviado` count (sends with `status='sent'`) will under/over-report after a partial failure.
**Fix:** At minimum, mark the campaign `sending` at the start and only flip to `sent` after all chunks complete; consider per-chunk transactions so a chunk's `sent` marking and its Resend call are committed together (or accept the documented at-least-once semantics and assert it in a test).

### WR-06: Branch selector in CampaniasPage is purely decorative and can mislead the operator about send scope

**File:** `el-templo-admin/src/pages/CampaniasPage.vue:38-51, 324-327`
**Issue:** `onBranchChange` is a no-op (audience is country-scoped server-side), but the UI presents a "Sucursal" selector right next to the irreversible send button. An operator could reasonably believe selecting a branch narrows the blast radius; it does not. Before a real mass send, an ambiguous control next to the trigger is a foot-gun.
**Fix:** Either remove the branch selector from this page or disable it with a tooltip ("La audiencia se define por país, no por sede"). Confirm the send confirmation copy states the actual scope (country) so `eligibleCount` and the message agree.

## Info

### IN-01: `recordOpen`/`recordClick` insert events even for already-bounced/failed sends

**File:** `el-templo-api/src/modules/campaigns/tracking-service.ts:27-43`
**Issue:** Events are recorded by `sendId` with no check that the send was actually `sent` (vs `pending`/`bounced`/`failed`). A valid token for a never-delivered send still produces an "open". Minor funnel-accuracy issue; the funnel joins on `campaign_sends` so it stays scoped to the campaign, but the counts can include events for non-`sent` rows.
**Fix:** Optionally filter to `sent` sends, or accept as approximate (consistent with `aperturaAproximada`).

### IN-02: `assetlinks.json` and `apple-app-site-association` ship with TODO placeholder fingerprints

**File:** `el-templo-app/public/.well-known/assetlinks.json:8,18`
**Issue:** Both Android cert fingerprints are literal `TODO_..._SHA256` strings. Until replaced with the real Play App Signing SHA-256, Android App Links will not verify and `https://app.eltemplo.org/r/trial` will open a disambiguation/browser instead of the app — the campaign CTA degrades to the web app (which the deep-link boot says is "harmless"), so not a blocker, but the native deep-link is non-functional until these are filled in.
**Fix:** Populate both prod and staging fingerprints from the Play Console before relying on native App Links.

### IN-03: `formatTime` and date parsing assume well-formed inputs without guards

**File:** `el-templo-app/src/pages/ReservasPage.vue:802-806, 691-693`
**Issue:** `formatTime` does `parseInt(parts[0])` without checking `parts.length`; `trialConfirmationBody` does `new Date(b.date + 'T00:00:00')` assuming `b.date` is `YYYY-MM-DD`. Inputs come from the API (schema-validated), so low risk, but a malformed `startTime` would render `NaN:undefined`.
**Fix:** Defensive defaults are cheap here; optional.

### IN-04: `isTrialMode` is an alias of `trialEligible` — redundant computed

**File:** `el-templo-app/src/pages/ReservasPage.vue:686`
**Issue:** `const isTrialMode = computed(() => trialEligible.value)` adds an indirection with no added meaning. Minor readability/dead-abstraction.
**Fix:** Inline `trialEligible` at the two call sites or document why a separate name exists.

---

## Notes on items explicitly checked and found SOUND (not findings)

- **Open-redirect (D-25):** `routes.ts:103-130` derives the destination from a hardcoded `TRIAL_DEEP_LINK_BASE` host, URL-encodes the token into a query param, and re-asserts `new URL(destination).host === "app.eltemplo.org"` before redirecting. Raw query input cannot become the redirect host. Closed by construction.
- **Token never authorizes (D-21):** `reserveTrialSchema` uses `additionalProperties:false` and carries no token; `reserveTrialSelfService` is identified by JWT and re-validates `status='freemium'` server-side. Deep-link boot ignores the token value.
- **HMAC sign/verify + expiry:** signing throws without `JWT_SECRET`; verify rejects malformed tokens, bad signatures (modulo CR-03), and `exp <= now`. Payload type-narrowing is correct. Only the comparison primitive (CR-03) is the defect.
- **Template injection:** `esc()` escapes `& < > " '` and is applied to every interpolated merge var (headline, subheadline, body paragraphs, sede name/address, URLs, button labels). No raw interpolation found.
- **Unsubscribe anti-enumeration:** generic confirmation page, no email echoed, idempotent on `UNIQUE(email)`.
- **Trial cancel-block (D-03):** `booking-service.ts:331-335` rejects cancelling any `isTrial` booking from the member app.
- **One-trial-per-lifetime + transaction atomicity (D-26):** the freemium→prueba promotion, `userStatusHistory` insert, and booking insert/reactivate are inside a single `db.transaction` (`trials-service.ts:252-307`); guards run before the tx. (The branch-coherence gap is CR-01, a separate concern from atomicity.)

---

_Reviewed: 2026-06-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
