import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, desc, asc, inArray, count } from 'drizzle-orm';
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
