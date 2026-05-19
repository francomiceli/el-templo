/**
 * withTimeout — AbortController-first timeout helper for tool-handler
 * localhost calls.
 *
 * Phase 95 BOOK-01 + Phase 97 RGUARD-03. Wraps an async operation in
 * an AbortController so the caller can pass `signal` into `fetch()` and
 * the in-flight HTTP request is actually closed on timeout (kernel-level
 * socket teardown) — not a Promise.race that leaves an orphan socket.
 *
 * The default 30000 ms value is locked by the Cross-Phase Invariant
 * (executeTool_timeout_seconds = 30) in `.env.example` DEBOUNCE_TTL block.
 * Phase 97 RGUARD-03 reuses the SAME env var EXECUTE_TOOL_TIMEOUT_MS to
 * extend usage to other executeTool sites.
 */

/**
 * Tagged-error subclass for `instanceof` discrimination at the
 * executeTool catch-site. The catch returns the locked allowlist
 * string `"Herramienta agotada por tiempo de espera."` (D-11 / D-18).
 */
export class ToolTimeoutError extends Error {
  constructor(message = "Tool operation timed out") {
    super(message);
    this.name = "ToolTimeoutError";
  }
}

/**
 * Run `operation` with an AbortController-backed timeout.
 *
 * The caller's `operation` receives `controller.signal` and is expected
 * to pass it into `fetch(url, { signal, ... })` so the HTTP request is
 * actually aborted on timeout. On timeout, throws `ToolTimeoutError`.
 * On non-timeout error, re-throws the original error. The timer is
 * always cleared via `finally`.
 */
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await operation(controller.signal);
  } catch (err: unknown) {
    if (controller.signal.aborted) {
      throw new ToolTimeoutError(`Tool operation timed out after ${ms}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
