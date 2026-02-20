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

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { SpomService } from "../spom/service";
import {
  runBlockPipeline,
  createInitialContext,
  type BlockPipelineOptions,
} from "./pipeline";
import type {
  LevelGroup,
  BlockRole,
  DaySession,
  BlockPlan,
  TraceEvent,
  ExercisePrescription,
  ExerciseLevel,
  FormatInstance,
  FormatParams,
} from "./types";
import { getFinalBlockRole } from "./types";
import { validateSessionForTrace } from "./validators/session-validator";
import { createSessionLogger } from "./trace/logger";
import { aggregateBlockTrace, aggregateSessionTrace } from "./trace/emitter";
import type { BlockTrace, SessionTrace } from "./trace/types";
import { MOBILITY_SORT_ORDER } from "../shared/training-constants";
import { selectMobilityExercise } from "./pipeline/utils/mobility-selection";

/**
 * Get block roles in execution order for a given week
 * Final block alternates: odd weeks = ATHLOS, even weeks = EPIKOS
 */
function getBlockRoles(week: number): BlockRole[] {
  return [
    "INITIUM",
    "NUCLEUS",
    "DEUTEROS_1",
    "DEUTEROS_2",
    getFinalBlockRole(week),
  ];
}

/** Input for session generation */
export interface GenerateSessionInput {
  week: number;
  day: string;
  levelGroup: LevelGroup;
  memberLevel: ExerciseLevel;
  /** Shared formats from first-generated level to enforce consistency across levels */
  sharedFormats?: Map<string, { formatId: number; name: string }>;
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
    logger.info(
      { event: "SESSION_STARTED", week, day, levelGroup, memberLevel },
      "Starting session generation",
    );

    const sessionTrace: TraceEvent[] = [];
    const blocks: BlockPlan[] = [];
    const blockTraces: BlockTrace[] = [];

    // Check if DEUTEROS_2 should be skipped and resolve Nucleus route for contextual Initium
    const rotator = await this.spomService.getWeeklyRotator(
      week,
      day,
      levelGroup,
    );
    const skipDeuteros2 = !rotator || rotator.deuteros2RouteId === null;

    // Resolve Nucleus route for contextual Initium selection (13-04)
    let nucleusRoute: string | undefined;
    if (rotator && rotator.nucleusRouteId) {
      const route = await this.spomService.getRouteById(rotator.nucleusRouteId);
      if (route) {
        nucleusRoute = route.code;
        logger.info(
          {
            event: "NUCLEUS_ROUTE_RESOLVED",
            nucleusRoute,
            nucleusRouteId: rotator.nucleusRouteId,
          },
          `Resolved Nucleus route for contextual Initium: ${nucleusRoute}`,
        );
      }
    }

    if (!nucleusRoute) {
      logger.warn(
        {
          event: "NUCLEUS_ROUTE_MISSING",
          reason: !rotator ? "No rotator entry" : "No nucleusRouteId",
        },
        "Nucleus route not available for contextual Initium selection",
      );
    }

    // Generate each block in sequence (determinism requires sequential execution)
    // Track DEUTEROS_1 format to enforce consistency with DEUTEROS_2
    let deuteros1Format: FormatInstance | undefined;
    // Track formats used in this session to avoid repeats within the same day
    const usedFormatNames: string[] = [];

