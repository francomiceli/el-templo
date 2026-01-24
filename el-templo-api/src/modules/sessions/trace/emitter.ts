/**
 * Trace Emission Utilities
 *
 * Functions for creating, emitting, and aggregating trace events
 * throughout the session generation pipeline.
 */

import type { Logger } from 'pino';
import type { TraceEvent as DomainTraceEvent } from '../types';
import type {
  TraceEvent,
  TraceSeverity,
  TraceCode,
  TraceWhere,
  BlockTrace,
  SessionTrace,
} from './types';

/**
 * Create a trace event with full context
 *
 * @param code - Trace event code
 * @param where - Location context
 * @param options - Additional event data
 * @returns Complete TraceEvent object
 */
export function createTraceEvent(
  code: TraceCode,
  where: TraceWhere,
  options: {
    severity?: TraceSeverity;
    decision?: Record<string, unknown>;
    reason?: TraceEvent['reason'];
    metrics?: Record<string, number>;
    message?: string;
  } = {}
): TraceEvent {
  return {
    ts: new Date().toISOString(),
    severity: options.severity || 'INFO',
    code,
    where,
    decision: options.decision,
    reason: options.reason,
    metrics: options.metrics,
    message: options.message,
  };
}

/**
 * Emit trace to logger AND return event for collection
 *
 * Logs the event at the appropriate level and returns it
 * so it can be collected into the session trace array.
 *
 * @param logger - Pino logger instance
 * @param event - Trace event to emit
 * @returns The same event for collection
 */
export function emitTrace(logger: Logger, event: TraceEvent): TraceEvent {
  const logData = {
    trace: event,
    code: event.code,
    where: event.where,
  };

  switch (event.severity) {
    case 'INFO':
      logger.info(logData, event.message || event.code);
      break;
    case 'WARNING':
      logger.warn(logData, event.message || event.code);
      break;
    case 'ERROR':
    case 'HARD_ERROR':
      logger.error(logData, event.message || event.code);
      break;
  }

  return event;
}

/**
 * Aggregate block events into BlockTrace summary
 *
 * Summarizes all events for a block, counting warnings,
 * errors, and fallbacks applied.
 *
 * Accepts either the trace/types TraceEvent or the domain TraceEvent
 * to allow flexibility with existing pipeline code.
 *
 * @param blockId - Block identifier
 * @param events - All trace events for the block
 * @returns BlockTrace with summary statistics
 */
export function aggregateBlockTrace(
  blockId: string,
  events: readonly (TraceEvent | DomainTraceEvent)[]
): BlockTrace {
  // Cast to work with both types (they share severity and code fields)
  const typedEvents = events as readonly TraceEvent[];
  return {
    blockId,
    events: typedEvents,
    summary: {
      totalEvents: events.length,
      warnings: events.filter((e) => e.severity === 'WARNING').length,
      errors: events.filter((e) => e.severity === 'ERROR' || e.severity === 'HARD_ERROR').length,
      fallbacksApplied: events.filter((e) => e.code.includes('FALLBACK')).length,
    },
  };
}

/**
 * Aggregate session traces from all blocks
 *
 * Creates a complete session trace summary with timing information.
 *
 * @param sessionId - Session identifier
 * @param blockTraces - All block traces
 * @param durationMs - Total generation time in milliseconds
 * @returns SessionTrace with complete summary
 */
export function aggregateSessionTrace(
  sessionId: string,
  blockTraces: BlockTrace[],
  durationMs: number
): SessionTrace {
  return {
    sessionId,
    blockTraces,
    summary: {
      totalEvents: blockTraces.reduce((sum, b) => sum + b.summary.totalEvents, 0),
      totalWarnings: blockTraces.reduce((sum, b) => sum + b.summary.warnings, 0),
      totalErrors: blockTraces.reduce((sum, b) => sum + b.summary.errors, 0),
      generationDurationMs: durationMs,
    },
  };
}
