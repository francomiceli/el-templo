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
 * The shape plan 02 will persist into the Redis session (6h TTL).
 * `updatedAt` is a unix epoch in milliseconds so the handler can
 * expire stale entries without a Date import in the resolver.
 */
export interface PlaybookSessionState {
  activePlaybook: PlaybookId | null;
  currentStage: StageId | null;
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
