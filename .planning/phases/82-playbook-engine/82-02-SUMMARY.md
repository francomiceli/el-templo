---
phase: 82-playbook-engine
plan: 02
subsystem: el-templo-bot-playbooks
tags: [playbooks, redis, handler-wiring, stage-advancement, v5.3]

dependencies:
  requires:
    - el-templo-bot/src/playbooks/resolver.ts: pure resolvePlaybook (plan 82-01)
    - el-templo-bot/src/playbooks/types.ts: PlaybookId, StageId, PlaybookSessionState (plan 82-01)
    - el-templo-bot/src/playbooks/definitions.ts: PLAYBOOKS registry (plan 82-01)
    - el-templo-bot/src/redis.ts: ioredis client + isRedisAvailable guard
    - el-templo-bot/src/memory/session.ts: SESSION_TTL reference (must match)
  provides:
    - playbook-state-store: getPlaybookState / setPlaybookState / deletePlaybookState (Redis, 6h TTL)
    - stage-advancement-fn: pure advanceStageIfComplete(current, signals) for PB1 and PB2
    - cancellation-intent-detector: detectCancellationIntent(text) regex helper inside webhook/handler.ts
    - signal-extractor: computeAdvanceSignals(inboundText, replyText) inside webhook/handler.ts
    - prompt-options-passthrough: SystemPromptOptions extended with optional activePlaybook + currentStage
  affects:
    - phase-82-03: getSystemPrompt will now receive activePlaybook + currentStage and inject the matching promptSection
    - phase-83: discovery-mode profile detection will replace the default PB1.E1->E2A branch with avatar-aware routing
    - phase-84: PB3/PB4/PB5 transitions will be added to advance.ts (currently return null)

tech_stack:
  added: []
  patterns:
    - pattern: dual-write-redis-engine-state
      detail: Handler writes the resolved playbook state BEFORE the AI call (crash safety) and overwrites it AFTER the AI call only when the stage actually advances (≤2 writes per turn)
    - pattern: silent-degradation-on-redis-failure
      detail: All playbook-state ops mirror memory/session.ts — log via Pino, return null/no-op, never throw to handler
    - pattern: separate-key-namespace
      detail: wa:playbook:<phone> is intentionally distinct from wa:session:<phone> so engine state is not coupled to the session-trim write cycle
    - pattern: pre-emptive-interface-merge
      detail: SystemPromptOptions adds optional activePlaybook + currentStage in this plan even though plan 82-03 will consume them — keeps the parallel wave merges painless

key_files:
  created:
    - path: el-templo-bot/src/memory/playbook-state.ts
      purpose: Redis get/set/delete for PlaybookSessionState with 6h TTL, mirrors session.ts shape
      exports: [getPlaybookState, setPlaybookState, deletePlaybookState, PLAYBOOK_STATE_TTL]
    - path: el-templo-bot/src/playbooks/advance.ts
      purpose: Pure stage advancement helper (PB1 + PB2 transitions only in v5.3)
      exports: [advanceStageIfComplete, AdvanceSignals]
    - path: el-templo-bot/test/playbook-state.test.ts
      purpose: 14 tests — round-trip, miss, delete, TTL, error degradation, prefix, overwrite, TTL=SESSION_TTL parity
    - path: el-templo-bot/test/playbook-advance.test.ts
      purpose: 21 tests — every wired transition + no-advance cases + purity guards (no mutation, deterministic)
  modified:
    - path: el-templo-bot/src/webhook/handler.ts
      change: Imports playbook engine pieces; calls resolvePlaybook + persists BEFORE the AI call; computes coarse signals + advanceStageIfComplete + persists AFTER the AI reply; passes activePlaybook/currentStage into getSystemPrompt; adds local detectCancellationIntent + computeAdvanceSignals helpers
    - path: el-templo-bot/src/ai/system-prompt.ts
      change: SystemPromptOptions extended with optional activePlaybook?: PlaybookId and currentStage?: StageId (passthrough only, plan 82-03 will consume)

