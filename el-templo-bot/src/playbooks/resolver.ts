/**
 * Playbook Engine — Resolver
 *
 * Pure, side-effect-free function that maps a (contact, session) pair to
 * exactly one {playbookId, stageId}. No IO, no Redis, no logging, no clocks.
 *
 * Resolution rules (first match wins):
 *   1. Cancellation intent overrides everything  -> PB5
 *   2. Session reuse if still consistent with clientState
 *   3. Fresh clientState -> playbook mapping
 *
 * Consumers:
 *   - The WhatsApp handler (plan 82-02) calls `resolvePlaybook` on every turn
 *     to decide which playbook prompt section to inject.
 *   - The system-prompt builder (plan 82-03) reads the result and pulls the
 *     matching stage from the `PLAYBOOKS` registry.
 */

import type { ClientState } from "../state/machine.js";
import { PLAYBOOKS } from "./definitions.js";
import type {
  PlaybookId,
  PlaybookSessionState,
  ResolveContact,
  StageId,
} from "./types.js";

export interface ResolveResult {
  playbookId: PlaybookId | null;
  stageId: StageId | null;
}

/**
 * Static mapping from client lifecycle state to its default playbook.
 * `active_member` maps to `null` — active members without cancellation
 * intent and without near-expiry signals fall back to Mica's base persona
 * (no playbook prompt section injected). PB3 near-expiry is a v5.4 concern.
 */
const STATE_TO_PLAYBOOK: Record<ClientState, PlaybookId | null> = {
  lead: "PB1",
  trial: "PB2",
  expired_member: "PB3",
  inactive_member: "PB4",
  active_member: null,
};

/**
 * Inverse check: is the given playbook still consistent with the contact's
 * current clientState? Used to decide whether to honor an in-flight session.
 * PB5 is NEVER considered consistent here because cancellation resolution
 * runs earlier in `resolvePlaybook` and short-circuits the session branch.
 */
function isConsistent(
  playbookId: PlaybookId,
  clientState: ClientState,
): boolean {
  return STATE_TO_PLAYBOOK[clientState] === playbookId;
}

/**
 * Resolve the active playbook and stage for a contact.
 *
 * @param contact  Minimal contact contract (clientState + cancellation flag)
 * @param session  Optional in-flight playbook session from Redis (plan 02).
 *                 Pass `null` on a fresh conversation.
 * @returns `{playbookId, stageId}`. Both fields are `null` only when the
 *          contact is an `active_member` with no cancellation intent and
 *          no valid in-flight session.
 */
export function resolvePlaybook(
  contact: ResolveContact,
  session: PlaybookSessionState | null,
): ResolveResult {
  // Rule 1: cancellation intent short-circuits everything.
  if (contact.cancellationIntent === true) {
    return {
      playbookId: "PB5",
      stageId: PLAYBOOKS.PB5.entryStageId,
    };
  }

  // Rule 2: session reuse. Honor a stored (playbook, stage) pair iff:
  //   - both fields are present
  //   - the stored playbook is still in the registry (guards against
  //     stale PB6 data that might pre-date the v5.3 scope guard)
  //   - the stored playbook is still consistent with the current
  //     clientState (otherwise the client transitioned and the old
  //     stage is stale — discard it)
  //   - the stored stageId actually exists in that playbook's stage list
  if (
    session !== null &&
    session.activePlaybook !== null &&
    session.currentStage !== null
  ) {
    const stored = PLAYBOOKS[session.activePlaybook];
    if (
      stored !== undefined &&
      isConsistent(session.activePlaybook, contact.clientState) &&
      stored.stages.some((s) => s.id === session.currentStage)
    ) {
      return {
        playbookId: session.activePlaybook,
        stageId: session.currentStage,
      };
    }
  }

  // Rule 3: fresh state-to-playbook mapping.
  const playbookId = STATE_TO_PLAYBOOK[contact.clientState];
  if (playbookId === null) {
    return { playbookId: null, stageId: null };
  }
  return {
    playbookId,
    stageId: PLAYBOOKS[playbookId].entryStageId,
  };
}
