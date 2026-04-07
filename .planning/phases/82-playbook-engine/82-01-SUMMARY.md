---
phase: 82-playbook-engine
plan: 01
subsystem: el-templo-bot-playbooks
tags: [playbooks, resolver, pure-function, sales-engine, v5.3]

dependencies:
  requires:
    - el-templo-bot/src/state/machine.ts: ClientState type
  provides:
    - playbook-registry: "Static PB1-PB5 definitions with Spanish promptSection text"
    - resolve-playbook-fn: "Pure resolvePlaybook(contact, session) -> {playbookId, stageId}"
    - playbook-types: "PlaybookId, StageId, PlaybookStage, PlaybookDefinition, PlaybookSessionState, ResolveContact"
  affects:
    - phase-82-02: WhatsApp handler will import resolvePlaybook + persist PlaybookSessionState
    - phase-82-03: System-prompt builder will read promptSection from the registry

tech_stack:
  added: []
  patterns:
    - pattern: pure-resolution-function
      detail: Side-effect-free resolver with no IO/Redis/Date imports — trivially unit-testable
    - pattern: registry-self-check-on-load
      detail: definitions.ts validates entryStageId references at module load time
    - pattern: scope-guard-via-comments
      detail: PB6 absence enforced by both type union (compile-time) and a runtime test

key_files:
  created:
    - path: el-templo-bot/src/playbooks/types.ts
      purpose: Type primitives for the playbook engine
      exports:
        [
          PlaybookId,
          StageId,
          PlaybookStage,
          PlaybookDefinition,
          PlaybookSessionState,
          ResolveContact,
        ]
    - path: el-templo-bot/src/playbooks/definitions.ts
      purpose: Static PLAYBOOKS registry (PB1-PB5) with Spanish promptSection text
      exports: [PLAYBOOKS]
      size: "~250 lines, ~22 stages total"
    - path: el-templo-bot/src/playbooks/resolver.ts
      purpose: Pure resolvePlaybook(contact, session) function
      exports: [resolvePlaybook, ResolveResult]
    - path: el-templo-bot/src/playbooks/index.ts
      purpose: Public barrel export for the playbook module
    - path: el-templo-bot/test/playbook-resolver.test.ts
      purpose: Vitest unit suite (21 tests) covering all resolution rules + scope guard
  modified: []

decisions:
  - decision: PlaybookId is a string-literal union of PB1..PB5 (no PB6)
    rationale: Compile-time enforcement of v5.3 scope. Any future code that references PB6 fails at tsc, not at runtime.
  - decision: StageId is a plain branded string, not an enum
    rationale: Stage labels evolve frequently in early playbook iteration. The PLAYBOOKS registry is the single source of truth at runtime.
  - decision: Spanish promptSection is transcribed AS-IS from contexto/kero-playbooks-completos.md
    rationale: Mica's tone is already validated by the sales team review (TEAM-CORR-01..06). Paraphrasing would re-introduce drift.
  - decision: active_member with no signals -> {null, null}
    rationale: PB3 near-expiry detection requires DB lookups (v5.4 scope). v5.3 active members fall back to Mica's base persona.
  - decision: cancellationIntent is a boolean on ResolveContact, not detected inside the resolver
    rationale: Keeps the resolver pure. Plan 02's handler runs a simple keyword detector before calling the resolver.
  - decision: Session reuse requires three independent checks (playbook in registry, consistent with state, stageId valid)
    rationale: Defense in depth against stale Redis sessions, especially across PB6 removal and future stage renames.
  - decision: Module-load self-check that every entryStageId matches a stage
    rationale: Catches typos at import time rather than at the first user message.

metrics:
  duration_minutes: ~6
  tasks_completed: 2
  files_created: 5
  files_modified: 0
  test_count: 21
  test_status: all green
  completed_date: "2026-04-07"
---

# Phase 82 Plan 01: Playbook Engine Foundation (Pure Resolver) Summary

Pure side-effect-free `resolvePlaybook(contact, session)` plus the static PB1-PB5 registry, locking in the v5.3 conversational sales engine contract before handler/prompt integration.

## What Was Built

A new `el-templo-bot/src/playbooks/` module containing the entire data + decision layer for the v5.3 Conversational Sales & Playbook Engine — with zero coupling to Redis, the WhatsApp handler, or the system prompt builder. Plans 82-02 and 82-03 will consume this module without needing to modify it.

The resolver is a single function with three resolution rules (cancellation override → session reuse → fresh state mapping) and is exhaustively tested across all five client states, both cancellation override paths, six session-reuse scenarios, the PB6 scope guard, and a 100-call purity smoke test.

