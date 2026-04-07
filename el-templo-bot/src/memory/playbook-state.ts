/**
 * Playbook State Memory (Redis, TTL: 6 hours)
 *
 * Persists the active playbook id and current stage id for a conversation
 * under a stable, conversation-scoped Redis key. Read by the WhatsApp
 * handler on every inbound message and overwritten after each turn.
 *
 * Why a separate key from `wa:session:` (memory/session.ts)?
 *
 *   - The session value is rewritten on every turn (it accumulates the last
 *     20 messages and gets trimmed). Coupling playbook state to that write
 *     cycle would mean a session-trim bug could lose stage progress.
 *   - The two values have different consumers and different invalidation
 *     rules, even though they share the same 6h TTL.
 *
 * Degrades silently when Redis is unavailable -- returns null / no-op so
 * the bot keeps responding even when Redis is down (the engine simply
 * falls through to fresh resolution from `clientState` on every turn).
 *
 * Mirrors the shape of `memory/session.ts` (same Pino logger, same
 * `isRedisAvailable` guard, same silent-degrade pattern, same TTL).
 */

import pino from "pino";
import { redis, isRedisAvailable } from "../redis.js";
import type { PlaybookSessionState } from "../playbooks/types.js";

const log = pino({ name: "el-templo-bot:playbook-state" });

/** TTL for playbook state: 6 hours in seconds — matches SESSION_TTL */
export const PLAYBOOK_STATE_TTL = 21_600;

/** Redis key prefix for playbook state — distinct from `wa:session:` */
const KEY_PREFIX = "wa:playbook:";

/**
 * Build the Redis key for a phone number's playbook state.
 */
function playbookKey(phone: string): string {
  return `${KEY_PREFIX}${phone}`;
}

/**
 * Retrieve the current playbook state for a phone number.
 * Returns null if Redis is unavailable, the key does not exist, or on error.
 */
export async function getPlaybookState(
  phone: string,
): Promise<PlaybookSessionState | null> {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const raw = await redis.get(playbookKey(phone));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PlaybookSessionState;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, phone }, "Failed to get playbook state");
    return null;
  }
}

/**
 * Persist the playbook state for a phone number with a 6h TTL.
 * Silently no-ops if Redis is unavailable or on error.
 */
export async function setPlaybookState(
  phone: string,
  state: PlaybookSessionState,
): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }

  try {
    await redis.set(
      playbookKey(phone),
      JSON.stringify(state),
      "EX",
      PLAYBOOK_STATE_TTL,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, phone }, "Failed to set playbook state");
  }
}

/**
 * Delete the playbook state for a phone number. For manual cleanup,
 * cancellation flows, or session reset.
 */
export async function deletePlaybookState(phone: string): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }

  try {
    await redis.del(playbookKey(phone));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, phone }, "Failed to delete playbook state");
  }
}
