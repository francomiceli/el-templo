---
phase: 94-openai-latency-graceful-failure
reviewed: 2026-05-17T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - el-templo-bot/src/ai/openai.ts
  - el-templo-bot/src/webhook/handler.ts
  - el-templo-bot/test/v5-3-3-openai-latency.test.ts
  - el-templo-bot/scripts/check-debounce-invariant.sh
  - el-templo-bot/.env.example
findings:
  critical: 3
  warning: 8
  info: 3
  total: 14
status: issues_found
---

# Phase 94: Code Review Report

**Reviewed:** 2026-05-17
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 94 implements three changes:

1. **LAT-01** — bounds the OpenAI SDK call with an env-configurable timeout (default 45s).
2. **LAT-02** — sends an interim "Dame un segundo 🙌" message when `provider.chat` throws an `OpenAI.APIError`.
3. **LAT-03** — graceful user-visible fallback ("Tuve un problemita técnico, ¿me lo escribís de nuevo?") when AI processing fails.

The TDD tests are present and well-structured. However, the implementation has several correctness gaps:

- **Provider abstraction is broken** — the LAT-02 interim-UX path is `OpenAI.APIError`-specific and will silently no-op for the Anthropic code path that the factory still supports.
- **The Cross-Phase Invariant formula omits SDK retries** — the OpenAI SDK defaults to `maxRetries: 2`, so worst-case per-`chat()` call is 3× the configured timeout, not 1×. The 395-second floor under-estimates by a factor of ~3.
- **UX regression in the fallback path** — when an `APIError` fires, the user sees "Dame un segundo 🙌" followed _immediately_ by "Tuve un problemita técnico" with no gap. The "give me a second" promise is contradicted within the same WhatsApp delivery batch.
- **`DEBOUNCE_TTL_SECONDS` parsing** is unchanged and remains brittle — a non-numeric env value yields `NaN`, which is then passed to Redis `SET EX NaN`.
- **Pre-existing button-reply handler** has no try/catch around `executeTool` and bypasses dedup + session updates; pre-existing gap surfaced under v94 scope.

## Critical Issues

### CR-01: LAT-02 interim UX is dead for the Anthropic provider path

**File:** `el-templo-bot/src/webhook/handler.ts:14, 653, 721`
**Issue:** The handler imports `OpenAI` from the `openai` package solely to use `OpenAI.APIError` as the `instanceof` discriminator for the interim "Dame un segundo" path. The factory at `el-templo-bot/src/ai/provider.ts:57-69` still supports `AI_PROVIDER=anthropic`, and `el-templo-bot/src/ai/anthropic.ts:98` throws `Anthropic.APIError` (a different constructor identity) on upstream failure. When the bot is configured for Anthropic, `err instanceof OpenAI.APIError` is always `false` → `sendInterimUx()` is skipped → the user sees no interim message during the multi-minute stall, only the eventual LAT-03 graceful fallback. This contradicts the LAT-02 intent ("user sees fast feedback during upstream stall") and silently degrades behavior depending on env config.

**Fix:** Either (a) detect provider-agnostic upstream errors via a shared discriminator (e.g., add an `isUpstreamProviderError(err)` helper that handles both `OpenAI.APIError` and `Anthropic.APIError`), or (b) widen the catch to all errors thrown out of `provider.chat` (since by contract, anything thrown there is an upstream failure):

```ts
// Option (a) — provider-agnostic discriminator in src/ai/provider.ts
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
export function isProviderApiError(err: unknown): boolean {
  return err instanceof OpenAI.APIError || err instanceof Anthropic.APIError;
}

// handler.ts
try {
  response = await provider.chat(messages, BOT_TOOLS);
} catch (err: unknown) {
  if (isProviderApiError(err)) await sendInterimUx();
  throw err;
}
```

### CR-02: Cross-Phase Invariant under-counts SDK retries — worst-case can exceed `DEBOUNCE_TTL_SECONDS`

**File:** `el-templo-bot/src/ai/openai.ts:50`, `el-templo-bot/src/webhook/handler.ts:96-109`, `el-templo-bot/scripts/check-debounce-invariant.sh:5-14`, `el-templo-bot/.env.example:39-45`
**Issue:** `new OpenAI({ timeout: timeout })` does NOT override `maxRetries`. The OpenAI SDK defaults to `maxRetries: 2` (see `openai/index.d.ts` — `RequestOptions.maxRetries?: number; // default 2`). On a transient 5xx or connection timeout, the SDK transparently retries — so the wall-clock for a single `provider.chat()` call is up to `3 × OPENAI_TIMEOUT_MS = 135s`, not `45s`. The Cross-Phase Invariant formula

