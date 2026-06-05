/**
 * Graduation Service
 *
 * Phase 130 (KAIROS-05, D-02/D-03): automatic, one-way kairos→alfa graduation.
 *
 * A `kairos` member who reaches KAIROS_GRADUATION_THRESHOLD completed sessions
 * is promoted to `alfa`. The promotion is:
 *   - one-way: only kairos→alfa, an alfa+ member is never demoted or re-evaluated;
 *   - override-aware: a member whose level was set manually by a coach
 *     (users.level_override=true) is skipped (D-03 sticky override);
 *   - event-driven: callers invoke maybeGraduateKairos right after recording a
 *     completed session — there is NO cron (D-02);
 *   - guarded at the write: the UPDATE is `WHERE id=? AND level='kairos'` so a
 *     concurrent manual change to alfa is never clobbered and the call is
 *     idempotent (a second call on an already-graduated alfa member is a no-op).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { KAIROS_GRADUATION_THRESHOLD } from "../shared/training-constants";

export class GraduationService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Promote a member from kairos to alfa if (and only if) they are currently
   * kairos, have NOT been manually placed by a coach, and have reached the
   * configured completed-session threshold. Safe to call on any member after
   * recording a completed session — non-kairos and overridden members are
   * cheap early returns.
   */
  async maybeGraduateKairos(userId: number): Promise<void> {
    const [member] = await this.db
      .select({
        level: schema.users.level,
        levelOverride: schema.users.levelOverride,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    // Unknown user — nothing to graduate.
    if (!member) return;

    // One-way: never touch an alfa+ member (D-02).
    if (member.level !== "kairos") return;

    // Sticky coach override: a manual placement is never reverted (D-03).
    if (member.levelOverride) return;

    // Total completed sessions across all levels (graduation is on lifetime
    // completion volume, not per-level). Mirrors the COUNT pattern in
    // MemberService.getSessionLevelCounts.
    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)`.as("count") })
      .from(schema.completedSessions)
      .where(eq(schema.completedSessions.userId, userId));

    const completedCount = Number(countRow?.count ?? 0);
    if (completedCount < KAIROS_GRADUATION_THRESHOLD) return;

    // Guarded one-way write: only flip a still-kairos row. Race-safe and
    // idempotent — a concurrent manual change to alfa won't be clobbered.
    await this.db
      .update(schema.users)
      .set({ level: "alfa" })
      .where(
        and(eq(schema.users.id, userId), eq(schema.users.level, "kairos")),
      );

    this.log.info(
      {
        userId,
        completedCount,
        threshold: KAIROS_GRADUATION_THRESHOLD,
        from: "kairos",
        to: "alfa",
      },
      "Auto-graduated member kairos→alfa",
    );
  }
}
