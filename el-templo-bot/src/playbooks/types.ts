/**
 * Playbook Engine — Types
 *
 * Pure type definitions for the v5.3 conversational sales playbook engine.
 * No runtime behavior, no IO. Imported by both the registry (`definitions.ts`)
 * and the resolver (`resolver.ts`), and re-exported via `index.ts`.
 *
 * Scope note: PB6 (Onboarding) is deliberately excluded from `PlaybookId`.
 * It is out of v5.3 scope per ROADMAP / KERO-08 and revisited in v5.4.
 */

import type { ClientState } from "../state/machine.js";

/**
 * The five playbooks that exist in v5.3. PB6 is intentionally omitted
 * so any accidental reference fails at compile time.
 */
export type PlaybookId = "PB1" | "PB2" | "PB3" | "PB4" | "PB5";

/**
 * Branded string for a stage identifier.
 *
 * Format: `<PlaybookId>.E<number><variant?>` e.g. `PB1.E1A`, `PB1.E2B`,
 * `PB3.E1`, `PB5.E2`. Kept as a plain string (rather than a string-literal
 * union) so stage labels can evolve without churning the type. The registry
 * in `definitions.ts` is the single source of truth for valid values.
 */
export type StageId = string;

/**
 * A single stage within a playbook. `promptSection` is the literal Spanish
 * text that gets injected into Mica's system prompt when this stage is
 * active (plan 03). `completionCriteria` is a human-readable hint consumed
 * by the advancement logic (plan 02) — it is NOT an executable predicate.
 */
export interface PlaybookStage {
  id: StageId;
  label: string;
  promptSection: string;
  nextStageHints?: {
    onCompletion?: StageId;
    onObjection?: StageId;
  };
  completionCriteria?: string;
}

/**
 * A complete playbook definition. `entryStageId` MUST be the id of one of
 * the stages in `stages`. Enforced at runtime by the registry's self-check
 * at module load (see `definitions.ts`).
 */
export interface PlaybookDefinition {
  id: PlaybookId;
  name: string;
  trigger: string;
  stages: PlaybookStage[];
  entryStageId: StageId;
}

/**
 * Simplified 4-avatar model for v5.3 (from 11 in the onboarding quiz design).
 * Detected conversationally during PB1 discovery and persisted in the playbook
 * session state. Phase 85 uses this to adapt Mica's tone per avatar.
 */
export type AvatarProfile =
  | "cero_absoluto" // nunca entrenó o no-entrenador
  | "gym_crossover" // viene de gym/crossfit/pesas
  | "intermedio" // ya hace calistenia, quiere mejorar
  | "retorna"; // entrenó antes, volvió después de un parate

/**
 * The shape plan 02 will persist into the Redis session (6h TTL).
 * `updatedAt` is a unix epoch in milliseconds so the handler can
 * expire stale entries without a Date import in the resolver.
 *
 * Schema evolution: the optional `avatar` field (added in phase 83-02)
 * is backward-compatible — old entries written by phase 82-02 without
 * the field deserialize cleanly with `avatar === undefined`.
 */
export interface PlaybookSessionState {
  activePlaybook: PlaybookId | null;
  currentStage: StageId | null;
  /**
   * Detected avatar profile for the lead. `undefined` means not yet detected,
   * `null` is reserved for explicit clears (none currently emitted), and a
   * concrete value means the parser found a `<profile>` tag in a prior turn.
   */
  avatar?: AvatarProfile | null;
  /**
   * Count of substantive user turns observed while the conversation was in
   * PB1.E1A or PB1.E1B (uses `hasMinimumContent` as the "substantive" check).
   * Used by STAGE-02 AND gate and the infinite-loop escape hatch (v5.3.2 P90).
   * Optional + backward-compatible: absent on pre-90 entries, treated as 0.
   */
  discoveryTurnCount?: number;
  /**
   * v5.3.2 Phase 91 (OBJN-01): soft-rejection arc tracking flag.
   *
   * True when Mica's PREVIOUS turn asked the soft-rejection WHY question.
   * Used by the back-off rule selector — turn N=hot+!whyAsked → WHY rule +
   * persist whyAsked=true; turn N+1=hot+whyAsked → BACK-OFF rule. Reset on
   * any non-rejection turn (re-engagement clears the arc so a future
   * rejection re-opens with a fresh WHY).
   *
   * Optional + backward-compatible: absent on pre-91 entries, treated as
   * `false` (mirrors `discoveryTurnCount` precedent from Phase 90).
   */
  whyAsked?: boolean;
  /**
   * v5.3.3 Phase 99 (PRICE-01): per-conversation per-PB1-session
   * price-insistence counter.
   *
   * Increments at most once per inbound when the priceObjection regex at
   * handler.ts (single source of truth via `detectPriceObjection`) matches
   * AND `activePlaybook === "PB1"`. Resets to 0 at the post-AI stage-advance
   * write site when `nextStage` leaves PB1 (so the PB2 disclosure flow is
   * not gated by stale PB1 state per CONTEXT.md PRICE-01).
   *
   * Optional + backward-compatible: absent on pre-99 entries, treated as 0
   * (mirrors `discoveryTurnCount` precedent from Phase 90 and `whyAsked`
   * precedent from Phase 91).
   */
  priceInsistenceCount?: number;
  updatedAt: number;
}

/**
 * Minimal contact contract consumed by `resolvePlaybook`. The handler
 * (plan 02) is responsible for populating this from the state machine
 * and a simple cancellation keyword detector — the resolver itself
 * does NOT read the DB, Redis, or message text.
 */
export interface ResolveContact {
  clientState: ClientState;
  cancellationIntent?: boolean;
}
