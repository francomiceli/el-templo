# Phase 98: Test Hygiene (98-A/B/C) — Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore green baseline on `el-templo-api` test suite by closing the 30 test-side failures classified in `/gsd-debug` session `api-30-test-failures-triage` (resolved 2026-06-16) as verdict **(a) PURE TEST-INFRA / TEST-STALENESS**. Three independent fix zones across three test files:

- **98-A** — `el-templo-api/test/subscriptions/subscriptions.test.ts` (6 failures): temporal fixture staleness (hard-coded past `startDate` literals — mostly `"2026-03-01"`, with one `"2026-04-01"` at `:423` — whose computed `endDate` is now past; `autoExpireSubscriptions` correctly expires before lookup). See D-01 for the exact rule + site classification.
- **98-B** — `el-templo-api/test/whatsapp/ai-tools.test.ts` (20 failures): broken cleanup filter mismatch (`LIKE 'TST%'` vs `code='alem'` seed) + 3 stale wording assertions (`'<N> lugares'` vs prod `'<N> cupos disponibles'` at `:112`, `:174`, `:225`).
- **98-C** — `el-templo-api/test/whatsapp/webhook.test.ts` (3 failures): missing AI-provider mock (placeholder `sk-xxxxxxxx` 401s) + stale image-test assertion (production now stores + replies per "quick-16 fix 3", test still asserts silent drop).

