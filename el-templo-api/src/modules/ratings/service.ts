/**
 * Ratings Service (Phase 143)
 *
 * The weekly roster (class_coach_assignments) is the SINGLE source of
 * attribution for post-class ratings (D-A1, D-Q1). Rating rules — 48h window,
 * one-shot, last-class-only, no-orphan — are enforced HERE, server-side, never
 * trusted to the client.
 *
 * Privacy isolation (D-A3, D-M3): getPendingRating never exposes the coach, and
 * the owner view is the only read path for ratings (the coach sees nothing).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, desc, asc, lt, lte, gt, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import { getWeekRange } from "../shared/date-utils";
import type {
  RosterAssignmentInput,
  RosterWeekRow,
  CoachOption,
  PendingRating,
  SubmitRatingInput,
  OwnerRatingsResult,
  RatingsScope,
  ClassSlot,
} from "./types";

/** Rating opportunity window: 48 hours after the class (D-P3). */
const RATING_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Derive the ISO day-of-week (1=Mon .. 7=Sun) from a "YYYY-MM-DD" string.
 * Uses noon-UTC to avoid DST/day-boundary drift (same convention as
 * date-utils). Roster days are 1..6 (Mon-Sat); Sunday (7) has no slots.
 */
function isoDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
  return dow === 0 ? 7 : dow;
}

/** Monday (ISO) of the week containing the given "YYYY-MM-DD" string. */
function isoWeekStart(dateStr: string): string {
  return getWeekRange(new Date(dateStr + "T12:00:00Z")).monday;
}

/** Turn derived from a schedule startTime "HH:MM": <12:00 = morning (D-A1). */
function slotFromStartTime(startTime: string): ClassSlot {
  return startTime < "12:00" ? "morning" : "afternoon";
}

