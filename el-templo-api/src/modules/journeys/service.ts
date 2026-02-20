/**
 * Journey Service
 *
 * Manages member journey lifecycle (select, archive, switch, advance)
 * and generates journey sessions using the journey pipeline.
 *
 * Follows the established service pattern (see AdminSessionService).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, desc } from "drizzle-orm";
import * as schema from "../../db/schema";
import { SpomService } from "../spom/service";
import { SessionGeneratorService } from "../sessions/service";
import { runJourneyBlockPipeline } from "../sessions/pipeline/journey-pipeline";
import { createInitialContext } from "../sessions/pipeline/context";
import type {
  LevelGroup,
  BlockRole,
  BlockPlan,
  TraceEvent,
  ExerciseLevel,
  FormatInstance,
  DaySession,
} from "../sessions/types";
import { getFinalBlockRole } from "../sessions/types";
import { validateSessionForTrace } from "../sessions/validators/session-validator";
import { createSessionLogger } from "../sessions/trace/logger";
import {
  aggregateBlockTrace,
  aggregateSessionTrace,
} from "../sessions/trace/emitter";
import type { BlockTrace } from "../sessions/trace/types";
import { selectMobilityExercise } from "../sessions/pipeline/utils/mobility-selection";
import {
  TRAINING_DAYS,
  MOBILITY_SORT_ORDER,
} from "../shared/training-constants";
import type {
  JourneyType,
  JourneyDuration,
  JourneyProgress,
  ArchivedJourney,
} from "./types";
import { JOURNEY_ROUTE_MAP } from "./constants";
import type { BlockPipelineOptions } from "../sessions/pipeline/index";

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

/**
 * Map levelGroup to its constituent member levels
 */
function levelGroupToMemberLevels(levelGroup: LevelGroup): ExerciseLevel[] {
  switch (levelGroup) {
    case "alfa_delta":
      return ["alfa", "delta"];
    case "sigma":
      return ["sigma"];
    case "omega":
      return ["omega", "spartan"];
  }
}

/**
 * Map a semana column name from a JourneyDuration
 */
function semanaColumn(
  duration: JourneyDuration,
): "semana20" | "semana40" | "semana60" {
  switch (duration) {
    case 20:
      return "semana20";
    case 40:
      return "semana40";
    case 60:
      return "semana60";
  }
}

export class JourneyService {
  private spomService: SpomService;
  private sessionService: SessionGeneratorService;

  constructor(private db: MySql2Database<typeof schema>) {
    this.spomService = new SpomService(db);
    this.sessionService = new SessionGeneratorService(db);
  }

  // ─── Journey Lifecycle Methods ────────────────────────────────────────

  /**
   * Get the active journey for a user, or null if no journey is active.
   */
  async getActiveJourney(userId: number): Promise<JourneyProgress | null> {
    const [journey] = await this.db
      .select()
      .from(schema.memberJourneys)
      .where(
        and(
          eq(schema.memberJourneys.userId, userId),
          eq(schema.memberJourneys.isActive, true),
        ),
      );

    if (!journey) return null;

    return {
      journeyType: journey.journeyType as JourneyType,
      semana20: journey.semana20,
      semana40: journey.semana40,
      semana60: journey.semana60,
      isActive: journey.isActive,
      startedAt: journey.startedAt.toISOString(),
    };
  }

  /**
   * Get all archived journeys for a user.
   */
  async getArchivedJourneys(userId: number): Promise<ArchivedJourney[]> {
    const journeys = await this.db
      .select()
      .from(schema.memberJourneys)
      .where(
        and(
          eq(schema.memberJourneys.userId, userId),
          eq(schema.memberJourneys.isActive, false),
        ),
      )
      .orderBy(desc(schema.memberJourneys.archivedAt));

    return journeys.map((j) => ({
      journeyType: j.journeyType as JourneyType,
      semana20: j.semana20,
      semana40: j.semana40,
      semana60: j.semana60,
      startedAt: j.startedAt.toISOString(),
      archivedAt: j.archivedAt?.toISOString() ?? new Date().toISOString(),
    }));
  }

