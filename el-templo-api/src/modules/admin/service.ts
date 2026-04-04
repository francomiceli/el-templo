import { MySql2Database } from "drizzle-orm/mysql2";
import {
  eq,
  and,
  desc,
  asc,
  inArray,
  count,
  gte,
  ne,
  isNull,
  isNotNull,
} from "drizzle-orm";
import * as schema from "../../db/schema";
import type { SessionStatus } from "./types";
import type { LevelGroup, ExerciseLevel } from "../sessions/types";
import { SpomService } from "../spom/service";
import {
  TRAINING_DAYS,
  DAY_OF_WEEK_MAP,
  parseDayId,
} from "../shared/training-constants";

export interface SessionFilter {
  week?: number;
  day?: string;
  levelGroup?: string;
  status?: SessionStatus;
  /** "null" = general (no goal plan), "notnull" = any goal plan, or specific goal plan type */
  goalPlanType?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  descending?: boolean;
}

export interface SessionListResult {
  sessions: AdminSessionSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminSessionSummary {
  id: number;
  dayId: string;
  week: number;
  day: string;
  levelGroup: string;
  memberLevel: string;
  routesSummary: string;
  status: SessionStatus;
  blockCount: number;
  goalPlanType: string | null;
  approvedAt: Date | null;
  approvedBy: number | null;
  approvedByName: string | null;
  approvedBySystem: boolean;
  createdAt: Date;
}

export class AdminSessionService {
  private spomService: SpomService;

  constructor(private db: MySql2Database<typeof schema>) {
    this.spomService = new SpomService(db);
  }

  async getSessions(filter: SessionFilter): Promise<SessionListResult> {
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];
    if (filter.week) conditions.push(eq(schema.sessions.week, filter.week));
    if (filter.day) conditions.push(eq(schema.sessions.day, filter.day));
    if (filter.levelGroup)
      conditions.push(eq(schema.sessions.levelGroup, filter.levelGroup));
    if (filter.status)
      conditions.push(eq(schema.sessions.status, filter.status));