```
DEBOUNCE_TTL_SECONDS >= (OPENAI_TIMEOUT_MS/1000) * MAX_TOOL_ITERATIONS
                      + executeTool_timeout * MAX_TOOL_ITERATIONS
                      + safety_buffer
```

asserts `600 >= 45*5 + 30*5 + 20 = 395`, but real worst-case is `135*5 + 30*5 + 20 = 845s` — **the lock TTL is too short**, exactly the failure mode the invariant exists to prevent (lock expires mid-handler → BUG-01 reintroduced). The TDD test SC#4 locks in the wrong numbers.

**Fix:** Either (a) explicitly set `maxRetries: 0` on the client (preferred — bot already has handler-level retry semantics via WhatsApp webhook redelivery), or (b) update the formula and TTL to account for retries:

```ts
// el-templo-bot/src/ai/openai.ts
this.client = new OpenAI({ timeout, maxRetries: 0 });
```

Then add a unit assertion mirroring SC#1 that `provider.client.maxRetries === 0`, and update the `.env.example` + `check-debounce-invariant.sh` + handler comments + 94-CONTEXT formula block in lockstep (per the user-MEMORY rule on multi-doc invariants requiring sha256 verification of identical blocks).

### CR-03: `DEBOUNCE_TTL_SECONDS` env parsing yields NaN on malformed input

**File:** `el-templo-bot/src/webhook/handler.ts:109`
**Issue:**

```ts
const DEBOUNCE_TTL_SECONDS = Number(process.env.DEBOUNCE_TTL_SECONDS ?? 600);
```

If an operator misconfigures `DEBOUNCE_TTL_SECONDS=six-hundred` (typo, copy-paste from human-readable docs, etc.), `Number("six-hundred")` returns `NaN`. That `NaN` is then passed to `tryAcquireDebounce(key, NaN)` → `redis.set(key, token, "EX", NaN, "NX")` → Redis returns an error ("value is not an integer or out of range") → `tryAcquireDebounce` returns `null` → **every webhook is silently dropped as "in-flight handler exists"**. The bot appears alive but answers no one. Same defensive parsing pattern that `resolveOpenAiTimeoutMs` (openai.ts:37-42) just added is conspicuously absent here.

**Fix:** Apply the same defensive parsing pattern Phase 94 just established for `OPENAI_TIMEOUT_MS`:

```ts
function resolveDebounceTtlSeconds(): number {
  const raw = process.env.DEBOUNCE_TTL_SECONDS;
  if (raw === undefined || raw === "") return 600;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600;
}
const DEBOUNCE_TTL_SECONDS = resolveDebounceTtlSeconds();
```

## Warnings

### WR-01: UX regression — "Dame un segundo" followed immediately by "Tuve un problemita técnico" contradicts itself

**File:** `el-templo-bot/src/webhook/handler.ts:357-369`, `el-templo-bot/test/v5-3-3-openai-latency.test.ts:454-478`
**Issue:** When `provider.chat` throws an `OpenAI.APIError`, the handler executes in this order:

1. `sendInterimUx()` → user sees "Dame un segundo 🙌".
2. `throw err` propagates to the outer catch.
3. Outer catch sends "Tuve un problemita técnico, ¿me lo escribís de nuevo?".

The two messages are sent back-to-back with no human-perceptible gap (the failure path has no retry / no delay between them). The user reads "give me a second" followed milliseconds later by "I had a technical issue, write it again" — the first promise is broken before they could read it. SC#3 even asserts both fire ("interim count = 1" AND "graceful count = 1") locking in this misleading sequence. The plan's LAT-02 motivation ("user gets fast feedback during a transient stall") only makes sense if the recovery path resends a real reply — when the call ultimately fails, the interim message becomes a lie.

**Fix:** Guard the LAT-03 graceful fallback on whether the interim UX was sent — if "Dame un segundo" already fired, suppress the apology and let the user retry organically (the interim message can serve as the "we'll get back to you" cue). Alternatively, only send the apology when `interimSent === false` (i.e., the error did not originate from the `provider.chat` path). Move the `interimSent` guard to handler-function scope so the outer catch can read it.

