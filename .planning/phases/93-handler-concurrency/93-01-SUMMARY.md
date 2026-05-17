---
phase: 93-handler-concurrency
plan: 01
subsystem: el-templo-bot/webhook-handler + memory/session
tags:
  [
    concurrency,
    debounce,
    redis,
    ttl,
    cross-phase-invariant,
    setnx,
    lua,
    branch-1,
    check-1-5,
  ]
requires:
  - phase: roadmap (v5.3.3)
    provides: "CONC-01 requirement — rapid-fire user messages produce exactly ONE bot response; Cross-Phase Invariant block locked across CONTEXT.md, ROADMAP Phase 93 Notes, ROADMAP Phase 94 SC#1"
provides:
  - "CONC-01 closed — Branch 1 (SETNX-race) + Branch 4 (TTL coupling) + post-hoc Check 1.5 (updateSession race) all fixed"
  - "DEBOUNCE_TTL_SECONDS env-overridable with 600s default; Cross-Phase Invariant satisfied for Phase 94 ship-after"
  - "tryAcquireDebounce / releaseDebounce (atomic SET NX + Lua compare-and-delete) — exported from memory/session.ts"
  - "UPDATE_SESSION_SCRIPT — Lua read-modify-write of session blob (cjson, atomic, trim-to-MAX, TTL refresh)"
  - "v5-3-3-handler-concurrency.test.ts (462 lines, unit — strict TDD fail-in-main for SETNX race + Check 1.5)"
  - "v5-3-3-handler-concurrency.integration.test.ts (424 lines, integration — regression-protector for Fastify-inject pipeline, dedup, ack flow)"
affects:
  - el-templo-bot/src/memory/session.ts
  - el-templo-bot/src/webhook/handler.ts
  - el-templo-bot/.env.example
  - el-templo-bot/test/v5-3-3-handler-concurrency.test.ts
  - el-templo-bot/test/memory-session.test.ts
  - el-templo-bot/test/ai-handler.test.ts
  - el-templo-api/test/whatsapp/v5-3-3-handler-concurrency.integration.test.ts
  - .planning/phases/93-handler-concurrency/93-AUDIT.md
status: complete
shipped: 2026-05-17
---

# Phase 93-01 — Handler Concurrency (CONC-01) Summary

## Branch Verdict

**Multi-fire: Branch 1 (primary, SETNX-race) + Branch 4 (secondary, TTL coupling) + Check 1.5 post-hoc (updateSession race).**

Per [`93-AUDIT.md`](./93-AUDIT.md) Final Branch Verdict — primary fix surface = Branch 1 atomic SETNX in `session.ts:125-155` (Task 4); secondary fix surface = Branch 4 TTL adjustment at `handler.ts:97` (Task 3, unconditional anyway per Cross-Phase Invariant). Check 1.5 (`updateSession` race at `session.ts:71-111`) added as a post-hoc audit amendment after the coalesce sub-test exposed the same defect class in a related surface — fixed in the same Task 4 commit.

Audit verdict was NOT escaped to Branch 5 (observability fallback). Two real defects identified pre-implementation, one post-hoc; all three fixed.

## Audit Findings Summary

Per `93-AUDIT.md` Per-Check Verdicts:

| Check              | Description                                                  | Verdict       |
| ------------------ | ------------------------------------------------------------ | ------------- |
| 1                  | SETNX-race at `session.ts:125-155`                           | **FIRES**     |
| 2                  | Meta dedup ordering at `handler.ts:291-306`                  | DOES NOT FIRE |
| 3                  | Compound (Check 1 ∩ Check 2)                                 | DOES NOT FIRE |
| 4                  | TTL / upstream coupling                                      | **FIRES**     |
| 5                  | Observability trigger (IFF Checks 1, 2, 4 all DOES NOT FIRE) | DOES NOT FIRE |
| **1.5 (post-hoc)** | **`updateSession` race at `session.ts:71-111`**              | **FIRES**     |

