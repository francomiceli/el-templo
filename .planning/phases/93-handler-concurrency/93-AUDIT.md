# Phase 93 Audit: Handler Concurrency (BUG-01)

**Date:** 2026-05-15
**Auditor:** GSD plan executor (Phase 93, Task 1)
**Read-only audit** — no source code modified. Audit produces verdicts + baselines + Task 4 implementation pointers.

---

## Baseline Captures

These integers are captured pre-Task-3 / pre-Task-4 / pre-Task-5 and are the comparison points for Task 5's discipline-diff verification. **Both grep patterns below MUST be re-run byte-identically in Task 5.**

### Console count (Pino-only discipline)

```bash
grep -rEn "console\." el-templo-bot/src/ | wc -l
```

**`console_count_baseline = 0`**

### any-type count (type-syntax-precise grep — matches TypeScript type-syntax only; ignores prose-word "any" in comments)

```bash
grep -rEn ':\s*any\b|<any[,>]|<any\s|as\s+any\b|\bany\[\]|Record<[^>]*,\s*any\s*>|Array<any>|Promise<any>' el-templo-bot/src/ | wc -l
```

**`any_count_baseline = 0`**

**Discipline guard for Task 5:** both numbers MUST equal 0 after Phase 93 ships. Any drift = scope creep into discouraged patterns; halt and surface.

---

## Per-Check Verdicts

### Check 1 — SETNX-race at `el-templo-bot/src/memory/session.ts:125-155`

**Verdict: FIRES**

**Reasoning:**

- `isDebounceActive` (`session.ts:125-137`) performs `redis.get(key)` and returns `value !== null` — **first round-trip**.
- `setDebounce` (`session.ts:142-155`) performs `redis.set(key, "1", "EX", ttlSeconds)` — **second round-trip**.
- The two round-trips are NOT atomic. There is no compare-and-set primitive used; no `NX` flag; no Lua script.
- Handler call site at `handler.ts:364-369`:
  ```typescript
  const alreadyProcessing = await isDebounceActive(debounceKey); // get
  if (alreadyProcessing) return;
  await setDebounce(debounceKey, DEBOUNCE_TTL_SECONDS); // set
  ```
- **Race window:** two concurrent webhook invocations for the same phone both reach `redis.get(key)`. On healthy local Redis the round-trip is ~0.5–2ms. If both `get` calls land before either `set` completes, both observe `null` (key not set), both return `false` from `isDebounceActive`, both proceed to `setDebounce`, both then sleep 3s and call `processWithAiInner`. Result: **two parallel `provider.chat` calls → two duplicate replies sent to the user.**
- **Timing window estimate:** ~0.5–2ms on local Redis (sub-millisecond network + serialization). On stressed or remote Redis: tens of milliseconds. Meta's webhook delivery is FIFO per session but the bot's Fastify server processes each POST in its own async chain, so two POSTs arriving ≤2ms apart can interleave into the race window. With ~100 conv/day at El Templo and the live-test BUG-01 reproduction shape ("Hola"+"Hola?"+"Holaaaaa" typed in rapid succession), three rapid Send taps from the same WhatsApp client easily land within 2ms.
- **No release-side defect:** the `finally` block at `handler.ts:382` calls `deleteDebounce` unconditionally. There is no token-aware release. If a peer handler whose TTL had since expired now re-acquired the key with a fresh value, our `finally` would still `redis.del` it — releasing the PEER's lock. This is a SECONDARY defect that the Branch 1 fix should also address (token-aware release via Lua compare-and-delete).

### Check 2 — Meta dedup ordering at `el-templo-bot/src/webhook/handler.ts:291-306`

**Verdict: DOES NOT FIRE**

**Reasoning:**

