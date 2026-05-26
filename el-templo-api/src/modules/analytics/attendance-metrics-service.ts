/**
 * Attendance Metrics Service (Phase 117 D-09 / D-11 / D-13).
 *
 * A NEW domain service (per D-09: new operativo/feature metrics live in their
 * own service — the 1112-LOC `analytics/service.ts` monolith is NOT touched;
 * the split is v4.9). Exposes two attendance KPIs consumed by the admin
 * Asistencias tab (frontend in Plan 05):
 *
 *   - uniqueMembers: COUNT(DISTINCT member_id) over `attendance` in the last
 *     7 / 14 / 30 days (D-11, feature comprometida). "El KPI de únicos que
 *     recepción pidió."
 *   - checkInAdoptionByBranch: per-branch ratio of confirmed bookings that
 *     have a check-in registered (D-13 Parte B) — exposes the operational
 *     problem of sedes that reserve but never pass list (Chapadmalal: 20/22
 *     reservan, nadie checkea). The <50% warning is FRONTEND logic (Plan 05).
 *
 * Scope (D-17 / T-117-01): every query routes through `applyScope` so a coach
 * of sede X never sees member_id / bookings of sede Y. Date ranges are
 * half-open on the raw column (D-08) to keep the attendance / bookings indexes
 * usable.
 *
 * Uses constructor DI pattern (Phase 56 convention), same shape as
 * AnalyticsService / SegmentationService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import type {
  AnalyticsFilters,
  UniqueMembersMetric,
  CheckInAdoptionRow,
} from "./types";

/**
 * Compose a half-open `[fromTs, toTsExclusive)` range fragment on a timestamp
 * column. `fromTs` is inclusive (>=), `toTsExclusive` is exclusive (<). Mirrors
 * the D-08 pattern used in `service.ts` (`>= dateFrom AND < dateTo+1`): never
 * wraps the column in DATE() so the (member_id, checked_in_at) /
 * (branch_id, checked_in_at) indexes stay usable.
 */
function isoSecond(d: Date): string {
  // "YYYY-MM-DD HH:MM:SS" in the process timezone — MySQL TIMESTAMP comparison.
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export class AttendanceMetricsService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Unique members (COUNT DISTINCT member_id) over `attendance` for the last
   * 7 / 14 / 30 days (D-11). Windows are counted backwards from "now":
   *   last7  = [now - 7d,  now+1s)
   *   last14 = [now - 14d, now+1s)
   *   last30 = [now - 30d, now+1s)
   * Half-open on the raw `checked_in_at` column (D-08) so the index is usable.
   * Scope (branchId / country) is applied via `applyScope` (D-17) — a coach of
   * sede X never counts member_id of sede Y.
   */
  async uniqueMembers(filters: AnalyticsFilters): Promise<UniqueMembersMetric> {
    const now = new Date();
    // Exclusive upper bound 1s past "now" so a check-in recorded this very
    // second is still inside every window.
    const upperExclusive = isoSecond(new Date(now.getTime() + 1000));

    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.attendance.branchId,
    });

    const countForWindow = async (days: number): Promise<number> => {
      const lower = isoSecond(new Date(now.getTime() - days * 86_400_000));
      const conditions: SQL[] = [
        sql`${schema.attendance.checkedInAt} >= ${lower}`,
        sql`${schema.attendance.checkedInAt} < ${upperExclusive}`,
        ...scopeConditions,
      ];

      const base = this.db
        .select({
          count: sql<number>`COUNT(DISTINCT ${schema.attendance.memberId})`,
        })
        .from(schema.attendance);

      const [row] = needsBranchJoin
        ? await base
            .innerJoin(
              schema.branches,
              eq(schema.branches.id, schema.attendance.branchId),
            )
            .where(and(...conditions))
        : await base.where(and(...conditions));

      return Number(row?.count ?? 0);
    };

    const [last7, last14, last30] = await Promise.all([
      countForWindow(7),
      countForWindow(14),
      countForWindow(30),
    ]);

    return { last7, last14, last30 };
  }

  /**
   * Per-branch check-in adoption ratio (D-13 Parte B):
   *   ratio = confirmed bookings WITH a check-in registered
   *           ÷ total confirmed bookings, per sede.
   *
   * bookings has no branch_id, so the sede comes from the booking's schedule
   * (`schedules.branch_id`). A booking "has a check-in" when there is an
   * `attendance` row for the same member + schedule + date (bookings.booking_date
   * = attendance.session_date) — attendance has no booking_id FK, so this is the
   * canonical correlation. Status enum value is `'confirmado'` (D-04 — never the
   * legacy English typo).
   *
   * ratio is returned 0..1 (0 = nadie checkea, 1 = todos). The <50% warning is
   * frontend logic (Plan 05). Branches with 0 confirmed bookings in scope do not
   * appear (no denominator → no row, avoids divide-by-zero / NaN). A branch with
   * confirmados > 0 and conCheckin = 0 yields ratio 0 (explicitly, not NaN).
   *
   * Scope (D-17): applyScope on `schedules.branchId`. Optional date range
   * (filters.dateFrom / dateTo) is applied half-open on booking_date when present.
   */
  async checkInAdoptionByBranch(
    filters: AnalyticsFilters,
  ): Promise<CheckInAdoptionRow[]> {
    const { conditions: scopeConditions } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.schedules.branchId,
    });

    const conditions: SQL[] = [
      sql`${schema.bookings.status} = 'confirmado'`,
      ...scopeConditions,
    ];

    if (filters.dateFrom !== undefined) {
      conditions.push(
        sql`${schema.bookings.bookingDate} >= ${filters.dateFrom}`,
      );
    }
    if (filters.dateTo !== undefined) {
      conditions.push(sql`${schema.bookings.bookingDate} <= ${filters.dateTo}`);
    }

    // LEFT JOIN attendance on (member + schedule + date). When the join matches
    // (id IS NOT NULL) the confirmed booking has a check-in. COUNT(DISTINCT) on
    // the booking id keeps the denominator a clean per-booking count even though
    // the join could fan out (a member could in theory have multiple attendance
    // rows for the same slot/day — defensive).
    const rows = await this.db
      .select({
        branchId: schema.schedules.branchId,
        branchName: schema.branches.name,
        confirmados: sql<number>`COUNT(DISTINCT ${schema.bookings.id})`,
        conCheckin: sql<number>`COUNT(DISTINCT CASE WHEN ${schema.attendance.id} IS NOT NULL THEN ${schema.bookings.id} END)`,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .leftJoin(
        schema.attendance,
        and(
          eq(schema.attendance.memberId, schema.bookings.memberId),
          eq(schema.attendance.scheduleId, schema.bookings.scheduleId),
          eq(schema.attendance.sessionDate, schema.bookings.bookingDate),
        ),
      )
      .where(and(...conditions))
      .groupBy(schema.schedules.branchId, schema.branches.name);

    return rows.map((r) => {
      const confirmados = Number(r.confirmados ?? 0);
      const conCheckin = Number(r.conCheckin ?? 0);
      // Guard divide-by-zero: groupBy can only emit a row when at least one
      // confirmed booking exists, so confirmados >= 1 here, but stay defensive.
      const ratio = confirmados > 0 ? conCheckin / confirmados : 0;
      return {
        branchId: r.branchId,
        branchName: r.branchName,
        confirmados,
        conCheckin,
        ratio,
      };
    });
  }
}