**Check 1 rationale (FIRES):** `isDebounceActive` (`redis.get`) and `setDebounce` (`redis.set`) at `session.ts:125-155` are two non-atomic Redis round-trips. Under concurrent webhook invocations, both `get` calls return `null` before either `set` lands → both invocations proceed → two parallel `provider.chat` calls → duplicate user-visible replies. Timing window ~0.5–2ms on local Redis; reachable under rapid Send taps from a single WhatsApp client.

**Check 2 rationale (DOES NOT FIRE):** Meta `whatsapp_message_id` dedup is correctly wired with the UNIQUE constraint at `el-templo-api/src/db/schema/whatsapp.ts:84` + `isDuplicateEntryError` catch at `handler.ts:291-306`. The INSERT runs BEFORE `processWithAi` is invoked, and the catch returns the loser handler early. No retry edge case identified that would slip a duplicate `wamid` past the dedup.

**Check 4 rationale (FIRES):** Worst-case post-Phase-94+97 handler runtime = 45×5 + 30×5 + 20 = 395s → round up to 600s. Current `DEBOUNCE_TTL_SECONDS = 10`. Gap pre-Phase-94 already allows BUG-01 via the TTL-expiry pathway (any inbound during seconds 10→handler-completion observes `isDebounceActive=false` and spawns a parallel handler). Gap post-Phase-94 widens to 385s without this fix — Phase 94's `OPENAI_TIMEOUT_MS=45000` would re-introduce BUG-01 as a side effect of fixing BUG-02.

**Check 1.5 rationale (FIRES, post-hoc):** Not enumerated in the original audit. Discovered during Task 4 implementation: with Branch 1's atomic SETNX in place, the same-body drop sub-test passed but the coalesce sub-test still failed. Root cause: `updateSession` at `session.ts:71-111` had the same non-atomic get-modify-set pattern as the debounce gate. Two concurrent calls both read `existing=null`, both wrote a single-message session, the second write overwrote the first. Surviving handler saw only one user text instead of "both texts as the user's combined turn." Same defect class, same file, same fix shape — shipped in the same Task 4 commit. Audit amendment in `93-AUDIT.md` documents the discovery, empirical evidence, fix shape, and scope justification.

## TTL Adjustment

**Choice: Option (a) — static 600s with env override.** Per `93-AUDIT.md` TTL Choice section.

```typescript
// el-templo-bot/src/webhook/handler.ts:97
const DEBOUNCE_TTL_SECONDS = Number(process.env.DEBOUNCE_TTL_SECONDS ?? 600);
```

`.env.example` updated with the canonical Cross-Phase Invariant block as a leading comment, so ops can adjust the value without spelunking through the codebase to find the formula.

