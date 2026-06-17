# Phase 98: Test Hygiene (98-A/B/C) — Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 4 fix surfaces (3 modified test files + 1 new export in existing helpers)
**Analogs found:** 4 / 4 (all in-file; no cross-file analog hunting required — surgical test-infra phase)

## Framing

Phase 98 is a **test-infra-only** phase (HARD GUARD SC#5: zero `el-templo-api/src/**` and `el-templo-bot/src/**` modifications). There are no new components, modules, or services. The "pattern" job here is:

1. Confirm the analog code patterns already present in the target test files (so the planner's `<read_first>` blocks point at the right line ranges).
2. Surface any line-number drift vs CONTEXT.md (re-grepped 2026-06-17).
3. Pin down the **style template** for the single new named export `futureDateISO` in `test/helpers.ts`.

Each "modified file" is its own analog — the closest pattern is the file's own existing convention.

## File Classification

| Fix surface (file)                                                                                                 | Role                                                      | Data flow                                                | Closest analog                                                                                                          | Match quality                        |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `el-templo-api/test/helpers.ts` (+1 named export `futureDateISO`)                                                  | test-helper (named-export module)                         | pure function                                            | Same file — existing `createTestApp`, `getAuthToken`, `registerUser`                                                    | exact (same file, same export style) |
| `el-templo-api/test/subscriptions/subscriptions.test.ts` (98-A — 6 stale `startDate` sites)                        | test-file (integration, CRUD lifecycle)                   | request-response (Fastify `app.inject`)                  | Same file — existing `assignPlan(...)` helper + `expect(body.startDate).toBe(...)` assertions                           | exact                                |
| `el-templo-api/test/whatsapp/ai-tools.test.ts` (98-B — `:60` seed code + `:112` wording)                           | test-file (integration, raw SQL via `mysql2/promise`)     | request-response (direct `executeTool(...)` invocations) | Same file — `:119` second-branch INSERT uses `code='TSTB'` (the convention 98-B aligns the `:60` INSERT to)             | exact                                |
| `el-templo-api/test/whatsapp/webhook.test.ts` (98-C — top-of-file `vi.mock` + 2 echo asserts + image test rewrite) | test-file (integration, webhook payloads + async handler) | event-driven (POST → async handler → DB)                 | Same file — `:27-39` existing `vi.mock` of `sendTextMessage`; `:161-172` `waitForHandler()`; `:265-300` text-test shape | exact                                |

---

## Drift report vs CONTEXT.md (re-grepped 2026-06-17 at HEAD `9b2f17ff`)

### `subscriptions.test.ts` — `startDate:` site enumeration

`grep -n "startDate"` on the live file. All 6 stale sites + all 3 leave-alone sites are at the **exact** line numbers CONTEXT.md cites. Zero drift.

| Site                              | CONTEXT.md classification                                                    | Live status                                                                                                                                                      | Match                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:132`                            | STALE (2026-03-01)                                                           | confirmed                                                                                                                                                        | exact                                                                                                                                               |
| `:366` + coupled `:374` assertion | STALE (2026-03-01)                                                           | confirmed (`expect(body.startDate).toBe("2026-03-01")` at `:374`; also `expect(body.endDate).toBe("2026-03-31")` at `:375` — both need dynamic-ization per D-03) | exact, **+1 additional coupling**: `:375` `endDate` literal must also be derived from `addDays(start, plan.durationDays)` or independent arithmetic |
| `:388`                            | STALE (2026-03-01)                                                           | confirmed                                                                                                                                                        | exact                                                                                                                                               |
| `:406`                            | STALE (2026-03-01)                                                           | confirmed                                                                                                                                                        | exact                                                                                                                                               |
| `:423`                            | STALE (**2026-04-01**, not 03-01)                                            | confirmed — literal is `"2026-04-01"`                                                                                                                            | exact (CONTEXT.md correctly flags this; naive find-replace misses it)                                                                               |
| `:584`                            | STALE (2026-03-01)                                                           | confirmed                                                                                                                                                        | exact                                                                                                                                               |
| `:537`                            | LEAVE-ALONE (intentional past `2025-01-01`)                                  | confirmed                                                                                                                                                        | exact                                                                                                                                               |
| `:721`                            | LEAVE-ALONE (future `2026-06-01`; assertion at `:749-753` echoes the string) | confirmed                                                                                                                                                        | exact                                                                                                                                               |
| `:733`                            | LEAVE-ALONE (future `2026-07-01`; assertion at `:749-758` echoes the string) | confirmed                                                                                                                                                        | exact                                                                                                                                               |

### `ai-tools.test.ts` — `"lugares"` assertion sites

**Drift found.** CONTEXT.md D-06 locks only `:112`. Live `grep -n "lugares\|cupos"` returns **3 occurrences**:

| Live line | Assertion                                                                                       | CONTEXT.md coverage                          | Status    |
| --------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- | --------- |
| `:112`    | `expect(result).toContain("20 lugares");` (test #1 — "returns formatted schedule data")         | Covered by D-06 (→ `"20 cupos disponibles"`) | covered   |
| `:174`    | `expect(result).toContain("2 lugares");` (test #5 — "accounts for bookings in spots remaining") | **NOT covered by CONTEXT.md**                | **DRIFT** |
| `:225`    | `expect(result).toContain("20 lugares");` (test #7 — "does not count cancelled bookings")       | **NOT covered by CONTEXT.md**                | **DRIFT** |

Production source `el-templo-bot/src/ai/tools.ts:389` emits **only** `"sin cupos"` or `"${N} cupos disponibles"` — the string `"lugares"` does NOT appear in prod. If only `:112` is updated, tests #5 and #7 will continue to fail with the SAME 20-failure cascade root cause they're already failing under (cleanup bug → `Duplicate entry` cascade, then post-fix → `"lugares"` substring missing). Update at planner level: **D-06 needs the planner to apply the wording fix at all 3 sites** (`:112`, `:174`, `:225`) — not just `:112` — for SC#1 (511 pass) to actually land. Flag to surface in the planner's RED-B / GREEN-B step.

### `webhook.test.ts` — text-test echo assertion sites

**Minor drift.** CONTEXT.md D-08 says "two text-test assertions at `:292` and `:339`". Re-grep finds:

| Live line  | Assertion                                                                                                                  | CONTEXT.md coverage                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:292`     | `expect(echoMessages[0].content).toBe("Echo: Hello from WhatsApp!");` (new-sender test, DB outbound row)                   | covered                                                                                                                                                     |
| `:296-299` | `expect(sendTextMessage).toHaveBeenCalledWith("5491100000001", "Echo: Hello from WhatsApp!");` (new-sender test, mock spy) | **implicitly covered** by D-08's `toHaveBeenCalledWith` template — needs same canned-text substitution                                                      |
| `:339`     | `expect(messages).toHaveLength(2);` (existing-sender test, count assert)                                                   | covered as-is (count is correct; no literal text update needed at `:339` itself, BUT the message at index 1 will now be the canned mock reply, not "Echo:") |
| `:340`     | `expect(sendTextMessage).toHaveBeenCalledOnce();` (existing-sender test, mock count)                                       | covered as-is                                                                                                                                               |

D-08's two-assertion count is shorthand for "the new-sender test has 2 echo-text assertions (DB content + mock call); both get the canned reply". Planner should apply D-08's substitution to **both** `:292` AND `:298` (the `toHaveBeenCalledWith` second arg), not just `:292`.

### `webhook.test.ts` — image-test region

| CONTEXT line                                          | Live line                                                                                               | Drift |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----- |
| `:27-39` (`vi.mock` block for `sendTextMessage`)      | 27-39                                                                                                   | exact |
| `:161-172` (`waitForHandler` / `resetHandlerPromise`) | 161-172                                                                                                 | exact |
| `:194-198` (`onMessageHandled` callback)              | 194-198 (actually `:196-198` — `register(webhookRoutes, { onMessageHandled: () => handlerResolve() })`) | exact |
| `:388-417` (image test block)                         | 388-418                                                                                                 | exact |
| `:402` (the `setTimeout` to be removed)               | 402                                                                                                     | exact |

Zero drift on 98-C structural anchors.

---

## Pattern Assignments

### Surface 1 — `el-templo-api/test/helpers.ts` (+ new `futureDateISO`)

**Analog:** same file, existing exports.

**Import style** (lines 1-9):

```typescript
/**
 * Test helpers for API integration tests.
 *
 * Provides createTestApp() using the existing buildApp() factory,
 * and auth helpers for registering users and obtaining JWT tokens.
 */

import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";
```

**Existing named-export style** (the template `futureDateISO` follows verbatim) — lines 26-44:

```typescript
/**
 * Log in with email/password and return the JWT token.
 */
export async function getAuthToken(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  // ...
}
```

**Style rules the planner should apply to `futureDateISO`:**

- Top-of-function JSDoc comment in the same single-purpose style as the existing 3 exports (`/** ... */`, one sentence describing return, one sentence of context).
- Named `export function ...` (not default export, not namespace object, not arrow-stored-in-const). Matches `createTestApp`, `getAuthToken`, `registerUser`.
- Explicit return-type annotation (`: string`) — all three existing exports annotate return types (`Promise<FastifyInstance>`, `Promise<string>`, `Promise<{ ... }>`).
- Parameter named `daysFromToday: number` per D-01 contract.
- Implementation should re-use the project's noon-UTC pattern from `el-templo-api/src/modules/shared/date-utils.ts:15-19` (`addDays`) to avoid DST/day-boundary drift. **Note:** test helpers cannot import from `src/modules/shared/` cleanly without adding a new test-side dependency — the simpler option is to inline the same `new Date(...).setUTCDate(...)` shape. Planner picks; both options are SC#5-compliant (helpers.ts is `test/`, not `src/`).

**Style template (skeleton — planner picks exact body):**

```typescript
/**
 * Return today + N days as an ISO date string ("YYYY-MM-DD").
 * Uses noon UTC internally to avoid DST/day-boundary drift.
 */
export function futureDateISO(daysFromToday: number): string {
  // body
}
```

---

### Surface 2 — `el-templo-api/test/subscriptions/subscriptions.test.ts` (98-A)

**Analog:** same file's existing `assignPlan(...)` helper + assertion conventions.

**Imports pattern** (lines 1-16) — the `addDays` import goes here (D-02):

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { createTestApp, getAuthToken, registerUser } from "../helpers";
// Planner adds: import { futureDateISO } from "../helpers";  (or merge into existing helpers import line)
// Planner adds: import { addDays } from "../../src/modules/shared/date-utils";
```

**Note:** project convention is to merge multi-symbol imports from the same module into a single import statement. Planner should fold `futureDateISO` into the existing `createTestApp, getAuthToken, registerUser` import: `import { createTestApp, getAuthToken, registerUser, futureDateISO } from "../helpers";`

**Call-site replacement pattern** (lines 129-135, the `assignPlan` helper default):

```typescript
payload: {
  planId: 1, // will be overridden
  branchId: 1,
  startDate: "2026-03-01",          // ← becomes futureDateISO(N) per D-01 rule
  priceTypeApplied: "regular",
  ...overrides,
},
```

**Coupled assertion pattern** (lines 374-375 — both literals are coupled to the `:366` startDate; both need dynamic-ization per D-03):

```typescript
expect(body.startDate).toBe("2026-03-01"); // echo-of-input — OK per D-03 if compared against the same variable
expect(body.endDate).toBe("2026-03-31"); // computed echo — NOT OK per D-03 ("tautological")
```

**Apply D-03 rewrite:**

```typescript
const start = futureDateISO(30);     // or whatever N satisfies "active when test runs"
const { body } = await assignPlan(member.id, { ..., startDate: start });
expect(body.startDate).toBe(start);                              // echo of literal input — OK
expect(new Date(body.endDate).getTime()).toBeGreaterThan(Date.now()); // independent: endDate in the future
// OR (stronger): const expectedEnd = addDays(start, plan.durationDays); expect(body.endDate).toBe(expectedEnd);
// D-03 calls the latter "tautological" because both sides resolve via addDays. Prefer the inequality form.
```

**Leave-alone pattern** (lines 537, 721, 733 — DO NOT modify):

```typescript
startDate: "2025-01-01",   // intentional past — verifies auto-expire path
startDate: "2026-06-01",   // future; coupled to :749-753 string-echo assertion
startDate: "2026-07-01",   // future; coupled to :749-758 string-echo assertion
```

---

### Surface 3 — `el-templo-api/test/whatsapp/ai-tools.test.ts` (98-B)

**Analog:** same file, line `:119` second-branch seed.

**Existing pattern at `:117-120` (the `'TSTB'` precedent that 98-B's `:60` rename aligns to):**

```typescript
const [branch2Result] = await pool.execute(
  `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
   VALUES ('Test Constitucion', 'TSTB', 15, true, NOW(), NOW())`,
);
```

**D-05 rewrite at `:58-61`:**

```typescript
// Before:
const [branchResult] = await pool.execute(
  `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
   VALUES ('Test Alem', 'alem', 20, true, NOW(), NOW())`,
);
// After:
const [branchResult] = await pool.execute(
  `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
   VALUES ('Test Alem', 'TSTA', 20, true, NOW(), NOW())`, // ← only the code literal changes
);
```

**Cleanup-filter pattern (already correct, line 55) — DO NOT TOUCH:**

```typescript
await pool.execute("DELETE FROM branches WHERE code LIKE 'TST%'");
```

After the `:60` rename, this filter matches `'TSTA'` (new) and `'TSTB'` (existing at `:119`) — `Duplicate entry` cascade closes.

**Wording-assertion pattern (D-06 + drift surfaced above):**

Apply at **3 sites**, not 1 as CONTEXT.md states:

```typescript
// :112 (test #1): expect(result).toContain("20 lugares")   → expect(result).toContain("20 cupos disponibles")
// :174 (test #5): expect(result).toContain("2 lugares")    → expect(result).toContain("2 cupos disponibles")
// :225 (test #7): expect(result).toContain("20 lugares")   → expect(result).toContain("20 cupos disponibles")
```

Anchor: production source `el-templo-bot/src/ai/tools.ts:389`:

```typescript
spotsRemaining <= 0 ? "sin cupos" : `${spotsRemaining} cupos disponibles`;
```

---

### Surface 4 — `el-templo-api/test/whatsapp/webhook.test.ts` (98-C)

**Analog:** same file's existing `vi.mock` block (lines 27-39).

**Existing `vi.mock` pattern (the verbatim shape D-07 mirrors)** — lines 26-39:

```typescript
// Mock sendTextMessage before importing routes
vi.mock(
  "../../../el-templo-bot/src/whatsapp/client",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../el-templo-bot/src/whatsapp/client")
      >();
    return {
      ...original,
      sendTextMessage: vi.fn().mockResolvedValue("wamid.sent.mock123"),
    };
  },
);

// Import after mock setup
import { webhookRoutes } from "../../../el-templo-bot/src/webhook/routes";
import { sendTextMessage } from "../../../el-templo-bot/src/whatsapp/client";
```

**D-07 mock — apply same shape to `createAiProvider`** (sits between the existing `sendTextMessage` mock at `:27-39` and the route import at `:42`):

```typescript
vi.mock("../../../el-templo-bot/src/ai/provider", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../../el-templo-bot/src/ai/provider")
    >();
  return {
    ...original,
    createAiProvider: vi.fn(() => ({
      chat: vi.fn().mockResolvedValue({
        content: "<CANNED_REPLY>", // planner picks: short Spanish greeting, e.g. "Hola, soy Mica."
        toolCalls: [], // empty → handler skips executeTool branch (verified handler.ts:706-708)
      }),
    })),
  };
});
```

Verified mock target shape against `el-templo-bot/src/ai/provider.ts`:

- `createAiProvider()` factory at `:57-69` returns an object implementing `AiProvider` interface (`:38-45`).
- `AiResponse` shape at `:33-36`: `{ content: string | null; toolCalls: ToolCall[] }`.
- Handler usage at `handler.ts:700` (`createAiProvider()`), `:708` (`provider.chat(messages, BOT_TOOLS)`), `:846` (second `provider.chat` after tool round-trip — `toolCalls: []` skips this branch entirely).

**`waitForHandler()` pattern (D-10) — already in-file at lines 161-172; D-10 reuses verbatim for the image test:**

```typescript
function waitForHandler(): Promise<void> {
  return handlerPromise;
}