## Public API

```ts
// el-templo-bot/src/playbooks/index.ts (barrel)
export {
  PLAYBOOKS, // Record<PlaybookId, PlaybookDefinition>
  resolvePlaybook, // (contact, session) => ResolveResult
  type PlaybookId, // "PB1" | "PB2" | "PB3" | "PB4" | "PB5"
  type StageId, // string (e.g. "PB1.E2A")
  type PlaybookStage,
  type PlaybookDefinition,
  type PlaybookSessionState, // { activePlaybook, currentStage, updatedAt }
  type ResolveContact, // { clientState, cancellationIntent? }
  type ResolveResult, // { playbookId, stageId } -- both nullable
};
```

### `resolvePlaybook(contact, session): ResolveResult`

```ts
function resolvePlaybook(
  contact: ResolveContact, // { clientState, cancellationIntent? }
  session: PlaybookSessionState | null, // null on a fresh conversation
): { playbookId: PlaybookId | null; stageId: StageId | null };
```

**Purity guarantees** — verified by grep and by a 100-call deterministic test:

- No `await`, no async
- No imports from `redis`, `ioredis`, `../memory/`, `../webhook/`, `../ai/`
- No `Date.now()`, `Math.random()`, or `console.*`
- Does not mutate the input `contact` or `session`

## Resolution Rules (first match wins)

| #   | Rule                  | Trigger                                                                                                       | Result                                             |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | Cancellation override | `contact.cancellationIntent === true`                                                                         | `{ PB5, PB5.E1 }` (regardless of state)            |
| 2   | Session reuse         | session has playbook + stage AND playbook is in registry AND consistent with `clientState` AND stageId exists | `{ session.activePlaybook, session.currentStage }` |
| 3   | Fresh state mapping   | (else)                                                                                                        | see table below                                    |

## State → Playbook Mapping

| `clientState`                | Playbook | Entry Stage | Notes                                                                              |
| ---------------------------- | -------- | ----------- | ---------------------------------------------------------------------------------- |
| `lead`                       | PB1      | `PB1.E1A`   | Lead Nuevo — discovery + targeted proposal + free trial CTA                        |
| `trial`                      | PB2      | `PB2.E1A`   | Trial No Convertido — listen, identify objection, propose with soft urgency        |
| `expired_member`             | PB3      | `PB3.E1`    | Vencimiento — recognition + upgrade anchor + facilitate payment                    |
| `inactive_member`            | PB4      | `PB4.E1A`   | Inactivo 30+d — empathetic check-in + plan-aware pause offer (Flex excluded)       |
| `active_member`              | `null`   | `null`      | No active playbook — falls back to Mica's base persona (PB3 near-expiry is v5.4)   |
| **any** + cancellationIntent | PB5      | `PB5.E1`    | Cancelación — listen first, then resolve by motive, escalate on serious complaints |

## Stage Catalog

Plans 82-02 and 82-03 can reference these by name. All stage IDs are stable.

**PB1 — Lead Nuevo** (entry: `PB1.E1A`)

- `PB1.E1A` — Apertura + Primera Pregunta de Discovery (Variante A)
- `PB1.E1B` — Apertura + Primera Pregunta de Discovery (Variante B)
- `PB1.E2A` — Segunda Pregunta (Principiante)
- `PB1.E2B` — Segunda Pregunta (Intermedio)
- `PB1.E3` — Tercera Pregunta (Logística)
- `PB1.E4` — Propuesta Targetizada (NO recomendar plan ni precio — TEAM-CORR-02)
- `PB1.E5` — Agendar Clase de Prueba
- `PB1.E6` — Recordatorio Pre-Clase
- `PB1.E7` — Post Clase de Prueba

**PB2 — Trial No Convertido** (entry: `PB2.E1A`)

- `PB2.E1A` — Check-in Post Prueba (Variante A)
- `PB2.E1B` — Check-in Post Prueba (Variante B)
- `PB2.E2` — Escuchar + Identificar Objeción
- `PB2.E3` — Propuesta con Urgencia Suave

**PB3 — Vencimiento de Membresía** (entry: `PB3.E1`)

- `PB3.E1` — Recordatorio + Reconocimiento
- `PB3.E2` — Ancla de Upgrade
- `PB3.E3` — Facilitar Pago

**PB4 — Miembro Inactivo** (entry: `PB4.E1A`)

- `PB4.E1A` — Check-in Empático (Variante A)
- `PB4.E1B` — Check-in Empático (Variante B)
- `PB4.E2` — Escuchar + Ofrecer Solución (pausa solo para Foundation/Foundation+/Performance — TEAM-CORR-04)

