/**
 * Redis Client Singleton
 *
 * Shared Redis connection for conversation context, customer memory,
 * distributed locks, and bot state.
 *
 * Uses ioredis with lazyConnect for graceful degradation -- bot starts
 * even if Redis is unavailable and recovers when Redis comes back.
 *
 * Key patterns:
 * - wa:session:{phone}  -- last N messages for AI context (TTL: 6h)
 * - wa:profile:{phone}  -- persistent customer profile (TTL: 90d)
 * - wa:lock:{scheduler}  -- distributed lock for schedulers
 * - wa:bot_state:{phone} -- 'active' | 'human_takeover'
 */

import Redis from "ioredis";
import pino from "pino";

const log = pino({ name: "el-templo-bot:redis" });

let available = false;

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Attempt to capture an error with Sentry if the package is available.
 * Uses a string variable for the module specifier to bypass TypeScript
 * module resolution (Sentry is an optional dependency).
 */
async function captureSentryError(err: Error): Promise<void> {
  try {
    const sentryModule = "@sentry/node";
    const Sentry = (await import(sentryModule)) as {
      captureException?: (err: Error) => void;
    };
    if (Sentry.captureException) {
      Sentry.captureException(err);
    }
  } catch {
    // Sentry not installed or not configured -- ignore
  }
}

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy(times: number): number | null {
    // Exponential backoff: 500ms, 1s, 2s, 4s, ... capped at 30s
    const delay = Math.min(times * 500, 30_000);
    return delay;
  },
});

redis.on("connect", () => {
  available = true;
  log.info("Redis connected");
});

redis.on("ready", () => {
  available = true;
  log.info("Redis ready");
});

redis.on("error", (err: Error) => {
  available = false;
  log.error({ err: err.message }, "Redis error");

  // Capture with Sentry if available (dynamic import to avoid hard dependency)
  void captureSentryError(err);
});

redis.on("close", () => {
  available = false;
  log.warn("Redis connection closed");
});

/**
 * Check whether Redis is currently connected and available.
 */
export function isRedisAvailable(): boolean {
  return available;
}

/**
 * Disconnect Redis gracefully. Call during process shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    available = false;
    log.info("Redis disconnected gracefully");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, "Error disconnecting Redis");
  }
}

// Attempt initial connection (non-blocking)
redis.connect().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  log.warn(
    { err: message },
    "Redis initial connection failed -- bot will operate without memory",
  );
});
