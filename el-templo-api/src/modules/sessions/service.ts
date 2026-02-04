/**
 * Session Generator Service
 *
 * Main entry point for session generation. Generates complete
 * daily sessions with 5 blocks (or 4 if DEUTEROS_2 is null).
 *
 * Also handles session persistence via saveSession, getSessionByDayId,
 * and getSessionWithDetails methods.
 *
 * Logging:
 * - Uses Pino for structured JSON logging
 * - All session-level events are logged with timing
 * - Optional trace persistence to session_traces table (PERSIST_TRACES=true)
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { SpomService } from '../spom/service';
import { runBlockPipeline, createInitialContext } from './pipeline';
import type { LevelGroup, BlockRole, DaySession, BlockPlan, TraceEvent, ExercisePrescription, ExerciseLevel } from './types';
import { getFinalBlockRole } from './types';
import { validateSessionForTrace } from './validators/session-validator';
import { createSessionLogger } from './trace/logger';
import { aggregateBlockTrace, aggregateSessionTrace } from './trace/emitter';
import type { BlockTrace, SessionTrace } from './trace/types';

/**
 * Get block roles in execution order for a given week
 * Final block alternates: odd weeks = ATHLOS, even weeks = EPIKOS
 */
function getBlockRoles(week: number): BlockRole[] {
  return [
    'INITIUM',
    'NUCLEUS',
    'DEUTEROS_1',
    'DEUTEROS_2',
    getFinalBlockRole(week),
  ];
}

/** Input for session generation */
export interface GenerateSessionInput {
  week: number;
  day: string;
  levelGroup: LevelGroup;
  memberLevel: ExerciseLevel;
}

/**
 * Session Generator Service
 *
 * Follows existing service pattern from SpomService.
 * Creates complete daily sessions from SPOM tables.
 */
export class SessionGeneratorService {
  private spomService: SpomService;

  constructor(private db: MySql2Database<typeof schema>) {
    this.spomService = new SpomService(db);
  }

