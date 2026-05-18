---
phase: 94-openai-latency-graceful-failure
verified: 2026-05-17T23:05:37Z
verification_updated: 2026-05-18T17:18:00Z
re_verified_after_gap_closure: 2026-05-18T17:18:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 2
authorization_note: |
  CR-01 and WR-01 overrides authorized by user via explicit
  disposition request 2026-05-17. Distinct from the prior
  unauthorized override attempt by gsd-verifier earlier in the
  same session (died with stuck terminal before commit). Only
  CR-01 and WR-01 are accepted; CR-02 was routed to gap closure
  via 94-02-PLAN.md (NOT accepted as override) and was CLOSED
  by the 94-02 ship 2026-05-18.
overrides:
  - finding: CR-01
    title: "instanceof OpenAI.APIError narrow-typing is provider-specific"
    disposition: accept
    accepted_by: matzaia2001
    accepted_at: 2026-05-18T02:39:20Z
    authorization: in-session (recovery from stuck verifier session)
    rationale: "instanceof OpenAI.APIError narrow-typing applies only when AI_PROVIDER=openai. Per .env.example, production locks AI_PROVIDER=openai. The Anthropic factory path is dormant in v5.3.3. If/when Anthropic is enabled, the error narrowing must be generalized — tracked as a known limitation, not a gap."
  - finding: WR-01
    title: "Back-to-back interim + graceful-fallback UX contradiction"
    disposition: accept
    accepted_by: matzaia2001
    accepted_at: 2026-05-18T02:39:20Z
    authorization: in-session (recovery from stuck verifier session)
    rationale: "Back-to-back 'Dame un segundo' + graceful fallback message is a UX rough edge but does not affect functional correctness. The common path (timeout + retry succeeds) delivers a clean user experience. The worst-case path (timeout + retry also fails) is empirically rare. Lifting interimSent to outer scope is a future UX refinement, captured as known limitation rather than a v5.3.3 blocker."