### WR-02: Pre-existing — button reply dispatch has no try/catch around `executeTool`

**File:** `el-templo-bot/src/webhook/handler.ts:215-264`
**Issue:** Button reply handling at line 220-262 calls `executeTool(...)` without any try/catch. If `executeTool` throws (DB unavailable, network error to el-templo-api, malformed args), the error escapes `handleInboundMessage` entirely. The outer try/catch at line 335-370 only wraps the `processWithAi(...)` call — button presses bypass it. A failing button click silently throws into the webhook caller and never sends the user any reply, never triggers the LAT-03 graceful fallback. Phase 94 explicitly aims for "graceful failure" but only for the AI text path — the button-confirm/cancel/schedule paths still fail silently.

**Fix:** Wrap each `executeTool` call in a try/catch matching the LAT-03 pattern, sending the same "Tuve un problemita técnico" fallback on error. Better: refactor button dispatch through `processWithAi` so the existing outer try/catch covers both surfaces.

### WR-03: Pre-existing — button replies bypass dedup and session updates

**File:** `el-templo-bot/src/webhook/handler.ts:215-264`
**Issue:** When `message.interactiveReplyId` is set, the handler returns at line 233/244/262 WITHOUT (a) inserting the inbound into `whatsapp_messages` (so no `ER_DUP_ENTRY` dedup on `whatsapp_message_id`), (b) calling `updateSession` to record the button press in Redis session history, (c) acquiring the debounce lock. WhatsApp _will_ redeliver webhooks on transient failure. If the same `confirm_booking` button reply is redelivered, `executeTool("book_class", ...)` runs twice — double booking. This is a Phase 94 boundary issue: the plan touched the surrounding handler logic but did not close this hole.

**Fix:** Move dedup INSERT and session update _before_ the button dispatch branch, OR add explicit dedup on `whatsappMessageId` using the same `isDuplicateEntryError` pattern at line 304-318.

### WR-04: `OpenAI` import in handler couples webhook handler to OpenAI SDK

**File:** `el-templo-bot/src/webhook/handler.ts:14`
**Issue:** `import OpenAI from "openai";` exists solely so the handler can do `err instanceof OpenAI.APIError`. This re-exports the `openai` package's heavy module tree (TypeScript types from `openai/resources/...`) into a module that is supposed to be provider-agnostic. Couples to one provider and forces a transitive bundle/cold-start cost on the webhook hot path. Related to CR-01 (provider abstraction breach).

**Fix:** Hide the error-type discrimination behind a method on `AiProvider`, e.g. `provider.isRetryableUpstreamError(err: unknown): boolean`. The handler then calls `provider.isRetryableUpstreamError(err)` and the `import OpenAI from "openai"` can be deleted.

### WR-05: `interimSent` closure flag is scoped to `processWithAiInner` only — outer catch cannot read it

**File:** `el-templo-bot/src/webhook/handler.ts:436-458`
**Issue:** The single-fire guard `interimSent` is declared inside `processWithAiInner` (line 444). The outer `handleInboundMessage` catch at line 345-370 cannot see it. This means the LAT-03 graceful fallback always fires, regardless of whether the interim UX already covered the user (see WR-01 for the UX consequence). Even if WR-01 is fixed by suppressing the apology when interim fired, the current code shape makes that fix mechanically impossible without lifting the flag.

**Fix:** Lift `interimSent` (or a return value indicating "interim already sent") into `handleInboundMessage` scope so the outer catch can conditionally suppress the graceful fallback.

### WR-06: `check-debounce-invariant.sh` crashes ungracefully on non-numeric env

**File:** `el-templo-bot/scripts/check-debounce-invariant.sh:20-26`
**Issue:** The script uses `set -euo pipefail`, then does `TTL=${DEBOUNCE_TTL_SECONDS:-600}` and later `[ "$TTL" -lt "$MINIMUM" ]`. If `DEBOUNCE_TTL_SECONDS="six-hundred"` (the same misconfiguration that triggers CR-03), the arithmetic comparison fails with bash's cryptic `[: six-hundred: integer expression expected`. The script exits non-zero (correct outcome) but with no actionable error message — the operator must scroll past `set -e`-suppressed bash internals to debug.