- Dedup is wired correctly with the UNIQUE constraint at `el-templo-api/src/db/schema/whatsapp.ts:84` (`varchar("whatsapp_message_id", { length: 100 }).unique()`) and the `try { INSERT } catch (isDuplicateEntryError) { return; }` pattern at `handler.ts:291-306`.
- **Critical ordering:** the dedup INSERT runs at `handler.ts:293-296` BEFORE `processWithAi` is invoked at `handler.ts:324`. Specifically:
  ```
  L291  // 2. Dedup check -- insert inbound message
  L292  try {
  L293    await db.execute(sql`INSERT ... whatsapp_message_id=${wamid} ...`);
  L297  } catch (err: unknown) {
  L298    if (isDuplicateEntryError(err)) { return; }
  L305    throw err;
  L306  }
  ...
  L324  await processWithAi(...);
  ```
- **Two concurrent INSERTs with SAME wamid:** the database serializes them via the UNIQUE constraint. One commits, the other receives `ER_DUP_ENTRY` (errno 1062) at the catch block and `return`s. The "loser" handler **never reaches `processWithAi`**, so the race window inside `processWithAi` is irrelevant to wamid-duplicate inbounds.
- **Non-text fallback path** at `handler.ts:274-289` follows the same pattern — `isDuplicateEntryError` catches and returns. Confirmed by reading code.
- **No retry edge case identified.** Meta's retry semantic sends the SAME `whatsapp_message_id`; the UNIQUE constraint catches it. The only way a duplicate wamid could slip past is if `whatsapp_message_id` is `null` on insert — but `parseWebhookPayload` (in `el-templo-bot/src/whatsapp/parse.ts`) only produces a `ParsedInboundMessage` if Meta provided an `id`, so `whatsappMessageId` is always a non-null string for text messages.
- **Different-wamid rapid-fire is NOT a dedup concern.** "Hola" typed 3 times by the user produces 3 different `wamid`s. The UNIQUE constraint does NOT (and should not) catch this. That's the debounce/Redis-lock layer's job — and that layer is defective per Check 1.

### Check 3 — Compound (Check 1 ∩ Check 2)

**Verdict: DOES NOT FIRE** (derived: Check 1 FIRES + Check 2 DOES NOT FIRE → compound condition `Check 1 AND Check 2` is false).

### Check 4 — TTL / upstream coupling

**Verdict: FIRES**

**Reasoning:**

- Worst-case post-Phase-94+97 handler runtime (per Cross-Phase Invariant block in `93-CONTEXT.md`):
  ```
  worst_case = OPENAI_TIMEOUT_MS/1000 × MAX_TOOL_ITERATIONS  (45 × 5 = 225s)
             + executeTool_timeout × MAX_TOOL_ITERATIONS     (30 × 5 = 150s)
             + safety_buffer                                  (20s)
             = 395s minimum → round up to 600s (10 min)
  ```
- Current `DEBOUNCE_TTL_SECONDS = 10` (`handler.ts:97`).
- **Gap pre-Phase-94:** OpenAI SDK default request timeout is 600s (10 min). A single slow `provider.chat` call can already exceed 10s — the 2026-04-16 22:23-22:26 incident in `bot-3min-response-latency.md` documented a ~3min handler hang. During seconds 10–180 of that hang, ANY inbound from the same phone would observe `isDebounceActive === false` (key auto-expired at second 10) and spawn a parallel handler. BUG-01 is therefore reachable BOTH via Check 1's SETNX-race AND via Check 4's TTL expiry.
- **Gap post-Phase-94 (LAT-01 = 45s OPENAI_TIMEOUT_MS):** if Phase 94 ships without raising the TTL, the gap is `395 - 10 = 385s`. The dead-man switch fires at second 10, and any inbound during seconds 10–395 spawns a parallel handler. **Phase 94 alone re-introduces BUG-01 as a side effect of fixing BUG-02.** This is the Cross-Phase Invariant in concrete form.
- **No mitigating factor invalidates the math:**
  - Phase 95's `withTimeout(30s)` bounds each `executeTool` localhost call, but the worst case is 30s × 5 iterations = 150s, still ≫ 10s.
  - The 3s `setTimeout` debounce delay does NOT bound the post-delay AI work.
  - No heartbeat-refresh is currently installed (no `setInterval(() => redis.expire(...))` in `handler.ts`).