**PB5 — Cancelación** (entry: `PB5.E1`)

- `PB5.E1` — Escuchar Sin Resistencia
- `PB5.E2` — Resolver Según Motivo
- `PB5.E3` — Si No Hay Vuelta

**PB6 — INTENTIONALLY ABSENT.** Out of v5.3 scope per ROADMAP / KERO-08. Revisited in v5.4. Enforced by both the `PlaybookId` type union and a unit test (`(PLAYBOOKS as Record<string, unknown>).PB6` is `undefined`).

## Session Reuse Contract (for plan 82-02)

A session is **honored** iff ALL of the following hold:

1. `session !== null`
2. `session.activePlaybook !== null` AND `session.currentStage !== null`
3. `PLAYBOOKS[session.activePlaybook]` exists (guards against stale PB6 data)
4. The stored playbook is consistent with the contact's current `clientState` (e.g. session=PB1 only valid while contact is `lead`)
5. The stored `currentStage` is found in that playbook's `stages` array (guards against renames)

Otherwise the session is **discarded** and the resolver falls through to fresh state mapping (Rule 3). Plan 82-02 should overwrite the session with the fresh result whenever a discard happens.

The handler in plan 82-02 is responsible for:

- Loading `PlaybookSessionState` from Redis (6h TTL per existing decision)
- Detecting cancellation keywords and setting `contact.cancellationIntent`
- Persisting the resolved `{playbookId, stageId}` back to Redis after each turn
- Advancing `currentStage` based on completion criteria (the resolver does NOT advance stages — it only routes)

## Verification Performed

- `cd el-templo-bot && pnpm tsc --noEmit` — clean (exit 0)
- `cd el-templo-bot && pnpm test playbook-resolver` — **21/21 passing**
- `grep -n "PB6" el-templo-bot/src/playbooks/definitions.ts` — only inside comments (lines 9, 262)
- `grep -rn "redis|ioredis|memory/session" el-templo-bot/src/playbooks/` — zero matches (purity)

## Test Coverage Summary (21 cases)

| Category                 | Cases | Examples                                                                                                                       |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| Fresh state mapping      | 5     | lead→PB1.E1A, trial→PB2.E1A, expired→PB3.E1, inactive→PB4.E1A, active→null                                                     |
| Cancellation override    | 4     | lead+cancel→PB5, active+cancel→PB5, inactive+cancel→PB5, session+cancel→PB5                                                    |
| Session reuse            | 6     | mid-flight PB1, mid-flight PB2, stale PB1 vs expired contact (discarded), bogus stageId (discarded), null session, null fields |
| PB6 scope guard          | 3     | PB6 undefined, registry has exactly PB1..PB5, every entry stage has non-empty Spanish promptSection                            |
| Purity / mutation guards | 3     | 100-call determinism, contact not mutated, session not mutated                                                                 |

## Deviations from Plan

**None auto-fixed.** Plan executed as written with one minor scaffolding-order tweak:

The plan described the barrel `index.ts` as exporting `resolvePlaybook` from Task 1, but `resolver.ts` is created in Task 2 — exporting it in Task 1 would have failed `pnpm tsc --noEmit` (Task 1's done criterion). I kept the resolver export commented in the Task 1 commit and uncommented it in the Task 2 commit. Both commits independently typecheck.

This is purely a commit-ordering detail; the final state matches the plan's intent.

## Out-of-Scope Items Noted (deferred, not fixed)

None. This plan was self-contained.

## What's Next (plan 82-02 preview)

- WhatsApp handler imports `resolvePlaybook` and `PlaybookSessionState`
- Cancellation keyword detector populates `contact.cancellationIntent`
- Redis read/write of `PlaybookSessionState` with 6h TTL
- Stage advancement logic (separate from the pure resolver)

## Self-Check: PASSED

- FOUND: `el-templo-bot/src/playbooks/types.ts`
- FOUND: `el-templo-bot/src/playbooks/definitions.ts`
- FOUND: `el-templo-bot/src/playbooks/resolver.ts`
- FOUND: `el-templo-bot/src/playbooks/index.ts`
- FOUND: `el-templo-bot/test/playbook-resolver.test.ts`
- FOUND: commit `f0b2ffa2` (Task 1)
- FOUND: commit `5ae1fa2b` (Task 2)
- VERIFIED: `pnpm tsc --noEmit` exit 0
- VERIFIED: `pnpm test playbook-resolver` — 21/21 green
- VERIFIED: PB6 absent from registry (only in comments)
- VERIFIED: zero IO imports in `src/playbooks/`
