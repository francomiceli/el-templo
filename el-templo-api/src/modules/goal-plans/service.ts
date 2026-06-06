/**
 * Goal Plan Service
 *
 * Manages member goal plan lifecycle (select, archive, switch)
 * and generates goal plan sessions using the goal plan pipeline.
 *
 * Follows the established service pattern (see AdminSessionService).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, or, desc, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { SpomService } from "../spom/service";
import { SessionGeneratorService } from "../sessions/service";
import { runGoalPlanBlockPipeline } from "../sessions/pipeline/goal-plan-pipeline";
import { createInitialContext } from "../sessions/pipeline/context";
import { isKairos } from "../sessions/pipeline/utils/kairos";
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
  GoalPlanType,
  GoalPlanProgress,
  ArchivedGoalPlan,
  CycleStats,
} from "./types";
import { GOAL_PLAN_ROUTE_MAP } from "./constants";
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
      // kairos se materializa en alfa_delta (igual que en el generador regular,
      // admin/service.ts) para que exista una sesión GP-...-kairos. Va LAST: alfa
      // genera primero y define sharedFormats; el formato no-lineal forzado sobre
      // kairos lo revierte a lineal el gate WR-02 dentro de runBlockPipeline.
      return ["alfa", "delta", "kairos"];
    case "sigma":
      return ["sigma"];
    case "omega":
      return ["omega", "spartan"];
  }
}

export class SubscriptionRequiredError extends Error {
  constructor() {
    super("Consulta en recepcion sobre los planes Por Objetivos.");
    this.name = "SubscriptionRequiredError";
  }
}

export class GoalPlanService {
  private spomService: SpomService;
  private sessionService: SessionGeneratorService;

  constructor(private db: MySql2Database<typeof schema>) {
    this.spomService = new SpomService(db);
    this.sessionService = new SessionGeneratorService(db);
  }

  // ─── Subscription Enforcement ──────────────────────────────────────────────

  /**
   * Check that the member has an active subscription that grants program
   * access. presencial gets Foundation; online_regular ships with one or
   * many enrollments (single program or bundle); online_goal and
   * online_coach also expose programs. The authoritative goal-plan check
   * runs downstream via getActiveGoalPlan — which returns null (then 400
   * upstream) if the resolved enrollment lacks a goalPlanType.
   * Throws SubscriptionRequiredError if not.
   */
  async checkSubscription(userId: number): Promise<void> {
    const [sub] = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          or(
            eq(schema.subscriptions.status, "active"),
            eq(schema.subscriptions.status, "paused"),
          ),
          or(
            eq(schema.subscriptionPlans.planCategory, "presencial"),
            eq(schema.subscriptionPlans.planCategory, "online_regular"),
            eq(schema.subscriptionPlans.planCategory, "online_goal"),
            eq(schema.subscriptionPlans.planCategory, "online_coach"),
          ),
        ),
      )
      .limit(1);

    if (!sub) {
      throw new SubscriptionRequiredError();
    }
  }

  // ─── Goal Plan Lifecycle Methods ────────────────────────────────────────
  // Uses program_enrollments + programs tables instead of the old member_goal_plans.
  // A "goal plan" is a program enrollment where the linked program has a goalPlanType.

  /**
   * Resolve the user's active goal-plan-bearing enrollment.
   *
   * Bundle members hold N active enrollments at once. The home dropdown
   * persists the chosen one in users.currentProgramEnrollmentId; we honor
   * that pointer here so /goal-plans/active and /goal-plans/session return
   * data for the program the member is actually viewing.
   *
   * Falls back to the first active enrollment with a goalPlanType for
   * single-program members and stale pointers.
   */
  private async resolveActiveGoalPlanEnrollment(userId: number): Promise<{
    goalPlanType: GoalPlanType;
    durationWeeks: number | null;
    enrolledAt: Date;
  } | null> {
    const baseSelect = () =>
      this.db
        .select({
          goalPlanType: schema.programs.goalPlanType,
          durationWeeks: schema.programs.durationWeeks,
          enrolledAt: schema.programEnrollments.enrolledAt,
        })
        .from(schema.programEnrollments)
        .innerJoin(
          schema.programs,
          eq(schema.programs.id, schema.programEnrollments.programId),
        );

    const [user] = await this.db
      .select({
        currentProgramEnrollmentId: schema.users.currentProgramEnrollmentId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (user?.currentProgramEnrollmentId != null) {
      const [pointed] = await baseSelect()
        .where(
          and(
            eq(schema.programEnrollments.id, user.currentProgramEnrollmentId),
            eq(schema.programEnrollments.userId, userId),
            eq(schema.programEnrollments.status, "active"),
            sql`${schema.programs.goalPlanType} IS NOT NULL`,
          ),
        )
        .limit(1);
      if (pointed?.goalPlanType) {
        return {
          goalPlanType: pointed.goalPlanType as GoalPlanType,
          durationWeeks: pointed.durationWeeks,
          enrolledAt: pointed.enrolledAt,
        };
      }
    }

    const [first] = await baseSelect()
      .where(
        and(
          eq(schema.programEnrollments.userId, userId),
          eq(schema.programEnrollments.status, "active"),
          sql`${schema.programs.goalPlanType} IS NOT NULL`,
        ),
      )
      .limit(1);

    if (!first?.goalPlanType) return null;
    return {
      goalPlanType: first.goalPlanType as GoalPlanType,
      durationWeeks: first.durationWeeks,
      enrolledAt: first.enrolledAt,
    };
  }

  /**
   * Get the active goal plan for a user, or null if none is active.
   * Resolves via users.currentProgramEnrollmentId (bundle pointer) with
   * fallback to the first active enrollment.
   */
  async getActiveGoalPlan(userId: number): Promise<GoalPlanProgress | null> {
    const enrollment = await this.resolveActiveGoalPlanEnrollment(userId);
    if (!enrollment) return null;
    return {
      goalPlanType: enrollment.goalPlanType,
      isActive: true,
      startedAt: enrollment.enrolledAt.toISOString(),
    };
  }

  /**
   * Get all archived (non-active) goal plan enrollments for a user.
   */
  async getArchivedGoalPlans(userId: number): Promise<ArchivedGoalPlan[]> {
    const enrollments = await this.db
      .select({
        goalPlanType: schema.programs.goalPlanType,
        enrolledAt: schema.programEnrollments.enrolledAt,
        completedAt: schema.programEnrollments.completedAt,
        expiredAt: schema.programEnrollments.expiredAt,
        cancelledAt: schema.programEnrollments.cancelledAt,
      })
      .from(schema.programEnrollments)
      .innerJoin(
        schema.programs,
        eq(schema.programs.id, schema.programEnrollments.programId),
      )
      .where(
        and(
          eq(schema.programEnrollments.userId, userId),
          sql`${schema.programEnrollments.status} != 'active'`,
          sql`${schema.programs.goalPlanType} IS NOT NULL`,
        ),
      )
      .orderBy(desc(schema.programEnrollments.completedAt));

    return enrollments
      .filter((e) => e.goalPlanType !== null)
      .map((e) => ({
        goalPlanType: e.goalPlanType as GoalPlanType,
        startedAt: e.enrolledAt.toISOString(),
        archivedAt:
          (e.completedAt ?? e.expiredAt ?? e.cancelledAt)?.toISOString() ??
          new Date().toISOString(),
      }));
  }

  /**
   * Get cycle stats for the member's active goal plan subscription.
   * Returns null if no active goal plan or no goal plan subscription.
   */
  async getCycleStats(userId: number): Promise<CycleStats | null> {
    // Step 1: resolve the active enrollment via the bundle pointer with
    // fallback to first active (see resolveActiveGoalPlanEnrollment).
    const enrollment = await this.resolveActiveGoalPlanEnrollment(userId);
    if (!enrollment) return null;

    // Indefinite programs don't have cycle stats
    if (!enrollment.durationWeeks) return null;

    const cycleWeeks = enrollment.durationWeeks;
    const durationDays = cycleWeeks * 7;

    // Step 2: Calculate cycle end date and current week
    const startedAt = enrollment.enrolledAt;
    const cycleEndDate = new Date(
      startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000,
    );
    const now = new Date();

    const msElapsed = now.getTime() - startedAt.getTime();
    const daysElapsed = Math.floor(msElapsed / (24 * 60 * 60 * 1000));
    const currentWeek = Math.min(Math.floor(daysElapsed / 7) + 1, cycleWeeks);
    const cycleComplete = now >= cycleEndDate;

    // Step 4: Count completions within the cycle window
    const startDateStr = startedAt.toISOString().slice(0, 10);
    const endDateStr = cycleEndDate.toISOString().slice(0, 10);

    const completions = await this.db
      .select({
        id: schema.completedSessions.id,
      })
      .from(schema.completedSessions)
      .where(
        and(
          eq(schema.completedSessions.userId, userId),
          eq(schema.completedSessions.goalPlanType, enrollment.goalPlanType),
          sql`${schema.completedSessions.date} >= ${startDateStr}`,
          sql`${schema.completedSessions.date} <= ${endDateStr}`,
        ),
      );

    return {
      cycleWeeks,
      currentWeek: Math.max(currentWeek, 1),
      cycleEndDate: cycleEndDate.toISOString(),
      totalCompletions: completions.length,
      cycleComplete,
    };
  }

  // ─── Session Generation Methods ───────────────────────────────────────

  /**
   * Generate goal plan sessions for all level groups across specified days.
   *
   * Uses runGoalPlanBlockPipeline instead of runBlockPipeline.
   * DayId format: GP-{goalPlanType}-W{week}-{day}-{memberLevel}
   *
   * @param week - SPOM week number
   * @param goalPlanType - The goal plan type to generate sessions for
   * @param options - Optional days filter and regenerate flag
   */
  async generateGoalPlanSessions(
    week: number,
    goalPlanType: GoalPlanType,
    options?: { days?: string[]; regenerate?: boolean },
  ): Promise<{
    generated: number;
    skipped: number;
    failed: number;
    warnings: string[];
  }> {
    const days = options?.days ?? [...TRAINING_DAYS];
    const levelGroups: LevelGroup[] = ["alfa_delta", "sigma", "omega"];

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const warnings: string[] = [];

    for (const day of days) {
      // Shared formats for cross-level consistency per day
      let sharedFormats:
        | Map<string, { formatId: number; name: string }>
        | undefined;

      for (const levelGroup of levelGroups) {
        const memberLevels = levelGroupToMemberLevels(levelGroup);

        for (const memberLevel of memberLevels) {
          const dayId = `GP-${goalPlanType}-W${week}-${day}-${memberLevel}`;

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

          try {
            // Generate goal plan session
            const session = await this.generateGoalPlanDailySession({
              week,
              day,
              levelGroup,
              memberLevel,
              goalPlanType,
              sharedFormats,
            });

            // Detect blocks where category or any-route fallback was used (Tier 5+)
            for (const block of session.blocks) {
              const decision = (t: { code: string; decision?: unknown }) =>
                t.decision as Record<string, unknown> | undefined;
              const categoryFallback = block.trace.some(
                (t) =>
                  t.code === "EXERCISE_FALLBACK" &&
                  decision(t)?.action === "CATEGORY_MATCHED",
              );
              const routeDropped = block.trace.some(
                (t) =>
                  t.code === "EXERCISE_FALLBACK" &&
                  decision(t)?.action === "ROUTE_DROPPED",
              );
              if (routeDropped) {
                warnings.push(
                  `${dayId} bloque ${block.role}: ruta "${block.route}" no tiene ejercicios, se usaron ejercicios de otras rutas`,
                );
              } else if (categoryFallback) {
                warnings.push(
                  `${dayId} bloque ${block.role}: ruta "${block.route}" no tiene ejercicios, se usaron ejercicios de la misma categoria`,
                );
              }
            }

            // Capture formats from first generated session for cross-level
            // consistency. NEVER from a kairos session (it forces the linear format,
            // which must not leak onto alfa/delta/sigma/omega); alfa/delta still define it.
            if (!sharedFormats && !isKairos(memberLevel)) {
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
          } catch (err: unknown) {
            failed++;
            const errorMsg = err instanceof Error ? err.message : String(err);
            warnings.push(`${dayId}: ${errorMsg}`);
          }
        }
      }
    }

    return { generated, skipped, failed, warnings };
  }

  /**
   * Generate a complete daily goal plan session.
   *
   * Similar to SessionGeneratorService.generateDailySession but uses
   * runGoalPlanBlockPipeline and sets goalPlanType on the session.
   */
  private async generateGoalPlanDailySession(input: {
    week: number;
    day: string;
    levelGroup: LevelGroup;
    memberLevel: ExerciseLevel;
    goalPlanType: GoalPlanType;
    sharedFormats?: Map<string, { formatId: number; name: string }>;
  }): Promise<DaySession> {
    const { week, day, levelGroup, memberLevel, goalPlanType } = input;
    const startTime = Date.now();
    const dayId = `GP-${goalPlanType}-W${week}-${day}-${memberLevel}`;

    const logger = createSessionLogger(week, dayId, levelGroup);
    logger.info(
      {
        event: "GOAL_PLAN_SESSION_STARTED",
        week,
        day,
        levelGroup,
        memberLevel,
        goalPlanType,
      },
      "Starting goal plan session generation",
    );

    const sessionTrace: TraceEvent[] = [];
    const blocks: BlockPlan[] = [];
    const blockTraces: BlockTrace[] = [];

    // Goal plan sessions don't use the weekly rotator, so DEUTEROS_2 behavior:
    // For goal plan sessions, all blocks get routes from the goal plan route map.
    // DEUTEROS_2 is always generated (routes come from goal plan map, not rotator null check).
    const skipDeuteros2 = false;

    // Track DEUTEROS_1 format for consistency
    let deuteros1Format: FormatInstance | undefined;
    const usedFormatNames: string[] = [];

    const blockRoles = getBlockRoles(week);
    for (const role of blockRoles) {
      if (role === "DEUTEROS_2" && skipDeuteros2) {
        continue;
      }

      // Create initial context with goal-plan-specific blockId
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

      // Run goal plan pipeline (uses goal plan route resolution instead of rotator)
      const blockPlan = await runGoalPlanBlockPipeline(
        initialContext,
        this.spomService,
        this.db,
        goalPlanType,
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
          goalPlanType,
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
          goalPlanType,
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
        goalPlanType,
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
      goalPlanType,
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
        `Goal plan session validation failed: ${validation.errors.join("; ")}`,
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
        event: "GOAL_PLAN_SESSION_COMPLETE",
        dayId,
        blocksGenerated: blocks.length,
        totalExercises: blocks.reduce((sum, b) => sum + b.exercises.length, 0),
        totalTraceEvents: fullSessionTrace.summary.totalEvents,
        warnings: fullSessionTrace.summary.totalWarnings,
        errors: fullSessionTrace.summary.totalErrors,
        durationMs,
        goalPlanType,
      },
      `Goal plan session ${dayId} generated in ${durationMs}ms`,
    );

    return {
      ...daySession,
      trace: sessionTrace,
    };
  }

  /**
   * Retrieve a goal plan session for the member's level.
   * Always returns the full session (all blocks).
   *
   * If no session exists for the current week, falls back to the most
   * recent available week.
   */
  async getGoalPlanSession(
    userId: number,
    week: number,
    day: string,
    levelOverride?: ExerciseLevel,
  ): Promise<DaySession | null> {
    // Get user's active goal plan and level
    const goalPlan = await this.getActiveGoalPlan(userId);
    if (!goalPlan) return null;

    // Get user's level
    const [user] = await this.db
      .select({ level: schema.users.level })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!user) return null;

    // Honor optional override — member can train at any level via the header
    // dropdown, without changing users.level (coach-only).
    const memberLevel = (levelOverride ?? user.level) as ExerciseLevel;
    const goalPlanType = goalPlan.goalPlanType;

    // Try current week first
    const dayId = `GP-${goalPlanType}-W${week}-${day}-${memberLevel}`;
    let session = await this.sessionService.getSessionByDayId(
      dayId,
      true, // requireApproved
    );

    if (!session) {
      // Fallback: find the most recent available week for this goal plan+day+level
      const fallbackSession = await this.db
        .select({ dayId: schema.sessions.dayId })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.goalPlanType, goalPlanType),
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

    return session ?? null;
  }
}