- **Numbers recorded:**
  - Current TTL: **10s**
  - Worst-case post-Phase-94+97 runtime: **395s** (round up to **600s**)
  - Gap: **385s** post-Phase-94
  - Required minimum TTL: **≥600s** (Option (a) static) OR heartbeat-refresh (Option (b)) OR hybrid (Option (c))

### Check 5 — Observability trigger

**Verdict: DOES NOT FIRE** (derived: Check 5 fires IFF Checks 1, 2, AND 4 all return DOES NOT FIRE. Check 1 and Check 4 both FIRE → Check 5 does not fire.)

---

## Final Branch Verdict

**Multi-fire case. Primary + secondary fix surfaces named with task mapping.**

| Surface   | Branch                      | Verdict | Fix location                                                    | Task mapping                                                                |
| --------- | --------------------------- | ------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Primary   | **Branch 1** (SETNX-race)   | FIRES   | `el-templo-bot/src/memory/session.ts:125-155` + handler:363-382 | **Task 4** (branch-specific fix)                                            |
| Secondary | **Branch 4** (TTL/upstream) | FIRES   | `el-templo-bot/src/webhook/handler.ts:97`                       | **Task 3** (unconditional TTL adjustment — covers Branch 4 by construction) |

**Precedence rationale:**

- Branch 1 is the proximate race-condition fix. Even if the TTL is bumped to 600s (closing the Check 4 window), the SETNX-race at sub-millisecond granularity is still reachable during the FIRST 600s. The atomic `SET NX PX` primitive eliminates the race regardless of TTL value.
- Branch 4's TTL fix is required regardless of Branch 1 — without it, Phase 94's `OPENAI_TIMEOUT_MS=45000` re-introduces BUG-01 via the alternative TTL-expiry pathway. Task 3 covers this unconditionally per the locked user decision in `93-CONTEXT.md`.
- Branch 5 (observability) is NOT triggered because real defects exist. Pino logs alone would NOT close BUG-01. However, the Branch 1 atomic-primitive fix at `session.ts` should also be designed with token-aware release to prevent the secondary "peer lock release" defect identified in Check 1 reasoning.

**Branch verdict NOT escaped to Branch 5.** Two real defects identified; both will be fixed.

**Cross-phase TTL invariant satisfied by Task 3.** Phase 94's reviewer's verification command `git log --oneline | grep -i 'debounce_ttl\|TTL\|93-'` will surface the dedicated TTL commit.

---

## Pipeline Map

Concrete ordered list of operations on the inbound webhook → AI reply path. File:line markers reference actual code.

```
1.  Meta sends POST /webhook                                  (Meta → ngrok → Fastify)
2.  routes.ts:54  void reply.code(200).send("EVENT_RECEIVED") (immediate ack, NEVER retried by Meta on 200)
3.  routes.ts:56  parseWebhookPayload(request.body)           (extract phone, text, wamid)
4.  routes.ts:63  handleInboundMessage(...) — fire-and-forget (NO awaited blocking)
5.  handler.ts:132-218  find/create conversation              (SELECT/INSERT whatsapp_conversations)
6.  handler.ts:220-240  determineClientState + getProfile     (Redis read for profile + state machine)
7.  handler.ts:241-258  interactive button dispatch?          (early-exit if button payload)
8.  handler.ts:259-289  non-text fallback path                (audio/image/etc.; dedup INSERT + return)
9.  handler.ts:291-306  TEXT DEDUP INSERT                      (UNIQUE-constraint catch; Check 2 surface — VERIFIED CORRECT)
10. handler.ts:308-311  log "Saved inbound message"
11. handler.ts:313-320  human_takeover check                   (early-exit if conversationStatus === 'human_takeover')
12. handler.ts:323-339  AI try/catch (outer)                   (catches all processWithAi errors; only logs — Phase 94 territory)
13. handler.ts:347-384  processWithAi                          (Check 1 surface)
    a. handler.ts:357  updateSession (user inbound → Redis)
    b. handler.ts:363  debounceKey = `wa:debounce:${phone}`
    c. handler.ts:364  isDebounceActive(debounceKey)          ← Check 1 RACE WINDOW START (redis.get)
    d. handler.ts:365-368  if true → log + return (debounce bail-out — Branch 5 emission site for duplicate_detected)
    e. handler.ts:369  setDebounce(debounceKey, 10s)           ← Check 1 RACE WINDOW END (redis.set; non-atomic with step c)
    f. handler.ts:371  await sleep(3000)                       (3s debounce delay)
    g. handler.ts:372  processWithAiInner(...)                 (the big pipeline; reads session, calls AI, sends reply)
    h. handler.ts:382  deleteDebounce(debounceKey)             (finally block; NO token check — secondary defect)
14. processWithAiInner: provider.chat at :584 (initial) and :641 (tool-loop) — Phase 94 territory, OUT OF SCOPE for Phase 93
```

