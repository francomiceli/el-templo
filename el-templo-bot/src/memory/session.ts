/**
 * Session Context Memory (Redis, TTL: 6 hours)
 *
 * Stores the last 20 messages from the current conversation session.
 * Injected into AI context on each message for continuity.
 *
 * Degrades silently when Redis is unavailable -- returns null / no-op.
 */

import pino from "pino";
import { redis, isRedisAvailable } from "../redis.js";

const log = pino({ name: "el-templo-bot:session" });

/** TTL for session context: 6 hours in seconds */
export const SESSION_TTL = 21_600;

/** Maximum number of messages stored per session */
export const MAX_SESSION_MESSAGES = 20;

/** Redis key prefix for session context */
const KEY_PREFIX = "wa:session:";

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number; // epoch ms
}

export interface SessionContext {
  messages: SessionMessage[];
  updatedAt: number;
}

/**
 * Build the Redis key for a phone number's session.
 */
function sessionKey(phone: string): string {
  return `${KEY_PREFIX}${phone}`;
}

/**
 * Retrieve the current session context for a phone number.
 * Returns null if Redis is unavailable, key does not exist, or on error.
 */
export async function getSession(
  phone: string,
): Promise<SessionContext | null> {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const raw = await redis.get(sessionKey(phone));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as SessionContext;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, phone }, "Failed to get session context");
    return null;
  }
}

/**
 * Append a message to the session context.
 * Creates a new session if none exists. Trims to last MAX_SESSION_MESSAGES.
 * Silently no-ops if Redis is unavailable or on error.
 */
export async function updateSession(
  phone: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }

  try {
    const key = sessionKey(phone);
    const existing = await redis.get(key);

    let session: SessionContext;

    if (existing) {
      session = JSON.parse(existing) as SessionContext;
    } else {
      session = { messages: [], updatedAt: Date.now() };
    }

    session.messages.push({
      role,
      content,
      timestamp: Date.now(),
    });

    // Trim to last N messages
    if (session.messages.length > MAX_SESSION_MESSAGES) {
      session.messages = session.messages.slice(-MAX_SESSION_MESSAGES);
    }

    session.updatedAt = Date.now();

    await redis.set(key, JSON.stringify(session), "EX", SESSION_TTL);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, phone }, "Failed to update session context");
  }
}

// ─── Debounce helpers (quick-16, fix 2) ─────────────────────────────────────
//
// Used by the webhook handler to coalesce two messages that arrive within a
// short window (~3s) from the same phone into a single AI call. The first
// handler sets the key and sleeps; any second handler that lands while the
// key is still present detects it and returns early (its inbound is already
// in the session, so the in-flight first handler picks it up after the
// delay). All three helpers gracefully degrade if Redis is unavailable.

/**
 * Check whether a debounce key is currently held (another handler is
 * already in-flight for this phone). Returns false when Redis is down.
 */
export async function isDebounceActive(key: string): Promise<boolean> {
  if (!isRedisAvailable()) {
    return false;
  }
  try {
    const value = await redis.get(key);
    return value !== null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, key }, "Failed to read debounce key");
    return false;
  }
}

/**
 * Set a debounce key with a TTL. No-op if Redis is unavailable.
 */
export async function setDebounce(
  key: string,
  ttlSeconds: number,
): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }
  try {
    await redis.set(key, "1", "EX", ttlSeconds);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, key }, "Failed to set debounce key");
  }
}

/**
 * Delete a debounce key. No-op if Redis is unavailable.
 */
export async function deleteDebounce(key: string): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }
  try {
    await redis.del(key);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, key }, "Failed to delete debounce key");
  }
}

/**
 * Delete a session context. For manual cleanup or session reset.
 */
export async function deleteSession(phone: string): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }

  try {
    await redis.del(sessionKey(phone));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, phone }, "Failed to delete session context");
  }
}