**Atomic commit:** [`8c74c850`](https://github.com/) — `feat(bot): raise DEBOUNCE_TTL_SECONDS per Phase 93↔94↔97 Cross-Phase Invariant (93-01)`. Separable from Task 4's atomic-primitive work (commit `2376eb31`) so Phase 94's reviewer can confirm the TTL adjustment landed via:

```bash
git log --oneline | grep -i 'debounce_ttl\|TTL\|93-' | head
```

**Cross-Phase Invariant satisfied.** Phase 94 (`OPENAI_TIMEOUT_MS=45000`) can ship-after Phase 93 without re-introducing BUG-01 via the TTL-expiry pathway. The 600s static value gives a 205s safety margin over the 395s worst-case post-Phase-94+97 handler runtime. Heartbeat-refresh (Option b) and hybrid (Option c) rejected as over-engineered at current scale (~100 conv/day per REQUIREMENTS.md).

## Branch Implementation Summary

**Branch 1 (SETNX-race fix) — `el-templo-bot/src/memory/session.ts` + `el-templo-bot/src/webhook/handler.ts`:**

Added two new helpers, kept the legacy trio exported for `debounce.test.ts` backward compat:

- `tryAcquireDebounce(key, ttlSeconds): Promise<string | null>` — single `SET NX EX` round-trip. Returns a 16-hex-char token on success, `null` on conflict. Graceful degrade when Redis is unavailable (synthetic token = single-process semantics). Fail-closed on Redis error (return `null` = drop inbound, prefer lost message over duplicate reply).
- `releaseDebounce(key, token): Promise<void>` — Lua compare-and-delete (`'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'`). Atomic. Prevents accidental release of a peer's lock if our TTL expired and they re-acquired.

`handler.ts:processWithAi` was rewired to use the new pair:

```typescript
const token = await tryAcquireDebounce(key, DEBOUNCE_TTL_SECONDS);
if (token === null) return;
try {
  await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_DELAY_MS));
  await processWithAiInner(...);
} finally {
  await releaseDebounce(key, token);
}
```

**Check 1.5 (`updateSession` race fix, post-hoc) — `el-templo-bot/src/memory/session.ts`:**

Replaced the non-atomic `redis.get` → parse → mutate → `redis.set` flow with a single Lua eval (`UPDATE_SESSION_SCRIPT`). The script performs `cjson.decode` → `table.insert` → trim-to-`MAX_SESSION_MESSAGES` → `cjson.encode` → `redis.call("set", ..., "EX", ttl)` server-side in one atomic round-trip. Eval is atomic w.r.t. other Redis commands by Redis-server contract.

ARGV layout: `ARGV[1]` = new message JSON, `ARGV[2]` = max messages (decimal string), `ARGV[3]` = TTL seconds (decimal string), `ARGV[4]` = updated-at epoch ms (decimal string, supplied by client for `Date.now()` parity with prior behavior).

**Regression test transition (TDD proof, firing branches Branches 1 + Check 1.5):**

| Test                                                         | Pre-Task-4                                                                                                                                                    | Post-Task-4 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Unit — same-body rapid-fire → silent drop                    | FAIL (expected 1, got 2)                                                                                                                                      | PASS        |
| Unit — different-body rapid-fire → coalesce, BOTH user texts | FAIL (expected 1, got 2; then after Branch-1-only attempt: PASS on count but FAIL on "expected '¿hay clases mañana?' to contain 'Hola'" — Check 1.5 surfaced) | PASS        |
| Unit — sanity sequential (non-race) → 2 separate AI calls    | PASS (scaffold integrity)                                                                                                                                     | PASS        |
| Integration — same-body                                      | PASS on bug shape on HEAD (Fastify-inject serializes); failed on brittle wamid-order assertion fixed in Task 2                                                | PASS        |
| Integration — different-body                                 | PASS on HEAD                                                                                                                                                  | PASS        |
| Integration — same-wamid Meta retry                          | PASS on HEAD (dedup regression-protector)                                                                                                                     | PASS        |

Captured failure transcripts in Task 2 commit body (`08437526`) and the Task 4 commit message (`2376eb31`).

## Test Results

| Surface                                                                            | Pre-Phase-93                                                | Post-Phase-93                                                                                    |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `el-templo-bot/test/v5-3-3-handler-concurrency.test.ts` (new)                      | 2/3 fail (TDD)                                              | **3/3 PASS**                                                                                     |
| `el-templo-api/test/whatsapp/v5-3-3-handler-concurrency.integration.test.ts` (new) | 3/3 pass (regression-protector role)                        | **3/3 PASS**                                                                                     |
| `el-templo-bot/test/memory-session.test.ts` (updated for Lua eval mock)            | 10/14 fail (after Task 4 source change, before test update) | **14/14 PASS**                                                                                   |
| `el-templo-bot/test/ai-handler.test.ts` (mock updated for new helpers)             | 6/7 pass (1 fail after handler.ts changed)                  | **7/7 PASS**                                                                                     |
| `el-templo-bot/test/debounce.test.ts` (legacy helpers, unchanged)                  | n/a                                                         | PASS (legacy helpers still exported)                                                             |
| **Full el-templo-bot suite**                                                       | —                                                           | **609/609 PASS**                                                                                 |
| `el-templo-api` Phase-93-related tests (v5-3-3 + conversations)                    | —                                                           | **21/21 PASS**                                                                                   |
| v5.3.2 RLOK-01..04 suite (`v5-3-2-regression.test.ts`)                             | PASS                                                        | **PASS** (zero regressions)                                                                      |
| KGATE-05 dual-threshold (≥20% rendered AND ≥35% knowledge)                         | PASS                                                        | **PASS**                                                                                         |
| PB1.E1A snapshot tripwire (`POST_RLOK_04_BYTES = 18370`)                           | PASS                                                        | **PASS** (snapshot file unchanged — Phase 93 does NOT touch `system-prompt.ts` / `knowledge.ts`) |
| Typecheck `el-templo-bot && pnpm tsc --noEmit`                                     | clean                                                       | **clean**                                                                                        |
| Typecheck `el-templo-api && pnpm tsc --noEmit`                                     | clean                                                       | **clean**                                                                                        |

**Pre-existing unrelated api failures noted but NOT caused by Phase 93:** `test/whatsapp/webhook.test.ts`, `test/whatsapp/ai-tools.test.ts`, `test/subscriptions/subscriptions.test.ts` show 29 pre-existing failures unrelated to Phase 93. Confirmed via git-stash A/B test: same 29 failures appear on baseline commit `8c74c850` (Task 3) with all Task 4 work stashed. These are pre-existing failures from earlier work; out of Phase 93 scope.

**TDD discipline proof:** Task 2 test commit `08437526` precedes Task 4 implementation commit `2376eb31` by 2 intermediate commits (Task 3 TTL adjustment at `8c74c850`). `git log --oneline master..HEAD` shows the linear chain:

```
2376eb31 fix(93-01): atomic SETNX for debounce gate + atomic Lua for updateSession (Branch 1 + Check 1.5)
8c74c850 feat(bot): raise DEBOUNCE_TTL_SECONDS per Phase 93↔94↔97 Cross-Phase Invariant (93-01)
08437526 test(93-01): fail-in-main unit suite + integration regression-protector (Branch 1+4)
b8298c89 docs(93-01): audit 5 independent checks + capture baselines (Branch 1+4 verdict)
```

## Discipline Diffs

Baselines captured in `93-AUDIT.md` (pre-Phase-93). Re-run with byte-identical grep patterns:

| Metric                                                              | Baseline (`93-AUDIT.md`) | Post-Phase-93 | Diff  |
| ------------------------------------------------------------------- | ------------------------ | ------------- | ----- |
| `console.*` count in `el-templo-bot/src/`                           | **0**                    | **0**         | **0** |
| `any`-type count (type-syntax-precise grep) in `el-templo-bot/src/` | **0**                    | **0**         | **0** |

**Grep patterns (re-run byte-identical in Task 5):**

```bash
# console count
grep -rEn "console\." el-templo-bot/src/ | wc -l

# any-type count — matches `: any`, `<any,...>`, `<any>`, `as any`, `any[]`,
# `Record<..., any>`, `Array<any>`, `Promise<any>`. Does NOT match prose-word
# 'any' in comments.
grep -rEn ':\s*any\b|<any[,>]|<any\s|as\s+any\b|\bany\[\]|Record<[^>]*,\s*any\s*>|Array<any>|Promise<any>' el-templo-bot/src/ | wc -l
```

Pino-only logging discipline maintained (`el-templo-bot/CLAUDE.md`). No new `any` types introduced — `unknown` + narrowing throughout new helpers and Lua script ARGV parsing.

## What Did NOT Change

Boundary diffs against `master` — confirms Phase 93 stayed in lane:

| File                                                                   | Reason untouched                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `el-templo-bot/src/ai/openai.ts`                                       | Phase 94 territory (OpenAI client timeout — LAT-01)                                                   |
| `el-templo-bot/src/webhook/handler.ts:584` (initial `provider.chat`)   | Phase 94 territory (interim UX + graceful fallback — LAT-02)                                          |
| `el-templo-bot/src/webhook/handler.ts:641` (tool-loop `provider.chat`) | Phase 94 territory (same as above)                                                                    |
| `el-templo-bot/src/webhook/routes.ts`                                  | Out of Phase 93 scope (ack/dispatch path); explicit READ-ONLY per 93-AUDIT.md Implementation Pointers |
| `el-templo-bot/src/ai/system-prompt.ts`                                | PB1.E1A snapshot tripwire (no rendered-prompt changes in Phase 93)                                    |
| `el-templo-bot/src/ai/knowledge.ts`                                    | PB1.E1A snapshot tripwire (same)                                                                      |

`git diff master -- {file}` returned empty for `openai.ts`, `routes.ts`, `system-prompt.ts`, `knowledge.ts`. For `handler.ts`, the lines around `:584` and `:641` (`provider.chat` await sites) show no Phase-93 modifications — only the debounce block at `:359-396` changed. No `BullMQ` / `RabbitMQ` dependency added per anti-scope-creep guard.

## Carry-Forward Notes

**For Phase 94 (LAT-01):**

- `DEBOUNCE_TTL_SECONDS` now reads `process.env.DEBOUNCE_TTL_SECONDS ?? 600`. Cross-Phase Invariant is satisfied: Phase 94 can safely set `OPENAI_TIMEOUT_MS=45000` without re-introducing BUG-01.
- **Phase 94 reviewer PR-gate verification command** (per `93-CONTEXT.md` Cross-Phase Invariant section):
  ```bash
  git log --oneline | grep -i 'debounce_ttl\|TTL\|93-' | head
  ```
  Must show Phase 93's TTL commit (`8c74c850`) ahead of the Phase 94 PR's HEAD. If missing, Phase 94 PR must NOT merge.
- Phase 94 touches `handler.ts:584` and `:641` (the two `provider.chat` await sites) — disjoint from Phase 93's debounce block at `:359-396`. Per `93-CONTEXT.md` disjoint-surface constraint, Phase 94's wrap-with-timeout/interim-UX work does NOT need to coordinate with Phase 93's atomic-primitive code beyond honoring the TTL bound.

**For Phase 97 (RGUARD-01):**

- Include `el-templo-bot/test/v5-3-3-handler-concurrency.test.ts` (unit, strict TDD lock for SETNX race + Check 1.5) AND `el-templo-api/test/whatsapp/v5-3-3-handler-concurrency.integration.test.ts` (integration, regression-protector for Fastify-inject pipeline + dedup + ack flow) in the milestone-scoped regression suite (either by reference — `pnpm test` runs them anyway — or by absorbing key assertions into a `v5-3-3-regression.test.ts` mirroring v5.3.2's pattern).
- The Cross-Phase Invariant block (`DEBOUNCE_TTL_SECONDS >= ...`) must remain textually identical across `93-CONTEXT.md`, ROADMAP Phase 93 Notes, ROADMAP Phase 94 SC#1, and `MACRO-ROADMAP.md` constraint #6 — verify during RGUARD-02. (Phase 93 did NOT modify these docs in this commit; they are already textually identical per the v5.3.3 ROADMAP creation pass.)

**For Phase 97 RGUARD-03 (executeTool timeout sweep):**

- The Lua-eval pattern used for Check 1.5's `updateSession` fix is now an established symmetric pattern alongside `releaseDebounce`. If RGUARD-03 finds other non-atomic get-modify-set surfaces in `executeTool` localhost call paths, the same Lua approach can be reused.

**Audit appendix entry (Check 1.5):**

`93-AUDIT.md` was amended in Task 4's commit with a post-hoc "Check 1.5: updateSession race" section documenting the discovery, empirical evidence, fix shape, and scope justification. The audit verdict table in Appendix A was updated implicitly — multi-fire surface is now Check 1 (debounce gate) + Check 1.5 (session append) + Check 4 (TTL coupling, Task 3). Future audits in this milestone should follow the same post-hoc amendment convention if execution surfaces an unanticipated defect class in a related file.