**Key observations:**

- Steps 13c and 13e are NOT atomic. Two concurrent invocations both reach 13c, both observe `null`, both reach 13e and set their token — Check 1 confirmed.
- Step 13e sets TTL=10s. Phase 94's 45s `OPENAI_TIMEOUT_MS` exceeds this — Check 4 confirmed.
- Step 9 (dedup INSERT) precedes processWithAi entry — Check 2 confirmed correct.
- `routes.ts` ack (step 2) is BEFORE `handleInboundMessage` (step 4). Per Phase 93 boundary, `routes.ts` is READ-ONLY — not modified.

---

## TTL Choice for Task 3

**Choice: Option (a) — Static 600s TTL with env override.**

**Rationale:**

- **Simplest** — single constant change, no new control-flow paths in the handler. No `setInterval`/`clearInterval` lifecycle to manage.
- **Bounded by Phase 94** — once `OPENAI_TIMEOUT_MS=45000` ships, the maximum legitimate handler runtime is bounded at 395s (per the invariant math). A 600s TTL gives a 205s safety margin over worst-case runtime. The risk of a 600s lock-hold on a stuck handler is acceptable given:
  1. Phase 94's timeout bounds the handler at 395s anyway.
  2. The `finally` block at `handler.ts:382` deletes the key on normal completion.
  3. The Branch 1 atomic-primitive fix adds token-aware release, eliminating accidental peer-lock release.
- **Heartbeat-refresh (Option b) rejected** for now — adds `setInterval`/`clearInterval` lifecycle complexity, risk of unhandled rejection if heartbeat `redis.expire` fails, and the failure mode (heartbeat loop crashes, lock stuck for static TTL) re-introduces the same concern as Option (a) without the simplicity. Phase 93's plan does not require this complexity to satisfy the invariant.
- **Hybrid (Option c) rejected** — combines complexity of (b) with the static-TTL hold-time of (a). Not justified at current scale (~100 conv/day per REQUIREMENTS.md).

**Concrete value:** `DEBOUNCE_TTL_SECONDS = Number(process.env.DEBOUNCE_TTL_SECONDS ?? 600)`. Env var documented in `.env.example` with the canonical Cross-Phase Invariant block.

**Phase 94 reviewer's verification command** (per `93-CONTEXT.md` Cross-Phase Invariant section):

```bash
git log --oneline | grep -i 'debounce_ttl\|TTL\|93-' | head
```

Will surface Task 3's atomic commit before Phase 94 PR merges.

---

## Implementation Pointers for Task 4 (Branch 1 — primary surface)

### File 1: `el-templo-bot/src/memory/session.ts`

**Replace** the non-atomic pair (`isDebounceActive`, `setDebounce`) at `:121-155` with two new helpers. Keep `deleteDebounce` for callers that don't have a token (graceful degrade); add a token-aware `releaseDebounce`.

