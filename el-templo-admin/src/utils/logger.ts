/**
 * Structured, level-gated logger for the admin app.
 *
 * Usage:
 *   import { createLogger } from 'src/utils/logger';
 *   const log = createLogger('SessionReview');
 *   log.info('Sessions loaded', { count: 42 });
 *   log.error('Failed to approve session', { error: err.message });
 *
 * In production: only warn and error output.
 * In development: all levels output with [context] prefix.
 * The error() method is the natural hook point for Sentry.captureMessage()
 * when frontend Sentry is added later.
 */

type LogData = Record<string, unknown>;

interface Logger {
  debug: (message: string, data?: LogData) => void;
  info: (message: string, data?: LogData) => void;
  warn: (message: string, data?: LogData) => void;
  error: (message: string, data?: LogData) => void;
}

const noop = () => {};

export function createLogger(context: string): Logger {
  const isProd = import.meta.env.PROD;

  const format = (message: string, data?: LogData): [string, ...unknown[]] =>
    data ? [`[${context}] ${message}`, data] : [`[${context}] ${message}`];

  return {
    debug: isProd ? noop : (msg, data?) => console.debug(...format(msg, data)),
    info: isProd ? noop : (msg, data?) => console.info(...format(msg, data)),
    warn: (msg, data?) => console.warn(...format(msg, data)),
    error: (msg, data?) => console.error(...format(msg, data)),
  };
}