**Fix:** Add an explicit numeric validation step before the comparison:

```bash
is_positive_int() { [[ "$1" =~ ^[1-9][0-9]*$ ]]; }
for var_name in TTL TIMEOUT_S MAX_TOOL_ITERATIONS EXECUTE_TOOL_BUDGET BUFFER; do
  val="${!var_name}"
  if ! is_positive_int "$val"; then
    echo "INVARIANT GUARD: $var_name='$val' is not a positive integer" >&2
    exit 2
  fi
done
```

### WR-07: `OpenAiProvider` constructor re-reads env on every instantiation; `createAiProvider` is called per-request

**File:** `el-templo-bot/src/webhook/handler.ts:643`, `el-templo-bot/src/ai/openai.ts:48-53`
**Issue:** Each inbound message calls `createAiProvider()` at handler.ts:643, which instantiates a fresh `new OpenAiProvider(model)` → fresh `new OpenAI({ timeout })` → fresh `resolveOpenAiTimeoutMs()` env read. The OpenAI SDK does non-trivial setup (HTTPS agent, fetcher), and the env read on every webhook is wasteful (and means a runtime env override only takes effect on the _next_ inbound). Pre-existing pattern but Phase 94 just added more work to the constructor.

**Fix:** Memoize the provider at module scope:

```ts
let cachedProvider: AiProvider | null = null;
export function createAiProvider(): AiProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = /* ... */;
  return cachedProvider;
}
```

### WR-08: Test SC#1 depends on undocumented OpenAI SDK private field

**File:** `el-templo-bot/test/v5-3-3-openai-latency.test.ts:56-59, 82-107`
**Issue:** `readClientTimeout(provider)` accesses `provider.client.timeout` directly — a field the OpenAI SDK happens to expose but does not document as a stable public API. The test comment at line 50-55 acknowledges this ("undocumented private behavior — fragile"). Any minor SDK refactor (renaming to `_timeout`, moving to internal options, etc.) breaks this test even when the production code is correct. The contract Phase 94 actually wants to assert is "the SDK receives `timeout=45000` at construction time" — that's a constructor-call invariant, not a client-field invariant.

**Fix:** Spy on the `OpenAI` constructor via `vi.doMock("openai")` returning a factory that records constructor args, then assert `expect(constructorArgs[0]).toMatchObject({ timeout: 45000 })`. The test comment at line 38-45 actually plans for this pattern but the implementation falls back to private-field inspection.

## Info

### IN-01: `new OpenAI({ timeout: timeout })` should use object shorthand

**File:** `el-templo-bot/src/ai/openai.ts:50`
**Issue:** `{ timeout: timeout }` can be `{ timeout }` (ES2015 shorthand). Minor readability nit; the rest of the file uses shorthand consistently.
**Fix:** `this.client = new OpenAI({ timeout });`

### IN-02: `resolveOpenAiTimeoutMs` accepts whitespace-only env as "valid empty"

**File:** `el-templo-bot/src/ai/openai.ts:37-42`
**Issue:** `if (raw === undefined || raw === "") return 45_000;` does not handle whitespace (e.g., `OPENAI_TIMEOUT_MS="   "`). `Number("   ")` returns `0`, which then fails the `> 0` guard and falls back to 45000. So the behavior is _correct_, but for the wrong reason — defensive readers may think whitespace is treated as "set" and try to debug accordingly. Mostly a documentation / readability concern.
**Fix:** Either trim before the empty-string check, or extend the explicit-empty branch: `if (raw === undefined || raw.trim() === "") return 45_000;`.

### IN-03: SC#2 test name says "exactly once per inbound" but the test does not exercise the tool-loop re-entry path

**File:** `el-templo-bot/test/v5-3-3-openai-latency.test.ts:393-410`
**Issue:** The test name promises the interim is sent _exactly once_, including in the case where the tool loop fires multiple `provider.chat` calls. But the mock always throws on the first call, so the tool loop is never entered — the assertion `interimSends.length === 1` only verifies the single-call path. A future regression where the second `provider.chat` (inside the tool loop) double-sends the interim would not be caught by this test.

**Fix:** Add a second test variant where `provider.chat` succeeds on the first call (returning a single tool call), then throws on the second call inside the tool loop. Assert `interimSends.length === 1`.

---

_Reviewed: 2026-05-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
