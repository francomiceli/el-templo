/**
 * Redis Distributed Lock
 *
 * Provides atomic lock acquisition/release for schedulers to prevent
 * duplicate work when the bot process restarts or runs on multiple instances.
 *
 * Uses Redis SET with NX (set if not exists) for atomic acquire.
 * TTL ensures locks auto-expire if the holder crashes.
 *
 * Key pattern: wa:lock:{scheduler}
 */

import pino from "pino";
import { redis, isRedisAvailable } from "../redis.js";

const log = pino({ name: "scheduler:lock" });

/**
 * Attempt to acquire a distributed lock.
 *
 * @param lockKey - Redis key for the lock (e.g. "wa:lock:class-reminder")
 * @param ttlSeconds - Lock auto-expiry in seconds (prevents deadlocks on crash)
 * @returns true if lock acquired, false if already held or Redis unavailable
 */
export async function acquireLock(
  lockKey: string,
  ttlSeconds: number,
): Promise<boolean> {
  if (!isRedisAvailable()) {
    log.warn({ lockKey }, "Redis unavailable, skipping lock acquisition");
    return false;
  }

  try {
    const result = await redis.set(lockKey, "locked", "EX", ttlSeconds, "NX");
    const acquired = result === "OK";

    if (acquired) {
      log.info({ lockKey, ttlSeconds }, "Lock acquired");
    } else {
      log.info({ lockKey }, "Lock already held, skipping");
    }

    return acquired;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ lockKey, err: message }, "Failed to acquire lock");
    return false;
  }
}

/**
 * Release a distributed lock.
 *
 * Errors are swallowed and logged -- releasing is best-effort.
 * The TTL ensures the lock will expire even if release fails.
 *
 * @param lockKey - Redis key for the lock to release
 */
export async function releaseLock(lockKey: string): Promise<void> {
  try {
    await redis.del(lockKey);
    log.info({ lockKey }, "Lock released");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ lockKey, err: message }, "Failed to release lock");
  }
}