    // Goal plan type filtering: "null" = general only, "notnull" = any goal plan, else specific type
    if (filter.goalPlanType === "null") {
      conditions.push(isNull(schema.sessions.goalPlanType));
    } else if (filter.goalPlanType === "notnull") {
      conditions.push(isNotNull(schema.sessions.goalPlanType));
    } else if (filter.goalPlanType) {
      conditions.push(
        eq(schema.sessions.goalPlanType, filter.goalPlanType),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await this.db
      .select({ count: count() })
      .from(schema.sessions)
      .where(whereClause);

    // Get sessions with approver name
    const sessions = await this.db
      .select({
        id: schema.sessions.id,
        dayId: schema.sessions.dayId,
        week: schema.sessions.week,
        day: schema.sessions.day,
        levelGroup: schema.sessions.levelGroup,
        status: schema.sessions.status,
        blockCount: schema.sessions.blockCount,
        goalPlanType: schema.sessions.goalPlanType,
        approvedAt: schema.sessions.approvedAt,
        approvedBy: schema.sessions.approvedBy,
        approvedBySystem: schema.sessions.approvedBySystem,
        createdAt: schema.sessions.createdAt,
        approverFirstName: schema.users.firstName,
        approverLastName: schema.users.lastName,
      })
      .from(schema.sessions)
      .leftJoin(schema.users, eq(schema.sessions.approvedBy, schema.users.id))
      .where(whereClause)
      .orderBy(
        filter.sortBy === "status"
          ? filter.descending
            ? desc(schema.sessions.status)
            : asc(schema.sessions.status)
          : filter.sortBy === "week"
            ? filter.descending
              ? desc(schema.sessions.week)
              : asc(schema.sessions.week)
            : filter.descending
              ? desc(schema.sessions.day)
              : asc(schema.sessions.day),
      )
      .limit(limit)
      .offset(offset);

    // Fetch routes for all sessions in a single query
    const sessionIds = sessions.map((s) => s.id);
    const blocks =
      sessionIds.length > 0
        ? await this.db
            .select({
              sessionId: schema.sessionBlocks.sessionId,
              role: schema.sessionBlocks.role,
              route: schema.sessionBlocks.route,
              intensity: schema.sessionBlocks.intensity,
              sortOrder: schema.sessionBlocks.sortOrder,
            })
            .from(schema.sessionBlocks)
            .where(inArray(schema.sessionBlocks.sessionId, sessionIds))
            .orderBy(asc(schema.sessionBlocks.sortOrder))
        : [];

    // Build routes summary map: sessionId -> "I, N: SU 55%, D1: PHS 60%, D2: HT 65%, A: FLR 60%"
    const routesBySession = new Map<number, string>();
    for (const sessionId of sessionIds) {
      const sessionBlocks = blocks.filter((b) => b.sessionId === sessionId);
      const routesSummary = sessionBlocks
        .map((b) => {
          if (b.role === "INITIUM") return "I";
          let label = b.role.charAt(0);
          if (b.role === "DEUTEROS_1") label = "D1";
          else if (b.role === "DEUTEROS_2") label = "D2";
          return `${label}: ${b.route} ${b.intensity}%`;
        })
        .join(", ");
      routesBySession.set(sessionId, routesSummary);
    }

    return {
      sessions: sessions.map((s) => {
        const memberLevel = parseDayId(s.dayId).level;
        return {
          id: s.id,
          dayId: s.dayId,
          week: s.week,
          day: s.day,
          levelGroup: s.levelGroup,
          memberLevel,
          routesSummary: routesBySession.get(s.id) || "",
          status: s.status as SessionStatus,
          blockCount: s.blockCount,
          goalPlanType: s.goalPlanType ?? null,
          approvedAt: s.approvedAt,
          approvedBy: s.approvedBy,
          approvedByName:
            s.approverFirstName && s.approverLastName
              ? `${s.approverFirstName} ${s.approverLastName}`
              : null,
          approvedBySystem: s.approvedBySystem ?? false,
          createdAt: s.createdAt!,
        };
      }),
      total: countResult?.count ?? 0,
      page,
      limit,
    };
  }

  async getSessionWithDetails(id: number) {
    // Get session
    const [session] = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, id));

    if (!session) return null;