closed_gaps:
  - finding: CR-02
    title: "SDK maxRetries=2 default breaks Cross-Phase Invariant (worst-case 845s > 600s TTL)"
    closure_plan: 94-02-PLAN.md
    closure_status: shipped
    closure_commits:
      red: 5ff993f04ce39c1a9f7d0523b5d33bcef94ca3f2
      green: c6c6bc0e2940edf3761fed9413f08c3f60930c9c
      summary: "07c65571"
      merge: "64556d68"
    shipped: 2026-05-18
    closure_evidence: |
      el-templo-bot/src/ai/openai.ts:63 — `new OpenAI({ timeout: timeout, maxRetries: 0 })`.
      Logger payload at openai.ts:65-68 includes maxRetries: 0 for boot-time confirmation.
      Doc-comment append at openai.ts:37-48 explains the invariant rationale inline.
      Regression coverage: 2 new `it()` blocks inside the LAT-01 (SC#1) describe in
      el-templo-bot/test/v5-3-3-openai-latency.test.ts (`readClientMaxRetries` helper + 2
      asserts that `client.maxRetries === 0` both at default env and with OPENAI_TIMEOUT_MS
      overridden). Suite count: 8/8 PASS deterministic in isolation. SDK runtime
      spot-check `node -e "import('openai').then(m => new m.default({timeout:45000,
      maxRetries:0, apiKey:'sk-test'}).maxRetries)"` prints `0`.
      Real worst-case formula post-94-02: `(45000/1000) × 1 × 5 + 30 × 5 + 20 = 395s`
      ≤ 600s DEBOUNCE_TTL_SECONDS. `bash el-templo-bot/scripts/check-debounce-invariant.sh`
      exits 0 ("Cross-phase invariant OK: TTL=600 >= minimum 395").
      SHA-256 multi-doc invariant block hash unchanged at
      67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344 across all 5
      canonical locations (93-CONTEXT.md:84, 94-CONTEXT.md:34, ROADMAP.md:62,
      ROADMAP.md:93, MACRO-ROADMAP.md:99) — formula text NOT mutated.
known_issues:
  - id: SC3-FLAKE-94-01
    title: "SC#3 graceful-fallback test intermittently fails under full-suite parallel load"
    introduced_by: fa65e5b3 (94-01 RED)
    not_introduced_by: 94-02 (regression-free; out of declared scope)
    location: el-templo-bot/test/v5-3-3-openai-latency.test.ts:~515 ('"sends Dame un segundo AND Tuve un problemita técnico; handler returns cleanly"')
    failing_assertion: "expect(interimSends.length).toBe(1) — receives 0 under contention"
    observed: |
      Verifier run 2026-05-18T17:17:32: full bot suite reported 616/617 (1 flake at SC#3 line 532).
      Verifier run 2026-05-18T17:17:49 immediately after: full bot suite reported 617/617 clean.
      Isolated `pnpm test v5-3-3-openai-latency`: 8/8 PASS deterministic on 2 sequential runs.
      Matches the ~50% flake rate documented in 94-02-SUMMARY.md "Known Issues / Follow-ups".
    hypothesis: "vi.advanceTimersByTimeAsync(3500) + promise-resolution ordering — needs explicit await on the interim send promise before asserting sendCalls."
    impact_on_94: "None. The two new maxRetries=0 it() blocks (94-02 regression coverage) pass on every run, isolated or in full-suite."
    disposition: |
      Tracked in 94-02-SUMMARY.md "Known Issues / Follow-ups" and STATE.md Pending Decisions.
      MUST be resolved before v5.4.0 ships — CI must be deterministic for prod deploy.
      Candidate remediation: Phase 97 (RGUARD scope expansion) or carved out as 97.1 / v5.3.4.
      Out of scope for this verification per user instruction (not introduced by 94-02 and
      explicitly tracked elsewhere — surfaced as known issue, not as new gap).
human_verification:
  - test: "Live BUG-02 smoke test: deploy v5.3.3 to staging with OpenAI key, simulate a slow upstream (e.g., temporarily throttle to a known-slow model or use a network sleep proxy), send an inbound WhatsApp message, observe (1) handler bails within ~45s wall-clock per provider.chat call, (2) user receives 'Dame un segundo 🙌' once, (3) user receives 'Tuve un problemita técnico…' graceful fallback, (4) bot process does not crash and is ready to handle the next message."
    expected: "End-to-end: interim message arrives within ~45s of upstream stall; graceful fallback arrives once SDK throws; no process exit / no infinite loop / no double-handling of next inbound."
    why_human: "Unit tests prove the catch path wires; only a live WhatsApp send confirms (a) Meta delivery latency does not undermine UX, (b) the LAT-02 interim message is actually perceived by the user during a real stall, (c) the graceful fallback closes the conversation gracefully on a real device."
    defer_to: v5.4.0
    defer_reason: "Cannot be exercised in dev — requires production deploy with throttled upstream conditions (ngrok + Meta test tokens insufficient). v5.4.0 owns the dev → prod migration; this smoke test attaches to that milestone's acceptance gate."
---

# Phase 94: OpenAI Latency + Graceful Failure — Verification Report

**Phase Goal:** A slow or hung OpenAI request can no longer silently stall the handler for minutes. The OpenAI SDK is bounded by an explicit timeout, the handler sends an interim UX message when the call exceeds the timeout boundary, and a graceful fallback is sent (and the bot returns cleanly) if a retry also fails. Closes BUG-02 from the post-v5.3.2 live test (~3min response latency window 22:23-22:26).
**Initial verification:** 2026-05-17T23:05:37Z (gsd-verifier)
**Disposition pass:** 2026-05-18T02:39:20Z (CR-01/WR-01 ACCEPTED, CR-02 → 94-02 gap closure, live smoke test DEFERRED to v5.4.0)
**Re-verification after gap closure:** 2026-05-18T17:18:00Z (this entry — 94-02 shipped, CR-02 closed)
**Status:** human_needed — Phase 94 cannot be marked `passed` until the live BUG-02 smoke test runs in v5.4.0. CR-02 closure verified.

## Re-verification After 94-02 Ship (2026-05-18)

### Why this re-verification

Plan 94-02 (`94-02-PLAN.md`) shipped 2026-05-18 to close gap CR-02 from the initial verification. CR-02 was NOT accepted as override at disposition time (2026-05-18T02:39:20Z) because the invariant discipline installed in Phase 93 must hold — the SDK's default `maxRetries: 2` made real worst-case per-`provider.chat` 135s instead of 45s, pushing end-to-end worst-case to 845s and breaking the canonical formula's 600s `DEBOUNCE_TTL_SECONDS` lock. The closure path was set at disposition time: set `maxRetries: 0` on the OpenAI client (option a — invariant locks the value at 0; no env override).

This re-verification confirms 94-02 actually shipped what its plan declared, the original 4 must-haves are still satisfied, and the CR-02 gap is genuinely closed in the codebase (not just claimed in SUMMARY.md).

### Re-verification scope

| Item                                                                                                    | Source of authority        | Verification result                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| LAT-01 — explicit `timeout: 45000` on OpenAI constructor, env-overridable, default-locked               | 94-01-PLAN must_haves[0]   | VERIFIED at `el-templo-bot/src/ai/openai.ts:62-63`. `resolveOpenAiTimeoutMs()` at `:50-55` resolves env with defensive fallback.                |
| **NEW: LAT-01 (94-02 addition)** — explicit `maxRetries: 0` on OpenAI constructor                       | 94-02-PLAN must_haves[0,1] | VERIFIED at `el-templo-bot/src/ai/openai.ts:63` — literal `maxRetries: 0` inside the constructor options object.                                |
| LAT-02 — interim UX "Dame un segundo 🙌" on `OpenAI.APIError`                                           | 94-01-PLAN must_haves[1]   | VERIFIED at `handler.ts:444-458` (sendInterimUx with single-fire guard) + `:649-657` and `:718-725` (both `provider.chat` await sites wrapped). |
| LAT-03 — graceful fallback + clean handler return                                                       | 94-01-PLAN must_haves[2]   | VERIFIED at `handler.ts:345-370` outer catch with inner try/catch around `sendTextMessage`.                                                     |
| Cross-Phase Invariant — original locked formula `45 × 1 × 5 + 30 × 5 + 20 = 395 ≤ 600` holds post-94-02 | 94-02-PLAN must_haves[1]   | VERIFIED — script exits 0, formula text byte-identical across all 5 canonical doc locations.                                                    |
| Regression test — `client.maxRetries === 0` asserted with and without env override                      | 94-02-PLAN must_haves[3]   | VERIFIED — `readClientMaxRetries` helper at `test/v5-3-3-openai-latency.test.ts:77-80` + 2 `it()` blocks at `:149-156` and `:158-168`.          |

### Re-verification: codebase evidence

#### 94-02 commits land on the working branch

```
$ git log --oneline -n 12
caf61869 docs(94): add 94-02 code review report
b859671c docs(phase-94): post-wave tracking + log SC#3 flake follow-up
64556d68 chore: merge executor worktree (worktree-agent-aca875803a009336f)
07c65571 docs(94-02): summary — CR-02 closure, OpenAI maxRetries=0 (Phase 94-02 complete)
c6c6bc0e fix(bot): set OpenAI maxRetries=0 to honor Cross-Phase Invariant (CR-02)
5ff993f0 test(94-02): fail-in-main regression for SDK maxRetries=0 (CR-02 closure)
1c5e9e22 docs(94): add 94-02-PLAN.md gap closure for CR-02 (SDK maxRetries=0)
...
```

RED `5ff993f0` immediately precedes GREEN `c6c6bc0e` — TDD discipline preserved.

#### Atomic commit scope

```
$ git show --stat 5ff993f0
 el-templo-bot/test/v5-3-3-openai-latency.test.ts | 61 ++++++++++++++++++++++++
 1 file changed, 61 insertions(+)

$ git show --stat c6c6bc0e
 el-templo-bot/src/ai/openai.ts | 20 ++++++++++++++++++--
 1 file changed, 18 insertions(+), 2 deletions(-)
```

Each commit modified exactly the file declared in its `files_modified` frontmatter. No scope leak.

#### Out-of-scope guardrails (94-02-PLAN.md verification step 12)

```
$ git diff 5ff993f0^..c6c6bc0e -- \
    el-templo-bot/.env.example \
    el-templo-bot/src/webhook/handler.ts \
    el-templo-bot/scripts/check-debounce-invariant.sh \
    el-templo-bot/src/tools.ts \
    el-templo-bot/src/ai/anthropic.ts \
    .planning/phases/93-handler-concurrency/93-CONTEXT.md \
    .planning/phases/94-openai-latency-graceful-failure/94-CONTEXT.md \
    .planning/ROADMAP.md \
    .planning/MACRO-ROADMAP.md \
  | wc -l
0
```

All 9 negative-assertion diffs empty (combined 0 lines). 94-02 stayed strictly within its declared `files_modified` (`openai.ts` + the test file).

#### Source-grep gates (post-GREEN, comment-filtered)

```
$ grep -c "maxRetries: 0" el-templo-bot/src/ai/openai.ts
3
$ grep -v '^\s*[/*]' el-templo-bot/src/ai/openai.ts | grep -c "maxRetries: 0"
2
$ grep -c "readClientMaxRetries" el-templo-bot/test/v5-3-3-openai-latency.test.ts
3
$ grep -c "expect(readClientMaxRetries(provider)).toBe(0)" el-templo-bot/test/v5-3-3-openai-latency.test.ts
2
```

Constructor option + logger payload (2 non-comment occurrences) + doc-comment mention (1 comment occurrence) = 3 total. Test helper declared once + called twice = 3 occurrences; assertion fired in both new `it()` blocks = 2 occurrences. All gates satisfied.

#### SDK runtime spot-check (Level 4 — data flow)

```
$ cd el-templo-bot && node -e "import('openai').then(m => { const c = new m.default({timeout:45000, maxRetries:0, apiKey:'sk-test'}); console.log('maxRetries=' + c.maxRetries); console.log('timeout=' + c.timeout); })"
maxRetries=0
timeout=45000
```

The SDK accepts and stores both options on the public client surface. The test-only `readClientMaxRetries` accessor returns ground truth, not a coerced default. The assertion `expect(readClientMaxRetries(provider)).toBe(0)` is meaningful (not a tautology against a hidden default).

#### Cross-Phase Invariant guard

```
$ bash el-templo-bot/scripts/check-debounce-invariant.sh
Cross-phase invariant OK: TTL=600 >= minimum 395
$ echo $?
0
```

Formula `(45000/1000) × 5 + 30 × 5 + 20 = 395 ≤ 600` holds with maxRetries=0 — no script edit required, no formula change.

#### SHA-256 multi-doc invariant drift check

```
$ extract_block() { awk -v s="$2" 'NR>=s {print; if (/Minimum TTL =/) exit}' "$1"; }
$ expected="67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344"
$ for spec in \
    ".planning/phases/93-handler-concurrency/93-CONTEXT.md:84" \
    ".planning/phases/94-openai-latency-graceful-failure/94-CONTEXT.md:34" \
    ".planning/ROADMAP.md:62" \
    ".planning/ROADMAP.md:93" \
    ".planning/MACRO-ROADMAP.md:99"; do
    f="${spec%:*}"; l="${spec##*:}"
    got=$(extract_block "$f" "$l" | shasum -a 256 | cut -d' ' -f1)
    [ "$got" = "$expected" ] && echo "OK   $f:$l" || echo "DRIFT $f:$l = $got"
  done
OK   .planning/phases/93-handler-concurrency/93-CONTEXT.md:84
OK   .planning/phases/94-openai-latency-graceful-failure/94-CONTEXT.md:34
OK   .planning/ROADMAP.md:62
OK   .planning/ROADMAP.md:93
OK   .planning/MACRO-ROADMAP.md:99
```

All 5 canonical block locations hash to `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` — formula text byte-identical, no drift.

Note: the initial verification (2026-05-17) used a different awk extraction range and reported hash `7f324a5b…`. The 94-02 SUMMARY notes the canonical hash as `67670b1e…` using a different extraction pattern (`Minimum TTL =` end-marker). Both extraction patterns produce internally-consistent hashes across all 4 markdown locations; the discriminating fact is that all 5 location-line pairs match each other byte-for-byte under whatever extraction the planner chose. That property holds.

#### Test suite results

**Isolated Phase 94 suite (deterministic):**

```
$ cd el-templo-bot && pnpm test v5-3-3-openai-latency
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

Two sequential runs both 8/8 PASS.

**Phase 93 regression suite (no regression):**

```
$ cd el-templo-bot && pnpm test v5-3-3-handler-concurrency
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

**Full bot test suite (flake reproduced, deterministic on isolation):**

```
$ cd el-templo-bot && pnpm test
# Run 1 (2026-05-18T17:17:32):
 Test Files  1 failed | 27 passed (28)
      Tests  1 failed | 616 passed (617)
# Failure: test/v5-3-3-openai-latency.test.ts:532:33
#   expect(interimSends.length).toBe(1) — receives 0

# Run 2 (2026-05-18T17:17:49, immediately after):
 Test Files  28 passed (28)
      Tests  617 passed (617)
```

This is the **documented SC#3 flake** introduced by 94-01's `fa65e5b3` (see `94-02-SUMMARY.md` "Known Issues / Follow-ups" and `STATE.md` Pending Decisions). 50% flake rate under parallel-load contention from the other 27 test files; 0% in suite-isolated runs. **Out of scope for this verification** per user instruction — surfaced as known issue, not classified as a new regression. Phase 94-02 itself is flake-free; both of its new `it()` blocks (`maxRetries === 0` regression coverage) pass on every run.

#### TypeScript clean

```
$ cd el-templo-bot && pnpm tsc --noEmit
# exit 0
```

## Original Goal Achievement (after 94-02 ship)

### Observable Truths

| #   | Truth                                                                                                                                                                                                                       | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | When provider.chat hangs (SDK never returns), the handler bails within the timeout boundary instead of stalling for the SDK's 600s default                                                                                  | VERIFIED | `openai.ts:50-55` `resolveOpenAiTimeoutMs()` + `:62-63` `new OpenAI({ timeout, maxRetries: 0 })`. Real per-call wall-clock = `OPENAI_TIMEOUT_MS / 1000`s — NOT `3×` thanks to `maxRetries=0` (94-02 closure). Phase 94 unit suite 3 LAT-01 tests PASS deterministic.                                                                                                                                                                                                                                                                                                   |
| 2   | When provider.chat throws OpenAI.APIError (incl. APIConnectionTimeoutError), the user receives 'Dame un segundo 🙌' via sendTextMessage exactly once per inbound                                                            | VERIFIED | `handler.ts:444-458` defines `sendInterimUx` closure with single-fire `interimSent` guard. `handler.ts:649-657` and `:718-725` wrap both `provider.chat` await sites with `if (err instanceof OpenAI.APIError) await sendInterimUx()`. Test SC#2 asserts exactly one interim send when APIError thrown. **Caveat:** discriminator is OpenAI-specific (CR-01 — ACCEPTED) — silent no-op on Anthropic provider path.                                                                                                                                                     |
| 3   | When the OpenAI call ultimately fails, the user receives 'Tuve un problemita técnico, ¿me lo escribís de nuevo?' and processWithAi returns cleanly — no throw escapes, no infinite loop, no process exit                    | VERIFIED | `handler.ts:345-370` outer catch (post-mod) executes `log.error(...)` then inner-try sends graceful fallback; inner-try swallows + logs send failures. No `throw` in catch path. Test SC#3 asserts `expect(p).resolves.toBeUndefined()` AND both interim + graceful sends fired (1 each). **Caveat:** WR-01 (ACCEPTED) — both messages fire back-to-back when APIError triggers LAT-02 then propagates to LAT-03; UX contradiction. **Note:** SC#3 has a known intermittent flake under parallel suite load (out of scope; not introduced by 94-02; see known_issues). |
| 4   | The Cross-Phase Invariant holds with current defaults: `DEBOUNCE_TTL_SECONDS (600) ≥ (OPENAI_TIMEOUT_MS/1000)*5 + 30*5 + 20 = 395`                                                                                          | VERIFIED | `bash el-templo-bot/scripts/check-debounce-invariant.sh` → `Cross-phase invariant OK: TTL=600 >= minimum 395` (exit 0). Spot-check `DEBOUNCE_TTL_SECONDS=100 bash …` → INVARIANT VIOLATION (exit 1) confirms guard works in both directions.                                                                                                                                                                                                                                                                                                                           |
| 5   | **NEW (94-02):** The Cross-Phase Invariant holds in REALITY (not just on paper) — `maxRetries: 0` on the OpenAI client means real per-call wall-clock equals `OPENAI_TIMEOUT_MS / 1000`, not `3 × OPENAI_TIMEOUT_MS / 1000` | VERIFIED | `openai.ts:63` constructs `new OpenAI({ timeout: timeout, maxRetries: 0 })`. SDK runtime spot-check confirms `client.maxRetries === 0` is honored and stored. Two regression tests at `test/v5-3-3-openai-latency.test.ts:149-156` and `:158-168` lock the invariant in unit tests. Real worst-case `45 × 1 × 5 + 30 × 5 + 20 = 395s ≤ 600s` — original locked formula now matches reality.                                                                                                                                                                            |

**Score:** 5/5 truths verified. (Truth 5 added by re-verification — was implicit in the original CR-02 disposition that the invariant must hold in REALITY, not just formula.)

### Required Artifacts

| Artifact                                            | Expected                                                                    | Status   | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-bot/src/ai/openai.ts`                    | OpenAI SDK client with explicit `timeout` AND `maxRetries: 0`               | VERIFIED | `:62-63` — `new OpenAI({ timeout: timeout, maxRetries: 0 })` with `resolveOpenAiTimeoutMs()` at `:50-55`. Defensive parsing: undefined/empty/non-numeric falls back to 45000. Logger payload at `:65-68` includes `maxRetries: 0` for boot confirmation (REVIEW WR-01 flagged this as a literal-not-derived value — acknowledged advisory). Catch at `:125-140` re-throws raw `OpenAI.APIError`. Doc-comment at `:37-48` carries the CR-02 invariant rationale inline. |
| `el-templo-bot/src/webhook/handler.ts`              | LAT-02 interim-message wrap + LAT-03 graceful fallback                      | VERIFIED | `:14` imports OpenAI default; `:444-458` `sendInterimUx` closure; `:649-657` LAT-02 site #1; `:718-725` LAT-02 site #2; `:345-370` LAT-03 outer catch with inner-try graceful send. UNCHANGED by 94-02 (out-of-scope guardrail PASS).                                                                                                                                                                                                                                  |
| `el-templo-bot/.env.example`                        | OPENAI_TIMEOUT_MS declaration                                               | VERIFIED | `:24-26` — 3 lines: comment line × 2 + `OPENAI_TIMEOUT_MS=45000`. Pre-existing Phase-93 invariant block at `:39-45` unchanged. UNCHANGED by 94-02 (no `OPENAI_MAX_RETRIES` env var — deliberate; invariant locks at 0).                                                                                                                                                                                                                                                |
| `el-templo-bot/test/v5-3-3-openai-latency.test.ts`  | TDD fail-in-main unit suite covering SC#1..#4 + 94-02 maxRetries regression | VERIFIED | 8 test cases (6 from 94-01 + 2 from 94-02). All 8 PASS isolated. `readClientMaxRetries` helper at `:77-80` mirrors `readClientTimeout` pattern. RED commit `5ff993f0` (test file only) immediately precedes GREEN commit `c6c6bc0e`.                                                                                                                                                                                                                                   |
| `el-templo-bot/scripts/check-debounce-invariant.sh` | Cross-Phase Invariant guard script (manual / CI)                            | VERIFIED | 35 lines, executable (`-rwxr-xr-x`), `set -euo pipefail`, formula matches canonical block, exit 0 on PASS / exit 1 on INVARIANT VIOLATION. UNCHANGED by 94-02. Not wired into git hooks (intentional — Phase 94 owns creation; hook wiring is deferred to Phase 97 RGUARD-02 territory).                                                                                                                                                                               |

### Key Link Verification

| From                                            | To                                             | Via                                               | Status | Details                                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai.ts:51`                                  | `process.env.OPENAI_TIMEOUT_MS`                | constructor option via `resolveOpenAiTimeoutMs()` | WIRED  | `:51` reads env, `:63` passes resolved value to constructor. Logger payload at `:66` includes resolved timeout for boot-time confirmation.                            |
| `openai.ts:63`                                  | OpenAI SDK constructor option `maxRetries: 0`  | constructor option object literal (94-02)         | WIRED  | Single locked literal in the constructor options object. Logger payload at `:66` includes `maxRetries: 0`. No env override — invariant lock.                          |
| `handler.ts:345-370` (outer catch)              | `sendTextMessage(message.phone, ...)`          | catch block on processWithAi                      | WIRED  | `:358-361` `await sendTextMessage(phone, "Tuve un problemita técnico, ¿me lo escribís de nuevo?")` inside inner-try; `:362-369` swallows + logs send failures.        |
| `handler.ts:649-657` + `:718-725` (catch sites) | `sendTextMessage(phone, "Dame un segundo 🙌")` | OpenAI.APIError catch path → `sendInterimUx`      | WIRED  | Two `provider.chat` await sites both call `sendInterimUx()` on APIError; closure flips single-fire flag; `:449` calls `sendTextMessage(phone, "Dame un segundo 🙌")`. |

### Data-Flow Trace (Level 4)

| Artifact                          | Data Variable                                | Source                                                                           | Produces Real Data                                                                      | Status  |
| --------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| `openai.ts` (client construction) | `timeout` (constructor arg)                  | `resolveOpenAiTimeoutMs()` → `process.env.OPENAI_TIMEOUT_MS` with fallback 45000 | Yes (env-sourced + default)                                                             | FLOWING |
| `openai.ts` (client construction) | `maxRetries` (constructor arg)               | Literal `0` (94-02) — invariant-locked                                           | Yes (literal value flows to SDK; runtime spot-check confirms `client.maxRetries === 0`) | FLOWING |
| `handler.ts` `sendInterimUx`      | "Dame un segundo 🙌" string literal          | Inline literal in `:449`                                                         | Yes (literal copy)                                                                      | FLOWING |
| `handler.ts` outer catch (LAT-03) | "Tuve un problemita técnico…" string literal | Inline literal in `:360`                                                         | Yes (literal copy)                                                                      | FLOWING |
| `check-debounce-invariant.sh`     | TTL/TIMEOUT_S/etc.                           | Env with defaults (TTL=600, OPENAI_TIMEOUT_MS=45000, etc.)                       | Yes (env-sourced + defaults)                                                            | FLOWING |

### Behavioral Spot-Checks

| Behavior                                                              | Command                                                                                                                                                              | Result                                                                              | Status                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| Phase 94 unit suite passes (isolated)                                 | `pnpm test v5-3-3-openai-latency`                                                                                                                                    | `Tests 8 passed (8)` — 2 sequential runs                                            | PASS                                          |
| Phase 93 regression suite remains green                               | `pnpm test v5-3-3-handler-concurrency`                                                                                                                               | `Tests 3 passed (3)`                                                                | PASS                                          |
| Full bot test suite (one run shows known flake; second run clean)     | `pnpm test`                                                                                                                                                          | Run 1: `1 failed (SC#3 line 532)                                                    | 616 passed (617)`. Run 2: `617 passed (617)`. | FLAKE (out of scope — known issue documented in `known_issues` frontmatter) |
| TypeScript clean                                                      | `pnpm tsc --noEmit`                                                                                                                                                  | exit 0 (no errors)                                                                  | PASS                                          |
| Cross-Phase Invariant script exits 0 at default env                   | `bash el-templo-bot/scripts/check-debounce-invariant.sh`                                                                                                             | `Cross-phase invariant OK: TTL=600 >= minimum 395` (exit 0)                         | PASS                                          |
| OpenAI SDK honors `{ timeout, maxRetries }` (runtime verification)    | `cd el-templo-bot && node -e "import('openai').then(m=>{const c=new m.default({timeout:45000,maxRetries:0,apiKey:'sk-test'});console.log(c.maxRetries,c.timeout)})"` | `0\n45000`                                                                          | PASS                                          |
| Cross-doc invariant block byte-identical across 5 canonical locations | `awk … shasum -a 256` on each of `93-CONTEXT.md:84`, `94-CONTEXT.md:34`, `ROADMAP.md:62`, `ROADMAP.md:93`, `MACRO-ROADMAP.md:99`                                     | All five hash to `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` | PASS                                          |
| Out-of-scope guardrails (94-02 combined diff)                         | `git diff 5ff993f0^..c6c6bc0e -- <9 paths>`                                                                                                                          | 0 lines (empty)                                                                     | PASS                                          |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared in PLAN.md or by convention for this phase. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan(s)              | Description                                                                                                                                                                                                                                 | Status    | Evidence                                                                                                                                                                                                                                                                                                                     |
| ----------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAT-01      | 94-01-PLAN + **94-02-PLAN** | OpenAI client constructed with explicit `timeout` option in `openai.ts` — default 45000 ms, env-overridable via `OPENAI_TIMEOUT_MS`. `.env.example` updated. **94-02 added `maxRetries: 0` to honor the Cross-Phase Invariant in reality.** | SATISFIED | `openai.ts:62-63` + `.env.example:24-26`. Defensive parsing for invalid env. SC#1 test (5 cases — 3 timeout + 2 maxRetries) PASS deterministic.                                                                                                                                                                              |
| LAT-02      | 94-01-PLAN                  | On timeout / `OpenAI.APIError`, handler sends interim UX ("Dame un segundo 🙌") rather than hanging silently. Wraps `provider.chat` at `:649` and `:718`.                                                                                   | SATISFIED | `handler.ts:649-657` + `:718-725` + `sendInterimUx` closure at `:444-458`. SC#2 test PASS. **Quality caveat (CR-01 — ACCEPTED):** OpenAI-specific discriminator — Anthropic path silently no-ops.                                                                                                                            |
| LAT-03      | 94-01-PLAN                  | If retry/fallback also fails, send "Tuve un problemita técnico, ¿me lo escribís de nuevo?" and return cleanly — no infinite loop, no crash.                                                                                                 | SATISFIED | `handler.ts:345-370` outer catch + inner-try graceful send. SC#3 asserts `expect(p).resolves.toBeUndefined()` and both messages fired. **UX caveat (WR-01 — ACCEPTED):** back-to-back send sequence. **Test caveat:** SC#3 has a known intermittent flake under parallel suite load (out of scope; not introduced by 94-02). |

No orphaned requirements: REQUIREMENTS.md lists exactly LAT-01/02/03 for Phase 94. All three are claimed by `94-01-PLAN.md` frontmatter; LAT-01 is additionally claimed (and tightened) by `94-02-PLAN.md` frontmatter for the maxRetries closure. Plan-level requirement coverage: complete, no orphans.

### Anti-Patterns Found

| File                                                | Line    | Pattern                                                                                                                            | Severity | Impact                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-bot/src/ai/openai.ts`                    | 63      | `{ timeout: timeout, maxRetries: 0 }` — verbose property syntax for timeout (could be `{ timeout }`).                              | INFO     | Style nit (REVIEW IN-01 from 94-01; preserved by 94-02 for diff minimality). No behavioral impact.                                                                                                                                                        |
| `el-templo-bot/src/ai/openai.ts`                    | 66      | `logger.info({ model, timeout, maxRetries: 0 }, ...)` — logger payload hardcodes `0` rather than reading `this.client.maxRetries`. | WARNING  | 94-02-REVIEW.md WR-01 — the log can drift from the actual SDK state if someone modifies the constructor without updating the log. Mitigation: regression test catches a constructor-level change to `maxRetries`. Advisory; does not block phase closure. |
| `el-templo-bot/src/ai/openai.ts`                    | 37-48   | Doc-comment for `maxRetries: 0` rationale is appended to `resolveOpenAiTimeoutMs` JSDoc, which is an unrelated helper.             | WARNING  | 94-02-REVIEW.md WR-02 — rationale lives 14 lines away from the actual constructor lock at `:63`. A maintainer reading the constructor would not see the rationale inline. Advisory; does not block phase closure.                                         |
| `el-templo-bot/src/webhook/handler.ts`              | 14      | Direct `import OpenAI from "openai"` couples webhook handler to one provider; only used for `instanceof` discrimination.           | WARNING  | Provider abstraction breach (CR-01 — ACCEPTED). Anthropic provider path's `Anthropic.APIError` is not handled by LAT-02.                                                                                                                                  |
| `el-templo-bot/src/webhook/handler.ts`              | 109     | `Number(process.env.DEBOUNCE_TTL_SECONDS ?? 600)` — pre-existing brittle parse; NaN on non-numeric env causes Redis `SET EX NaN`.  | WARNING  | Pre-existing (Phase 93 territory, not Phase 94's surface). REVIEW CR-03 (94-01). Out-of-scope.                                                                                                                                                            |
| `el-templo-bot/src/webhook/handler.ts`              | 444     | `interimSent` closure flag scoped only to `processWithAiInner` — outer catch can't read it.                                        | WARNING  | REVIEW WR-05 (94-01). Forces back-to-back send sequence (WR-01 — ACCEPTED).                                                                                                                                                                               |
| `el-templo-bot/scripts/check-debounce-invariant.sh` | 20      | `TTL=${DEBOUNCE_TTL_SECONDS:-600}` then arithmetic compare — non-numeric env crashes ungracefully under `set -e`.                  | WARNING  | REVIEW WR-06 (94-01). Operator-error UX; not a correctness bug.                                                                                                                                                                                           |
| `el-templo-bot/test/v5-3-3-openai-latency.test.ts`  | 69      | Doc-comment for `readClientMaxRetries` references "review IN WR-08" — severity-prefix typo.                                        | INFO     | 94-02-REVIEW.md IN-02. Should be "94-REVIEW.md WR-08".                                                                                                                                                                                                    |
| `el-templo-bot/test/v5-3-3-openai-latency.test.ts`  | 158-168 | Second new `it()` block ("maxRetries remains 0 even when OPENAI_TIMEOUT_MS is overridden") is near-tautological.                   | INFO     | 94-02-REVIEW.md IN-01. Not harmful (~10 LOC cheap coverage); could be repurposed to assert `OPENAI_MAX_RETRIES` env var is ignored (more meaningful regression).                                                                                          |

**No 🛑 BLOCKER anti-patterns.** No debt markers (`TBD`, `FIXME`, `XXX`, `TODO`, `HACK`) in any Phase-94-modified file. No `console.*` calls. No `: any` types.

### Human Verification Required

1. **Live BUG-02 smoke test** — deferred to v5.4.0 (frontmatter `human_verification[0]`).
   - **Test:** Deploy to staging with a real WhatsApp number, simulate slow OpenAI upstream (network throttling or a sleep proxy), send an inbound message, observe end-to-end timing + WhatsApp delivery of both interim and graceful messages.
   - **Expected:** Per phase goal — handler bails within timeout boundary, user receives both messages, bot does not crash, next inbound is handled cleanly.
   - **Why deferred:** Cannot be exercised in dev (ngrok + Meta test tokens insufficient). v5.4.0 provisions the production environment and owns this acceptance check. **Carry-forward dependency:** v5.4.0 milestone scope MUST include this smoke test as an acceptance gate before Phase 94 can be marked closed.

### Accepted Overrides (carried forward from initial verification)

Two findings from `94-REVIEW.md` accepted with documented rationale per explicit in-session user authorization 2026-05-17. Both are quality / UX dispositions on already-VERIFIED must-haves — neither blocks goal achievement.

1. **CR-01 — Provider-specific error narrowing (ACCEPTED)**
   - **Finding:** `handler.ts` LAT-02 catch uses `err instanceof OpenAI.APIError`. When `AI_PROVIDER=anthropic`, the discriminator silently no-ops on `Anthropic.APIError` throws.
   - **Disposition (verbatim):** "instanceof OpenAI.APIError narrow-typing applies only when AI_PROVIDER=openai. Per .env.example, production locks AI_PROVIDER=openai. The Anthropic factory path is dormant in v5.3.3. If/when Anthropic is enabled, the error narrowing must be generalized — tracked as a known limitation, not a gap."
   - **Accepted by:** matzaia2001 (in-session authorization, 2026-05-18T02:39:20Z)

2. **WR-01 — Back-to-back interim + graceful-fallback UX (ACCEPTED)**
   - **Finding:** When `provider.chat` throws `APIError`, user receives "Dame un segundo 🙌" immediately followed by "Tuve un problemita técnico, ¿me lo escribís de nuevo?" with no perceptible delay.
   - **Disposition (verbatim):** "Back-to-back 'Dame un segundo' + graceful fallback message is a UX rough edge but does not affect functional correctness. The common path (timeout + retry succeeds) delivers a clean user experience. The worst-case path (timeout + retry also fails) is empirically rare. Lifting interimSent to outer scope is a future UX refinement, captured as known limitation rather than a v5.3.3 blocker."
   - **Accepted by:** matzaia2001 (in-session authorization, 2026-05-18T02:39:20Z)

### Closed Gaps

1. **CR-02 — SDK `maxRetries=2` default breaks Cross-Phase Invariant** — CLOSED 2026-05-18 via 94-02
   - **Finding:** SDK default `maxRetries: 2` made real worst-case per-`provider.chat` call `3 × 45s = 135s`. Real worst-case end-to-end `135 × 5 + 30 × 5 + 20 = 845s` exceeded the `DEBOUNCE_TTL_SECONDS=600` lock TTL by 245s.
   - **Closure approach (option a from disposition):** Set `maxRetries: 0` on the OpenAI client constructor in `el-templo-bot/src/ai/openai.ts:63`. The handler already provides retry/recovery via the Phase 94 LAT-02 interim UX + LAT-03 graceful fallback path; SDK-level double-retry was redundant. `maxRetries=1` was rejected (would yield 620s > 600s); only `maxRetries=0` preserved the original locked formula without forcing a multi-doc canonical-block resync.
   - **Closure verified in this re-verification:**
     - Constructor option at `openai.ts:63` contains `maxRetries: 0` (confirmed by Read tool + comment-filtered grep returning 2 occurrences).
     - SDK runtime spot-check returns `client.maxRetries === 0` and `client.timeout === 45000`.
     - Two regression tests at `test/v5-3-3-openai-latency.test.ts:149-156` and `:158-168` lock the invariant — both PASS isolated.
     - Real worst-case formula `45 × 1 × 5 + 30 × 5 + 20 = 395s ≤ 600s` holds; canonical block unchanged across all 5 doc locations (sha256 `67670b1e…`).
     - Out-of-scope guardrails clean: combined diff across the 9 declared-out-of-scope paths is 0 lines.
   - **Commits:** RED `5ff993f04ce39c1a9f7d0523b5d33bcef94ca3f2` → GREEN `c6c6bc0e2940edf3761fed9413f08c3f60930c9c` → SUMMARY `07c65571` → merge `64556d68`.

### Known Issues (Not Gaps)

1. **SC#3 graceful-fallback test intermittent flake** (id: `SC3-FLAKE-94-01`)
   - **Origin:** Introduced by 94-01's RED commit `fa65e5b3`, NOT by 94-02.
   - **Location:** `el-templo-bot/test/v5-3-3-openai-latency.test.ts:~515` (the `"sends 'Dame un segundo' AND 'Tuve un problemita técnico'; handler returns cleanly"` it-block). Failing assertion: `expect(interimSends.length).toBe(1)` receives `0`.
   - **Observed during this re-verification:** Full bot suite run 1 (17:17:32) reported 616/617 — 1 failure at SC#3 line 532. Run 2 immediately after (17:17:49) reported 617/617 clean. Isolated suite `pnpm test v5-3-3-openai-latency` PASS 8/8 on 2 sequential runs. Matches the ~50% under-parallel-load flake rate documented in `94-02-SUMMARY.md` "Known Issues / Follow-ups".
   - **Hypothesis:** `vi.advanceTimersByTimeAsync(3500)` timing coupling with promise-resolution ordering — likely needs an explicit await on the interim send promise before asserting `sendCalls`.
   - **Disposition:** Tracked here, in `94-02-SUMMARY.md` "Known Issues / Follow-ups", and in `STATE.md` Pending Decisions. **MUST be resolved before v5.4.0 ships** — CI must be deterministic for prod deploy. Candidate remediation: Phase 97 (RGUARD scope expansion) or carved out as a 97.1 / v5.3.4 if timing allows.
   - **Out of scope for this verification** per user instruction: surfaced as known issue, not as new gap. 94-02 itself is flake-free; both of its new `it()` blocks pass on every run.

### Out-of-Scope Verified

**For 94-01 (initial verification):**

- `git diff fa65e5b3^..d3de86b1 -- el-templo-bot/src/tools.ts` → **empty** (Phase 95/97 territory).
- `git diff fa65e5b3^..d3de86b1 -- el-templo-bot/src/webhook/handler.ts | grep "DEBOUNCE_TTL_SECONDS\s*="` → **empty** (Phase 93 owns the definition).

**For 94-02 (this re-verification):**

- Combined diff `git diff 5ff993f0^..c6c6bc0e -- <9 paths>` → 0 lines empty. The 9 paths: `.env.example`, `handler.ts`, `check-debounce-invariant.sh`, `tools.ts`, `anthropic.ts`, `93-CONTEXT.md`, `94-CONTEXT.md`, `ROADMAP.md`, `MACRO-ROADMAP.md`.
- Per-commit stat: RED `5ff993f0` touched only the test file (+61); GREEN `c6c6bc0e` touched only `openai.ts` (+18/-2). No drift outside declared `files_modified`.
- Cross-Phase Invariant block byte-identical (`67670b1e…`) across all 5 canonical locations after the 94-02 ship.

### Gaps Summary

**Phase 94 mechanically achieves its goal end-to-end now that 94-02 has shipped.** BUG-02's specific failure (~3 min silent stall observed 2026-04-16) is closed: the OpenAI SDK is bounded by an explicit 45000 ms timeout (env-overridable) AND `maxRetries: 0` (94-02 lock — invariant-aligned), the interim UX message fires on `OpenAI.APIError`, the graceful fallback fires from the outer catch with clean return, and the Cross-Phase Invariant `600 ≥ 395` holds in REALITY (not just in formula text). All 5 must-have truths verified — 4 from initial verification + 1 added by re-verification to assert the post-94-02 truth that the invariant holds in REALITY.

The phase status remains **`human_needed`** rather than `passed` because:

1. **Live BUG-02 smoke test (deferred to v5.4.0):** Cannot be exercised in dev (ngrok + Meta test tokens insufficient). v5.4.0 milestone scope MUST include this as an acceptance gate before Phase 94 can be marked closed.

2. **Open known issue (out of scope; tracked elsewhere):** The SC#3 flake under parallel suite load — introduced by 94-01's RED commit, NOT by 94-02 — must be resolved before v5.4.0 ships. Not classified as a Phase 94 gap; documented in `known_issues` frontmatter, `94-02-SUMMARY.md`, and `STATE.md`.

CR-01 and WR-01 are accepted with documented rationale per explicit in-session user authorization (see "Accepted Overrides"). CR-02 was originally a non-accepted gap requiring closure via `94-02-PLAN.md`; that closure is now verified shipped — see "Closed Gaps".

---

_Initial verification: 2026-05-17T23:05:37Z (gsd-verifier)_
_Disposition pass: 2026-05-18T02:39:20Z (user-driven — CR-01/WR-01 ACCEPTED; CR-02 → 94-02 gap closure; live smoke DEFERRED to v5.4.0)_
_Re-verification after gap closure: 2026-05-18T17:18:00Z (gsd-verifier — 94-02 ship verified; CR-02 CLOSED; phase remains `human_needed` pending v5.4.0 live smoke)_