```typescript
import crypto from "node:crypto";

// New helper — atomic SETNX returning a token (or null if not acquired):
export async function tryAcquireDebounce(
  key: string,
  ttlSeconds: number,
): Promise<string | null> {
  if (!isRedisAvailable()) {
    // graceful degrade: act as if we own the lock (no Redis = no coordination = single-process semantics)
    return crypto.randomBytes(8).toString("hex");
  }
  const token = crypto.randomBytes(8).toString("hex");
  try {
    const result = await redis.set(key, token, "EX", ttlSeconds, "NX");
    return result === "OK" ? token : null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, key }, "Failed to acquire debounce key");
    return null; // safer to fail-closed (drop the inbound) than to fail-open (duplicate replies)
  }
}

// New helper — token-aware release via Lua compare-and-delete:
export async function releaseDebounce(
  key: string,
  token: string,
): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }
  try {
    // Atomic compare-and-delete: only delete if the current value equals our token
    await redis.eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      key,
      token,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, key }, "Failed to release debounce key");
  }
}
```

**Keep** `isDebounceActive`, `setDebounce`, `deleteDebounce` exported for backward compat with `el-templo-bot/test/debounce.test.ts`. (Removing them would force a test rewrite that's out of scope for this task.) The Phase 93 fix is purely **additive**.

### File 2: `el-templo-bot/src/webhook/handler.ts`

**Replace** the existing debounce block at `:359-383` with the atomic-primitive version:

```typescript
// ── Debounce (Phase 93 Branch 1 fix: atomic SETNX with token-aware release) ──
const debounceKey = `wa:debounce:${phone}`;
const token = await tryAcquireDebounce(debounceKey, DEBOUNCE_TTL_SECONDS);
if (token === null) {
  log.info({ phone }, "Debounce: in-flight handler exists, skipping AI call");
  return;
}
try {
  await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_DELAY_MS));
  await processWithAiInner(
    db,
    log,
    conversationId,
    phone,
    inboundText,
    clientState,
    currentProfile,
  );
} finally {
  await releaseDebounce(debounceKey, token);
}
```

**Update imports** at `handler.ts:29-35`:

```typescript
import {
  getSession,
  updateSession,
  tryAcquireDebounce,
  releaseDebounce,
} from "../memory/session.js";
```

(Drop `isDebounceActive`, `setDebounce`, `deleteDebounce` imports — these remain exported for `debounce.test.ts` backward compat but the handler no longer consumes them.)

### Boundaries respected

- `handler.ts:584` and `:641` (`provider.chat` call sites) — **UNCHANGED** (Phase 94 territory).
- `handler.ts:97` — **CHANGED IN TASK 3 ONLY** (not in Task 4).
- `el-templo-bot/src/ai/openai.ts:29` — **UNCHANGED** (Phase 94 territory).
- `el-templo-bot/src/webhook/routes.ts` — **UNCHANGED** (out of Phase 93 scope).
- `el-templo-bot/src/ai/system-prompt.ts` and `knowledge.ts` — **UNCHANGED** (snapshot tripwire).

---

## Appendix A: Verdict summary table

| Check | Description                               | Verdict       |
| ----- | ----------------------------------------- | ------------- |
| 1     | SETNX-race at session.ts:125-155          | FIRES         |
| 2     | Meta dedup ordering at handler.ts:291-306 | DOES NOT FIRE |
| 3     | Compound (Check 1 ∩ Check 2)              | DOES NOT FIRE |
| 4     | TTL / upstream coupling                   | FIRES         |
| 5     | Observability trigger                     | DOES NOT FIRE |

**Final Branch Verdict:** Branch 1 (primary, Task 4) + Branch 4 (secondary, Task 3).

---

## Appendix B: Task 2 failure transcripts (placeholder — Task 2 will append observed-failure output here)

(Reserved for Task 2 to append vitest output capturing the regression tests failing on HEAD.)