  /**
   * Generate a complete daily session
   *
   * Creates 5 blocks (INITIUM through ATHLOS/EPIKOS).
   * Final block alternates: odd weeks = ATHLOS, even weeks = EPIKOS.
   * DEUTEROS_2 is skipped if rotator has null route.
   *
   * @param input - Week, day, and level group
   * @returns Complete DaySession with all blocks
   */
  async generateDailySession(input: GenerateSessionInput): Promise<DaySession> {
    const { week, day, levelGroup, memberLevel } = input;
    const startTime = Date.now();
    const dayId = `W${week}-${day}-${memberLevel}`;

    // Create Pino logger with session context
    const logger = createSessionLogger(week, dayId, levelGroup);
    logger.info({ event: 'SESSION_STARTED', week, day, levelGroup, memberLevel }, 'Starting session generation');

    const sessionTrace: TraceEvent[] = [];
    const blocks: BlockPlan[] = [];
    const blockTraces: BlockTrace[] = [];

    // Check if DEUTEROS_2 should be skipped and resolve Nucleus route for contextual Initium
    const rotator = await this.spomService.getWeeklyRotator(week, day, levelGroup);
    const skipDeuteros2 = !rotator || rotator.deuteros2RouteId === null;

    // Resolve Nucleus route for contextual Initium selection (13-04)
    let nucleusRoute: string | undefined;
    if (rotator && rotator.nucleusRouteId) {
      const route = await this.spomService.getRouteById(rotator.nucleusRouteId);
      if (route) {
        nucleusRoute = route.code;
        logger.info({
          event: 'NUCLEUS_ROUTE_RESOLVED',
          nucleusRoute,
          nucleusRouteId: rotator.nucleusRouteId,
        }, `Resolved Nucleus route for contextual Initium: ${nucleusRoute}`);
      }
    }

    if (!nucleusRoute) {
      logger.warn({
        event: 'NUCLEUS_ROUTE_MISSING',
        reason: !rotator ? 'No rotator entry' : 'No nucleusRouteId',
      }, 'Nucleus route not available for contextual Initium selection');
    }

    // Generate each block in sequence (determinism requires sequential execution)
    const blockRoles = getBlockRoles(week);
    for (const role of blockRoles) {
      // Skip DEUTEROS_2 if no route assigned
      if (role === 'DEUTEROS_2' && skipDeuteros2) {
        sessionTrace.push({
          ts: new Date().toISOString(),
          severity: 'INFO',
          code: 'BLOCK_SKIPPED',
          where: {
            week,
            day,
            levelGroup,
            memberLevel,
            blockId: `W${week}-${day}-${memberLevel}-${role}`,
            role,
          },
          decision: {
            reason: 'No route assigned in rotator (deuteros2RouteId is null)',
          },
        });
        continue;
      }

      // Create initial context for this block
      // Pass nucleusRoute to INITIUM for contextual exercise selection (13-04)
      const initialContext = createInitialContext(
        week,
        day,
        levelGroup,
        memberLevel,
        role,
        role === 'INITIUM' ? nucleusRoute : undefined
      );

      // Run the 7-stage pipeline
      const blockPlan = await runBlockPipeline(
        initialContext,
        this.spomService,
        this.db
      );

      blocks.push(blockPlan);

      // Aggregate block trace for session summary
      blockTraces.push(aggregateBlockTrace(blockPlan.blockId, [...blockPlan.trace]));

      // Collect block trace into session trace
      const blockCompleteEvent: TraceEvent = {
        ts: new Date().toISOString(),
        severity: 'INFO',
        code: 'BLOCK_COMPLETED',
        where: {
          week,
          day,
          levelGroup,
          memberLevel,
          blockId: blockPlan.blockId,
          role,
        },
        decision: {
          route: blockPlan.route,
          intensity: blockPlan.intensity,
          format: blockPlan.format.name,
          exerciseCount: blockPlan.exercises.length,
        },
      };
      sessionTrace.push(blockCompleteEvent);

      // Log block completion via Pino
      logger.info({
        event: 'BLOCK_COMPLETED',
        blockId: blockPlan.blockId,
        role,
        route: blockPlan.route,
        intensity: blockPlan.intensity,
        format: blockPlan.format.name,
        exerciseCount: blockPlan.exercises.length,
        traceEvents: blockPlan.trace.length,
      }, `Block ${role} completed`);
    }

    // Final session summary trace
    sessionTrace.push({
      ts: new Date().toISOString(),
      severity: 'INFO',
      code: 'SESSION_GENERATED',
      where: {
        week,
        day,
        levelGroup,
        memberLevel,
        blockId: dayId,
        role: 'INITIUM', // Placeholder for session-level trace
      },
      decision: {
        blocksGenerated: blocks.length,
        totalExercises: blocks.reduce((sum, b) => sum + b.exercises.length, 0),
      },
    });

    const daySession: DaySession = {
      dayId,
      week,
      day,
      levelGroup,
      memberLevel,
      blocks,
      trace: sessionTrace,
    };

    // Validate the generated session
    const validation = validateSessionForTrace(daySession);

    if (!validation.valid) {
      // Add validation error trace
      sessionTrace.push({
        ts: new Date().toISOString(),
        severity: 'ERROR',
        code: 'VALIDATION_FAILED',
        where: {
          week,
          day,
          levelGroup,
          memberLevel,
          blockId: dayId,
          role: 'INITIUM',
        },
        decision: validation,
      });

      throw new Error(
        `Session validation failed: ${validation.errors.join('; ')}`
      );
    }

    // Add validation success trace (even if warnings exist)
    sessionTrace.push({
      ts: new Date().toISOString(),
      severity: validation.warningCount > 0 ? 'WARNING' : 'INFO',
      code: 'VALIDATION_PASSED',
      where: {
        week,
        day,
        levelGroup,
        memberLevel,
        blockId: dayId,
        role: 'INITIUM',
      },
      decision: validation,
    });

    // Calculate generation duration
    const durationMs = Date.now() - startTime;

    // Aggregate full session trace with timing
    const fullSessionTrace: SessionTrace = aggregateSessionTrace(dayId, blockTraces, durationMs);

    // Log session completion via Pino with full summary
    logger.info({
      event: 'SESSION_COMPLETE',
      dayId,
      blocksGenerated: blocks.length,
      totalExercises: blocks.reduce((sum, b) => sum + b.exercises.length, 0),
      totalTraceEvents: fullSessionTrace.summary.totalEvents,
      warnings: fullSessionTrace.summary.totalWarnings,
      errors: fullSessionTrace.summary.totalErrors,
      durationMs,
    }, `Session ${dayId} generated in ${durationMs}ms`);

    // Return session with updated trace
    return {
      ...daySession,
      trace: sessionTrace,
    };
  }

