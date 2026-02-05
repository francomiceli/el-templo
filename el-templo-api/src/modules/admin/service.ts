import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, desc, asc, inArray, count, gte } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { SessionStatus } from './types';
import type { LevelGroup, ExerciseLevel } from '../sessions/types';

export interface SessionFilter {
  week?: number;
  day?: string;
  levelGroup?: string;
  status?: SessionStatus;
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
  status: SessionStatus;
  blockCount: number;
  approvedAt: Date | null;
  approvedBy: number | null;
  approvedByName: string | null;
  approvedBySystem: boolean;
  discardedAt: Date | null;
  discardedReason: string | null;
  createdAt: Date;
}

export class AdminSessionService {
  constructor(private db: MySql2Database<typeof schema>) {}

  async getSessions(filter: SessionFilter): Promise<SessionListResult> {
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];
    if (filter.week) conditions.push(eq(schema.sessions.week, filter.week));
    if (filter.day) conditions.push(eq(schema.sessions.day, filter.day));
    if (filter.levelGroup) conditions.push(eq(schema.sessions.levelGroup, filter.levelGroup));
    if (filter.status) conditions.push(eq(schema.sessions.status, filter.status));

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
        approvedAt: schema.sessions.approvedAt,
        approvedBy: schema.sessions.approvedBy,
        approvedBySystem: schema.sessions.approvedBySystem,
        discardedAt: schema.sessions.discardedAt,
        discardedReason: schema.sessions.discardedReason,
        createdAt: schema.sessions.createdAt,
        approverFirstName: schema.users.firstName,
        approverLastName: schema.users.lastName,
      })
      .from(schema.sessions)
      .leftJoin(schema.users, eq(schema.sessions.approvedBy, schema.users.id))
      .where(whereClause)
      .orderBy(
        filter.sortBy === 'status'
          ? (filter.descending ? desc(schema.sessions.status) : asc(schema.sessions.status))
          : filter.sortBy === 'week'
          ? (filter.descending ? desc(schema.sessions.week) : asc(schema.sessions.week))
          : (filter.descending ? desc(schema.sessions.day) : asc(schema.sessions.day))
      )
      .limit(limit)
      .offset(offset);

    return {
      sessions: sessions.map(s => ({
        id: s.id,
        dayId: s.dayId,
        week: s.week,
        day: s.day,
        levelGroup: s.levelGroup,
        status: s.status as SessionStatus,
        blockCount: s.blockCount,
        approvedAt: s.approvedAt,
        approvedBy: s.approvedBy,
        approvedByName: s.approverFirstName && s.approverLastName
          ? `${s.approverFirstName} ${s.approverLastName}`
          : null,
        approvedBySystem: s.approvedBySystem ?? false,
        discardedAt: s.discardedAt,
        discardedReason: s.discardedReason,
        createdAt: s.createdAt!,
      })),
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

    // Get prescriptions for each block
    const blocksWithExercises = await Promise.all(
      blocks.map(async (block) => {
        const prescriptions = await this.db
          .select({
            id: schema.sessionPrescriptions.id,
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
          .where(eq(schema.sessionPrescriptions.blockId, block.id))
          .orderBy(asc(schema.sessionPrescriptions.sortOrder));

        return { ...block, exercises: prescriptions };
      })
    );

    return { ...session, blocks: blocksWithExercises };
  }

  async approveSession(id: number, userId: number): Promise<boolean> {
    const [result] = await this.db
      .update(schema.sessions)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: userId,
        approvedBySystem: false,
      })
      .where(eq(schema.sessions.id, id));

    return result.affectedRows > 0;
  }

  async discardSession(id: number, userId: number, reason?: string): Promise<boolean> {
    const [result] = await this.db
      .update(schema.sessions)
      .set({
        status: 'discarded',
        discardedAt: new Date(),
        discardedBy: userId,
        discardedReason: reason || null,
      })
      .where(eq(schema.sessions.id, id));

    return result.affectedRows > 0;
  }

  async revertSession(id: number): Promise<boolean> {
    const [result] = await this.db
      .update(schema.sessions)
      .set({
        status: 'pending_review',
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
        status: 'approved',
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
      .where(eq(schema.sessions.status, 'pending_review'));

    return result?.count ?? 0;
  }

  async restoreFromDiscarded(id: number): Promise<boolean> {
    const [result] = await this.db
      .update(schema.sessions)
      .set({
        status: 'pending_review',
        discardedAt: null,
        discardedBy: null,
        discardedReason: null,
      })
      .where(and(
        eq(schema.sessions.id, id),
        eq(schema.sessions.status, 'discarded')
      ));

    return result.affectedRows > 0;
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

    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const levels: LevelGroup[] = ['alfa_delta', 'sigma', 'omega'];

    return {
      week,
      days: days.map(day => ({
        day,
        levels: levels.map(levelGroup => {
          const session = sessions.find(s => s.day === day && s.levelGroup === levelGroup);
          return {
            levelGroup,
            hasSession: !!session,
            status: (session?.status as SessionStatus) || null,
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
    const [configRow] = await this.db.select().from(schema.spomConfig);
    const currentWeek = configRow?.currentWeek || 1;

    // Get weeks that have at least one approved session (current week or later)
    const approvedWeeks = await this.db
      .selectDistinct({ week: schema.sessions.week })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.status, 'approved'),
          gte(schema.sessions.week, currentWeek)
        )
      );

    const weeksWithApproved = approvedWeeks.map(r => r.week).sort((a, b) => a - b);
    const weeksAhead = weeksWithApproved.length > 0
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
    const [configRow] = await this.db.select().from(schema.spomConfig);
    const currentWeek = configRow?.currentWeek || 1;

    // Calculate tomorrow's day based on branch timezone (Argentina)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayOfWeek = tomorrow.getDay(); // 0=Sun, 1=Mon, ...
    const dayMap: Record<number, string> = {
      1: 'lunes',
      2: 'martes',
      3: 'miercoles',
      4: 'jueves',
      5: 'viernes',
      6: 'sabado',
    };

    const tomorrowDay = dayMap[dayOfWeek];

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
          eq(schema.sessions.status, 'pending_review'),
          eq(schema.sessions.week, currentWeek),
          eq(schema.sessions.day, tomorrowDay)
        )
      );

    if (pendingSessions.length === 0) {
      return { approved: 0 };
    }

    // Auto-approve them with approvedBySystem=true flag
    const sessionIds = pendingSessions.map(s => s.id);
    await this.db
      .update(schema.sessions)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: null, // null indicates auto-approved (no user)
        approvedBySystem: true, // Flag to distinguish from manual approval
      })
      .where(inArray(schema.sessions.id, sessionIds));

    return { approved: pendingSessions.length };
  }

  async generateWeek(week: number, options: {
    days?: string[];
    levelGroups?: string[];
    regenerate?: boolean;
  }): Promise<{ generated: number; skipped: number }> {
    const days = options.days || ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const levelGroups = options.levelGroups || ['alfa_delta', 'sigma', 'omega'];

    let generated = 0;
    let skipped = 0;

    // Import SessionGeneratorService dynamically to avoid circular deps
    const { SessionGeneratorService } = await import('../sessions/service.js');
    const sessionService = new SessionGeneratorService(this.db);

    for (const day of days) {
      for (const levelGroup of levelGroups) {
        // Map levelGroup to memberLevels
        const memberLevels: ExerciseLevel[] = levelGroup === 'alfa_delta'
          ? ['alfa', 'delta']
          : levelGroup === 'sigma'
          ? ['sigma']
          : ['omega', 'spartan'];

        for (const memberLevel of memberLevels) {
          const dayId = `W${week}-${day}-${memberLevel}`;

          // Check if session exists
          const existing = await sessionService.getSessionByDayId(dayId);

          if (existing && !options.regenerate) {
            skipped++;
            continue;
          }

          if (existing && options.regenerate) {
            // Discard existing session
            await this.db
              .update(schema.sessions)
              .set({
                status: 'discarded',
                discardedAt: new Date(),
                discardedReason: 'Regenerated',
              })
              .where(eq(schema.sessions.dayId, dayId));
          }

          // Generate new session
          const session = await sessionService.generateDailySession({
            week,
            day,
            levelGroup: levelGroup as LevelGroup,
            memberLevel,
          });

          await sessionService.saveSession(session);
          generated++;
        }
      }
    }

    return { generated, skipped };
  }
}