    const blockRoles = getBlockRoles(week);
    for (const role of blockRoles) {
      // Skip DEUTEROS_2 if no route assigned
      if (role === "DEUTEROS_2" && skipDeuteros2) {
        sessionTrace.push({
          ts: new Date().toISOString(),
          severity: "INFO",
          code: "BLOCK_SKIPPED",
          where: {
            week,
            day,
            levelGroup,
            memberLevel,
            blockId: `W${week}-${day}-${memberLevel}-${role}`,
            role,
          },
          decision: {
            reason: "No route assigned in rotator (deuteros2RouteId is null)",
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
        role === "INITIUM" ? nucleusRoute : undefined,
      );

      // Build pipeline options
      // DEUTEROS_2 must use same format as DEUTEROS_1 for consistency
      // sharedFormats enforces cross-level format consistency (same format for all levels on a day)
      const sharedFormat = input.sharedFormats?.get(role);
      const pipelineOptions: BlockPipelineOptions = sharedFormat
        ? { forcedFormat: sharedFormat, excludeFormatNames: usedFormatNames }
        : role === "DEUTEROS_2" && deuteros1Format
          ? {
              forcedFormat: deuteros1Format,
              excludeFormatNames: usedFormatNames,
            }
          : { excludeFormatNames: usedFormatNames };

      // Run the 7-stage pipeline
      const blockPlan = await runBlockPipeline(
        initialContext,
        this.spomService,
        this.db,
        pipelineOptions,
      );

      // Track used format for same-day deduplication
      usedFormatNames.push(blockPlan.format.name);

      // Capture DEUTEROS_1's format for DEUTEROS_2 consistency
      if (role === "DEUTEROS_1") {
        deuteros1Format = blockPlan.format;
      }

      // Select mobility exercise for non-INITIUM blocks (Phase 17)
      if (role !== "INITIUM") {
        const mobility = await selectMobilityExercise(blockPlan.route, this.db);
        if (mobility) {
          blockPlan.mobilityExercise = mobility;
        }
        logger.info(
          {
            event: "MOBILITY_SELECTED",
            blockId: blockPlan.blockId,
            role,
            route: blockPlan.route,
            mobilityExercise: mobility ? mobility.name : null,
            fallbackUsed: mobility
              ? undefined
              : "no_mobility_exercises_available",
          },
          mobility
            ? `Mobility: ${mobility.name}`
            : "No mobility exercise available",
        );
      }

      blocks.push(blockPlan);

      // Aggregate block trace for session summary
      blockTraces.push(
        aggregateBlockTrace(blockPlan.blockId, [...blockPlan.trace]),
      );

      // Collect block trace into session trace
      const blockCompleteEvent: TraceEvent = {
        ts: new Date().toISOString(),
        severity: "INFO",
        code: "BLOCK_COMPLETED",
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
      logger.info(
        {
          event: "BLOCK_COMPLETED",
          blockId: blockPlan.blockId,
          role,
          route: blockPlan.route,
          intensity: blockPlan.intensity,
          format: blockPlan.format.name,
          exerciseCount: blockPlan.exercises.length,
          traceEvents: blockPlan.trace.length,
        },
        `Block ${role} completed`,
      );
    }

    // Final session summary trace
    sessionTrace.push({
      ts: new Date().toISOString(),
      severity: "INFO",
      code: "SESSION_GENERATED",
      where: {
        week,
        day,
        levelGroup,
        memberLevel,
        blockId: dayId,
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
        severity: "ERROR",
        code: "VALIDATION_FAILED",
        where: {
          week,
          day,
          levelGroup,
          memberLevel,
          blockId: dayId,
        },
        decision: validation,
      });

      throw new Error(
        `Session validation failed: ${validation.errors.join("; ")}`,
      );
    }

    // Add validation success trace (even if warnings exist)
    sessionTrace.push({
      ts: new Date().toISOString(),
      severity: validation.warningCount > 0 ? "WARNING" : "INFO",
      code: "VALIDATION_PASSED",
      where: {
        week,
        day,
        levelGroup,
        memberLevel,
        blockId: dayId,
      },
      decision: validation,
    });

    // Calculate generation duration
    const durationMs = Date.now() - startTime;

    // Aggregate full session trace with timing
    const fullSessionTrace: SessionTrace = aggregateSessionTrace(
      dayId,
      blockTraces,
      durationMs,
    );

    // Log session completion via Pino with full summary
    logger.info(
      {
        event: "SESSION_COMPLETE",
        dayId,
        blocksGenerated: blocks.length,
        totalExercises: blocks.reduce((sum, b) => sum + b.exercises.length, 0),
        totalTraceEvents: fullSessionTrace.summary.totalEvents,
        warnings: fullSessionTrace.summary.totalWarnings,
        errors: fullSessionTrace.summary.totalErrors,
        durationMs,
      },
      `Session ${dayId} generated in ${durationMs}ms`,
    );

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
    options?: { generationDurationMs?: number },
  ): Promise<{ sessionId: number }> {
    // Build algorithm snapshot before transaction (pure computation)
    const algorithmSnapshot = {
      blocks: session.blocks.map((block, blockIdx) => {
        const snapshotExercises = block.exercises.map((ex, exIdx) => ({
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          contraction: ex.contraction,
          reps: ex.reps,
          seconds: ex.seconds,
          rest: ex.rest,
          notes: ex.notes ?? null,
          difficulty: ex.dificultadLineal ?? null,
          sortOrder: exIdx,
          exerciseType: ex.exerciseType ?? "main",
        }));

        // Include mobility exercise in snapshot for revert capability
        if (block.mobilityExercise) {
          snapshotExercises.push({
            exerciseId: block.mobilityExercise.exerciseId,
            exerciseName: block.mobilityExercise.name,
            contraction: block.mobilityExercise.contraction,
            reps: block.mobilityExercise.reps,
            seconds: block.mobilityExercise.seconds,
            rest: block.mobilityExercise.rest,
            notes: block.mobilityExercise.notes ?? null,
            difficulty: null,
            sortOrder: 999,
            exerciseType: "mobility" as const,
          });
        }

        return {
          blockId: block.blockId,
          role: block.role,
          route: block.route,
          pattern: block.pattern,
          intensity: block.intensity,
          repsBudget: block.repsBudget,
          formatId: block.format.formatId,
          formatName: block.format.name,
          formatParams: block.formatParams,
          exerciseCount: block.exercises.length,
          sortOrder: blockIdx,
          exercises: snapshotExercises,
        };
      }),
    };

    // Wrap all DB writes in a transaction to prevent partial session state
    const sessionId = await this.db.transaction(async (tx) => {
      // Insert session row
      const [sessionResult] = await tx.insert(schema.sessions).values({
        dayId: session.dayId,
        week: session.week,
        day: session.day,
        levelGroup: session.levelGroup,
        blockCount: session.blocks.length,
        traceJson: session.trace,
        ...(session.journeyType ? { journeyType: session.journeyType } : {}),
      });

      const newSessionId = sessionResult.insertId;

      // Insert blocks and prescriptions
      for (let blockIdx = 0; blockIdx < session.blocks.length; blockIdx++) {
        const block = session.blocks[blockIdx];

        const [blockResult] = await tx.insert(schema.sessionBlocks).values({
          sessionId: newSessionId,
          blockId: block.blockId,
          role: block.role,
          route: block.route,
          pattern: block.pattern,
          intensity: block.intensity,
          repsBudget: block.repsBudget,
          formatId: block.format.formatId,
          formatName: block.format.name,
          formatParams: block.formatParams,
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
            repsMax: ex.repsMax ?? null,
            seconds: ex.seconds,
            secondsMax: ex.secondsMax ?? null,
            increment: ex.increment ?? null,
            rest: ex.rest,
            notes: ex.notes ?? null,
            difficulty: ex.dificultadLineal ?? null, // Store difficulty for display to users
            sortOrder: exIdx,
            exerciseType: ex.exerciseType ?? "main",
          }));

          await tx
            .insert(schema.sessionPrescriptions)
            .values(prescriptionValues);
        }

        // Insert mobility exercise if present (Phase 17)
        const mobilityEx = block.mobilityExercise;
        if (mobilityEx) {
          await tx.insert(schema.sessionPrescriptions).values({
            blockId,
            exerciseId: mobilityEx.exerciseId,
            exerciseName: mobilityEx.name,
            contraction: mobilityEx.contraction,
            reps: mobilityEx.reps,
            repsMax: mobilityEx.repsMax ?? null,
            seconds: mobilityEx.seconds,
            secondsMax: mobilityEx.secondsMax ?? null,
            increment: mobilityEx.increment ?? null,
            rest: mobilityEx.rest,
            notes: mobilityEx.notes ?? null,
            difficulty: null, // Mobility exercises don't use difficulty
            sortOrder: MOBILITY_SORT_ORDER,
            exerciseType: "mobility",
          });
        }
      }

      // Store algorithm snapshot for revert capability (Phase 15)
      await tx
        .update(schema.sessions)
        .set({ algorithmSnapshot: algorithmSnapshot })
        .where(eq(schema.sessions.id, newSessionId));

      // Optional: Persist trace data to session_traces table for analytics
      if (process.env.PERSIST_TRACES === "true") {
        // Aggregate block traces for summary stats
        const blockTracesSummary: BlockTrace[] = session.blocks.map((block) =>
          aggregateBlockTrace(block.blockId, [...block.trace]),
        );

        const sessionTraceData = aggregateSessionTrace(
          session.dayId,
          blockTracesSummary,
          options?.generationDurationMs ?? 0,
        );

        await tx.insert(schema.sessionTraces).values({
          sessionId: newSessionId,
          traceJson: sessionTraceData,
          eventCount: sessionTraceData.summary.totalEvents,
          warningCount: sessionTraceData.summary.totalWarnings,
          errorCount: sessionTraceData.summary.totalErrors,
          generationMs: sessionTraceData.summary.generationDurationMs,
        });
      }

      return newSessionId;
    });

    return { sessionId };
  }

  /**
   * Check if session exists in DB by dayId
   *
   * Used for cache checking before generation. Returns full
   * session object reconstructed from DB if found.
   *
   * @param dayId - Unique session identifier (e.g., W1-lunes-sigma)
   * @param requireApproved - If true, only return approved sessions
   * @returns DaySession if found, null otherwise
   */
  async getSessionByDayId(
    dayId: string,
    requireApproved = false,
  ): Promise<DaySession | null> {
    // Build query conditions
    const conditions = [eq(schema.sessions.dayId, dayId)];
    if (requireApproved) {
      conditions.push(eq(schema.sessions.status, "approved"));
    }

    // Query session
    const [session] = await this.db
      .select()
      .from(schema.sessions)
      .where(and(...conditions));

    if (!session) {
      return null;
    }

    return this.reconstructSession(session);
  }

  /**
   * Get multiple sessions by dayIds in a single batch
   *
   * @param dayIds - Array of day identifiers
   * @param requireApproved - If true, only return approved sessions
   * @returns Map of dayId -> DaySession (missing entries mean no session found)
   */
  async getSessionsByDayIds(
    dayIds: string[],
    requireApproved = false,
  ): Promise<Map<string, DaySession>> {
    if (dayIds.length === 0) return new Map();

    const conditions = [inArray(schema.sessions.dayId, dayIds)];
    if (requireApproved) {
      conditions.push(eq(schema.sessions.status, "approved"));
    }

    const sessions = await this.db
      .select()
      .from(schema.sessions)
      .where(and(...conditions));

    if (sessions.length === 0) return new Map();

    // Batch fetch all blocks for all sessions
    const sessionIds = sessions.map((s) => s.id);
    const allBlocks = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(inArray(schema.sessionBlocks.sessionId, sessionIds))
      .orderBy(schema.sessionBlocks.sortOrder);

    // Batch fetch all prescriptions for all blocks
    const blockIds = allBlocks.map((b) => b.id);
    const allPrescriptions =
      blockIds.length > 0
        ? await this.db
            .select({
              id: schema.sessionPrescriptions.id,
              blockId: schema.sessionPrescriptions.blockId,
              exerciseId: schema.sessionPrescriptions.exerciseId,
              exerciseName: schema.sessionPrescriptions.exerciseName,
              contraction: schema.sessionPrescriptions.contraction,
              reps: schema.sessionPrescriptions.reps,
              repsMax: schema.sessionPrescriptions.repsMax,
              seconds: schema.sessionPrescriptions.seconds,
              secondsMax: schema.sessionPrescriptions.secondsMax,
              increment: schema.sessionPrescriptions.increment,
              rest: schema.sessionPrescriptions.rest,
              notes: schema.sessionPrescriptions.notes,
              difficulty: schema.sessionPrescriptions.difficulty,
              exerciseType: schema.sessionPrescriptions.exerciseType,
              sortOrder: schema.sessionPrescriptions.sortOrder,
              videoUrl: schema.exercises.videoUrl,
            })
            .from(schema.sessionPrescriptions)
            .leftJoin(
              schema.exercises,
              eq(schema.sessionPrescriptions.exerciseId, schema.exercises.id),
            )
            .where(inArray(schema.sessionPrescriptions.blockId, blockIds))
            .orderBy(schema.sessionPrescriptions.sortOrder)
        : [];

    // Group prescriptions by blockId
    const prescByBlock = new Map<number, typeof allPrescriptions>();
    for (const p of allPrescriptions) {
      const list = prescByBlock.get(p.blockId) ?? [];
      list.push(p);
      prescByBlock.set(p.blockId, list);
    }

    // Group blocks by sessionId
    const blocksBySession = new Map<number, typeof allBlocks>();
    for (const b of allBlocks) {
      const list = blocksBySession.get(b.sessionId) ?? [];
      list.push(b);
      blocksBySession.set(b.sessionId, list);
    }

    // Build result map
    const result = new Map<string, DaySession>();
    for (const session of sessions) {
      const blocks = blocksBySession.get(session.id) ?? [];
      const blockPlans: BlockPlan[] = blocks.map((block) => {
        const prescriptions = prescByBlock.get(block.id) ?? [];
        const exercises: ExercisePrescription[] = prescriptions.map((p) => ({
          exerciseId: p.exerciseId,
          name: p.exerciseName,
          contraction: p.contraction as "CON" | "EXC" | "ISO",
          reps: p.reps,
          repsMax: p.repsMax ?? undefined,
          seconds: p.seconds,
          secondsMax: p.secondsMax ?? undefined,
          increment: p.increment ?? undefined,
          rest: p.rest,
          notes: p.notes ?? undefined,
          dificultadLineal: p.difficulty ?? undefined,
          exerciseType: p.exerciseType as "main" | "mobility",
          videoUrl: p.videoUrl ?? undefined,
        }));

        let role: BlockRole = block.role as BlockRole;
        if (block.role === "ATHLOS_EPIKOS") {
          role = getFinalBlockRole(session.week);
        }

        const formatParams = block.formatParams
          ? (block.formatParams as unknown as FormatParams)
          : ({ type: "standard" } as const);

        return {
          blockId: block.blockId,
          role,
          route: block.route,
          pattern: block.pattern,
          intensity: block.intensity,
          repsBudget: block.repsBudget,
          format: { formatId: block.formatId, name: block.formatName },
          formatParams,
          exercises,
          trace: [],
        };
      });

      const dayIdParts = session.dayId.split("-");
      const memberLevel = dayIdParts[2] as ExerciseLevel;

      result.set(session.dayId, {
        dayId: session.dayId,
        week: session.week,
        day: session.day,
        levelGroup: session.levelGroup as LevelGroup,
        memberLevel,
        blocks: blockPlans,
        trace: (session.traceJson as TraceEvent[]) ?? [],
      });
    }

    return result;
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
  private async reconstructSession(
    session: typeof schema.sessions.$inferSelect,
  ): Promise<DaySession> {
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
        .select({
          id: schema.sessionPrescriptions.id,
          exerciseId: schema.sessionPrescriptions.exerciseId,
          exerciseName: schema.sessionPrescriptions.exerciseName,
          contraction: schema.sessionPrescriptions.contraction,
          reps: schema.sessionPrescriptions.reps,
          repsMax: schema.sessionPrescriptions.repsMax,
          seconds: schema.sessionPrescriptions.seconds,
          secondsMax: schema.sessionPrescriptions.secondsMax,
          increment: schema.sessionPrescriptions.increment,
          rest: schema.sessionPrescriptions.rest,
          notes: schema.sessionPrescriptions.notes,
          difficulty: schema.sessionPrescriptions.difficulty,
          exerciseType: schema.sessionPrescriptions.exerciseType,
          sortOrder: schema.sessionPrescriptions.sortOrder,
          videoUrl: schema.exercises.videoUrl,
        })
        .from(schema.sessionPrescriptions)
        .leftJoin(
          schema.exercises,
          eq(schema.sessionPrescriptions.exerciseId, schema.exercises.id),
        )
        .where(eq(schema.sessionPrescriptions.blockId, block.id))
        .orderBy(schema.sessionPrescriptions.sortOrder);

      const exercises: ExercisePrescription[] = prescriptions.map((p) => ({
        exerciseId: p.exerciseId,
        name: p.exerciseName,
        contraction: p.contraction as "CON" | "EXC" | "ISO",
        reps: p.reps,
        repsMax: p.repsMax ?? undefined,
        seconds: p.seconds,
        secondsMax: p.secondsMax ?? undefined,
        increment: p.increment ?? undefined,
        rest: p.rest,
        notes: p.notes ?? undefined,
        dificultadLineal: p.difficulty ?? undefined, // Load difficulty for display to users
        exerciseType: p.exerciseType as "main" | "mobility",
        videoUrl: p.videoUrl ?? undefined,
      }));

      // Transform legacy ATHLOS_EPIKOS to correct role based on week
      let role: BlockRole = block.role as BlockRole;
      if (block.role === "ATHLOS_EPIKOS") {
        role = getFinalBlockRole(session.week);
      }

      // Handle formatParams: existing sessions may have null, default to 'standard'
      const formatParams = block.formatParams
        ? (block.formatParams as unknown as FormatParams)
        : ({ type: "standard" } as const);

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
        formatParams,
        exercises,
        trace: [], // Trace is stored at session level, not block level
      });
    }

    // Extract memberLevel from dayId (format: W1-lunes-alfa)
    const dayIdParts = session.dayId.split("-");
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
