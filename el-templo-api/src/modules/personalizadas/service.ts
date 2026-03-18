/**
 * Personalizadas Service
 *
 * Manages member personalizada lifecycle (select, archive, switch, advance)
 * and generates personalizada sessions using the personalizada pipeline.
 *
 * Follows the established service pattern (see AdminSessionService).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, desc } from "drizzle-orm";
import * as schema from "../../db/schema";
import { SpomService } from "../spom/service";
import { SessionGeneratorService } from "../sessions/service";
import { runPersonalizadaBlockPipeline } from "../sessions/pipeline/personalizada-pipeline";
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
  PersonalizadaType,
  PersonalizadaDuration,
  PersonalizadaProgress,
  ArchivedPersonalizada,
} from "./types";
import { PERSONALIZADA_ROUTE_MAP } from "./constants";
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
 * Map a semana column name from a PersonalizadaDuration
 */
function semanaColumn(
  duration: PersonalizadaDuration,
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

export class PersonalizadasService {
  private spomService: SpomService;
  private sessionService: SessionGeneratorService;

  constructor(private db: MySql2Database<typeof schema>) {
    this.spomService = new SpomService(db);
    this.sessionService = new SessionGeneratorService(db);
  }

  // ─── Personalizada Lifecycle Methods ────────────────────────────────────────

  /**
   * Get the active personalizada for a user, or null if none is active.
   */
  async getActivePersonalizada(
    userId: number,
  ): Promise<PersonalizadaProgress | null> {
    const [personalizada] = await this.db
      .select()
      .from(schema.memberPersonalizadas)
      .where(
        and(
          eq(schema.memberPersonalizadas.userId, userId),
          eq(schema.memberPersonalizadas.isActive, true),
        ),
      );

    if (!personalizada) return null;

    return {
      personalizadaType: personalizada.personalizadaType as PersonalizadaType,
      semana20: personalizada.semana20,
      semana40: personalizada.semana40,
      semana60: personalizada.semana60,
      isActive: personalizada.isActive,
      startedAt: personalizada.startedAt.toISOString(),
    };
  }

  /**
   * Get all archived personalizadas for a user.
   */
  async getArchivedPersonalizadas(
    userId: number,
  ): Promise<ArchivedPersonalizada[]> {
    const personalizadas = await this.db
      .select()
      .from(schema.memberPersonalizadas)
      .where(
        and(
          eq(schema.memberPersonalizadas.userId, userId),
          eq(schema.memberPersonalizadas.isActive, false),
        ),
      )
      .orderBy(desc(schema.memberPersonalizadas.archivedAt));

    return personalizadas.map((p) => ({
      personalizadaType: p.personalizadaType as PersonalizadaType,
      semana20: p.semana20,
      semana40: p.semana40,
      semana60: p.semana60,
      startedAt: p.startedAt.toISOString(),
      archivedAt: p.archivedAt?.toISOString() ?? new Date().toISOString(),
    }));
  }

  /**
   * Select a new personalizada for a user.
   * If the user has an existing active personalizada, archive it first.
   */
  async selectPersonalizada(
    userId: number,
    personalizadaType: PersonalizadaType,
  ): Promise<PersonalizadaProgress> {
    // Archive any existing active personalizada
    const existingActive = await this.getActivePersonalizada(userId);
    if (existingActive) {
      await this.db
        .update(schema.memberPersonalizadas)
        .set({
          isActive: false,
          archivedAt: new Date(),
        })
        .where(
          and(
            eq(schema.memberPersonalizadas.userId, userId),
            eq(schema.memberPersonalizadas.isActive, true),
          ),
        );
    }

    // Create new active personalizada
    await this.db.insert(schema.memberPersonalizadas).values({
      userId,
      personalizadaType,
      isActive: true,
      semana20: 1,
      semana40: 1,
      semana60: 1,
    });

    return {
      personalizadaType,
      semana20: 1,
      semana40: 1,
      semana60: 1,
      isActive: true,
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Advance the semana counter for a specific duration of the user's active personalizada.
   */
  async advanceSemana(
    userId: number,
    duration: PersonalizadaDuration,
  ): Promise<void> {
    const column = semanaColumn(duration);

    const [personalizada] = await this.db
      .select()
      .from(schema.memberPersonalizadas)
      .where(
        and(
          eq(schema.memberPersonalizadas.userId, userId),
          eq(schema.memberPersonalizadas.isActive, true),
        ),
      );

    if (!personalizada) {
      throw new Error("No active personalizada found for user");
    }

    const newValue = personalizada[column] + 1;

    await this.db
      .update(schema.memberPersonalizadas)
      .set({ [column]: newValue })
      .where(eq(schema.memberPersonalizadas.id, personalizada.id));
  }

  // ─── Session Generation Methods ───────────────────────────────────────

  /**
   * Generate personalizada sessions for all level groups across specified days.
   *
   * Uses runPersonalizadaBlockPipeline instead of runBlockPipeline.
   * DayId format: P-{personalizadaType}-W{week}-{day}-{memberLevel}
   *
   * @param week - SPOM week number
   * @param personalizadaType - The personalizada type to generate sessions for
   * @param options - Optional days filter and regenerate flag
   */
  async generatePersonalizadaSessions(
    week: number,
    personalizadaType: PersonalizadaType,
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
          const dayId = `P-${personalizadaType}-W${week}-${day}-${memberLevel}`;

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

          // Generate personalizada session
          const session = await this.generatePersonalizadaDailySession({
            week,
            day,
            levelGroup,
            memberLevel,
            personalizadaType,
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
   * Generate a complete daily personalizada session.
   *
   * Similar to SessionGeneratorService.generateDailySession but uses
   * runPersonalizadaBlockPipeline and sets personalizadaType on the session.
   */
  private async generatePersonalizadaDailySession(input: {
    week: number;
    day: string;
    levelGroup: LevelGroup;
    memberLevel: ExerciseLevel;
    personalizadaType: PersonalizadaType;
    sharedFormats?: Map<string, { formatId: number; name: string }>;
  }): Promise<DaySession> {
    const { week, day, levelGroup, memberLevel, personalizadaType } = input;
    const startTime = Date.now();
    const dayId = `P-${personalizadaType}-W${week}-${day}-${memberLevel}`;

    const logger = createSessionLogger(week, dayId, levelGroup);
    logger.info(
      {
        event: "PERSONALIZADA_SESSION_STARTED",
        week,
        day,
        levelGroup,
        memberLevel,
        personalizadaType,
      },
      "Starting personalizada session generation",
    );

    const sessionTrace: TraceEvent[] = [];
    const blocks: BlockPlan[] = [];
    const blockTraces: BlockTrace[] = [];

    // Personalizada sessions don't use the weekly rotator, so DEUTEROS_2 behavior:
    // For personalizada sessions, all blocks get routes from the personalizada route map.
    // DEUTEROS_2 is always generated (routes come from personalizada map, not rotator null check).
    const skipDeuteros2 = false;

    // Track DEUTEROS_1 format for consistency
    let deuteros1Format: FormatInstance | undefined;
    const usedFormatNames: string[] = [];

    const blockRoles = getBlockRoles(week);
    for (const role of blockRoles) {
      if (role === "DEUTEROS_2" && skipDeuteros2) {
        continue;
      }

      // Create initial context with personalizada-specific blockId
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

      // Run personalizada pipeline (uses personalizada route resolution instead of rotator)
      const blockPlan = await runPersonalizadaBlockPipeline(
        initialContext,
        this.spomService,
        this.db,
        personalizadaType,
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
          personalizadaType,
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
          personalizadaType,
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
        personalizadaType,
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
      personalizadaType,
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
        `Personalizada session validation failed: ${validation.errors.join("; ")}`,
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
        event: "PERSONALIZADA_SESSION_COMPLETE",
        dayId,
        blocksGenerated: blocks.length,
        totalExercises: blocks.reduce((sum, b) => sum + b.exercises.length, 0),
        totalTraceEvents: fullSessionTrace.summary.totalEvents,
        warnings: fullSessionTrace.summary.totalWarnings,
        errors: fullSessionTrace.summary.totalErrors,
        durationMs,
        personalizadaType,
      },
      `Personalizada session ${dayId} generated in ${durationMs}ms`,
    );

    return {
      ...daySession,
      trace: sessionTrace,
    };
  }

  /**
   * Retrieve a personalizada session for the member's level,
   * filtering blocks by duration.
   *
   * If no session exists for the current week, falls back to the most
   * recent available week (per CONTEXT.md: "silently fall back to most
   * recent available session").
   */
  async getPersonalizadaSession(
    userId: number,
    week: number,
    day: string,
    duration: PersonalizadaDuration,
  ): Promise<DaySession | null> {
    // Get user's active personalizada and level
    const personalizada = await this.getActivePersonalizada(userId);
    if (!personalizada) return null;

    // Get user's level
    const [user] = await this.db
      .select({ level: schema.users.level })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!user) return null;

    const memberLevel = user.level as ExerciseLevel;
    const personalizadaType = personalizada.personalizadaType;

    // Try current week first
    const dayId = `P-${personalizadaType}-W${week}-${day}-${memberLevel}`;
    let session = await this.sessionService.getSessionByDayId(
      dayId,
      true, // requireApproved
    );

    if (!session) {
      // Fallback: find the most recent available week for this personalizada+day+level
      const fallbackSession = await this.db
        .select({ dayId: schema.sessions.dayId })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.personalizadaType, personalizadaType),
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
  duration: PersonalizadaDuration,
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
