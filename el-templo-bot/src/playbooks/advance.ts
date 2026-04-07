/**
 * Playbook Engine — Stage Advancement
 *
 * Pure helper that decides whether the playbook should move to a new stage
 * given coarse signals computed by the WhatsApp handler from the inbound
 * message and Mica's outbound reply.
 *
 * Scope (v5.3): keep transitions SMALL and explicit. Only the transitions
 * that plans 83 and 84 genuinely need are wired. Everything else returns
 * `null` (no advance) so the resolver keeps the same stage on the next turn.
 *
 * Smart profile-based branching (PB1.E1->E2A vs E2B based on detected
 * avatar) is intentionally deferred to phase 83 — for now, PB1.E1A/E1B
 * always advances to PB1.E2A.
 *
 * NO IO. NO Redis. NO logger. Trivially unit-testable.
 */

import type { PlaybookId, StageId } from "./types.js";

/**
 * Coarse signals derived by the handler from the current turn.
 *
 * The handler computes these via simple keyword/regex inspection of the
 * inbound user message and Mica's outbound reply (see
 * `computeAdvanceSignals` in `webhook/handler.ts`). Plan 83 will likely
 * upgrade these to model-driven detection.
 */
export interface AdvanceSignals {
  /** A discovery question was answered this turn (used to step through PB1 stages) */
  discoveryAnswered?: boolean;
  /** Mica proposed the trial in her last reply */
  trialProposed?: boolean;
  /** The user explicitly accepted (sí, dale, anotame, etc.) */
  userAccepted?: boolean;
  /** The user raised a priced objection */
  priceObjection?: boolean;
}

/**
 * Decide whether the current `(playbookId, stageId)` should advance to a
 * new stage given this turn's signals.
 *
 * @returns The new `StageId` to persist, or `null` to keep the current stage.
 */
export function advanceStageIfComplete(
  current: { playbookId: PlaybookId; stageId: StageId },
  signals: AdvanceSignals,
): StageId | null {
  const { playbookId, stageId } = current;

  // ── PB1: Lead Nuevo ─────────────────────────────────────────────────────
  if (playbookId === "PB1") {
    // E1A / E1B → E2A (default Principiante).
    // TODO(phase-83): branch on detected avatar (cero_absoluto / gym_crossover
    // → E2A, intermedio / retorna → E2B). For now we always pick E2A so the
    // engine has a deterministic next stage; the smart split lands when the
    // profile detector exists.
    if (
      (stageId === "PB1.E1A" || stageId === "PB1.E1B") &&
      signals.discoveryAnswered === true
    ) {
      return "PB1.E2A";
    }

    // E2A / E2B → E3 (logística)
    if (
      (stageId === "PB1.E2A" || stageId === "PB1.E2B") &&
      signals.discoveryAnswered === true
    ) {
      return "PB1.E3";
    }

    // E3 → E4 (propuesta targetizada)
    if (stageId === "PB1.E3" && signals.discoveryAnswered === true) {
      return "PB1.E4";
    }

    // E4 → E5 (agendar prueba) when the user accepts
    if (stageId === "PB1.E4" && signals.userAccepted === true) {
      return "PB1.E5";
    }

    return null;
  }

  // ── PB2: Trial No Convertido ────────────────────────────────────────────
  if (playbookId === "PB2") {
    // E1A / E1B → E2 on any user reply (treated as a discovery turn)
    if (
      (stageId === "PB2.E1A" || stageId === "PB2.E1B") &&
      signals.discoveryAnswered === true
    ) {
      return "PB2.E2";
    }

    // E2 → E3 when the user raises a price objection
    if (stageId === "PB2.E2" && signals.priceObjection === true) {
      return "PB2.E3";
    }

    return null;
  }

  // ── PB3, PB4, PB5: no advancement rules in v5.3 ─────────────────────────
  // Phase 84 will introduce stage-level transitions for these. For now they
  // stay on their entry stage (or wherever the resolver left them).
  return null;
}
