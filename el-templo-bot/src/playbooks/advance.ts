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
 * Phase 83-03 wired the smart profile-based branching: PB1.E1A/E1B advances
 * to PB1.E2A for cero_absoluto / gym_crossover and to PB1.E2B for
 * intermedio / retorna. The defer + insistence guards also live here so the
 * engine reinforces the prompt-level rules from plan 83-01.
 *
 * Phase 84-03 wired stage transitions for PB3, PB4, and PB5, and refined
 * PB2.E2 → PB2.E3 to fire on `discoveryAnswered` (any substantive reply
 * after objection handling) instead of only `priceObjection`. Plan 84-01
 * enriched PB2.E2 with four objection branches (precio, tiempo, identidad,
 * difusa); conditioning the advance on `priceObjection` alone would have
 * stranded three of the four branches on PB2.E2 forever. The broadened
 * trigger matches the same convention used for PB2.E1A/E1B → PB2.E2.
 *
 * NO IO. NO Redis. NO logger. Trivially unit-testable.
 */

import type { AvatarProfile, PlaybookId, StageId } from "./types.js";

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

  // ── NEW in phase 83 ────────────────────────────────────────────────────

  /**
   * Avatar detected this turn (from the <profile> tag Mica emitted and the
   * webhook handler extracted). Used to branch PB1.E1 → E2A vs E2B.
   * Pass the NEWLY detected avatar for this turn OR the prior stored avatar
   * if the handler wants to honor a previous detection. Null/undefined means
   * "no profile signal" and the default branching rule applies.
   */
  detectedAvatar?: AvatarProfile | null;

  /**
   * True when the user's inbound message is a direct logistical question
   * (price, schedule, location) asked BEFORE discovery finished. When true,
   * the discovery stage HOLDS (no advance) — Mica is expected to answer
   * briefly and re-anchor discovery on the same turn, per DISC-03.
   */
  directQuestionAsked?: boolean;

  /**
   * True when the user has EXPLICITLY refused to engage with discovery
   * ("solo quiero el precio", "pasame los horarios", "no tengo tiempo para
   * charlar", etc). When true, the discovery stage HOLDS and Mica defers
   * profiling that turn (DISC-07).
   */
  userInsistedDirect?: boolean;

  /**
   * v5.3.2 Phase 91 (OBJN-01): soft rejection during discovery.
   *
   * True when the user emitted an explicit soft rejection (no me interesa /
   * no creo / no voy a / me parece que no — see `computeAdvanceSignals` in
   * `webhook/handler.ts` for the full regex). Active ONLY for stageId ∈
   * {PB1.E1A, E1B, E2A, E2B, E3}; never E4–E7 (REGLA FUERTE owns its own
   * rules; PB1.E5–E7 are post-booking and "rejection" means something else).
   *
   * When true, `advanceStageIfComplete` MUST return `null` for in-scope PB1
   * stages — the rejection turn is not a discovery answer and the engine
   * must hold the stage so Mica's next reply can ask the WHY question or
   * back off (the prompt-side framing rule lives in `system-prompt.ts`).
   *
   * Inert outside the in-scope set: PB2–PB5 ignore this signal entirely
   * (PB2.E2 already owns its own four objection branches).
   */
  softRejection?: boolean;
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
    // OBJN-01 (v5.3.2 Phase 91): soft rejection during discovery never
    // advances. In-scope: E1A/E1B/E2A/E2B/E3 (the discovery block). E4–E7
    // ignore softRejection — REGLA FUERTE owns its own rules at E4 and
    // post-booking stages have different semantics. Explicit allowlist
    // (NOT a negative listing of E4–E7) so adding a future stage is
    // a deliberate inclusion, not an accidental one.
    const inScopeForRejection =
      stageId === "PB1.E1A" ||
      stageId === "PB1.E1B" ||
      stageId === "PB1.E2A" ||
      stageId === "PB1.E2B" ||
      stageId === "PB1.E3";
    if (signals.softRejection === true && inScopeForRejection) {
      return null;
    }

    // Guard: the user insisted on direct answers OR asked a direct question
    // this turn — hold the discovery stage so Mica re-anchors on the next
    // inbound message. This reinforces the defer rule from PB1 promptSections
    // (see plan 83-01). DISC-03 + DISC-07.
    if (
      signals.userInsistedDirect === true ||
      signals.directQuestionAsked === true
    ) {
      return null;
    }

    // E1A / E1B → E2A or E2B depending on detected avatar.
    //   cero_absoluto, gym_crossover → E2A (principiante variant)
    //   intermedio, retorna           → E2B (experienced variant)
    //   null/undefined                → default to E2A (backward compatible)
    if (
      (stageId === "PB1.E1A" || stageId === "PB1.E1B") &&
      signals.discoveryAnswered === true
    ) {
      const avatar = signals.detectedAvatar ?? null;
      if (avatar === "intermedio" || avatar === "retorna") {
        return "PB1.E2B";
      }
      return "PB1.E2A";
    }

    // E2A / E2B → E3 (logística)
    if (
      (stageId === "PB1.E2A" || stageId === "PB1.E2B") &&
      signals.discoveryAnswered === true
    ) {
      return "PB1.E3";
    }

    // E3 → E4 (propuesta targetizada). After E3 we ALWAYS exit discovery,
    // enforcing the 2-3 question cap regardless of how rich the answers were.
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

    // E2 → E3 on any substantive user reply after objection handling.
    // Plan 84-01 enriched PB2.E2 with four objection branches (precio,
    // tiempo, identidad, difusa); we no longer condition advancement on
    // priceObjection alone — every branch ends with the soft-urgency
    // proposal in the next turn, so any discoveryAnswered signal advances.
    if (stageId === "PB2.E2" && signals.discoveryAnswered === true) {
      return "PB2.E3";
    }

    return null;
  }

  // ── PB3: Vencimiento de Membresía ───────────────────────────────────────
  if (playbookId === "PB3") {
    // E1A / E1B → E2 (ancla de upgrade) when the user shows interest in
    // exploring options. Reuses discoveryAnswered as the "user replied
    // engagedly" signal — same convention as PB2.
    if (
      (stageId === "PB3.E1A" || stageId === "PB3.E1B") &&
      signals.discoveryAnswered === true
    ) {
      return "PB3.E2";
    }

    // E2 → E3 (facilitar pago) when the user accepts the upgrade or just
    // confirms renewal of the current plan.
    if (stageId === "PB3.E2" && signals.userAccepted === true) {
      return "PB3.E3";
    }

    return null;
  }

  // ── PB4: Miembro Inactivo ───────────────────────────────────────────────
  if (playbookId === "PB4") {
    // E1A / E1B → E2 (escuchar + ofrecer solución) on any user reply.
    // PB4 is empathy-first: the moment the inactive member responds, Mica
    // transitions to the listen+solution stage. There is no further
    // automatic advance from E2 in v5.3 — escalation (if triggered) is
    // handled by the handler's existing humanTakeoverTriggered path.
    if (
      (stageId === "PB4.E1A" || stageId === "PB4.E1B") &&
      signals.discoveryAnswered === true
    ) {
      return "PB4.E2";
    }

    return null;
  }

  // ── PB5: Cancelación ────────────────────────────────────────────────────
  if (playbookId === "PB5") {
    // E1 → E2 (resolver según motivo) when the user explained their reason.
    // We treat any substantive reply as a motivo signal.
    if (stageId === "PB5.E1" && signals.discoveryAnswered === true) {
      return "PB5.E2";
    }

    // E2 → E3 (procesar baja or escalate) when the user accepts an
    // alternative. We don't have a dedicated "refused" signal in v5.3 —
    // the refusal path is owned by Mica's reasoning + the prompt rule in
    // PB5.E3. Engine-level: only advance on userAccepted.
    if (stageId === "PB5.E2" && signals.userAccepted === true) {
      return "PB5.E3";
    }

    return null;
  }

  return null;
}
