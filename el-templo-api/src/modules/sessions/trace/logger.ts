/**
 * Pino Logger Configuration for Session Generation
 *
 * Provides structured logging with context inheritance
 * for tracing session generation decisions.
 */

import pino from "pino";

/**
 * Base session logger with common configuration
 *
 * - Uses ISO timestamps for consistency
 * - Pretty prints in development
 * - Outputs JSON in production for machine parsing
 */
export const sessionLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields if any
  redact: [],
  // Use pino-pretty in development
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

/**
 * Create child logger with session context
 *
 * All log entries from this logger will include session-level context
 * for top-level session generation logging.
 *
 * @param weekId - Week number
 * @param dayId - Day identifier (e.g., "W1-lunes-sigma")
 * @param levelGroup - Level group identifier
 * @returns Child logger with session context
 */
export function createSessionLogger(
  weekId: number,
  dayId: string,
  levelGroup: string,
) {
  return sessionLogger.child({
    weekId,
    dayId,
    levelGroup,
    component: "session-generator",
  });
}