    // Get blocks
    const blocks = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.sessionId, id))
      .orderBy(asc(schema.sessionBlocks.sortOrder));

    if (blocks.length === 0) {
      const memberLevel = parseDayId(session.dayId).level;
      return { ...session, memberLevel, blocks: [] };
    }

    // Batch fetch all prescriptions for all blocks (eliminates N+1)
    const blockIds = blocks.map((b) => b.id);
    const allPrescriptions = await this.db
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
        sortOrder: schema.sessionPrescriptions.sortOrder,
        exerciseRoute: schema.exercises.route,
        exerciseType: schema.sessionPrescriptions.exerciseType,
        weighted: schema.sessionPrescriptions.weighted,
      })
      .from(schema.sessionPrescriptions)
      .leftJoin(
        schema.exercises,
        eq(schema.sessionPrescriptions.exerciseId, schema.exercises.id),
      )
      .where(inArray(schema.sessionPrescriptions.blockId, blockIds))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    // Group prescriptions by blockId
    const prescriptionsByBlock = new Map<number, typeof allPrescriptions>();
    for (const p of allPrescriptions) {
      const list = prescriptionsByBlock.get(p.blockId) ?? [];
      list.push(p);
      prescriptionsByBlock.set(p.blockId, list);
    }

    const blocksWithExercises = blocks.map((block) => {
      const prescriptions = prescriptionsByBlock.get(block.id) ?? [];
      const mainPrescriptions = prescriptions.filter(
        (p) => p.exerciseType !== "mobility",
      );
      const mobilityPrescription = prescriptions.find(
        (p) => p.exerciseType === "mobility",
      );

      return {
        ...block,
        exercises: mainPrescriptions.map((p) => ({
          ...p,
          dificultadLineal: p.difficulty,
          route: p.exerciseRoute || null,
          exerciseType: p.exerciseType,
        })),
        mobilityExercise: mobilityPrescription
          ? {
              id: mobilityPrescription.id,
              exerciseId: mobilityPrescription.exerciseId,
              exerciseName: mobilityPrescription.exerciseName,
              contraction: mobilityPrescription.contraction,
              reps: mobilityPrescription.reps,
              seconds: mobilityPrescription.seconds,
              rest: mobilityPrescription.rest,
              notes: mobilityPrescription.notes,
              exerciseType: mobilityPrescription.exerciseType,
              weighted: mobilityPrescription.weighted,
            }
          : null,
      };
    });

    const memberLevel = parseDayId(session.dayId).level;
    return { ...session, memberLevel, blocks: blocksWithExercises };
  }

  /**
   * Batch fetch all session details for a given week+day (eliminates N+1).
   * Returns fully hydrated sessions sorted by memberLevel.
   */
  async getDaySessionDetails(
    week: number,
    day: string,
    goalPlanType?: string,
  ) {
    // 1. Get all sessions for this week+day, optionally filtered by goalPlanType
    const conditions = [
      eq(schema.sessions.week, week),
      eq(schema.sessions.day, day),
    ];

    if (goalPlanType) {
      conditions.push(eq(schema.sessions.goalPlanType, goalPlanType));
    } else {
      conditions.push(isNull(schema.sessions.goalPlanType));
    }

    const sessions = await this.db
      .select()
      .from(schema.sessions)
      .where(and(...conditions));

    if (sessions.length === 0) return [];

    // 2. Batch fetch all blocks for all sessions
    const sessionIds = sessions.map((s) => s.id);
    const allBlocks = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(inArray(schema.sessionBlocks.sessionId, sessionIds))
      .orderBy(asc(schema.sessionBlocks.sortOrder));

    // 3. Batch fetch all prescriptions for all blocks
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
              sortOrder: schema.sessionPrescriptions.sortOrder,
              exerciseRoute: schema.exercises.route,
              exerciseType: schema.sessionPrescriptions.exerciseType,
              weighted: schema.sessionPrescriptions.weighted,
            })
            .from(schema.sessionPrescriptions)
            .leftJoin(
              schema.exercises,
              eq(schema.sessionPrescriptions.exerciseId, schema.exercises.id),
            )
            .where(inArray(schema.sessionPrescriptions.blockId, blockIds))
            .orderBy(asc(schema.sessionPrescriptions.sortOrder))
        : [];

    // 4. Group prescriptions by blockId
    const prescriptionsByBlock = new Map<number, typeof allPrescriptions>();
    for (const p of allPrescriptions) {
      const list = prescriptionsByBlock.get(p.blockId) ?? [];
      list.push(p);
      prescriptionsByBlock.set(p.blockId, list);
    }

    // 5. Group blocks by sessionId
    const blocksBySession = new Map<number, typeof allBlocks>();
    for (const b of allBlocks) {
      const list = blocksBySession.get(b.sessionId) ?? [];
      list.push(b);
      blocksBySession.set(b.sessionId, list);
    }

    // 6. Assemble full session details
    return sessions.map((session) => {
      const blocks = blocksBySession.get(session.id) ?? [];
      const blocksWithExercises = blocks.map((block) => {
        const prescriptions = prescriptionsByBlock.get(block.id) ?? [];
        const mainPrescriptions = prescriptions.filter(
          (p) => p.exerciseType !== "mobility",
        );
        const mobilityPrescription = prescriptions.find(
          (p) => p.exerciseType === "mobility",
        );

        return {
          ...block,
          exercises: mainPrescriptions.map((p) => ({
            ...p,
            dificultadLineal: p.difficulty,
            route: p.exerciseRoute || null,
            exerciseType: p.exerciseType,
          })),
          mobilityExercise: mobilityPrescription
            ? {
                id: mobilityPrescription.id,
                exerciseId: mobilityPrescription.exerciseId,
                exerciseName: mobilityPrescription.exerciseName,
                contraction: mobilityPrescription.contraction,
                reps: mobilityPrescription.reps,
                seconds: mobilityPrescription.seconds,
                rest: mobilityPrescription.rest,
                notes: mobilityPrescription.notes,
                exerciseType: mobilityPrescription.exerciseType,
                weighted: mobilityPrescription.weighted,
              }
            : null,
        };
      });

      const memberLevel = parseDayId(session.dayId).level;
      return { ...session, memberLevel, blocks: blocksWithExercises };
    });
  }

  async approveSession(id: number, userId: number): Promise<boolean> {
    const [result] = await this.db
      .update(schema.sessions)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
        approvedBySystem: false,
      })
      .where(eq(schema.sessions.id, id));

    return result.affectedRows > 0;
  }

  async revertSession(id: number): Promise<boolean> {
    const [result] = await this.db
      .update(schema.sessions)
      .set({
        status: "pending_review",
        approvedAt: null,
        approvedBy: null,
        approvedBySystem: false,
      })
      .where(eq(schema.sessions.id, id));

    return result.affectedRows > 0;
  }

  async bulkApprove(ids: number[], userId: number): Promise<number> {
    const [result] = await this.db
      .update(schema.sessions)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
        approvedBySystem: false,
      })
      .where(inArray(schema.sessions.id, ids));

    return result.affectedRows;
  }

  async getPendingCount(): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.sessions)
      .where(eq(schema.sessions.status, "pending_review"));

    return result?.count ?? 0;
  }

  async getWeekSummary(week: number): Promise<{
    week: number;
    days: {
      day: string;
      levels: {
        levelGroup: string;
        hasSession: boolean;
        status: SessionStatus | null;
      }[];
    }[];
  }> {
    const sessions = await this.db
      .select({
        day: schema.sessions.day,
        levelGroup: schema.sessions.levelGroup,
        status: schema.sessions.status,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.week, week));

    const days = [...TRAINING_DAYS];
    const levels: LevelGroup[] = ["alfa_delta", "sigma", "omega"];

    return {
      week,
      days: days.map((day) => ({
        day,
        levels: levels.map((levelGroup) => {
          const groupSessions = sessions.filter(
            (s) => s.day === day && s.levelGroup === levelGroup,
          );
          // Show worst status: pending > approved
          const worstStatus =
            groupSessions.length === 0
              ? null
              : groupSessions.some((s) => s.status === "pending_review")
                ? "pending_review"
                : groupSessions.every((s) => s.status === "approved")
                  ? "approved"
                  : (groupSessions[0].status as SessionStatus);
          return {
            levelGroup,
            hasSession: groupSessions.length > 0,
            status: worstStatus,
          };
        }),
      })),
    };
  }

  /**
   * Get weeks coverage info for alert display
   * Returns current week, which weeks have approved sessions, and how many weeks ahead
   */
  async getApprovedWeeksCoverage(): Promise<{
    currentWeek: number;
    weeksWithApproved: number[];
    weeksAhead: number;
  }> {
    // Get current SPOM week
    const currentWeek = await this.spomService.getCurrentWeek();

    // Get weeks that have at least one approved session (current week or later)
    const approvedWeeks = await this.db
      .selectDistinct({ week: schema.sessions.week })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.status, "approved"),
          gte(schema.sessions.week, currentWeek),
        ),
      );

    const weeksWithApproved = approvedWeeks
      .map((r) => r.week)
      .sort((a, b) => a - b);
    const weeksAhead =
      weeksWithApproved.length > 0
        ? Math.max(...weeksWithApproved) - currentWeek
        : 0;

    return {
      currentWeek,
      weeksWithApproved,
      weeksAhead,
    };
  }

  /**
   * Auto-approve pending sessions for tomorrow
   * Called by cron job at 23:59 daily to ensure sessions are available
   */
  async autoApprovePendingSessions(): Promise<{ approved: number }> {
    // Get current SPOM week
    const currentWeek = await this.spomService.getCurrentWeek();

    // Calculate tomorrow's day in Argentina timezone (UTC-3)
    // Using Intl to avoid server timezone mismatch (server may run in UTC)
    const argTZ = "America/Argentina/Buenos_Aires";
    const now = new Date();

    // Get today's date string in Argentina timezone, then add 1 day
    const argDateStr = now.toLocaleDateString("en-CA", { timeZone: argTZ }); // YYYY-MM-DD
    const argToday = new Date(argDateStr + "T12:00:00"); // noon to avoid DST edge cases
    argToday.setDate(argToday.getDate() + 1);
    const dayOfWeek = argToday.getDay(); // 0=Sun, 1=Mon, ...
    const tomorrowDay = DAY_OF_WEEK_MAP[dayOfWeek];

    // If Sunday (no key in dayMap), skip - no sessions on Sunday
    if (!tomorrowDay) {
      return { approved: 0 };
    }

    // Find all pending sessions for tomorrow
    const pendingSessions = await this.db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.status, "pending_review"),
          eq(schema.sessions.week, currentWeek),
          eq(schema.sessions.day, tomorrowDay),
        ),
      );

    if (pendingSessions.length === 0) {
      return { approved: 0 };
    }

    // Auto-approve them with approvedBySystem=true flag
    const sessionIds = pendingSessions.map((s) => s.id);
    await this.db
      .update(schema.sessions)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: null, // null indicates auto-approved (no user)
        approvedBySystem: true, // Flag to distinguish from manual approval
      })
      .where(inArray(schema.sessions.id, sessionIds));

    return { approved: pendingSessions.length };
  }

  async generateWeek(
    week: number,
    options: {
      days?: string[];
      levelGroups?: string[];
      regenerate?: boolean;
    },
  ): Promise<{
    generated: number;
    skipped: number;
    failed: number;
    warnings: string[];
  }> {
    const days = options.days || [...TRAINING_DAYS];
    const levelGroups = options.levelGroups || ["alfa_delta", "sigma", "omega"];

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const warnings: string[] = [];

    // Import SessionGeneratorService dynamically to avoid circular deps
    const { SessionGeneratorService } = await import("../sessions/service.js");
    const sessionService = new SessionGeneratorService(this.db);

    for (const day of days) {
      // Shared formats for cross-level consistency per day
      // Captured from the first generated level, then forced on subsequent levels
      let sharedFormats:
        | Map<string, { formatId: number; name: string }>
        | undefined;

      for (const levelGroup of levelGroups) {
        // Map levelGroup to memberLevels
        const memberLevels: ExerciseLevel[] =
          levelGroup === "alfa_delta"
            ? ["alfa", "delta"]
            : levelGroup === "sigma"
              ? ["sigma"]
              : ["omega", "spartan"];

        for (const memberLevel of memberLevels) {
          const dayId = `W${week}-${day}-${memberLevel}`;

          // Check if session exists
          const existing = await sessionService.getSessionByDayId(dayId);

          if (existing && !options.regenerate) {
            skipped++;
            continue;
          }

          if (existing && options.regenerate) {
            // Delete existing session (cascade handles blocks/prescriptions)
            await this.db
              .delete(schema.sessions)
              .where(eq(schema.sessions.dayId, dayId));
          }

          try {
            // Generate new session (pass sharedFormats for cross-level consistency)
            const session = await sessionService.generateDailySession({
              week,
              day,
              levelGroup: levelGroup as LevelGroup,
              memberLevel,
              sharedFormats,
            });

            // Capture formats from the first generated session of the day
            // INITIUM excluded (uses separate pipeline, always Interval Training)
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

            await sessionService.saveSession(session);
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
   * Get pool of blocks from approved sessions matching route + memberLevel
   */
  async getBlockPool(
    route: string,
    memberLevel: string,
    excludeSessionId?: number,
    excludeBlockId?: number,
  ) {
    // Build conditions
    const conditions = [
      eq(schema.sessions.status, "approved"),
      eq(schema.sessionBlocks.route, route),
    ];

    if (excludeSessionId) {
      conditions.push(ne(schema.sessions.id, excludeSessionId));
    }

    // Get blocks from approved sessions matching route
    const blocks = await this.db
      .select({
        id: schema.sessionBlocks.id,
        sessionId: schema.sessionBlocks.sessionId,
        blockId: schema.sessionBlocks.blockId,
        role: schema.sessionBlocks.role,
        route: schema.sessionBlocks.route,
        pattern: schema.sessionBlocks.pattern,
        intensity: schema.sessionBlocks.intensity,
        repsBudget: schema.sessionBlocks.repsBudget,
        formatId: schema.sessionBlocks.formatId,
        formatName: schema.sessionBlocks.formatName,
        exerciseCount: schema.sessionBlocks.exerciseCount,
        sortOrder: schema.sessionBlocks.sortOrder,
        sessionWeek: schema.sessions.week,
        sessionDay: schema.sessions.day,
        sessionDayId: schema.sessions.dayId,
      })
      .from(schema.sessionBlocks)
      .innerJoin(
        schema.sessions,
        eq(schema.sessionBlocks.sessionId, schema.sessions.id),
      )
      .where(and(...conditions))
      .orderBy(desc(schema.sessions.week), asc(schema.sessions.day));

    // Filter by memberLevel (extracted from dayId)
    const filteredBlocks = blocks.filter((b) => {
      const blockMemberLevel = b.sessionDayId.split("-").pop() || "";
      return blockMemberLevel === memberLevel;
    });

    // Batch fetch all prescriptions for filtered blocks (eliminates N+1)
    const filteredBlockIds = filteredBlocks.map((b) => b.id);
    const allExercises =
      filteredBlockIds.length > 0
        ? await this.db
            .select({
              id: schema.sessionPrescriptions.id,
              blockId: schema.sessionPrescriptions.blockId,
              exerciseId: schema.sessionPrescriptions.exerciseId,
              exerciseName: schema.sessionPrescriptions.exerciseName,
              contraction: schema.sessionPrescriptions.contraction,
              reps: schema.sessionPrescriptions.reps,
              seconds: schema.sessionPrescriptions.seconds,
              rest: schema.sessionPrescriptions.rest,
              notes: schema.sessionPrescriptions.notes,
              difficulty: schema.sessionPrescriptions.difficulty,
              sortOrder: schema.sessionPrescriptions.sortOrder,
            })
            .from(schema.sessionPrescriptions)
            .where(
              inArray(schema.sessionPrescriptions.blockId, filteredBlockIds),
            )
            .orderBy(asc(schema.sessionPrescriptions.sortOrder))
        : [];

    // Group exercises by blockId
    const exercisesByBlock = new Map<number, typeof allExercises>();
    for (const e of allExercises) {
      const list = exercisesByBlock.get(e.blockId) ?? [];
      list.push(e);
      exercisesByBlock.set(e.blockId, list);
    }

    const result = filteredBlocks.map((block) => {
      const exercises = exercisesByBlock.get(block.id) ?? [];
      return {
        id: block.id,
        blockId: block.blockId,
        role: block.role,
        route: block.route,
        pattern: block.pattern,
        intensity: block.intensity,
        repsBudget: block.repsBudget,
        formatId: block.formatId,
        formatName: block.formatName,
        exerciseCount: block.exerciseCount,
        sourceWeek: block.sessionWeek,
        sourceDay: block.sessionDay,
        sourceRole: block.role,
        exercises: exercises.map((e) => ({
          ...e,
          dificultadLineal: e.difficulty,
        })),
      };
    });

    // Deduplicate blocks by exercise fingerprint (sorted exercise names)
    // Keep the most recent one (first in list since ordered by week DESC)
    // Pre-seed with current block's fingerprint so identical blocks are excluded
    const seen = new Map<string, (typeof result)[number]>();
    if (excludeBlockId) {
      const currentExercises = await this.db
        .select({ exerciseName: schema.sessionPrescriptions.exerciseName })
        .from(schema.sessionPrescriptions)
        .where(eq(schema.sessionPrescriptions.blockId, excludeBlockId));
      if (currentExercises.length > 0) {
        const currentFingerprint = currentExercises
          .map((e) => e.exerciseName)
          .sort()
          .join("|");
        seen.set(currentFingerprint, {} as (typeof result)[number]);
      }
    }
    for (const block of result) {
      const fingerprint = block.exercises
        .map((e) => e.exerciseName)
        .sort()
        .join("|");
      if (!seen.has(fingerprint)) {
        seen.set(fingerprint, block);
      }
    }

    return {
      blocks: Array.from(seen.values()).filter((b) => b.id !== undefined),
    };
  }

  /**
   * Swap a block in a session with a block from the pool (approved session)
   */
  async swapBlock(
    sessionId: number,
    targetBlockId: number,
    sourceBlockId: number,
  ): Promise<boolean> {
    // Validate target block belongs to the given session
    const [targetBlock] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(
        and(
          eq(schema.sessionBlocks.id, targetBlockId),
          eq(schema.sessionBlocks.sessionId, sessionId),
        ),
      );

    if (!targetBlock) return false;

    // Validate source block belongs to an approved session
    const [sourceBlock] = await this.db
      .select({
        id: schema.sessionBlocks.id,
        route: schema.sessionBlocks.route,
        pattern: schema.sessionBlocks.pattern,
        intensity: schema.sessionBlocks.intensity,
        repsBudget: schema.sessionBlocks.repsBudget,
        formatId: schema.sessionBlocks.formatId,
        formatName: schema.sessionBlocks.formatName,
        exerciseCount: schema.sessionBlocks.exerciseCount,
        sessionStatus: schema.sessions.status,
      })
      .from(schema.sessionBlocks)
      .innerJoin(
        schema.sessions,
        eq(schema.sessionBlocks.sessionId, schema.sessions.id),
      )
      .where(
        and(
          eq(schema.sessionBlocks.id, sourceBlockId),
          eq(schema.sessions.status, "approved"),
        ),
      );

    if (!sourceBlock) return false;

    // Get source prescriptions
    const sourcePrescriptions = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, sourceBlockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    // Wrap UPDATE + DELETE + INSERT in a transaction to prevent corrupt state
    await this.db.transaction(async (tx) => {
      // Update target block with source block data (preserve sessionId, role, sortOrder)
      await tx
        .update(schema.sessionBlocks)
        .set({
          route: sourceBlock.route,
          pattern: sourceBlock.pattern,
          intensity: sourceBlock.intensity,
          repsBudget: sourceBlock.repsBudget,
          formatId: sourceBlock.formatId,
          formatName: sourceBlock.formatName,
          exerciseCount: sourceBlock.exerciseCount,
        })
        .where(eq(schema.sessionBlocks.id, targetBlockId));

      // Delete old prescriptions for target block
      await tx
        .delete(schema.sessionPrescriptions)
        .where(eq(schema.sessionPrescriptions.blockId, targetBlockId));

      // Insert new prescriptions copied from source
      if (sourcePrescriptions.length > 0) {
        await tx.insert(schema.sessionPrescriptions).values(
          sourcePrescriptions.map((p) => ({
            blockId: targetBlockId,
            exerciseId: p.exerciseId,
            exerciseName: p.exerciseName,
            contraction: p.contraction,
            reps: p.reps,
            seconds: p.seconds,
            rest: p.rest,
            notes: p.notes,
            difficulty: p.difficulty,
            sortOrder: p.sortOrder,
          })),
        );
      }
    });

    return true;
  }
}
