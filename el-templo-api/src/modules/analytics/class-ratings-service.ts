/**
 * Class ratings analytics service — the "Clases" tab.
 *
 * A NEW read-only domain service (analytics convention: strategic metrics live
 * in their own service; the `analytics/service.ts` monolith is NOT touched).
 * It reads the CLASS dimension of `coach_ratings` (`class_stars`), the sibling
 * of the PROFE dimension (`stars`) that backs /puntuaciones. Only rows with a
 * non-null `class_stars` are counted — pre-split historical rows (class_stars
 * IS NULL) are excluded so the trend starts cleanly at the feature launch.
 *
 * Surfaces (user-confirmed): a weekly TREND, a per-BRANCH average, and a
 * per-TURNO average (mañana/tarde). No per-activity breakdown and no comments
 * here — the comment stays on /puntuaciones only.
 *
 * TURNO note: the class rating was attributed via the roster SLOT, which splits
 * at 12:00 (RatingsService.slotFromStartTime), NOT the analytics turno bands
 * ([07,10)/[17,20)). We group by that SAME 12:00 slot for consistency with how
 * each rating was attributed. This tab therefore does NOT take the global turno
 * filter (band-based) — it always shows both slots.
 *
 * Scope (T-117-01): every query routes branch/country through `applyScope` on
 * `coachRatings.branchId`; the route is ADMIN_ROLES-only (requireAdminAnalytics).
 * Constructor DI (Phase 56), same shape as the other analytics services.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, isNotNull, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { rangeConditions, bucketExpr } from "./cohorts";
import type {
  AnalyticsFilters,
  ClassRatingsAnalytics,
  ClassRatingTrendPoint,
  ClassRatingBranchRow,
  ClassRatingTurnoRow,
} from "./types";

/** Round an AVG(stars) to 2 decimals (matches getOwnerRatings), null-safe. */
function roundAvg(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : Math.round(n * 100) / 100;
}

export class ClassRatingsService {
  constructor(
    private readonly db: MySql2Database<typeof schema>,
    private readonly log: FastifyBaseLogger,
  ) {}

  async getClassRatings(
    filters: AnalyticsFilters,
  ): Promise<ClassRatingsAnalytics> {
    const [overall, trend, byBranch, byTurno] = await Promise.all([
      this.getOverall(filters),
      this.getTrend(filters),
      this.getByBranch(filters),
      this.getByTurno(filters),
    ]);
    return { overall, trend, byBranch, byTurno };
  }

  /** Base WHERE conditions shared by every query: rated class + scope + range. */
  private baseConditions(filters: AnalyticsFilters): {
    conditions: SQL[];
    needsBranchJoin: boolean;
  } {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.coachRatings.branchId,
    });

    const conditions: SQL[] = [
      isNotNull(schema.coachRatings.classStars) as unknown as SQL,
      ...scopeConditions,
      ...rangeConditions(
        schema.coachRatings.sessionDate,
        filters.dateFrom,
        filters.dateTo,
      ),
    ];

    return { conditions, needsBranchJoin };
  }

  /** Global average + count over the scoped, ranged, rated universe. */
  private async getOverall(
    filters: AnalyticsFilters,
  ): Promise<{ avgStars: number | null; count: number }> {
    const { conditions, needsBranchJoin } = this.baseConditions(filters);

    let query = this.db
      .select({
        avgStars: sql<string>`AVG(${schema.coachRatings.classStars})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.coachRatings)
      .$dynamic();

    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.coachRatings.branchId),
      );
    }

    const [row] = await query.where(and(...conditions));
    return {
      avgStars: roundAvg(row?.avgStars),
      count: Number(row?.count ?? 0),
    };
  }

  /** Weekly trend of the class average (ISO year-week buckets). */
  private async getTrend(
    filters: AnalyticsFilters,
  ): Promise<ClassRatingTrendPoint[]> {
    const { conditions, needsBranchJoin } = this.baseConditions(filters);
    const bucket = bucketExpr(schema.coachRatings.sessionDate, "weekly");

    let query = this.db
      .select({
        period: bucket,
        avgStars: sql<string>`AVG(${schema.coachRatings.classStars})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.coachRatings)
      .$dynamic();

    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.coachRatings.branchId),
      );
    }

    const rows = await query
      .where(and(...conditions))
      .groupBy(bucket)
      .orderBy(bucket);

    return rows.map((r) => ({
      period: r.period,
      avgStars: roundAvg(r.avgStars) ?? 0,
      count: Number(r.count),
    }));
  }

  /** Per-branch average + count (always joins branches for the name). */
  private async getByBranch(
    filters: AnalyticsFilters,
  ): Promise<ClassRatingBranchRow[]> {
    const { conditions } = this.baseConditions(filters);

    const rows = await this.db
      .select({
        branchId: schema.coachRatings.branchId,
        branchName: schema.branches.name,
        avgStars: sql<string>`AVG(${schema.coachRatings.classStars})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.coachRatings)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.coachRatings.branchId),
      )
      .where(and(...conditions))
      .groupBy(schema.coachRatings.branchId, schema.branches.name)
      .orderBy(schema.branches.name);

    return rows.map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName,
      avgStars: roundAvg(r.avgStars) ?? 0,
      count: Number(r.count),
    }));
  }

  /**
   * Per-turno average, split at 12:00 on the schedule startTime — the SAME
   * slot boundary the roster used to attribute the rating. Rows whose schedule
   * is missing a startTime are dropped from this breakdown (they cannot be
   * classified), which is why byTurno counts may sum below `overall.count`.
   */
  private async getByTurno(
    filters: AnalyticsFilters,
  ): Promise<ClassRatingTurnoRow[]> {
    const { conditions, needsBranchJoin } = this.baseConditions(filters);
    const turnoExpr = sql<string>`CASE WHEN ${schema.schedules.startTime} < '12:00' THEN 'manana' ELSE 'tarde' END`;

    let query = this.db
      .select({
        turno: turnoExpr,
        avgStars: sql<string>`AVG(${schema.coachRatings.classStars})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.coachRatings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.coachRatings.scheduleId),
      )
      .$dynamic();

    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.coachRatings.branchId),
      );
    }

    const rows = await query
      .where(and(...conditions))
      .groupBy(turnoExpr)
      .orderBy(turnoExpr);

    return rows.map((r) => ({
      turno: r.turno === "manana" ? "manana" : "tarde",
      avgStars: roundAvg(r.avgStars) ?? 0,
      count: Number(r.count),
    }));
  }
}
