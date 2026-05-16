/**
 * Session Context Memory (Redis, TTL: 6 hours)
 *
 * Stores the last 20 messages from the current conversation session.
 * Injected into AI context on each message for continuity.
 *
 * Degrades silently when Redis is unavailable -- returns null / no-op.
 */

import { randomBytes } from "node:crypto";
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
 * Lua script: atomic read-modify-write append to session context.
 *
 * Phase 93 Check 1.5 — `updateSession` had the same non-atomic get-modify-set
 * defect class as the original debounce gate. Under concurrent invocations,
 * two callers both read the same prior value, both append their own message
 * to their LOCAL copy, both write back — last writer wins, prior messages
 * lost. This script collapses the operation into a single server-side
 * mutation so concurrent calls serialize on Redis (one Lua execution at a
 * time per Redis docs — eval is atomic w.r.t. other commands).
 *
 * KEYS[1] = session key (`wa:session:<phone>`)
 * ARGV[1] = new message (JSON-encoded SessionMessage)
 * ARGV[2] = max messages (decimal string)
 * ARGV[3] = TTL seconds (decimal string)
 * ARGV[4] = updatedAt epoch ms (decimal string; supplied by client for parity
 *           with the prior Date.now() behavior)
 */
const UPDATE_SESSION_SCRIPT = `
local existing = redis.call("get", KEYS[1])
local session
if existing then
  session = cjson.decode(existing)
else
  session = { messages = {}, updatedAt = 0 }
end

local newMessage = cjson.decode(ARGV[1])
table.insert(session.messages, newMessage)

local maxMessages = tonumber(ARGV[2])
local n = #session.messages
if n > maxMessages then
  local trimmed = {}
  for i = n - maxMessages + 1, n do
    table.insert(trimmed, session.messages[i])
  end
  session.messages = trimmed
end

session.updatedAt = tonumber(ARGV[4])

redis.call("set", KEYS[1], cjson.encode(session), "EX", tonumber(ARGV[3]))
return 1
`;

/**
 * Append a message to the session context.
 * Creates a new session if none exists. Trims to last MAX_SESSION_MESSAGES.
 * Silently no-ops if Redis is unavailable or on error.
 *
 * Atomic: the read-modify-write is collapsed into a single Lua eval so
 * concurrent invocations serialize on Redis. See UPDATE_SESSION_SCRIPT
 * comment for the Phase 93 Check 1.5 background.
 */
export async function updateSession(
  phone: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }

  const key = sessionKey(phone);
  const newMessage: SessionMessage = {
    role,
    content,
    timestamp: Date.now(),
  };

  try {
    await redis.eval(
      UPDATE_SESSION_SCRIPT,
      1,
      key,
      JSON.stringify(newMessage),
      String(MAX_SESSION_MESSAGES),
      String(SESSION_TTL),
      String(Date.now()),
    );
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

// ─── Atomic debounce primitive (Phase 93 Branch 1 — SETNX-race fix) ──────────
//
// The legacy isDebounceActive + setDebounce pair is non-atomic (two Redis
// round-trips). Under concurrent webhook invocations both can observe the
// key as missing before either's set lands, both proceed, and both spawn
// AI calls — the BUG-01 duplicate-reply failure mode. The pair below
// replaces it with a single atomic SET NX PX round-trip and a token-aware
// Lua compare-and-delete release. Old helpers remain exported for
// debounce.test.ts backward compat; new code should use these.

/**
 * Atomic SETNX with token-aware acquisition.
 * Returns a unique token string on successful acquisition (caller must hold
 * onto it and pass to releaseDebounce). Returns null if the key is already
 * held by another holder.
 *
 * When Redis is unavailable, returns a synthetic token (graceful degrade —
 * single-process semantics, no coordination needed).
 * On Redis error, returns null (fail-closed: drop the inbound rather than
 * fail-open and risk a duplicate reply).
 */
export async function tryAcquireDebounce(
  key: string,
  ttlSeconds: number,
): Promise<string | null> {
  if (!isRedisAvailable()) {
    return randomBytes(8).toString("hex");
  }
  const token = randomBytes(8).toString("hex");
  try {
    const result = await redis.set(key, token, "EX", ttlSeconds, "NX");
    return result === "OK" ? token : null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, key }, "Failed to acquire debounce key");
    return null;
  }
}

/**
 * Token-aware debounce release. Atomically deletes the key only when its
 * current value equals our token — prevents accidental release of a peer's
 * lock if our TTL expired and they re-acquired.
 *
 * No-op when Redis is unavailable. Swallows Redis errors (log only).
 */
export async function releaseDebounce(
  key: string,
  token: string,
): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }
  try {
    await redis.eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      key,
      token,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, key }, "Failed to release debounce key");
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