**HARD GUARD (SC#5):** Zero production source touches. `git diff` MUST show zero changes to `el-templo-api/src/**` AND `el-templo-bot/src/**`. If any failure unexpectedly reveals a production bug at fix time, STOP and re-classify per `/gsd-debug` (a/b/c) framework — do NOT silently absorb.

**Single deliverable:** Three test files updated + 1 new helper export in `test/helpers.ts`. Target: `cd el-templo-api && pnpm test --run` exits `511 passed / 1 failed / 512 total` (the 1 fail = BUG-03 (i) LIKE-search RED at `el-templo-bot/src/ai/tools.ts:455`, intentionally deferred per Phase 95 — STAYS RED).

**Out of scope (HARD GUARDS):**

- Any production source modification (HARD GUARD per SC#5).
- Modifying the wording at `el-templo-bot/src/ai/tools.ts:389` — intentional prod state.
- Closing BUG-03 (i) at `tools.ts:455` — Phase 95 owns the deferred-scope marker.
- `el-templo-bot/` test suite changes (Phase 96.5 just shipped clean; do not touch).
- Adding `MockAiProvider` class in bot src — violates SC#5.
- Real-API CI mode (setting working `OPENAI_API_KEY` in CI) — bad practice; non-deterministic.

</domain>

<decisions>
## Implementation Decisions

### D-01 — 98-A relative-date strategy: shared helper in `test/helpers.ts`

**Locked:** Add `futureDateISO(daysFromToday: number): string` to `el-templo-api/test/helpers.ts`. Replace **6 stale `startDate` sites** in `subscriptions.test.ts` (the 6 reported failures). **Drive the fix by the rule below, NOT by a find-replace of `"2026-03-01"`** — the literal `"2026-03-01"` enumeration in this section's earlier draft was inaccurate.

**Decision rule (apply per `startDate` site):**

Compute `startDate + plan.durationDays`. If that end date is already in the **past** relative to today AND the test expects the subscription to remain active/usable → **STALE**: replace the literal with `futureDateISO(...)`. If the date is intentionally past (auto-expire test) OR a fixed future date whose exact string is coupled to assertions → **LEAVE IT**. `autoExpireSubscriptions` flips active→expired once `endDate < today`, which is the root cause of the 6 stale failures.

**Actual classification** (re-confirm by grepping current line numbers at plan-phase time — they drift):

**STALE — replace with `futureDateISO` (6 sites = the 6 reported failures):**

- `:132` `startDate "2026-03-01"` (ends 2026-03-31, past)
- `:366` `startDate "2026-03-01"` (ends past). The `:366` test has **two coupled echo assertions** that must both become dynamic per D-03 (verified 2026-06-17):
  - `:374` `expect(body.startDate).toBe("2026-03-01")` → compare to computed `start`.
  - `:375` `expect(body.endDate).toBe("2026-03-31")` → compare to computed `end` (or assert "endDate in future"); comment `// 30 days from Mar 1` for math context.
  - **LEAVE-ALONE within the same test:** `:606` `expect(body.endDate >= "2026-03-31").toBe(true)` is a resilient lower-bound assertion — a future `endDate` still satisfies it. DO NOT modify `:606`.
- `:388` `startDate "2026-03-01"` (past)
- `:406` `startDate "2026-03-01"` (past)
- `:423` `startDate "2026-04-01"` (ends 2026-05-01, past) — **NOTE:** this is `2026-04-01`, NOT `2026-03-01`. A naive find-replace of `"2026-03-01"` MISSES this stale site and SC#1 (511 pass) won't be reached.
- `:584` `startDate "2026-03-01"` (past)

**DO NOT TOUCH — intentional, currently passing:**

- `:537` `startDate "2025-01-01"` — intentionally past; this test verifies the auto-expire path (404 + history-row). Replacing it breaks the test's purpose.
- `:721` `startDate "2026-06-01"` — future; still active.
- `:733` `startDate "2026-07-01"` — future; still active.
- Both `:721`/`:733` have assertions at `:746-758` that check the listing contains the exact strings `"2026-06-01"` and `"2026-07-01"` (history-ordering test). Replacing these dates breaks green tests. Leave them as fixed literals.

**Net:** 6 sites become future-relative; 3 stay fixed (`:537`/`:721`/`:733`). After the fix, `cd el-templo-api && pnpm test --run` for this file should be green, contributing to the phase-wide SC#1 target of 511 passed / 1 failed / 512 total.

**Verified against** `el-templo-api/test/subscriptions/subscriptions.test.ts` on **2026-06-17**.

**Rationale:**

- Debug session (`api-30-test-failures-triage.md` §Per-file disposition, subscriptions row) explicitly recommends the relative-date approach over `vi.useFakeTimers` to avoid timer/I/O side-effects.
- `test/helpers.ts` is the canonical home for cross-test utilities (this is the helpers-file case per the codebase analysis pattern); Phase 97 RGUARD-01 is a likely second consumer (regression suite will need today-relative anchors).
- Single source of truth across `subscriptions.test.ts` and any future date-sensitive tests.

**Rejected alternatives:**

- **File-local helper** in `subscriptions.test.ts` — same function, scoped. Rejected because Phase 97 RGUARD-01 is a likely second consumer; co-location only justified when a second consumer hasn't materialized (Phase 95 D-16 / Phase 96 D-14 precedent), but here the second consumer is already on the roadmap.
- **`vi.useFakeTimers() + vi.setSystemTime(...)`** — would let the past-date literals stay. **HARD REJECT.** Three reasons: (i) debug session explicit warning ("avoid fake-timer side-effects"); (ii) STATE.md carry-forward flags DEGR-01 / LAT-03 family as already-flaky on `vi.useFakeTimers + advanceTimersByTimeAsync`; (iii) `vi.useFakeTimers` is the exact Date/timer landmine behind Phase 96's 5.5h execute timeout.
- **Inline `new Date(Date.now() + 86400000).toISOString().split('T')[0]` per call site** — 6+ duplicated expressions, tortured assertions, violates DRY (`CLAUDE.md` flags repetition aggressively).
- **Find-replace of the literal `"2026-03-01"`** — MISSES `:423` (`2026-04-01`), and would naively rewrite `:537`/`:721`/`:733` if extended without the rule. Drive by rule, not by literal.

### D-02 — 98-A endDate math: reuse `addDays` from prod date-utils

**Locked:** Test imports `addDays` from `el-templo-api/src/modules/shared/date-utils.ts` (already a pure exported function) for endDate arithmetic. The test does NOT re-implement noon-UTC date math.

**Rationale:** `addDays` already exists in production source as a pure helper with its own unit-test coverage in `test/unit/date-utils.test.ts` (verified by codebase scout). Test importing the prod function for fixture math is the standard pattern — not a SC#5 violation (importing is not modifying).

### D-03 — 98-A assertion shape: non-tautological date assertions

**Locked:** Lifecycle tests assert lifecycle state (active → expired, assign/pause/cancel transitions), NOT exact date string echoes through the same math function.

**For dates specifically:**

- ✅ Assert `body.startDate === start` (echo of the literal input value — not tautological; verifies API returned what was sent).
- ✅ Assert `new Date(body.endDate) > new Date()` ("endDate is in the future") OR assert the date-diff in days against `plan.durationDays` using independent arithmetic.
- ❌ Avoid `expect(body.endDate).toBe(addDays(start, 30))` — both sides resolve via the same production function; the test would pass even if `addDays` regressed silently. `addDays` has its own unit tests in `test/unit/date-utils.test.ts` — don't re-test it through subscription assertions.

**Rationale:** Subscription lifecycle tests verify subscription behavior, not date arithmetic. Keep assertion strength focused on the contract that matters (the sub IS active / endDate IS in the future / pause works on a live sub).

### D-04 — 98-A scope guard: do NOT touch the passing peer tests

**Locked:** Three sites in `subscriptions.test.ts` are intentional and currently passing — DO NOT replace these literals (verified 2026-06-17, see D-01):

- `:537` `startDate: "2025-01-01"` — deliberately past; verifies the auto-expire path (404 + history-row behavior).
- `:721` `startDate: "2026-06-01"` — future and still active; assertion at `:746-758` checks the exact string `"2026-06-01"` (history-ordering test).
- `:733` `startDate: "2026-07-01"` — future and still active; same assertion-coupling at `:746-758` checks `"2026-07-01"`.

Replacing any of these breaks the test's purpose (`:537`) or breaks currently-green assertions (`:721`/`:733`).

### D-05 — 98-B cleanup: rename seed `'alem'` → `'TSTA'`

**Locked:** `el-templo-api/test/whatsapp/ai-tools.test.ts:60` INSERT statement changes from `code='alem'` to `code='TSTA'`. The `name='Test Alem'` stays unchanged (test assertion at `:109` checks `result.toContain("Test Alem")` — the display name, not the internal code).

**Rationale:**

- Existing cleanup filter `WHERE code LIKE 'TST%'` (line 55) works unchanged.
- Mirrors the second-branch seed convention already used at `:119` (`code='TSTB'`).
- Single-line change at the INSERT; zero filter changes elsewhere; semantically consistent ("all TST-prefixed codes are test data").
- The `branchId` returned from the INSERT is used downstream by ID, not by code string — rename has zero ripple.

**Rejected alternatives:**

- **Extend LIKE filter** to `WHERE code LIKE 'TST%' OR code = 'alem'` — semantically odd (delete a production-looking code); risk if global setup ever seeds a real `'alem'` branch.
- **Seed-registry by-ID pattern** (track inserted IDs, `DELETE WHERE id IN (...)`) — over-engineered for a 1-line bug; requires top-level state plumbing across tests; engineering balance fails ("over-engineered" per `CLAUDE.md` preference).

### D-06 — 98-B wording assertion: exact `'cupos disponibles'` at all 3 stale sites

**Locked:** `el-templo-api/test/whatsapp/ai-tools.test.ts` updates the stale `"<N> lugares"` wording to `"<N> cupos disponibles"` at **three sites** (number-aware — preserve each site's spot count; do NOT blind-replace `"20 lugares"`). Verified 2026-06-17 against the live file:

- `:112` `"20 lugares"` → `"20 cupos disponibles"`
- `:174` `"2 lugares"` → `"2 cupos disponibles"` — **NOTE:** number is `"2"`, not `"20"`. A naive find-replace of `"20 lugares"` MISSES this site and SC#1 (511 pass) won't be reached.
- `:225` `"20 lugares"` → `"20 cupos disponibles"`

Each assertion shape: `expect(result).toContain("<N> cupos disponibles")`.

**Rationale:**

- ROADMAP SC#3 specifies the exact `"cupos disponibles"` wording — locks the intentional production text.
- Production source at `el-templo-bot/src/ai/tools.ts:389` is the source of truth (`${spotsRemaining} cupos disponibles`). Wording is a deliberate prod decision (origin NOT attributed per ROADMAP §Notes — treat as intentional state).
- Stronger signal than a looser `"cupos"` substring; future wording regressions (e.g., degenerate output) caught.
- Completeness verified: these are the ONLY `"lugares"` sites in `ai-tools.test.ts` (no further drift expected at plan-phase time).

### D-07 — 98-C AI mock: `vi.mock` the provider factory

**Locked:** Add `vi.mock('../../../el-templo-bot/src/ai/provider', ...)` at the top of `webhook.test.ts` (alongside the existing `vi.mock('../../../el-templo-bot/src/whatsapp/client', ...)` at lines 27-39). Stub `createAiProvider` to return a fake provider whose `.chat()` returns a canned `{ content: "<canned-text>", toolCalls: [] }` shape per `AiResponse` (per the interface at `el-templo-bot/src/ai/provider.ts:33`).

**Plan-phase locks:**

- Exact canned `.chat()` response text (single short Spanish string — plan-phase chooses; e.g., `"Hola, soy Mica."` or similar greeting-shape).
- Whether the mock returns the same canned reply on every call or varies by `messages[]` input (default: constant — simpler, sufficient for SC#1/SC#4).
- Whether to also mock `executeTool` to avoid the booking-tool round-trip (default: no — `provider.chat` returning `toolCalls: []` means the handler skips the executeTool branch entirely; verified by handler.ts surface scan).

**Rationale:**

- **Mirrors the existing `sendTextMessage` mock pattern in the same file** (lines 27-39) — same `vi.mock` shape, same `importOriginal` spread, same approach. Zero new technique introduced.
- **Provider-level mock is the right abstraction layer.** Mocking `createAiProvider` (the factory) means future provider swaps (OpenAI ↔ Anthropic) don't break tests; mocking the OpenAI SDK shape directly would be brittle.
- **SC#5 compliant.** Adding `vi.mock(...)` in the test file is test-infra only — no prod source touched.

**Rejected alternatives:**

- **`vi.mock` the OpenAI module directly** — entangles tests with OpenAI SDK internal client shape; brittle to SDK upgrades.
- **Real `OPENAI_API_KEY` in CI** — real API calls in tests (cost, flakiness, non-determinism); local dev requires keys; tests fail when OpenAI degrades. Industry bad practice.
- **MockAiProvider class in `el-templo-bot/src/ai/`** — modifies bot src. **VIOLATES SC#5.** Out of scope.

### D-08 — 98-C text-test assertion update: replace `"Echo: ..."` literal at both sites

**Locked:** The `"Echo: Hello from WhatsApp!"` literal appears at **two sites** in the new-sender text test (verified 2026-06-17 — these are the ONLY occurrences in `webhook.test.ts`):

- `:292` `expect(echoMessages[0].content).toBe("Echo: Hello from WhatsApp!")` — DB content check.
- `:298` `sendTextMessage` 2nd-arg assertion — `expect(sendTextMessage).toHaveBeenCalledWith("5491100000001", "Echo: Hello from WhatsApp!")`.

Plan-phase replaces both with the exact canned response text chosen for D-07's mock (default: a single short Spanish greeting). Assertion shape:

```ts
expect(echoMessages[0].content).toBe(<CANNED_REPLY>);
expect(sendTextMessage).toHaveBeenCalledWith("5491100000001", <CANNED_REPLY>);
```

The existing-sender text test (around `:339-340`) is **count-based, not literal-based** — it is invariant under this change and DOES NOT need editing.

**Rationale:** The `"Echo: ..."` literal is a pre-AI-integration leftover and is technically stale even ignoring the 401. Updating both sites to the mock's canned text aligns assertion with current production behavior shape (AI round-trip → outbound text via `sendTextMessage`).

### D-09 — 98-C image-test assertion: count + semantic substring

**Locked:** `webhook.test.ts:388` ("non-text message (image) returns 200 but does not store or reply") updates to assert the post-"quick-16 fix 3" production behavior:

```ts
// After waitForHandler():
const [msgRows] = await pool.execute("SELECT * FROM whatsapp_messages");
const messages = msgRows as Record<string, unknown>[];
expect(messages).toHaveLength(2); // 1 inbound + 1 outbound fallback
expect(sendTextMessage).toHaveBeenCalledOnce();
expect(messages[1].content).toContain("imagen"); // semantic intent: fallback acknowledges image
// (Plus: verify 1 conversation now exists, since the inbound INSERT triggered creation.)
```

**Test description rename:** from `"returns 200 but does not store or reply"` → `"returns 200, stores inbound, and sends non-text fallback"` (or similar — plan-phase locks exact wording).

**Rationale:**

- Locks **behavior shape** (1+1 message count + 1 outbound send) — catches regressions to silent-drop or double-send.
- Locks **semantic intent** via substring (`"imagen"` — matches `getNonTextFallback("image")` per `el-templo-bot/src/webhook/handler.ts:326` which returns `"Recibí tu imagen, pero..."`).
- Avoids brittleness to exact wording polish (Spanish copy can be refined without breaking the test).

**Rejected alternatives:**

- **Count only** — doesn't verify the right fallback variant fired (could be any text); weak signal.
- **Exact full `getNonTextFallback("image")` string** — couples test to fallback wording; breaks on any Spanish-copy polish. ROADMAP doesn't lock specific wording (only the store-+-reply behavior anchored to "quick-16 fix 3" comments).

### D-10 — 98-C wait-for-handler integration

**Locked:** The image-test currently uses `await new Promise((r) => setTimeout(r, 100))` (line 402) on the assumption nothing fires. Updated test must use the existing `waitForHandler()` mechanism (line 161-172, 264) since the handler now DOES fire (store + reply). Same pattern as the text-test cases.

### D-11 — Plan structure: 1 plan, 3 atomic sub-commit chains

**Locked:** Single plan `98-01-test-hygiene.md` with atomic commit sequence:

```
RED-A (98-A failing tests still RED + helper exported)
  → GREEN-A (98-A 6 tests green; subscriptions.test.ts only)
RED-B (98-B failing tests still RED post-A)
  → GREEN-B (98-B 20 tests green; ai-tools.test.ts only)
RED-C (98-C failing tests still RED post-B)
  → GREEN-C (98-C 3 tests green; webhook.test.ts only)
SUMMARY (Phase 98 ship: 29 newly green + 1 deferred RED preserved + invariants verified)
```

**Execution order:** 98-A → 98-B → 98-C (smallest to largest, debug-session estimates: ~30min / ~15min / ~1-2h).

**Rationale:**

- **Matches Phase 96.5 atomic cadence** (RED → GREEN → SUMMARY) scaled to 3 zones — proven pattern.
- **ROADMAP §Plans explicit preference:** "Single-plan structure preferred if test-file isolation makes a single GREEN commit per fix-zone clean." Three fix zones = three separate test files = file-isolated GREEN commits are inherently clean.
- **Per-zone atomicity preserved** — each fix-zone GREEN commit is independently revertible (e.g., if 98-C reveals a snag, 98-A and 98-B GREEN stay shipped).
- **Single planning pass + single PR cycle** — Phase 97 is waiting (RGUARD-01 cannot lock on a 30-red baseline); minimizing planning overhead matters.
- **STOP-and-reclassify guard** (per ROADMAP §Notes "If any failure unexpectedly reveals a production bug, STOP and re-classify per `/gsd-debug` (a/b/c) framework") is honored cleanly: stop after the failing RED commit, before GREEN.
- **Build cadence on simpler zones; heaviest (98-C, vi.mock wiring + 3 assertion updates) lands last** when cadence and verify-gates are established.

**Rejected alternatives:**

- **3 separate plans** (`98-01-subs`, `98-02-ai-tools`, `98-03-webhook`) — 3× planning overhead; multi-PR cycle; Phase 97 wait grows. File isolation already gives per-zone atomicity via sub-commit chain — separate plans add overhead without gain.
- **1 plan, 1 combined RED + 1 combined GREEN** — loses per-zone revert; harder to honor STOP-and-reclassify guard; mixes fix-zone signal in CI.

### Claude's Discretion

Plan-phase resolves these details using the locked decisions above:

- **Exact canned `.chat()` response text** for D-07's mock (single short Spanish string, e.g., a greeting-shape; doesn't need to be semantically meaningful — tests assert count + literal echo, not content quality).
- **Exact assertion ordering** within each test (group lifecycle assertions; defer dynamic-date assertions).
- **Exact site enumeration in `subscriptions.test.ts`** — D-01 lists the 6 stale sites and 3 leave-alone sites verified 2026-06-17. Plan-phase re-confirms current line numbers by grepping `startDate:` (drift expected) but does NOT re-derive the rule and does NOT drive the fix off the literal `"2026-03-01"` (misses `:423`'s `2026-04-01`); each site is evaluated by the D-01 rule (compute `startDate + plan.durationDays`; past + expected-active → stale) per D-04.
- **Whether to also rename `'TSTB'` → `'TSTB'` consistency check** — no change planned, but plan-phase confirms the seed at `:119` still uses the TST prefix.
- **Test description renames** (e.g., D-09's image-test) — plan-phase locks exact strings.
- **Whether the new `futureDateISO` helper is exported as a named export or added to a `dateHelpers` namespace** — default: named export (matches existing `createTestApp`, `getAuthToken`, `registerUser` shape in `test/helpers.ts`).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 98 scope locks

- `.planning/ROADMAP.md` Phase 98 section (lines ~219-252) — Goal, SC#1..SC#6, Notes (HARD GUARDS, BUG-03 (i) deferred-scope, wording attribution non-claim, image-handler anchor, Phase 97 absorption option, out-of-scope list, 6-pair sha256 invariant).
- `.planning/debug/resolved/api-30-test-failures-triage.md` — `/gsd-debug` resolved session; classification verdict (a) PURE TEST-INFRA; per-file root-cause traces with verbatim failure output and source-line citations; recommended Phase 98 fix loci. **Evidence-ready ingestion for plan-phase per ROADMAP §Notes.**
- `.planning/STATE.md` — current focus, v5.4.0 production-ready path, carry-forward planning constraints (F-1/F-2 deprecation, sha256 invariant, 90-min execute hard cap, atomic RED→GREEN→SUMMARY cadence).
- `.planning/phases/95-booking-reliability-graceful-degradation/95-AUDIT.md` BUG-03 (i) — Phase 95-deferred RED at `el-templo-bot/src/ai/tools.ts:455`; STAYS RED in Phase 98; Phase 95 owns eventual GREEN.

### Test files (the fix surfaces)

- `el-templo-api/test/subscriptions/subscriptions.test.ts` — 98-A target (6 failures); 6 stale `startDate` sites (5× `"2026-03-01"` + 1× `"2026-04-01"` at `:423`) + 3 leave-alone sites (`:537` intentional past; `:721`/`:733` future with exact-string assertions at `:746-758`). Exact rule and per-site classification in D-01.
- `el-templo-api/test/whatsapp/ai-tools.test.ts` — 98-B target (20 failures); `beforeEach` cleanup-filter mismatch + 1 stale wording assertion at `:112`.
- `el-templo-api/test/whatsapp/webhook.test.ts` — 98-C target (3 failures); missing AI mock + stale image-test assertion at `:388-417`.
- `el-templo-api/test/helpers.ts` — 98-A helper landing site (`futureDateISO` export added).
- `el-templo-api/test/setup.ts` — global setup reference (seeds `code='TEST'` branch + spom_config + admin user). UNCHANGED.
- `el-templo-api/vitest.config.ts` — `fileParallelism: false`; test env vars; UNCHANGED.

### Production source (READ-ONLY — DO NOT MODIFY)

- `el-templo-api/src/modules/shared/date-utils.ts` — exports `addDays(dateStr, days)` pure helper; test imports for endDate math (D-02). UNCHANGED.
- `el-templo-api/src/modules/subscriptions/service.ts:178-233` — `getMemberSubscription` (calls `autoExpireSubscriptions` first). Behavior is correct by design — tests adapt, not service.
- `el-templo-api/src/modules/subscriptions/service.ts:775-788` — `autoExpireSubscriptions` (UPDATE subscriptions SET status='expired' WHERE endDate < TODAY). Working as designed.
- `el-templo-bot/src/ai/tools.ts:389` — `cupos disponibles` wording (intentional prod state; assertion target for D-06). **DO NOT MODIFY.**
- `el-templo-bot/src/ai/tools.ts:455` — BUG-03 (i) LIKE-search RED; Phase 95-deferred. **DO NOT CLOSE.**
- `el-templo-bot/src/ai/provider.ts:33,38,57-67` — `AiProvider` interface, `createAiProvider` factory; mock target for D-07. UNCHANGED.
- `el-templo-bot/src/webhook/handler.ts:323-358` — non-text fallback path (store + reply per "quick-16 fix 3"); behavior anchor for D-09. UNCHANGED.
- `el-templo-bot/src/webhook/handler.ts:700,708` — `createAiProvider()` + `provider.chat()` call sites; the vi.mock target intercepts at the factory.

### Carry-forward planning discipline

- `.planning/STATE.md` "Carry-forward planning constraints — DO NOT regenerate F-1/F-2 verify gates" (Engineering Learning 2026-05-18). Substantive verify gates only: (a) sha256 6-pair drift sentry, (b) `pnpm tsc --noEmit` both packages, (c) exact-file-count assertion, (d) commit subject regex, (e) negative-assertion `git diff` guards on production source paths, (f) code-discipline grep on new files, (g) explicit `<human-check>` checklist.
- Phase 96.5 ship pattern (`d835c18a` SUMMARY) — atomic RED → GREEN → SUMMARY commit chain reused, scaled to 3 zones per D-11.

### Codebase intel

- `.planning/codebase/TESTING.md` — Vitest config, helpers, cleanup strategy, integration test structure, mocking patterns. **Bot-testing strategy section** anticipates `MockAiProvider` for the future bot-test infra (v5.4.0+ work); Phase 98 stays within `vi.mock` pattern per D-07 to preserve SC#5.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`addDays(dateStr, days): string`** at `el-templo-api/src/modules/shared/date-utils.ts:15-19` — pure noon-UTC date arithmetic; unit-tested in `test/unit/date-utils.test.ts`. **Reused for 98-A endDate math (D-02)** without modification.
- **`vi.mock(...)` pattern at `webhook.test.ts:27-39`** — existing `sendTextMessage` mock via `vi.mock('../../../el-templo-bot/src/whatsapp/client', async (importOriginal) => { ... })`. **98-C D-07 mirrors this exact shape** for the AI provider factory.
- **`waitForHandler()` async-await helper** at `webhook.test.ts:161-172` + `resetHandlerPromise()` + `onMessageHandled` callback at `:194-198`. **98-C D-10 reuses for the updated image-test** (handler now fires async work — image-test must await it).
- **Test `helpers.ts` named exports** (`createTestApp`, `getAuthToken`, `registerUser`) — 98-A D-01's `futureDateISO` joins this same export style.

### Established Patterns

- **`vi.mock` at file top with `importOriginal` spread** — established by existing `sendTextMessage` mock; D-07 follows verbatim.
- **`beforeEach` cleanup → seed in test files** — each test file owns its cleanup (per `TESTING.md` cleanup strategy); no cross-file shared cleanup.
- **`TST*` test-data naming convention** — `branches.code` test data uses `TST` prefix (line 119 `'TSTB'`, global setup `'TEST'`). D-05's rename `'alem'` → `'TSTA'` aligns the seed with this convention.
- **Lifecycle-state assertions over date-math assertions** — D-03 follows the codebase convention: lifecycle tests verify state transitions; date arithmetic lives in dedicated `test/unit/date-utils.test.ts`.
- **Atomic RED → GREEN → SUMMARY commit chain** — Phase 96.5 cadence; D-11 scales to 3 zones (RED-A → GREEN-A → ... → SUMMARY).
- **F-1/F-2 verify gates DEPRECATED** — substantive gates only per Engineering Learning 2026-05-18 (see canonical_refs).

### Integration Points

- **`test/helpers.ts`** — surface area grows by 1 named export (`futureDateISO`). All existing exports untouched.
- **`subscriptions.test.ts`** — call-site replacements at 7 stale literals; assertions become dynamic per D-03; lifecycle behavior unchanged.
- **`ai-tools.test.ts`** — single-line INSERT change at `:60` (seed code rename); single-line assertion change at `:112` (wording).
- **`webhook.test.ts`** — `vi.mock` block added at top (mirrors line 27-39 pattern); 2 text-test assertions updated to match canned mock reply; 1 image-test rewritten to assert post-quick-16-fix-3 behavior; `waitForHandler()` integrated into image-test.
- **No production source surfaces touched.** `el-templo-api/src/**` and `el-templo-bot/src/**` are read-only for Phase 98 (`addDays` imported only; SC#5 HARD GUARD).

</code_context>

<specifics>
## Specific Ideas

### From debug session (verbatim citations)

- **98-A causal chain:** `subscriptions.test.ts` first-assign creates sub `endDate=2026-03-31, status=active`. Any subsequent operation through `getMemberSubscription` triggers `autoExpireSubscriptions` (line 182 calls line 775-788) → status flips `active`→`expired` → lookup returns nothing → operations correctly return 201/404 instead of 409/200. **Three-line proof.** Today (2026-06-17) is 78 days past `endDate 2026-03-31`. Confidence: high (causal chain traced through source).
- **98-B verbatim cleanup-filter mismatch:** line 55 `DELETE FROM branches WHERE code LIKE 'TST%'`; line 60 `INSERT ... code='alem'`. Run-1 inserts; run-2 `beforeEach` cleanup does NOT delete the `'alem'` row (filter mismatch); run-2 INSERT throws `Duplicate entry 'alem' for key 'branches.branches_code_unique'`. Cascade: tests #2-#20 fail on the duplicate INSERT in `beforeEach`. Confidence: high (verbatim Duplicate entry error matches verbatim cleanup filter).
- **98-B wording mismatch:** test #1 asserts `"20 lugares"`; production at `el-templo-bot/src/ai/tools.ts:389` emits `${spotsRemaining} cupos disponibles`. Origin of wording change NOT attributed — treat as intentional state per ROADMAP §Notes. Confidence: high.
- **98-C 401 root:** test env `OPENAI_API_KEY=sk-xxxxxxxx`; live log `status:401 ... message:"401 Incorrect API key provided: sk-xxxxxxxx ..."`. Confidence: high (verbatim 401 from openai-provider in run output).
- **98-C image-handler anchor:** post-"quick-16 fix 3" behavior verified at `el-templo-bot/src/webhook/handler.ts:323-358` (verbatim "quick-16 fix 3" inline comment at `:323` + at `el-templo-bot/src/whatsapp/client.ts:358`). Cross-verified by owner 2026-06-16. Confidence: high.

### Phase 96.5 cadence reuse

Phase 96.5 shipped 2026-06-16 (`d835c18a` SUMMARY) via atomic RED → GREEN → SUMMARY chain after Phase 96's 5.5h timeout taught the value of pre-flagged execute prompts and avoiding `vi.useFakeTimers` for any code paths that touch Date/timer machinery. Phase 98 D-01's hard reject of `vi.useFakeTimers` and D-11's atomic-chain structure both derive from this pattern.

### BUG-03 (i) verification

`test/whatsapp/v5-3-3-booking.integration.test.ts` — single failure `BUG-03 candidate (i) — LIKE-search ambiguity at tools.ts:455 > RED: returns exactly one disambiguated branch for substring-match input (FAILS on master)`. Description literally says "FAILS on master". **Verified UNCHANGED from Phase 95 baseline 2026-06-16.** Phase 98 verifies this single failure persists (SC#1: total = 1 failed); does NOT close it.

</specifics>

<deferred>
## Deferred Ideas

### To Phase 97 (RGUARD-01)

- **`futureDateISO` second-consumer pattern** — Phase 97 regression suite will need today-relative anchors; D-01's shared-helper choice anticipates this.
- **Behavioral assertions for non-text fallback** — Phase 98 locks structural test shape (count + substring). Behavioral live-test coverage (does the bot recover gracefully when user sends image mid-conversation?) is Phase 97 live-test territory.

### To v5.4.0 or later

- **`MockAiProvider` class in `el-templo-bot/src/ai/`** with env-routed selection (`AI_PROVIDER=mock`). Would be reusable across the bot-test scaffolding that `TESTING.md` anticipates. **Out of Phase 98 scope** (violates SC#5 by modifying bot src). Reconsider as a v5.4.0 test-infra hardening item.
- **Seed-registry by-ID pattern** for test data — over-engineered for 98-B alone, but could become standard as the test suite grows (Phase 97 + v5.4.0 add tests). Note as a v5.4+ test-architecture decision.
- **Tool-layer date validation** (already deferred from Phase 96.5; rejected past dates server-side at `tools.ts:691`, `:869`). Defensive belt-and-suspenders for Phase 96.5's prompt-grounding fix. v5.4.0 hardening if residual hallucination empirically surfaces.

### Out of scope (HARD GUARDS — reiteration)

- Production source fixes — Phase 98 is HARD TEST-INFRA-ONLY (SC#5).
- Modifying `el-templo-bot/src/ai/tools.ts:389` wording.
- Closing BUG-03 (i) at `tools.ts:455` (Phase 95 owns).
- `el-templo-bot/` test suite changes (Phase 96.5 just shipped clean).
- Cross-timezone edge cases for date helper (Argentine local is v5.3.3 territory; multi-TZ is v5.4+).

</deferred>

<carry_forward_principles>

## Carry-Forward Principles (from STATE.md v5.4.0 Production-Ready Path)

### 6-pair sha256 invariant — UNCHANGED in Phase 98

The canonical `DEBOUNCE_TTL_SECONDS` block hashes byte-equal across all 6 anchors at:

`67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344`

Phase 98 modifies zero terms in the invariant. **Verify gate:** `shasum -a 256` on the extracted block at each of the 6 anchors before and after Phase 98 ship — same hash.

### Engineering discipline

- **No F-1/F-2 verify gate regeneration** — substantive gates only (Engineering Learning 2026-05-18 locked in STATE.md). F-1 vitest RED grep fails on ANSI color codes; F-2 `pnpm lint` is a no-op (no `lint` script). DO NOT regenerate.
- **90-min hard cap per execute** — Phase 96's 5.5h timeout taught the lesson; Phase 96.5 honored. Phase 98 with 3 fix zones must respect the cap per atomic sub-commit chain (each RED-X / GREEN-X cycle should fit within budget).
- **Atomic RED → GREEN → SUMMARY commit chain** — Phase 96.5 cadence; D-11 scales to 3 zones.
- **STOP-and-reclassify guard** — If any failure in 98-A/B/C unexpectedly reveals a production bug at fix time, STOP and re-classify per `/gsd-debug` (a/b/c) framework. Do NOT silently absorb (ROADMAP §Notes).

### SC verification gates (planning input)

- **SC#1** — `cd el-templo-api && pnpm test --run` exits `511 passed / 1 failed / 512 total`. The 1 fail = BUG-03 (i) intentional RED.
- **SC#5** — `git diff --name-only HEAD~N HEAD -- 'el-templo-api/src/**' 'el-templo-bot/src/**'` returns EMPTY across all Phase 98 commits.
- **SC#6** — `cd el-templo-api && pnpm tsc --noEmit` AND `cd el-templo-bot && pnpm tsc --noEmit` both clean post-fix.

</carry_forward_principles>

---

_Phase: 98-test-hygiene-98-a-b-c_
_Context gathered: 2026-06-17_
