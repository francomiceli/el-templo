import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, desc, asc, inArray, count, gte, ne } from 'drizzle-orm';
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
  memberLevel: string;
  routesSummary: string;
  status: SessionStatus;
  blockCount: number;
  approvedAt: Date | null;
  approvedBy: number | null;
  approvedByName: string | null;
  approvedBySystem: boolean;
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

    // Fetch routes for all sessions in a single query
    const sessionIds = sessions.map(s => s.id);
    const blocks = sessionIds.length > 0
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
      const sessionBlocks = blocks.filter(b => b.sessionId === sessionId);
      const routesSummary = sessionBlocks
        .map(b => {
          if (b.role === 'INITIUM') return 'I';
          let label = b.role.charAt(0);
          if (b.role === 'DEUTEROS_1') label = 'D1';
          else if (b.role === 'DEUTEROS_2') label = 'D2';
          return `${label}: ${b.route} ${b.intensity}%`;
        })
        .join(', ');
      routesBySession.set(sessionId, routesSummary);
    }

    return {
      sessions: sessions.map(s => {
        // Extract memberLevel from dayId (format: "W1-lunes-alfa" -> "alfa")
        const memberLevel = s.dayId.split('-').pop() || '';
        return {
          id: s.id,
          dayId: s.dayId,
          week: s.week,
          day: s.day,
          levelGroup: s.levelGroup,
          memberLevel,
          routesSummary: routesBySession.get(s.id) || '',
          status: s.status as SessionStatus,
          blockCount: s.blockCount,
          approvedAt: s.approvedAt,
          approvedBy: s.approvedBy,
          approvedByName: s.approverFirstName && s.approverLastName
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
            exerciseRoute: schema.exercises.route,
          })
          .from(schema.sessionPrescriptions)
          .leftJoin(schema.exercises, eq(schema.sessionPrescriptions.exerciseId, schema.exercises.id))
          .where(eq(schema.sessionPrescriptions.blockId, block.id))
          .orderBy(asc(schema.sessionPrescriptions.sortOrder));

        return {
          ...block,
          exercises: prescriptions.map(p => ({
            ...p,
            dificultadLineal: p.difficulty,
            route: p.exerciseRoute || null,
          })),
        };
      })
    );

    const memberLevel = session.dayId.split('-').pop() || '';
    return { ...session, memberLevel, blocks: blocksWithExercises };
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
          const groupSessions = sessions.filter(s => s.day === day && s.levelGroup === levelGroup);
          // Show worst status: pending > approved
          const worstStatus = groupSessions.length === 0 ? null
            : groupSessions.some(s => s.status === 'pending_review') ? 'pending_review'
            : groupSessions.every(s => s.status === 'approved') ? 'approved'
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
            // Delete existing session (cascade handles blocks/prescriptions)
            await this.db
              .delete(schema.sessions)
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

  /**
   * Get pool of blocks from approved sessions matching route + memberLevel
   */
  async getBlockPool(route: string, memberLevel: string, excludeSessionId?: number, excludeBlockId?: number) {
    // Build conditions
    const conditions = [
      eq(schema.sessions.status, 'approved'),
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
      .innerJoin(schema.sessions, eq(schema.sessionBlocks.sessionId, schema.sessions.id))
      .where(and(...conditions))
      .orderBy(desc(schema.sessions.week), asc(schema.sessions.day));

    // Filter by memberLevel (extracted from dayId)
    const filteredBlocks = blocks.filter(b => {
      const blockMemberLevel = b.sessionDayId.split('-').pop() || '';
      return blockMemberLevel === memberLevel;
    });

    // Get exercises for each block
    const result = await Promise.all(
      filteredBlocks.map(async (block) => {
        const exercises = await this.db
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
          exercises: exercises.map(e => ({
            ...e,
            dificultadLineal: e.difficulty,
          })),
        };
      })
    );

    // Deduplicate blocks by exercise fingerprint (sorted exercise names)
    // Keep the most recent one (first in list since ordered by week DESC)
    // Pre-seed with current block's fingerprint so identical blocks are excluded
    const seen = new Map<string, typeof result[number]>();
    if (excludeBlockId) {
      const currentExercises = await this.db
        .select({ exerciseName: schema.sessionPrescriptions.exerciseName })
        .from(schema.sessionPrescriptions)
        .where(eq(schema.sessionPrescriptions.blockId, excludeBlockId));
      if (currentExercises.length > 0) {
        const currentFingerprint = currentExercises.map(e => e.exerciseName).sort().join('|');
        seen.set(currentFingerprint, {} as typeof result[number]);
      }
    }
    for (const block of result) {
      const fingerprint = block.exercises
        .map(e => e.exerciseName)
        .sort()
        .join('|');
      if (!seen.has(fingerprint)) {
        seen.set(fingerprint, block);
      }
    }

    return { blocks: Array.from(seen.values()).filter(b => b.id !== undefined) };
  }

  /**
   * Swap a block in a session with a block from the pool (approved session)
   */
  async swapBlock(sessionId: number, targetBlockId: number, sourceBlockId: number): Promise<boolean> {
    // Validate target block belongs to the given session
    const [targetBlock] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(and(
        eq(schema.sessionBlocks.id, targetBlockId),
        eq(schema.sessionBlocks.sessionId, sessionId),
      ));

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
      .innerJoin(schema.sessions, eq(schema.sessionBlocks.sessionId, schema.sessions.id))
      .where(and(
        eq(schema.sessionBlocks.id, sourceBlockId),
        eq(schema.sessions.status, 'approved'),
      ));

    if (!sourceBlock) return false;

    // Get source prescriptions
    const sourcePrescriptions = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, sourceBlockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    // Update target block with source block data (preserve sessionId, role, sortOrder)
    await this.db
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
    await this.db
      .delete(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, targetBlockId));

    // Insert new prescriptions copied from source
    if (sourcePrescriptions.length > 0) {
      await this.db.insert(schema.sessionPrescriptions).values(
        sourcePrescriptions.map(p => ({
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
        }))
      );
    }

    return true;
  }
}