export class RatingsService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  // ─── Roster (owner/coach write) ────────────────────────────────────────────

  /**
   * Coaches assignable to a branch: users with role 'coach' that have a
   * user_branches row for the branch.
   */
  async getCoachesForBranch(branchId: number): Promise<CoachOption[]> {
    const rows = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .innerJoin(
        schema.userBranches,
        eq(schema.userBranches.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.users.role, "coach"),
          eq(schema.userBranches.branchId, branchId),
        ),
      )
      .orderBy(schema.users.firstName, schema.users.lastName);

    return rows.map((r) => ({
      id: r.id,
      firstName: r.firstName ?? "",
      lastName: r.lastName ?? "",
    }));
  }

  /**
   * Effective roster for a branch as of a given week (admin grid).
   *
   * Rows are effective-dated: `week_start_date` is the week a change takes
   * effect and each (day, slot) inherits the coach from the most recent change
   * whose week is <= the viewed week. So for each cell we pick the latest
   * change-point <= `weekStartDate` (window ROW_NUMBER, rn=1). A cell with no
   * change-point on or before the week is simply absent (no coach yet).
   */
  async getRosterWeek(
    branchId: number,
    weekStartDate: string,
  ): Promise<RosterWeekRow[]> {
    const result = await this.db.execute(sql`
      SELECT t.id AS id,
             t.day_of_week AS dayOfWeek,
             t.slot AS slot,
             t.coach_id AS coachId,
             u.first_name AS firstName,
             u.last_name AS lastName
      FROM (
        SELECT id, day_of_week, slot, coach_id,
               ROW_NUMBER() OVER (
                 PARTITION BY day_of_week, slot
                 ORDER BY week_start_date DESC
               ) AS rn
        FROM class_coach_assignments
        WHERE branch_id = ${branchId}
          AND week_start_date <= ${weekStartDate}
      ) t
      JOIN users u ON u.id = t.coach_id
      WHERE t.rn = 1
    `);

    const rows = result[0] as unknown as Array<{
      id: number;
      dayOfWeek: number;
      slot: string;
      coachId: number;
      firstName: string | null;
      lastName: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      branchId,
      // The cell belongs to the viewed week, not the (possibly earlier) week the
      // change-point was created — the grid renders "who teaches this week".
      weekStartDate,
      dayOfWeek: r.dayOfWeek,
      slot: r.slot as ClassSlot,
      coachId: r.coachId,
      coachName: [r.firstName, r.lastName].filter(Boolean).join(" "),
    }));
  }

  /**
   * Set the coach for a (day, slot) effective from `weekStartDate` onward
   * (effective-dated model). The change rules from that week until the next
   * change-point supersedes it — persists immediately, the UI has no Save
   * button.
   *
   * A change-point is only stored when it actually changes the effective coach,
   * keeping the invariant "no two consecutive change-points share a coach":
   *  - If the coach inherited from the previous change-point is already this
   *    coach, no row is created (or an existing redundant row at this week is
   *    removed) — the week keeps inheriting.
   *  - Any immediately following change-point that now repeats this coach is
   *    collapsed, so a change never leaves a redundant duplicate downstream.
   * This is what makes "changing a slot propagates forward" hold with a single
   * row per real change, without wiping legitimately planned future changes.
   *
   * Guards: coach must belong to the branch (user_branches, T-143-05), dayOfWeek
   * in 1..6, slot valid, and the target week must not be in the past — history
   * stays frozen so past attribution is never rewritten.
   */
  async upsertRosterAssignment(input: RosterAssignmentInput): Promise<void> {
    const { branchId, weekStartDate, dayOfWeek, slot, coachId } = input;

    if (dayOfWeek < 1 || dayOfWeek > 6) {
      throw new BadRequestError("Día de semana inválido (1-6)");
    }
    if (slot !== "morning" && slot !== "afternoon") {
      throw new BadRequestError("Turno inválido");
    }

    // History is read-only: a change can only take effect from the current ISO
    // week onward, so already-taught classes keep their attribution.
    const currentWeek = isoWeekStart(new Date().toISOString().split("T")[0]);
    if (weekStartDate < currentWeek) {
      throw new BadRequestError(
        "No se puede editar el roster de una semana pasada",
      );
    }

    // The coach must be a coach assigned to this branch.
    const [coachRow] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(
        schema.userBranches,
        eq(schema.userBranches.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.users.id, coachId),
          eq(schema.users.role, "coach"),
          eq(schema.userBranches.branchId, branchId),
        ),
      )
      .limit(1);

    if (!coachRow) {
      throw new BadRequestError("El profe no pertenece a esta sucursal");
    }

    const slotFilter = and(
      eq(schema.classCoachAssignments.branchId, branchId),
      eq(schema.classCoachAssignments.dayOfWeek, dayOfWeek),
      eq(schema.classCoachAssignments.slot, slot),
    );

    await this.db.transaction(async (tx) => {
      // Coach inherited from the most recent change-point strictly before W.
      const [prev] = await tx
        .select({ coachId: schema.classCoachAssignments.coachId })
        .from(schema.classCoachAssignments)
        .where(
          and(
            slotFilter,
            lt(schema.classCoachAssignments.weekStartDate, weekStartDate),
          ),
        )
        .orderBy(desc(schema.classCoachAssignments.weekStartDate))
        .limit(1);

      // Write the change-point at W (replace if this week already had one).
      await tx
        .insert(schema.classCoachAssignments)
        .values({ branchId, weekStartDate, dayOfWeek, slot, coachId })
        .onDuplicateKeyUpdate({ set: { coachId } });

      if (prev && prev.coachId === coachId) {
        // The week already inherited this coach — no change-point needed.
        await tx
          .delete(schema.classCoachAssignments)
          .where(
            and(
              slotFilter,
              eq(schema.classCoachAssignments.weekStartDate, weekStartDate),
            ),
          );
        return;
      }

      // Collapse a following change-point that now merely repeats this coach
      // (the invariant guarantees at most one such contiguous row).
      const following = await tx
        .select({
          id: schema.classCoachAssignments.id,
          coachId: schema.classCoachAssignments.coachId,
        })
        .from(schema.classCoachAssignments)
        .where(
          and(
            slotFilter,
            gt(schema.classCoachAssignments.weekStartDate, weekStartDate),
          ),
        )
        .orderBy(asc(schema.classCoachAssignments.weekStartDate));

      for (const row of following) {
        if (row.coachId !== coachId) break;
        await tx
          .delete(schema.classCoachAssignments)
          .where(eq(schema.classCoachAssignments.id, row.id));
      }
    });
  }

  // ─── Member pending + submit ─────────────────────────────────────────────

  /**
   * The single class the member should rate now (D-P3/D-P4), or null.
   *
   * Returns the member's most recent CONFIRMED in-person attendance whose
   * class start is within the last 48h (D-P3) that (a) has NOT already been
   * rated for (memberId, sessionDate, scheduleId) (one-shot, D-P2) and (b) has
   * a coach assigned in the roster for that class (no-orphan, D-Q3). Only the
   * LAST eligible class is returned — no queue (D-P4).
   *
   * Exposes NOTHING about the coach (D-A3).
   */
  async getPendingRating(memberId: number): Promise<PendingRating | null> {
    const now = Date.now();

    // Candidate in-person classes: confirmed attendance with a schedule (the
    // schedule resolves activity + startTime = slot). Newest first.
    const candidates = await this.db
      .select({
        sessionDate: schema.attendance.sessionDate,
        branchId: schema.attendance.branchId,
        scheduleId: schema.attendance.scheduleId,
        checkedInAt: schema.attendance.checkedInAt,
        startTime: schema.schedules.startTime,
        activityName: schema.activities.name,
        timezone: schema.branches.timezone,
      })
      .from(schema.attendance)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.attendance.scheduleId),
      )
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.attendance.branchId),
      )
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          eq(schema.attendance.status, "confirmado"),
        ),
      )
      .orderBy(desc(schema.attendance.checkedInAt))
      .limit(20);

    for (const c of candidates) {
      if (c.scheduleId === null) continue;

      // 48h window (D-P3): measured from the class start moment.
      const checkedAtMs =
        c.checkedInAt instanceof Date
          ? c.checkedInAt.getTime()
          : new Date(c.checkedInAt).getTime();
      if (Number.isNaN(checkedAtMs)) continue;
      if (now - checkedAtMs > RATING_WINDOW_MS) {
        // Older than 48h — and candidates are newest-first, so everything
        // after this is older too: there's nothing left to rate (D-P4).
        return null;
      }

      // One-shot (D-P2): already rated this exact class?
      const [existing] = await this.db
        .select({ id: schema.coachRatings.id })
        .from(schema.coachRatings)
        .where(
          and(
            eq(schema.coachRatings.memberId, memberId),
            eq(schema.coachRatings.sessionDate, c.sessionDate),
            eq(schema.coachRatings.scheduleId, c.scheduleId),
          ),
        )
        .limit(1);
      if (existing) continue;

      // No-orphan (D-Q3): there must be a coach assigned in the roster.
      const coachId = await this.resolveRosterCoachId(
        c.branchId,
        c.sessionDate,
        c.startTime,
      );
      if (coachId === null) continue;

      // Eligible — return the class only, never the coach (D-A3).
      return {
        sessionDate: c.sessionDate,
        branchId: c.branchId,
        scheduleId: c.scheduleId,
        activityName: c.activityName,
        dayOfWeek: isoDayOfWeek(c.sessionDate),
      };
    }

    return null;
  }

  /**
   * Submit a rating. Resolves the coach from the roster by attribution
   * (D-Q1) and enforces every server-side guard before inserting.
   */
  async submitRating(
    memberId: number,
    input: SubmitRatingInput,
  ): Promise<void> {
    const { sessionDate, scheduleId, stars, comment } = input;

    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new BadRequestError("La puntuación debe ser un entero de 1 a 5");
    }
    if (comment !== undefined && comment.length > 500) {
      throw new BadRequestError("El comentario supera los 500 caracteres");
    }

    // The member must actually have attended this class (T-143-08).
    const [attendanceRow] = await this.db
      .select({
        branchId: schema.attendance.branchId,
        checkedInAt: schema.attendance.checkedInAt,
        startTime: schema.schedules.startTime,
      })
      .from(schema.attendance)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.attendance.scheduleId),
      )
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          eq(schema.attendance.sessionDate, sessionDate),
          eq(schema.attendance.scheduleId, scheduleId),
          eq(schema.attendance.status, "confirmado"),
        ),
      )
      .limit(1);

    if (!attendanceRow) {
      throw new BadRequestError("No asististe a esta clase");
    }

    // Revalidate the 48h window server-side (D-P3) — don't trust the client.
    const checkedAtMs =
      attendanceRow.checkedInAt instanceof Date
        ? attendanceRow.checkedInAt.getTime()
        : new Date(attendanceRow.checkedInAt).getTime();
    if (
      Number.isNaN(checkedAtMs) ||
      Date.now() - checkedAtMs > RATING_WINDOW_MS
    ) {
      throw new BadRequestError("El plazo para puntuar esta clase venció");
    }

    // One-shot guard (D-P2).
    const [already] = await this.db
      .select({ id: schema.coachRatings.id })
      .from(schema.coachRatings)
      .where(
        and(
          eq(schema.coachRatings.memberId, memberId),
          eq(schema.coachRatings.sessionDate, sessionDate),
          eq(schema.coachRatings.scheduleId, scheduleId),
        ),
      )
      .limit(1);
    if (already) {
      throw new BadRequestError("Ya puntuaste esta clase");
    }

    // Attribution (D-Q1): resolve the coach from the roster for this class.
    const coachId = await this.resolveRosterCoachId(
      attendanceRow.branchId,
      sessionDate,
      attendanceRow.startTime,
    );
    if (coachId === null) {
      throw new BadRequestError("No hay profe asignado a esta clase");
    }

    await this.db.insert(schema.coachRatings).values({
      coachId,
      memberId,
      branchId: attendanceRow.branchId,
      scheduleId,
      sessionDate,
      stars,
      comment: comment ?? null,
    });
  }

  /**
   * Resolve the attributed coachId for a class identified by (branchId,
   * sessionDate, schedule startTime). Effective-dated: picks the coach from the
   * most recent change-point whose week is <= the class's ISO week. Returns null
   * when no change-point applies on or before that week (no-orphan, D-Q3).
   *
   * A LATER change-point (a future roster edit) never affects a past class,
   * because its week is > the class's week and is excluded by the <= filter.
   */
  private async resolveRosterCoachId(
    branchId: number,
    sessionDate: string,
    startTime: string,
  ): Promise<number | null> {
    const weekStartDate = isoWeekStart(sessionDate);
    const dayOfWeek = isoDayOfWeek(sessionDate);
    const slot = slotFromStartTime(startTime);

    const [row] = await this.db
      .select({ coachId: schema.classCoachAssignments.coachId })
      .from(schema.classCoachAssignments)
      .where(
        and(
          eq(schema.classCoachAssignments.branchId, branchId),
          lte(schema.classCoachAssignments.weekStartDate, weekStartDate),
          eq(schema.classCoachAssignments.dayOfWeek, dayOfWeek),
          eq(schema.classCoachAssignments.slot, slot),
        ),
      )
      .orderBy(desc(schema.classCoachAssignments.weekStartDate))
      .limit(1);

    return row ? row.coachId : null;
  }

  // ─── Owner view (owner-only, D-M3) ────────────────────────────────────────

  /**
   * Owner view: per-coach average + count, plus recent individual ratings
   * (D-O1). Scope mirrors CoachService — owner is unrestricted; admin/gestion
   * restricted to their country via the rating's branch.
   */
  async getOwnerRatings(scope: RatingsScope): Promise<OwnerRatingsResult> {
    // Restrict by country (via branch) for non-owner staff. Owner sees all.
    let branchIds: number[] | null = null;
    if (!scope.isOwner) {
      if (scope.country === null) {
        return { perCoach: [], recent: [] };
      }
      const branchRows = await this.db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.country, scope.country));
      branchIds = branchRows.map((b) => b.id);
      if (branchIds.length === 0) {
        return { perCoach: [], recent: [] };
      }
    }

    const branchFilter =
      branchIds !== null
        ? inArray(schema.coachRatings.branchId, branchIds)
        : undefined;

    const perCoachRows = await this.db
      .select({
        coachId: schema.coachRatings.coachId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        averageStars: sql<string>`AVG(${schema.coachRatings.stars})`,
        ratingCount: sql<number>`COUNT(*)`,
      })
      .from(schema.coachRatings)
      .innerJoin(schema.users, eq(schema.users.id, schema.coachRatings.coachId))
      .where(branchFilter)
      .groupBy(
        schema.coachRatings.coachId,
        schema.users.firstName,
        schema.users.lastName,
      )
      .orderBy(schema.users.firstName, schema.users.lastName);

    const recentRows = await this.db
      .select({
        id: schema.coachRatings.id,
        coachId: schema.coachRatings.coachId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        stars: schema.coachRatings.stars,
        comment: schema.coachRatings.comment,
        sessionDate: schema.coachRatings.sessionDate,
        activityName: schema.activities.name,
      })
      .from(schema.coachRatings)
      .innerJoin(schema.users, eq(schema.users.id, schema.coachRatings.coachId))
      .leftJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.coachRatings.scheduleId),
      )
      .leftJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(branchFilter)
      .orderBy(desc(schema.coachRatings.createdAt))
      .limit(50);

    return {
      perCoach: perCoachRows.map((r) => ({
        coachId: r.coachId,
        coachName: [r.firstName, r.lastName].filter(Boolean).join(" "),
        averageStars: Math.round(Number(r.averageStars) * 100) / 100,
        ratingCount: Number(r.ratingCount),
      })),
      recent: recentRows.map((r) => ({
        id: r.id,
        coachId: r.coachId,
        coachName: [r.firstName, r.lastName].filter(Boolean).join(" "),
        stars: r.stars,
        comment: r.comment ?? null,
        sessionDate: r.sessionDate,
        activityName: r.activityName ?? null,
      })),
    };
  }
}