  /**
   * Select a new journey for a user.
   * If the user has an existing active journey, archive it first.
   */
  async selectJourney(
    userId: number,
    journeyType: JourneyType,
  ): Promise<JourneyProgress> {
    // Archive any existing active journey
    const existingActive = await this.getActiveJourney(userId);
    if (existingActive) {
      await this.db
        .update(schema.memberJourneys)
        .set({
          isActive: false,
          archivedAt: new Date(),
        })
        .where(
          and(
            eq(schema.memberJourneys.userId, userId),
            eq(schema.memberJourneys.isActive, true),
          ),
        );
    }

    // Create new active journey
    await this.db.insert(schema.memberJourneys).values({
      userId,
      journeyType,
      isActive: true,
      semana20: 1,
      semana40: 1,
      semana60: 1,
    });

    return {
      journeyType,
      semana20: 1,
      semana40: 1,
      semana60: 1,
      isActive: true,
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Advance the semana counter for a specific duration of the user's active journey.
   */
  async advanceSemana(
    userId: number,
    duration: JourneyDuration,
  ): Promise<void> {
    const column = semanaColumn(duration);

    const [journey] = await this.db
      .select()
      .from(schema.memberJourneys)
      .where(
        and(
          eq(schema.memberJourneys.userId, userId),
          eq(schema.memberJourneys.isActive, true),
        ),
      );

    if (!journey) {
      throw new Error("No active journey found for user");
    }

    const newValue = journey[column] + 1;

    await this.db
      .update(schema.memberJourneys)
      .set({ [column]: newValue })
      .where(eq(schema.memberJourneys.id, journey.id));
  }

  // ─── Session Generation Methods ───────────────────────────────────────

  /**
   * Generate journey sessions for all level groups across specified days.
   *
   * Uses runJourneyBlockPipeline instead of runBlockPipeline.
   * DayId format: J-{journeyType}-W{week}-{day}-{memberLevel}
   *
   * @param week - SPOM week number
   * @param journeyType - The journey type to generate sessions for
   * @param options - Optional days filter and regenerate flag
   */
  async generateJourneySessions(
    week: number,
    journeyType: JourneyType,
    options?: { days?: string[]; regenerate?: boolean },
  ): Promise<{ generated: number; skipped: number }> {
    const days = options?.days ?? [...TRAINING_DAYS];
    const levelGroups: LevelGroup[] = ["alfa_delta", "sigma", "omega"];

    let generated = 0;
    let skipped = 0;

    for (const day of days) {
      // Shared formats for cross-level consistency per day
      let sharedFormats:
        | Map<string, { formatId: number; name: string }>
        | undefined;

      for (const levelGroup of levelGroups) {
        const memberLevels = levelGroupToMemberLevels(levelGroup);

        for (const memberLevel of memberLevels) {
          const dayId = `J-${journeyType}-W${week}-${day}-${memberLevel}`;

          // Check if session exists
          const existing = await this.sessionService.getSessionByDayId(dayId);

          if (existing && !options?.regenerate) {
            skipped++;
            continue;
          }

          if (existing && options?.regenerate) {
            // Delete existing session (cascade handles blocks/prescriptions)
            await this.db
              .delete(schema.sessions)
              .where(eq(schema.sessions.dayId, dayId));
          }

          // Generate journey session
          const session = await this.generateJourneyDailySession({
            week,
            day,
            levelGroup,
            memberLevel,
            journeyType,
            sharedFormats,
          });

          // Capture formats from first generated session for cross-level consistency
          if (!sharedFormats) {
            sharedFormats = new Map();
            for (const block of session.blocks) {
              if (block.role !== "INITIUM") {
                sharedFormats.set(block.role, {
                  formatId: block.format.formatId,
                  name: block.format.name,
                });
              }
            }
          }

          await this.sessionService.saveSession(session);
          generated++;
        }
      }
    }

    return { generated, skipped };
  }

  /**
   * Generate a complete daily journey session.
   *
   * Similar to SessionGeneratorService.generateDailySession but uses
   * runJourneyBlockPipeline and sets journeyType on the session.
   */
  private async generateJourneyDailySession(input: {
    week: number;
    day: string;
    levelGroup: LevelGroup;
    memberLevel: ExerciseLevel;
    journeyType: JourneyType;
    sharedFormats?: Map<string, { formatId: number; name: string }>;
  }): Promise<DaySession> {
    const { week, day, levelGroup, memberLevel, journeyType } = input;
    const startTime = Date.now();
    const dayId = `J-${journeyType}-W${week}-${day}-${memberLevel}`;

    const logger = createSessionLogger(week, dayId, levelGroup);
    logger.info(
      {
        event: "JOURNEY_SESSION_STARTED",
        week,
        day,
        levelGroup,
        memberLevel,
        journeyType,
      },
      "Starting journey session generation",
    );

    const sessionTrace: TraceEvent[] = [];
    const blocks: BlockPlan[] = [];
    const blockTraces: BlockTrace[] = [];

    // Journey sessions don't use the weekly rotator, so DEUTEROS_2 behavior:
    // For journey sessions, all blocks get routes from the journey route map.
    // DEUTEROS_2 is always generated (routes come from journey map, not rotator null check).
    const skipDeuteros2 = false;

    // Track DEUTEROS_1 format for consistency
    let deuteros1Format: FormatInstance | undefined;
    const usedFormatNames: string[] = [];

    const blockRoles = getBlockRoles(week);
    for (const role of blockRoles) {
      if (role === "DEUTEROS_2" && skipDeuteros2) {
        continue;
      }

      // Create initial context with journey-specific blockId
      const initialContext = createInitialContext(
        week,
        day,
        levelGroup,
        memberLevel,
        role,
      );

      // Build pipeline options
      const sharedFormat = input.sharedFormats?.get(role);
      const pipelineOptions: BlockPipelineOptions = sharedFormat
        ? { forcedFormat: sharedFormat, excludeFormatNames: usedFormatNames }
        : role === "DEUTEROS_2" && deuteros1Format
          ? {
              forcedFormat: deuteros1Format,
              excludeFormatNames: usedFormatNames,
            }
          : { excludeFormatNames: usedFormatNames };

      // Run journey pipeline (uses journey route resolution instead of rotator)
      const blockPlan = await runJourneyBlockPipeline(
        initialContext,
        this.spomService,
        this.db,
        journeyType,
        pipelineOptions,
      );

      // Track used format
      usedFormatNames.push(blockPlan.format.name);

      if (role === "DEUTEROS_1") {
        deuteros1Format = blockPlan.format;
      }

      // Select mobility exercise for non-INITIUM blocks
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
          },
          mobility
            ? `Mobility: ${mobility.name}`
            : "No mobility exercise available",
        );
      }

      blocks.push(blockPlan);

      blockTraces.push(
        aggregateBlockTrace(blockPlan.blockId, [...blockPlan.trace]),
      );

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
          journeyType,
        },
      };
      sessionTrace.push(blockCompleteEvent);

      logger.info(
        {
          event: "BLOCK_COMPLETED",
          blockId: blockPlan.blockId,
          role,
          route: blockPlan.route,
          intensity: blockPlan.intensity,
          format: blockPlan.format.name,
          exerciseCount: blockPlan.exercises.length,
          journeyType,
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
        journeyType,
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
      journeyType,
    };

    // Validate the generated session
    const validation = validateSessionForTrace(daySession);

    if (!validation.valid) {
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
        `Journey session validation failed: ${validation.errors.join("; ")}`,
      );
    }

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

    const durationMs = Date.now() - startTime;

    const fullSessionTrace = aggregateSessionTrace(
      dayId,
      blockTraces,
      durationMs,
    );

    logger.info(
      {
        event: "JOURNEY_SESSION_COMPLETE",
        dayId,
        blocksGenerated: blocks.length,
        totalExercises: blocks.reduce((sum, b) => sum + b.exercises.length, 0),
        totalTraceEvents: fullSessionTrace.summary.totalEvents,
        warnings: fullSessionTrace.summary.totalWarnings,
        errors: fullSessionTrace.summary.totalErrors,
        durationMs,
        journeyType,
      },
      `Journey session ${dayId} generated in ${durationMs}ms`,
    );

    return {
      ...daySession,
      trace: sessionTrace,
    };
  }

  /**
   * Retrieve a journey session for the member's level,
   * filtering blocks by duration.
   *
   * If no session exists for the current week, falls back to the most
   * recent available week (per CONTEXT.md: "silently fall back to most
   * recent available session").
   */
  async getJourneySession(
    userId: number,
    week: number,
    day: string,
    duration: JourneyDuration,
  ): Promise<DaySession | null> {
    // Get user's active journey and level
    const journey = await this.getActiveJourney(userId);
    if (!journey) return null;

    // Get user's level
    const [user] = await this.db
      .select({ level: schema.users.level })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!user) return null;

    const memberLevel = user.level as ExerciseLevel;
    const journeyType = journey.journeyType;

    // Try current week first
    const dayId = `J-${journeyType}-W${week}-${day}-${memberLevel}`;
    let session = await this.sessionService.getSessionByDayId(
      dayId,
      true, // requireApproved
    );

    if (!session) {
      // Fallback: find the most recent available week for this journey+day+level
      const fallbackSession = await this.db
        .select({ dayId: schema.sessions.dayId })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.journeyType, journeyType),
            eq(schema.sessions.day, day),
            eq(schema.sessions.status, "approved"),
          ),
        )
        .orderBy(desc(schema.sessions.week))
        .limit(10); // Get a few candidates

      // Find one matching this member level
      for (const candidate of fallbackSession) {
        if (candidate.dayId.endsWith(`-${memberLevel}`)) {
          session = await this.sessionService.getSessionByDayId(
            candidate.dayId,
            true,
          );
          if (session) break;
        }
      }
    }

    if (!session) return null;

    // Filter blocks by duration
    const filteredBlocks = filterBlocksByDuration(session.blocks, duration);

    return {
      ...session,
      blocks: filteredBlocks,
    };
  }
}

/**
 * Filter session blocks based on selected duration.
 *
 * Per CONTEXT.md:
 *   20 min: Initium + Nucleus
 *   40 min: Initium + Nucleus + Deuteros (single, DEUTEROS_1 only)
 *   60 min: All blocks (Initium + Nucleus + Deuteros + Athlos/Epikos)
 */
function filterBlocksByDuration(
  blocks: readonly import("../sessions/types").BlockPlan[],
  duration: JourneyDuration,
): import("../sessions/types").BlockPlan[] {
  switch (duration) {
    case 20:
      return blocks.filter((b) => b.role === "INITIUM" || b.role === "NUCLEUS");
    case 40:
      return blocks.filter(
        (b) =>
          b.role === "INITIUM" ||
          b.role === "NUCLEUS" ||
          b.role === "DEUTEROS_1",
      );
    case 60:
      return [...blocks];
  }
}