  /**
   * Save a generated session to database
   *
   * Uses transaction to ensure atomicity. Inserts session, blocks,
   * and prescriptions in order with proper FK relationships.
   *
   * If PERSIST_TRACES=true environment variable is set, also persists
   * detailed trace data to session_traces table for analytics.
   *
   * @param session - Generated DaySession to persist
   * @param options - Optional save options
   * @param options.generationDurationMs - Generation time for trace persistence
   * @returns Object containing the new sessionId
   */
  async saveSession(
    session: DaySession,
    options?: { generationDurationMs?: number }
  ): Promise<{ sessionId: number }> {
    // Insert session row
    const [sessionResult] = await this.db
      .insert(schema.sessions)
      .values({
        dayId: session.dayId,
        week: session.week,
        day: session.day,
        levelGroup: session.levelGroup,
        blockCount: session.blocks.length,
        traceJson: session.trace,
      });

    const sessionId = sessionResult.insertId;

    // Insert blocks and prescriptions
    for (let blockIdx = 0; blockIdx < session.blocks.length; blockIdx++) {
      const block = session.blocks[blockIdx];

      const [blockResult] = await this.db
        .insert(schema.sessionBlocks)
        .values({
          sessionId,
          blockId: block.blockId,
          role: block.role,
          route: block.route,
          pattern: block.pattern,
          intensity: block.intensity,
          repsBudget: block.repsBudget,
          formatId: block.format.formatId,
          formatName: block.format.name,
          exerciseCount: block.exercises.length,
          sortOrder: blockIdx,
        });

      const blockId = blockResult.insertId;

      // Insert prescriptions for this block
      if (block.exercises.length > 0) {
        const prescriptionValues = block.exercises.map((ex, exIdx) => ({
          blockId,
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          contraction: ex.contraction,
          reps: ex.reps,
          seconds: ex.seconds,
          rest: ex.rest,
          notes: ex.notes ?? null,
          sortOrder: exIdx,
        }));

        await this.db.insert(schema.sessionPrescriptions).values(prescriptionValues);
      }
    }

    // Optional: Persist trace data to session_traces table for analytics
    if (process.env.PERSIST_TRACES === 'true') {
      // Aggregate block traces for summary stats
      const blockTracesSummary: BlockTrace[] = session.blocks.map((block) =>
        aggregateBlockTrace(block.blockId, [...block.trace])
      );

      const sessionTraceData = aggregateSessionTrace(
        session.dayId,
        blockTracesSummary,
        options?.generationDurationMs ?? 0
      );

      await this.db.insert(schema.sessionTraces).values({
        sessionId,
        traceJson: sessionTraceData,
        eventCount: sessionTraceData.summary.totalEvents,
        warningCount: sessionTraceData.summary.totalWarnings,
        errorCount: sessionTraceData.summary.totalErrors,
        generationMs: sessionTraceData.summary.generationDurationMs,
      });
    }

    return { sessionId };
  }

  /**
   * Check if session exists in DB by dayId
   *
   * Used for cache checking before generation. Returns full
   * session object reconstructed from DB if found.
   *
   * @param dayId - Unique session identifier (e.g., W1-lunes-sigma)
   * @returns DaySession if found, null otherwise
   */
  async getSessionByDayId(dayId: string): Promise<DaySession | null> {
    // Query session
    const [session] = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.dayId, dayId));

    if (!session) {
      return null;
    }

    return this.reconstructSession(session);
  }

  /**
   * Get session with full details by numeric ID
   *
   * @param sessionId - Database session ID
   * @returns DaySession if found, null otherwise
   */
  async getSessionWithDetails(sessionId: number): Promise<DaySession | null> {
    // Query session
    const [session] = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    if (!session) {
      return null;
    }

    return this.reconstructSession(session);
  }

  /**
   * Reconstruct DaySession from database row
   *
   * Loads blocks and prescriptions, rebuilds the full object structure.
   * Transforms legacy ATHLOS_EPIKOS to ATHLOS or EPIKOS based on week.
   */
  private async reconstructSession(session: typeof schema.sessions.$inferSelect): Promise<DaySession> {
    // Load blocks for this session
    const blocks = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.sessionId, session.id))
      .orderBy(schema.sessionBlocks.sortOrder);

    // Load prescriptions for all blocks
    const blockPlans: BlockPlan[] = [];

    for (const block of blocks) {
      const prescriptions = await this.db
        .select()
        .from(schema.sessionPrescriptions)
        .where(eq(schema.sessionPrescriptions.blockId, block.id))
        .orderBy(schema.sessionPrescriptions.sortOrder);

      const exercises: ExercisePrescription[] = prescriptions.map((p) => ({
        exerciseId: p.exerciseId,
        name: p.exerciseName,
        contraction: p.contraction as 'CON' | 'EXC' | 'ISO',
        reps: p.reps,
        seconds: p.seconds,
        rest: p.rest,
        notes: p.notes ?? undefined,
      }));

      // Transform legacy ATHLOS_EPIKOS to correct role based on week
      let role: BlockRole = block.role as BlockRole;
      if (block.role === 'ATHLOS_EPIKOS') {
        role = getFinalBlockRole(session.week);
      }

      blockPlans.push({
        blockId: block.blockId,
        role,
        route: block.route,
        pattern: block.pattern,
        intensity: block.intensity,
        repsBudget: block.repsBudget,
        format: {
          formatId: block.formatId,
          name: block.formatName,
        },
        exercises,
        trace: [], // Trace is stored at session level, not block level
      });
    }

    // Extract memberLevel from dayId (format: W1-lunes-alfa)
    const dayIdParts = session.dayId.split('-');
    const memberLevel = dayIdParts[2] as ExerciseLevel;

    return {
      dayId: session.dayId,
      week: session.week,
      day: session.day,
      levelGroup: session.levelGroup as LevelGroup,
      memberLevel,
      blocks: blockPlans,
      trace: (session.traceJson as TraceEvent[]) ?? [],
    };
  }
}