decisions:
  - decision: Use a separate Redis key namespace (wa:playbook:) instead of stuffing playbook state inside the existing wa:session: value
    rationale: The session value is rewritten on every turn (last 20 messages, trimmed). Coupling stage progress to that write cycle would mean a session-trim bug could lose engine state. The two values also have different consumers and different invalidation semantics, even though they share the same 6h TTL.
  - decision: PLAYBOOK_STATE_TTL is exactly SESSION_TTL (21_600 seconds) — asserted by test
    rationale: Both values represent "this conversation is still warm." If they expired at different times, the bot would either resolve a playbook with no session history (cold restart mid-flight) or remember a conversation it has no playbook for. Asserted in tests so a future bump only happens in lock-step.
  - decision: Persist the resolved {playbookId, stageId} BEFORE the AI provider call, then overwrite AFTER the reply only when the stage actually advances
    rationale: Crash safety. If the AI provider throws after we resolve but before we write, the next inbound message would re-resolve from scratch and the user-visible state would be inconsistent with what Mica was doing on the prior turn. Worst case is 2 Redis writes per turn — cheap.
  - decision: PB1.E1A and PB1.E1B both default to PB1.E2A when discovery is answered (no smart branching yet)
    rationale: The avatar/profile detector lives in plan 83. The engine still needs a deterministic next stage today, so we pick E2A and leave a `TODO(phase-83)` comment to flip to E2B for intermedio/retorna avatars.
  - decision: PB3, PB4, and PB5 have NO advancement rules in v5.3
    rationale: Phase 84 owns the state-adaptive PB2-PB5 prompts and will add transitions then. Returning null here keeps the resolver pinning these playbooks to their entry stage, which is the correct v5.3 behavior because none of those flows ship yet.
  - decision: detectCancellationIntent uses a narrow Spanish keyword regex (cancelar | dar de baja | quiero irme | quiero salir | darme de baja)
    rationale: The handler hands a hard boolean to the resolver, and PB5 is high-stakes (it short-circuits everything else). False positives would route normal users into a cancellation flow, which is far worse than missing a few edge phrasings. Plan 84 will expand this once PB5 stages exist.
  - decision: computeAdvanceSignals lives inside handler.ts as a private helper, not in src/playbooks/intents.ts
    rationale: It is the only caller, the regex set is tiny, and putting it next to the signal consumer keeps the wiring obvious. If phase 83 grows this into a model-driven detector with multiple call sites, that is the moment to extract.
  - decision: Pre-emptively add activePlaybook + currentStage to SystemPromptOptions in this plan (the parallel plan 82-03 also touches this file)
    rationale: Coordinator note explicitly requested a pre-emptive merge so the parallel wave does not collide. The fields are optional, ignored by the current renderer, and idempotent to re-add — plan 82-03 just consumes them.

metrics:
  duration_minutes: ~12
  tasks_completed: 2
  files_created: 4
  files_modified: 2
  test_count: 35
  test_status: all green (231/231 in full bot suite)
  completed_date: "2026-04-07"
---

# Phase 82 Plan 02: Redis Persistence + Stage Advancement + Handler Wiring Summary

Wires the pure resolver from plan 82-01 into the live WhatsApp handler with a Redis-backed `{activePlaybook, currentStage}` store, a pure stage-advancement helper, and a cancellation-intent detector — all while preserving the silent-degradation guarantee from `memory/session.ts`.

## What Was Built

The Playbook Engine is now an actual engine, not just a resolver. On every inbound message the handler reads prior playbook state from Redis, runs `resolvePlaybook`, persists the result before the AI call, generates Mica's reply, computes coarse advancement signals from the inbound + outbound text, and overwrites Redis with the next stage when the helper returns one. Stage state survives across turns within a 6h TTL that matches `SESSION_TTL` exactly, and the handler degrades silently to the resolver-only path when Redis is down.

Plan 82-03 can now read `activePlaybook` and `currentStage` from `SystemPromptOptions` (already plumbed through `getSystemPrompt`) and inject the matching playbook section.

## Redis Key Schema

| Key                   | Value                        | TTL          | Writer                                      | Reader                                    |
| --------------------- | ---------------------------- | ------------ | ------------------------------------------- | ----------------------------------------- |
| `wa:playbook:<phone>` | `JSON(PlaybookSessionState)` | 21 600s (6h) | `setPlaybookState` (handler, 1-2x per turn) | `getPlaybookState` (handler, 1x per turn) |

`PlaybookSessionState` shape (from plan 82-01):

```ts
{
  activePlaybook: PlaybookId | null,  // "PB1" | "PB2" | "PB3" | "PB4" | "PB5"
  currentStage: StageId | null,       // e.g. "PB1.E1A"
  updatedAt: number,                  // epoch ms
}
```