let handlerResolve: () => void;
let handlerPromise: Promise<void>;

function resetHandlerPromise(): void {
  handlerPromise = new Promise<void>((resolve) => {
    handlerResolve = resolve;
  });
}
```

Wired into route registration at `:196-198`:

```typescript
await app.register(webhookRoutes, {
  onMessageHandled: () => handlerResolve(),
});
```

And `resetHandlerPromise()` is called in `beforeEach` at `:217`. **No new wiring needed** — the image test just stops using the `setTimeout(100)` at `:402` and starts using `await waitForHandler()`.

**Text-test echo-assertion rewrite (D-08) — apply at BOTH `:292` AND `:298`:**

Existing pattern, new-sender test, lines 286-300:

```typescript
const [echoRows] = await pool.execute(
  "SELECT * FROM whatsapp_messages WHERE message_direction = 'outbound_bot'",
);
const echoMessages = echoRows as Record<string, unknown>[];
expect(echoMessages).toHaveLength(1);
expect(echoMessages[0].content).toBe("Echo: Hello from WhatsApp!"); // :292 — rewrite
expect(echoMessages[0].whatsapp_message_id).toBe("wamid.sent.mock123");

expect(sendTextMessage).toHaveBeenCalledWith(
  "5491100000001",
  "Echo: Hello from WhatsApp!", // :298 — rewrite (same canned text)
);
```

Both `"Echo: Hello from WhatsApp!"` literals become `<CANNED_REPLY>` (the exact string the D-07 mock's `chat` returns).

**Image-test rewrite pattern (D-09 + D-10) — lines 388-418:**

Before (stale, asserts pre-quick-16-fix-3 silent-drop):

```typescript
describe("POST /webhook — non-text message (image)", () => {
  it("returns 200 but does not store or reply", async () => {
    const payload = makeImagePayload("5491100000004", "wamid.image001");
    const res = await app.inject({ method: "POST", url: "/webhook", payload });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("EVENT_RECEIVED");
    await new Promise((r) => setTimeout(r, 100)); // :402 — REMOVE
    const [msgRows] = await pool.execute("SELECT * FROM whatsapp_messages");
    const messages = msgRows as Record<string, unknown>[];
    expect(messages).toHaveLength(0); // STALE
    const [convRows] = await pool.execute(/* ... */);
    const conversations = convRows as Record<string, unknown>[];
    expect(conversations).toHaveLength(0); // STALE
    expect(sendTextMessage).not.toHaveBeenCalled(); // STALE
  });
});
```

After (matches `handler.ts:323-358` post-quick-16-fix-3 behavior — verified above):

```typescript
describe("POST /webhook — non-text message (image)", () => {
  it("returns 200, stores inbound, and sends non-text fallback", async () => {
    // description rename per D-09
    const payload = makeImagePayload("5491100000004", "wamid.image001");
    const res = await app.inject({ method: "POST", url: "/webhook", payload });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("EVENT_RECEIVED");

    await waitForHandler(); // D-10 — replaces setTimeout(100)

    const [msgRows] = await pool.execute(
      "SELECT * FROM whatsapp_messages ORDER BY id",
    );
    const messages = msgRows as Record<string, unknown>[];
    expect(messages).toHaveLength(2); // 1 inbound + 1 outbound fallback
    expect(sendTextMessage).toHaveBeenCalledOnce();
    expect(messages[1].content).toContain("imagen"); // semantic substring from getNonTextFallback("image")

    const [convRows] = await pool.execute(
      "SELECT * FROM whatsapp_conversations WHERE phone = '5491100000004'",
    );
    const conversations = convRows as Record<string, unknown>[];
    expect(conversations).toHaveLength(1); // inbound INSERT triggered creation
  });
});
```

`"imagen"` substring confirmed against `handler.ts:178`: `"Recibí tu imagen, pero por ahora solo puedo responder a mensajes de texto. ¿Me contás por acá qué necesitás?"`

---

## Shared Patterns

### Pattern S-1 — `vi.mock(..., async (importOriginal) => { ... })` with `importOriginal` spread

**Source:** `webhook.test.ts:27-39` (`sendTextMessage` mock).
**Apply to:** the D-07 `createAiProvider` mock added in 98-C. Mirror the shape exactly (same `async (importOriginal) =>`, same `await importOriginal<typeof import(...)>()` typing, same `return { ...original, <name>: vi.fn()... }` spread).
**Rationale:** zero new technique; the file's reviewer already understands this shape.

### Pattern S-2 — `await waitForHandler()` post-`POST /webhook` for any test where the handler does async work

**Source:** `webhook.test.ts:161-172` (`waitForHandler` / `resetHandlerPromise`) + `:196-198` (callback wiring) + `:265`, `:325`, `:373` (existing usage in text-test cases).
**Apply to:** the rewritten image test (D-10 replaces `setTimeout(100)`). Status-only and dedup-skip tests that intentionally do NOT trigger the handler keep their `setTimeout(100)`.
**Rationale:** the handler now stores + replies asynchronously for non-text messages (per quick-16 fix 3); `setTimeout(100)` is a race.

### Pattern S-3 — `cleanup-then-seed` `beforeEach` with `LIKE 'TST%'` filter

**Source:** `ai-tools.test.ts:45-99` (the full `beforeEach`).
**Apply to:** **NOTHING NEW.** 98-B does NOT modify this pattern. The fix is to align the seed (`:60` INSERT) so the existing filter (`:55`) matches. Cleanup filter at `:55` is verified correct.
**Rationale:** D-05 explicitly rejects the alternative of broadening the filter — the convention is "test data uses TST-prefixed codes; cleanup is `LIKE 'TST%'`". The bug was the seed; the cleanup is canon.

### Pattern S-4 — Lifecycle-state assertions, NOT date-arithmetic assertions

**Source:** D-03 rule + `subscriptions.test.ts` patterns at `:573-576` (status echo), `:601-625` (resume extends endDate).
**Apply to:** every 98-A rewrite where a literal endDate appears in an assertion.
**Rationale:** keep date-arithmetic verification in `test/unit/date-utils.test.ts`; subscription tests verify subscription contract (active/expired/paused, sub IS in the future), not `addDays` correctness.

---

## No Analog Found

None — every fix surface has a direct in-file analog. This phase introduces zero new patterns; it is alignment work.

## Out-of-Scope Flags (no proposals to modify)

Per HARD GUARD SC#5, no production source changes are proposed. The following files are READ-ONLY anchors during pattern mapping:

| File                                                       | Why referenced                                                                                     | Action                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `el-templo-api/src/modules/shared/date-utils.ts`           | `addDays` import target for D-02 (test imports, does not modify)                                   | READ-ONLY                               |
| `el-templo-bot/src/ai/provider.ts`                         | `createAiProvider` factory + `AiProvider`/`AiResponse` interfaces — mock target shape verification | READ-ONLY                               |
| `el-templo-bot/src/ai/tools.ts:389`                        | source-of-truth for `"cupos disponibles"` wording                                                  | READ-ONLY (D-06 intentional prod state) |
| `el-templo-bot/src/ai/tools.ts:455`                        | BUG-03 (i) LIKE-search RED — Phase 95 owns                                                         | READ-ONLY (stays RED)                   |
| `el-templo-bot/src/webhook/handler.ts:173-188`, `:323-358` | `getNonTextFallback("image")` source + non-text fallback path — anchor for `"imagen"` substring    | READ-ONLY                               |
| `el-templo-bot/src/webhook/handler.ts:700, 708, 846`       | `createAiProvider()` + `provider.chat` call sites — mock interception verification                 | READ-ONLY                               |

If, during execute, the planner or implementer finds a pattern that would imply touching any `src/**` file, STOP per CONTEXT.md SC#5 + STATE.md `STOP-and-reclassify guard` and re-triage via `/gsd-debug`.

## Metadata

- **Analog search scope:** `el-templo-api/test/**` (3 target files + helpers.ts) + READ-ONLY consultation of `el-templo-bot/src/ai/provider.ts`, `tools.ts`, `webhook/handler.ts`, and `el-templo-api/src/modules/shared/date-utils.ts` for mock-shape + wording-anchor verification.
- **Files scanned (Read + Grep):** 7 (3 test files, 1 helpers file, 4 src files — all src files are READ-ONLY anchors).
- **Re-grep verification date:** 2026-06-17 against HEAD `9b2f17ff`.
- **Drift items surfaced for planner attention:**
  1. **ai-tools.test.ts wording fix at 3 sites (`:112`, `:174`, `:225`), not 1** as CONTEXT.md D-06 states. Without fixing `:174` + `:225`, tests #5 and #7 will fail SC#1 (511/512 pass) once the cleanup bug is fixed at `:60`.
  2. **subscriptions.test.ts `:375` endDate literal** is coupled to `:366` startDate and also needs dynamic-ization (CONTEXT.md D-01 only enumerates `:374` as the coupled assertion).
  3. **webhook.test.ts D-08 substitution applies at 2 lines in the new-sender test (`:292` + `:298`)**, not just `:292`. The existing-sender test's `:339-340` count + `toHaveBeenCalledOnce` assertions remain unchanged (the count is invariant; only the implied content at index 1 changes).