`PLAYBOOK_STATE_TTL === SESSION_TTL === 21_600` is asserted in `playbook-state.test.ts` so any future bump must happen in lock-step.

## Advancement Rules (v5.3)

| Playbook    | From       | Signal              | To   | Notes                                               |
| ----------- | ---------- | ------------------- | ---- | --------------------------------------------------- |
| PB1         | E1A or E1B | `discoveryAnswered` | E2A  | Default Principiante. `TODO(phase-83)` smart branch |
| PB1         | E2A or E2B | `discoveryAnswered` | E3   | Logística                                           |
| PB1         | E3         | `discoveryAnswered` | E4   | Propuesta targetizada                               |
| PB1         | E4         | `userAccepted`      | E5   | Agendar prueba                                      |
| PB1         | E5         | (any)               | null | Terminal in v5.3                                    |
| PB2         | E1A or E1B | `discoveryAnswered` | E2   | Escuchar + identificar objeción                     |
| PB2         | E2         | `priceObjection`    | E3   | Propuesta con urgencia suave                        |
| PB2         | E3         | (any)               | null | Terminal in v5.3                                    |
| PB3/PB4/PB5 | (any)      | (any)               | null | Deferred to phase 84                                |

`advanceStageIfComplete` is pure — no IO, no logger, no Date import — and is exhaustively unit-tested (21 cases including mutation guards and a 100-call determinism check).

## Handler Integration Points

Two engine touchpoints inside `processWithAi`, both inside the existing best-effort try block:

**1. Pre-AI: resolve and persist**

```ts
const priorPbState = await getPlaybookState(phone);
const resolved = resolvePlaybook(
  { clientState, cancellationIntent: detectCancellationIntent(inboundText) },
  priorPbState,
);

if (resolved.playbookId !== null && resolved.stageId !== null) {
  await setPlaybookState(phone, {
    activePlaybook: resolved.playbookId,
    currentStage: resolved.stageId,
    updatedAt: Date.now(),
  });
}
```

This runs BEFORE `provider.chat()` so a crash mid-turn cannot leave the engine in a state that disagrees with what Mica was doing. The resolved fields are then passed into `getSystemPrompt({ ..., activePlaybook, currentStage })` so plan 82-03 can read them.

**2. Post-AI: signal extraction + conditional advance**

```ts
await updateSession(phone, "assistant", replyText);

if (resolved.playbookId !== null && resolved.stageId !== null) {
  const signals = computeAdvanceSignals(inboundText, replyText);
  const nextStage = advanceStageIfComplete(
    { playbookId: resolved.playbookId, stageId: resolved.stageId },
    signals,
  );
  if (nextStage !== null) {
    await setPlaybookState(phone, {
      activePlaybook: resolved.playbookId,
      currentStage: nextStage,
      updatedAt: Date.now(),
    });
  }
}
```

Worst case: 2 Redis writes per turn (resolve, then advance). Best case: 1 (no advance). When Redis is down, both writes silently no-op and the handler proceeds normally — the engine simply re-resolves from `clientState` on the next turn.

## Cancellation Intent Regex

Lives at the bottom of `webhook/handler.ts`. Plan 84 will expand it; for v5.3 it stays narrow:

```ts
function detectCancellationIntent(text: string): boolean {
  return /\b(cancelar|dar de baja|quiero irme|quiero salir|darme de baja)\b/i.test(
    text,
  );
}
```

Reasoning: PB5 short-circuits the entire resolver. False positives would route normal users into a cancellation flow, which is strictly worse than missing edge phrasings.

## Signal Extraction Heuristic

`computeAdvanceSignals(inboundText, replyText)` runs four narrow regexes against the lowercased turn text:

| Signal              | Source          | Heuristic                                                                                    |
| ------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| `discoveryAnswered` | reply + inbound | Reply contains `?` AND inbound has non-trivial content                                       |
| `trialProposed`     | reply           | `\b(prueba\|probar\|clase de prueba\|gratis)\b/i`                                            |
| `userAccepted`      | inbound         | `\b(sí\|si\|dale\|anotame\|me anoto\|me sumo\|listo\|perfecto\|genial)\b/i`                  |
| `priceObjection`    | inbound         | `\b(caro\|carísimo\|precio\|no me alcanza\|no puedo pagar\|muy caro\|barato\|descuento)\b/i` |

Phase 83 may upgrade this to a model-driven detector. Kept as a private helper inside `handler.ts` rather than a separate `intents.ts` module since it has exactly one caller and a tiny regex set.

## Verification Performed

- `cd el-templo-bot && pnpm tsc --noEmit` — clean (exit 0)
- `cd el-templo-bot && pnpm test playbook-state` — **14/14 passing**
- `cd el-templo-bot && pnpm test playbook-advance` — **21/21 passing**
- `cd el-templo-bot && pnpm test` — **231/231 passing across 12 files** (no regressions in existing handler/session/conversation tests)
- `grep -rn "prisma\|drizzle\|mysql\|\.sql" el-templo-bot/src/playbooks/ el-templo-bot/src/memory/playbook-state.ts` — zero matches (Redis-only)
- `grep -n "resolvePlaybook" el-templo-bot/src/webhook/handler.ts` — exactly 1 call site (plus 1 import line)
- `grep -n "PlaybookState\|advanceStageIfComplete" el-templo-bot/src/webhook/handler.ts` — 6 hits across imports + the two integration points
- `grep -rn "console\." el-templo-bot/src/memory/playbook-state.ts el-templo-bot/src/playbooks/advance.ts` — zero matches (Pino-only)

## Test Coverage Summary

| File                            | Cases | Categories                                                                                           |
| ------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `test/playbook-state.test.ts`   | 14    | Round-trip · miss · delete · TTL value · prefix · overwrite · error degradation · TTL/SESSION parity |
| `test/playbook-advance.test.ts` | 21    | Every PB1 transition · every PB2 transition · PB3/PB4/PB5 no-op · purity (no mutation, determinism)  |

## Deviations from Plan

**None auto-fixed.** Plan executed as written, with two minor scoping notes:

1. The plan suggested EITHER casting `as SystemPromptOptions` OR cleanly extending the interface for the parallel-wave merge. I took the cleaner path (extended the interface) because (a) the coordinator note explicitly asked for a pre-emptive merge for plan 82-03, (b) optional fields are idempotent if 82-03 also adds them, and (c) it avoids leaving a `TODO`-flavored cast in the handler.
2. The plan listed `el-templo-bot/src/playbooks/intents.ts` as a possible home for `detectCancellationIntent` and `computeAdvanceSignals`. I kept both as private helpers inside `webhook/handler.ts` because they have exactly one caller each and the regex sets are tiny — extraction would have been premature. Phase 83 is the natural moment to revisit.

## Out-of-Scope Items Noted (deferred, not fixed)

- **Smart PB1.E1 → E2A vs E2B branching** based on detected avatar — left as `TODO(phase-83)` inside `advance.ts`. Today both E1A and E1B always go to E2A.
- **PB3, PB4, PB5 stage transitions** — `advanceStageIfComplete` returns `null` for all of them. Phase 84 owns this.
- **Model-driven signal extraction** — `computeAdvanceSignals` uses simple regex matches. Phase 83 may upgrade.
- **Cross-session durability** — playbook state expires with the 6h TTL. v5.4 (Kero CRM) is the moment to consider MySQL persistence.

## What's Next (plan 82-03 preview)

- `getSystemPrompt` consumes `activePlaybook` + `currentStage` (already plumbed by this plan)
- The active playbook's `promptSection` from `PLAYBOOKS[activePlaybook]` is injected — and ONLY that section, never the other four
- Verification that the rendered prompt across all five client states contains exactly one playbook block

## Self-Check: PASSED

- FOUND: `el-templo-bot/src/memory/playbook-state.ts`
- FOUND: `el-templo-bot/src/playbooks/advance.ts`
- FOUND: `el-templo-bot/test/playbook-state.test.ts`
- FOUND: `el-templo-bot/test/playbook-advance.test.ts`
- FOUND: modified `el-templo-bot/src/webhook/handler.ts`
- FOUND: modified `el-templo-bot/src/ai/system-prompt.ts`
- FOUND: commit `9d59c5bb` (Task 1: Redis playbook state)
- FOUND: commit `aff96077` (Task 2: advance helper + handler wiring)
- VERIFIED: `pnpm tsc --noEmit` exit 0
- VERIFIED: `pnpm test` 231/231 green (12 files)
- VERIFIED: zero MySQL/Drizzle imports in `src/playbooks/` and `src/memory/playbook-state.ts`
- VERIFIED: `wa:playbook:` key prefix present and distinct from `wa:session:`
- VERIFIED: PLAYBOOK_STATE_TTL === SESSION_TTL (asserted in test)
