/**
 * Analytics Service
 *
 * Aggregation queries for KPI stats, member analytics,
 * attendance analytics, and financial analytics.
 * All data is read-only -- no writes to any table.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, isNull, inArray, gt, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { resolveMonthRange, computePriorPeriod } from "../shared/date-utils";
import { activeMemberExists } from "../shared/active-member";
import { firmMoneySqlFor } from "../finance/firm-money";
import { collectibleDebtCondition } from "../finance/debt-conditions";
import { applyScope } from "./scope";
import type {
  KpiStats,
  MonetaryKpiByCurrency,
  MemberAnalytics,
  PlanDistributionRow,
  AttendanceAnalytics,
  FinancialAnalytics,
  OutstandingByCurrency,
  RevenueByCurrency,
  AnalyticsFilters,
  Trend,
  AttentionMember,
  HeatmapCell,
  SlotOccupancy,
} from "./types";

// Phase 117 D-08: end-exclusive upper bound for half-open date ranges
// [dateFrom, dateTo+1day). Comparing a DATETIME column directly against this
// preserves the index (whereas DATE(col) <= dateTo wraps the column in a
// function and forces a full scan). Returns YYYY-MM-DD.
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

export class AnalyticsService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  /**
   * Get high-level KPI stats with trend vs prior period.
   */
  async getKpis(filters: AnalyticsFilters): Promise<KpiStats> {
    const { dateFrom, dateTo } = this.resolveDefaults(filters);
    const { priorFrom, priorTo } = this.computePriorPeriod(dateFrom, dateTo);
    const branchId = filters.branchId;
    const country = filters.country;

    const [activeMembers, monthlyRevenue, dailyAttendanceAvg] =
      await Promise.all([
        this.getActiveMembersKpi(
          branchId,
          country,
          dateFrom,
          dateTo,
          priorFrom,
          priorTo,
        ),
        this.getMonthlyRevenueKpi(
          branchId,
          country,
          dateFrom,
          dateTo,
          priorFrom,
          priorTo,
        ),
        this.getDailyAttendanceKpi(
          branchId,
          country,
          dateFrom,
          dateTo,
          priorFrom,
          priorTo,
        ),
      ]);

    return { activeMembers, monthlyRevenue, dailyAttendanceAvg };
  }

  // ─── Member Analytics ──────────────────────────────────────────────────────

  async getMemberAnalytics(
    filters: AnalyticsFilters,
  ): Promise<MemberAnalytics> {
    const { dateFrom, dateTo } = this.resolveDefaults(filters);
    const branchId = filters.branchId;
    const country = filters.country;

    const [
      newMembers,
      churnedMembers,
      retentionRate,
      planDistribution,
      attentionList,
      renewalRate,
    ] = await Promise.all([
      this.countNewMembers(branchId, country, dateFrom, dateTo),
      this.countChurnedMembers(branchId, country, dateFrom, dateTo),
      this.computeRetentionRate(branchId, country, dateFrom, dateTo),
      this.getPlanDistribution(branchId, country),
      this.getAttentionList(branchId, country),
      this.getRenewalRate(branchId, country),
    ]);

    return {
      newMembers,
      churnedMembers,
      retentionRate,
      planDistribution,
      attentionList,
      renewalRate,
    };
  }

  // ─── Attendance Analytics ──────────────────────────────────────────────────

  async getAttendanceAnalytics(
    filters: AnalyticsFilters,
  ): Promise<AttendanceAnalytics> {
    const { dateFrom, dateTo } = this.resolveDefaults(filters);
    const branchId = filters.branchId;
    const country = filters.country;

    const [dailyCheckins, peakHoursHeatmap, slotOccupancy, noShowRate] =
      await Promise.all([
        this.getDailyCheckins(branchId, country, dateFrom, dateTo),
        this.getPeakHoursHeatmap(branchId, country, dateFrom, dateTo),
        this.getSlotOccupancy(branchId, country, dateFrom, dateTo),
        this.getNoShowRate(branchId, country, dateFrom, dateTo),
      ]);

    return { dailyCheckins, peakHoursHeatmap, slotOccupancy, noShowRate };
  }

  // ─── Financial Analytics ───────────────────────────────────────────────────

  async getFinancialAnalytics(
    filters: AnalyticsFilters,
  ): Promise<FinancialAnalytics> {
    const { dateFrom, dateTo } = this.resolveDefaults(filters);
    const branchId = filters.branchId;
    const country = filters.country;

    const [
      revenueTrend,
      revenueByMethod,
      revenueByBranch,
      outstandingByCurrency,
    ] = await Promise.all([
      this.getRevenueTrend(branchId, country, dateFrom, dateTo),
      this.getRevenueByMethod(branchId, country, dateFrom, dateTo),
      this.getRevenueByBranch(branchId, country, dateFrom, dateTo),
      this.getOutstandingByCurrency(branchId, country),
    ]);

    return {
      revenueTrend,
      revenueByMethod,
      revenueByBranch,
      outstandingByCurrency,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private KPI Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async getActiveMembersKpi(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
    priorFrom: string,
    priorTo: string,
  ): Promise<{ value: number; trend: Trend }> {
    const currentCount = await this.countActiveMembers(branchId, country);
    // For trend: estimate prior period active members by subtracting
    // new members added during current period and adding back churned ones
    const newInPeriod = await this.countNewMembers(
      branchId,
      country,
      dateFrom,
      dateTo,
    );
    const churnedInPeriod = await this.countChurnedMembers(
      branchId,
      country,
      dateFrom,
      dateTo,
    );
    const priorCount = currentCount - newInPeriod + churnedInPeriod;

    return {
      value: currentCount,
      trend: this.computeTrend(currentCount, priorCount),
    };
  }

  private async countActiveMembers(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
  ): Promise<number> {
    // Phase 117 D-02: stop reading the denormalized users.status (which drifts
    // to a stale 'activo' when a sub expires without a status recompute — the
    // ~48 fantasmas) and compute "activo" LIVE via the canonical
    // activeMemberExists predicate. Real count is 692, not the inflated 749.
    const conditions: SQL[] = [
      eq(schema.users.role, "member") as unknown as SQL,
      activeMemberExists(schema.users.id),
    ];
    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId) as unknown as SQL);
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country) as unknown as SQL);
    }

    const query = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions));

    const [result] = await query;

    return Number(result?.count ?? 0);
  }

  private async getMonthlyRevenueKpi(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
    priorFrom: string,
    priorTo: string,
  ): Promise<MonetaryKpiByCurrency> {
    // Phase 117 D-05 / D-17: per-currency KPI with an independent trend for
    // each currency vs the prior period — ARS and EUR are never summed.
    const current = await this.sumRevenue(branchId, country, dateFrom, dateTo);
    const prior = await this.sumRevenue(branchId, country, priorFrom, priorTo);

    return {
      ARS: {
        value: current.ARS,
        trend: this.computeTrend(current.ARS, prior.ARS),
      },
      EUR: {
        value: current.EUR,
        trend: this.computeTrend(current.EUR, prior.EUR),
      },
    };
  }

  private async getDailyAttendanceKpi(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
    priorFrom: string,
    priorTo: string,
  ): Promise<{ value: number; trend: Trend }> {
    const currentAvg = await this.computeDailyAvg(
      branchId,
      country,
      dateFrom,
      dateTo,
    );
    const priorAvg = await this.computeDailyAvg(
      branchId,
      country,
      priorFrom,
      priorTo,
    );

    return {
      value: Math.round(currentAvg * 10) / 10,
      trend: this.computeTrend(currentAvg, priorAvg),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Member Analytics Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async countNewMembers(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    // Phase 117 D-06: count only NEW members who are also ACTIVE (canonical
    // predicate), not every role='member' created in the window — which would
    // include freemium/prueba leads and made getActiveMembersKpi's prior-period
    // estimate circular. Phase 117 D-08: half-open [dateFrom, dateTo+1) range so
    // the createdAt index is usable (no DATE() wrapper).
    const conditions: SQL[] = [
      eq(schema.users.role, "member") as unknown as SQL,
      activeMemberExists(schema.users.id),
      sql`${schema.users.createdAt} >= ${dateFrom}`,
      sql`${schema.users.createdAt} < ${nextDay(dateTo)}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId) as unknown as SQL);
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country) as unknown as SQL);
    }

    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions));

    return Number(result?.count ?? 0);
  }

  /**
   * @deprecated Phase 121 D-09: legacy churn metric keyed off `updatedAt` of
   * `cancelled` subscriptions — fragile and NOT person-based. Superseded by the
   * canonical person-based churn at `GET /api/admin/analytics/churn`
   * (`ChurnService.getChurn`), which counts DISTINCT persons whose membership
   * expired by `endDate` in `[from, to)` and did not renew within the configured
   * window (churn maduro). Kept live during Phase 121 so the current admin
   * dashboard does not break; physical removal happens in the admin-UI phase when
   * the cards reconnect to `/churn`. Do NOT add new callers.
   */
  // @deprecated Phase 121 D-09: use ChurnService / GET /churn
  private async countChurnedMembers(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.subscriptions.status, "cancelled"),
      sql`DATE(${schema.subscriptions.updatedAt}) >= ${dateFrom}`,
      sql`DATE(${schema.subscriptions.updatedAt}) <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.subscriptions.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.subscriptions)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(and(...conditions));

    return Number(result?.count ?? 0);
  }

  /**
   * @deprecated Phase 121 D-09: legacy retention metric — uses an INCLUSIVE
   * `<= dateTo` window and a coarse "any active/paused sub exists" renewal test,
   * NOT the person-based expiry cohort. Superseded by the canonical person-based
   * churn/renovación at `GET /api/admin/analytics/churn`
   * (`ChurnService.getChurn`) — renov% is `100 − churn%` only when `enGracia === 0`
   * (the "número vivo"). Kept live during Phase 121 so the current admin dashboard
   * does not break; physical removal happens in the admin-UI phase when the cards
   * reconnect to `/churn`. Do NOT add new callers.
   */
  // @deprecated Phase 121 D-09: use ChurnService / GET /churn
  private async computeRetentionRate(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    // Count members whose subscription ended in the period
    const endingConditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.endDate} >= ${dateFrom}`,
      sql`${schema.subscriptions.endDate} <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      endingConditions.push(eq(schema.subscriptions.branchId, branchId));
    }
    if (country !== undefined) {
      endingConditions.push(eq(schema.branches.country, country));
    }

    const [endingResult] = await this.db
      .select({
        count: sql<number>`COUNT(DISTINCT ${schema.subscriptions.userId})`,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(and(...endingConditions));

    const totalEnding = Number(endingResult?.count ?? 0);
    if (totalEnding === 0) return 100;

    // Count those who have an active/paused subscription (renewed)
    const renewedConditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.endDate} >= ${dateFrom}`,
      sql`${schema.subscriptions.endDate} <= ${dateTo}`,
      sql`EXISTS (
        SELECT 1 FROM subscriptions s2
        WHERE s2.user_id = subscriptions.user_id
        AND s2.subscription_status IN ('active', 'paused')
        AND s2.id != subscriptions.id
      )`,
    ];

    if (branchId !== undefined) {
      renewedConditions.push(eq(schema.subscriptions.branchId, branchId));
    }
    if (country !== undefined) {
      renewedConditions.push(eq(schema.branches.country, country));
    }

    const [renewedResult] = await this.db
      .select({
        count: sql<number>`COUNT(DISTINCT ${schema.subscriptions.userId})`,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(and(...renewedConditions));

    const totalRenewed = Number(renewedResult?.count ?? 0);

    return Math.round((totalRenewed / totalEnding) * 100);
  }

  private async getPlanDistribution(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
  ): Promise<PlanDistributionRow[]> {
    // Phase 117 D-07: exclude archived plans and group by (name, country) so
    // homonymous plans across countries — e.g. "Flex" AR (id 1) vs "Flex" ES
    // (id 105) — are reported as two separate rows instead of being summed.
    const conditions: SQL[] = [
      sql`${schema.subscriptions.status} IN ('active', 'paused')`,
      eq(schema.subscriptionPlans.isArchived, false) as unknown as SQL,
    ];

    if (branchId !== undefined) {
      conditions.push(
        eq(schema.subscriptions.branchId, branchId) as unknown as SQL,
      );
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country) as unknown as SQL);
    }

    const rows = await this.db
      .select({
        planName: schema.subscriptionPlans.name,
        country: schema.subscriptionPlans.country,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(and(...conditions))
      .groupBy(schema.subscriptionPlans.name, schema.subscriptionPlans.country);

    return rows.map((r) => ({
      planName: r.planName,
      country: r.country,
      count: Number(r.count),
    }));
  }

  /**
   * Window (in days) used to derive the `yaPago` flag (Phase 117 D-16): a
   * member counts as "ya pagó" if they have a NON-VOIDED `plan_charge` inflow
   * in `financial_transactions` within the last N days. 30 days matches the
   * shortest plan cycle, so a recent payment whose subscription row has not
   * yet been renewed is still recognized by reception.
   */
  private static readonly YA_PAGO_WINDOW_DAYS = 30;

  /**
   * Renewals/expirations worklist (Phase 117 D-14/D-16/D-17).
   *
   * Two blocks, same shape:
   *   - `expiring`: ACTIVE subs ending in the next 7 days (daysUntilExpiry>=0,
   *     daysOverdue null).
   *   - `overdue`: subs whose end_date is 1..30 days in the past AND the member
   *     is NOT currently active (negated activeMemberExists → "vencido sin
   *     renovar"). daysOverdue = CURDATE()-end_date (real), daysUntilExpiry null.
   *     Members overdue >30 days are excluded (out of the 1-7/8-14/15-30 buckets).
   *
   * Each member carries:
   *   - `yaPago`: EXISTS recent non-voided plan_charge inflow (D-16).
   *   - `segment`: member_profiles.segment for prioritization (D-16/D-17) — an
   *     ausente/alerta that is expiring/overdue is the highest-priority contact.
   *
   * "habló con coach" (D-16) is DEFERRED: it is not derivable without new
   * schema/UI, so it is intentionally NOT implemented here.
   *
   * Scope (T-117-01): branchId/country filters are applied to BOTH blocks via
   * applyScope over subscriptions.branchId — a coach/admin never sees PII
   * (phone) of members outside their authorized branches/country.
   */
  private async getAttentionList(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
  ): Promise<AttentionMember[]> {
    const scope = applyScope({
      branchId,
      country,
      branchColumn: schema.subscriptions.branchId,
    });

    // yaPago: derived EXISTS over recent non-voided plan_charge inflows (D-16).
    const yaPagoExpr = sql<number>`EXISTS (
      SELECT 1 FROM financial_transactions ft
      WHERE ft.member_id = ${schema.subscriptions.userId}
        AND ft.kind = 'plan_charge'
        AND ft.direction = 'inflow'
        AND ${sql.raw(firmMoneySqlFor("ft"))}
        AND ft.transaction_date >= DATE_SUB(CURDATE(), INTERVAL ${sql.raw(
          String(AnalyticsService.YA_PAGO_WINDOW_DAYS),
        )} DAY)
    )`;

    // ── Expiring: active subs ending in the next 7 days ──────────────────────
    const expiringConditions: SQL[] = [
      sql`${schema.subscriptions.status} = 'active'`,
      sql`${schema.subscriptions.endDate} >= CURDATE()`,
      sql`${schema.subscriptions.endDate} <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
      ...scope.conditions,
    ];

    const expiringRows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        planName: schema.subscriptionPlans.name,
        phone: schema.users.phone,
        endDate: schema.subscriptions.endDate,
        yaPago: yaPagoExpr,
        segment: schema.memberProfiles.segment,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .leftJoin(
        schema.memberProfiles,
        eq(schema.memberProfiles.userId, schema.subscriptions.userId),
      )
      .where(and(...expiringConditions))
      .limit(50);

    const expiring: AttentionMember[] = expiringRows.map((r) => {
      const endDate = r.endDate ? new Date(r.endDate) : new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.ceil(
        (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      return {
        userId: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        planName: r.planName,
        phone: r.phone,
        type: "expiring" as const,
        daysUntilExpiry,
        daysOverdue: null,
        yaPago: Number(r.yaPago) === 1,
        segment: r.segment ?? null,
      };
    });

    // ── Overdue: end_date 1..30 days past AND member NOT active (no renewal) ──
    const overdueConditions: SQL[] = [
      sql`${schema.subscriptions.endDate} < CURDATE()`,
      sql`${schema.subscriptions.endDate} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      // "vencido sin renovar": negate the canonical active predicate so a member
      // who renewed (has an in-effect sub) drops out of the overdue worklist.
      sql`NOT ${activeMemberExists(schema.subscriptions.userId)}`,
      ...scope.conditions,
    ];

    const overdueRows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        planName: schema.subscriptionPlans.name,
        phone: schema.users.phone,
        daysOverdue: sql<number>`DATEDIFF(CURDATE(), ${schema.subscriptions.endDate})`,
        yaPago: yaPagoExpr,
        segment: schema.memberProfiles.segment,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .leftJoin(
        schema.memberProfiles,
        eq(schema.memberProfiles.userId, schema.subscriptions.userId),
      )
      .where(and(...overdueConditions))
      .limit(50);

    // A member may have several past subs in the window; keep the one with the
    // smallest daysOverdue (most recent expiry) per user.
    const overdueByUser = new Map<number, AttentionMember>();
    for (const r of overdueRows) {
      const daysOverdue = Number(r.daysOverdue);
      const existing = overdueByUser.get(r.userId);
      if (existing && (existing.daysOverdue ?? Infinity) <= daysOverdue) {
        continue;
      }
      overdueByUser.set(r.userId, {
        userId: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        planName: r.planName,
        phone: r.phone,
        type: "overdue" as const,
        daysUntilExpiry: null,
        daysOverdue,
        yaPago: Number(r.yaPago) === 1,
        segment: r.segment ?? null,
      });
    }
    const overdue = [...overdueByUser.values()];

    // Prioritize: ausente/alerta first (they leave if untouched), then by
    // urgency (overdue with most mora, then expiring soonest).
    const priorityRank = (m: AttentionMember): number => {
      if (m.segment === "ausente") return 0;
      if (m.segment === "alerta") return 1;
      return 2;
    };
    const urgency = (m: AttentionMember): number =>
      m.type === "overdue"
        ? -(m.daysOverdue ?? 0) // more mora = more urgent
        : (m.daysUntilExpiry ?? 0); // expiring sooner = more urgent

    const combined = [...overdue, ...expiring].sort((a, b) => {
      const pr = priorityRank(a) - priorityRank(b);
      if (pr !== 0) return pr;
      return urgency(a) - urgency(b);
    });

    return combined.slice(0, 20);
  }

  /**
   * Operational renewal rate 7/14/30 (Phase 117 D-15). For each window N, of the
   * members whose subscription ended within the last N days, the % that renewed
   * (now have an in-effect subscription per activeMemberExists). Distinct
   * members. Returns 0 for a window with no expirations. Scope (T-117-01) is
   * applied over subscriptions.branchId.
   *
   * @deprecated Phase 121 D-09: operational 7/14/30 metric anchored to fixed
   * CURDATE() windows, NOT person-cohort renovación. Superseded by the canonical
   * person-based renovación at `GET /api/admin/analytics/renewal`
   * (`RenewalService.getRenewal`), which counts DISTINCT matured persons whose
   * membership expired by `endDate` in `[from, to)` and renewed within the single
   * configurable window — over the SAME cohort churn uses (RENOV-01). Kept live
   * during Phase 121 so the current admin dashboard does not break; physical
   * removal happens in the admin-UI phase when the cards reconnect to `/renewal`.
   * Do NOT add new callers.
   */
  // @deprecated Phase 121 D-09: use RenewalService / GET /renewal
  private async getRenewalRate(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
  ): Promise<{ last7: number; last14: number; last30: number }> {
    const computeWindow = async (days: number): Promise<number> => {
      const scope = applyScope({
        branchId,
        country,
        branchColumn: schema.subscriptions.branchId,
      });

      const endingConditions: SQL[] = [
        sql`${schema.subscriptions.endDate} < CURDATE()`,
        sql`${schema.subscriptions.endDate} >= DATE_SUB(CURDATE(), INTERVAL ${sql.raw(
          String(days),
        )} DAY)`,
        ...scope.conditions,
      ];

      const [endingResult] = await this.db
        .select({
          ending: sql<number>`COUNT(DISTINCT ${schema.subscriptions.userId})`,
          renewed: sql<number>`COUNT(DISTINCT CASE WHEN ${activeMemberExists(
            schema.subscriptions.userId,
          )} THEN ${schema.subscriptions.userId} END)`,
        })
        .from(schema.subscriptions)
        .innerJoin(
          schema.branches,
          eq(schema.branches.id, schema.subscriptions.branchId),
        )
        .where(and(...endingConditions));

      const ending = Number(endingResult?.ending ?? 0);
      if (ending === 0) return 0;
      const renewed = Number(endingResult?.renewed ?? 0);
      return Math.round((renewed / ending) * 100);
    };

    const [last7, last14, last30] = await Promise.all([
      computeWindow(7),
      computeWindow(14),
      computeWindow(30),
    ]);
    return { last7, last14, last30 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Attendance Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async getDailyCheckins(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<Array<{ date: string; count: number }>> {
    // Phase 117 D-08: half-open [dateFrom, dateTo+1) on the raw column keeps the
    // checkedInAt index usable (DATE(col) wrapped the column and forced a scan).
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.attendance.checkedInAt} >= ${dateFrom}`,
      sql`${schema.attendance.checkedInAt} < ${nextDay(dateTo)}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.attendance.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    const base = this.db
      .select({
        date: sql<string>`DATE(${schema.attendance.checkedInAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.attendance);

    const rows =
      country !== undefined
        ? await base
            .innerJoin(
              schema.branches,
              eq(schema.branches.id, schema.attendance.branchId),
            )
            .where(and(...conditions))
            .groupBy(sql`DATE(${schema.attendance.checkedInAt})`)
            .orderBy(sql`DATE(${schema.attendance.checkedInAt})`)
        : await base
            .where(and(...conditions))
            .groupBy(sql`DATE(${schema.attendance.checkedInAt})`)
            .orderBy(sql`DATE(${schema.attendance.checkedInAt})`);

    return rows.map((r) => ({
      date: String(r.date),
      count: Number(r.count),
    }));
  }

  private async getPeakHoursHeatmap(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<HeatmapCell[]> {
    // Phase 117 D-08: half-open [dateFrom, dateTo+1) on the raw column keeps the
    // checkedInAt index usable. (The DAYOFWEEK/HOUR projections below still need
    // the raw timestamp — only the range filter is de-wrapped.)
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.attendance.checkedInAt} >= ${dateFrom}`,
      sql`${schema.attendance.checkedInAt} < ${nextDay(dateTo)}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.attendance.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    // Count checkins per (dayOfWeek, hour), then divide by number of weeks
    const dayMs = 1000 * 60 * 60 * 24;
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const totalDays = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / dayMs) + 1,
    );
    const weeksInPeriod = Math.max(1, totalDays / 7);

    // Get branch capacity for normalization
    let maxCapacity = 22; // default
    if (branchId !== undefined) {
      const [branch] = await this.db
        .select({ maxCapacity: schema.branches.maxCapacity })
        .from(schema.branches)
        .where(eq(schema.branches.id, branchId));
      if (branch) maxCapacity = branch.maxCapacity;
    }

    const base = this.db
      .select({
        dayOfWeek: sql<number>`DAYOFWEEK(${schema.attendance.checkedInAt})`,
        hour: sql<number>`HOUR(${schema.attendance.checkedInAt})`,
        total: sql<number>`COUNT(*)`,
      })
      .from(schema.attendance);

    const rows =
      country !== undefined
        ? await base
            .innerJoin(
              schema.branches,
              eq(schema.branches.id, schema.attendance.branchId),
            )
            .where(and(...conditions))
            .groupBy(
              sql`DAYOFWEEK(${schema.attendance.checkedInAt})`,
              sql`HOUR(${schema.attendance.checkedInAt})`,
            )
        : await base
            .where(and(...conditions))
            .groupBy(
              sql`DAYOFWEEK(${schema.attendance.checkedInAt})`,
              sql`HOUR(${schema.attendance.checkedInAt})`,
            );

    return rows.map((r) => {
      // MySQL DAYOFWEEK: 1=Sunday, 2=Monday...7=Saturday
      // Convert to ISO: 1=Monday..7=Sunday
      const mysqlDow = Number(r.dayOfWeek);
      const isoDow = mysqlDow === 1 ? 7 : mysqlDow - 1;
      const avgPerWeek = Number(r.total) / weeksInPeriod;
      const occupancy = Math.min(
        100,
        Math.round((avgPerWeek / maxCapacity) * 100),
      );

      return {
        dayOfWeek: isoDow,
        hour: Number(r.hour),
        averageOccupancy: occupancy,
      };
    });
  }

  private async getSlotOccupancy(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<SlotOccupancy[]> {
    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.schedules.isActive, true),
      sql`${schema.bookings.bookingDate} >= ${dateFrom}`,
      sql`${schema.bookings.bookingDate} <= ${dateTo}`,
      sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.schedules.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    // Number of weeks in period for averaging
    const dayMs = 1000 * 60 * 60 * 24;
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const totalDays = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / dayMs) + 1,
    );
    const weeksInPeriod = Math.max(1, totalDays / 7);

    // Get branch capacity
    let maxCapacity = 22;
    if (branchId !== undefined) {
      const [branch] = await this.db
        .select({ maxCapacity: schema.branches.maxCapacity })
        .from(schema.branches)
        .where(eq(schema.branches.id, branchId));
      if (branch) maxCapacity = branch.maxCapacity;
    }

    const rows = await this.db
      .select({
        scheduleId: schema.schedules.id,
        activityName: schema.activities.name,
        dayOfWeek: schema.schedules.dayOfWeek,
        startTime: schema.schedules.startTime,
        totalBookings: sql<number>`COUNT(${schema.bookings.id})`,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .where(and(...conditions))
      .groupBy(
        schema.schedules.id,
        schema.activities.name,
        schema.schedules.dayOfWeek,
        schema.schedules.startTime,
      );

    return rows.map((r) => {
      const avgPerWeek = Number(r.totalBookings) / weeksInPeriod;
      const occupancy = Math.min(
        100,
        Math.round((avgPerWeek / maxCapacity) * 100),
      );

      return {
        scheduleId: r.scheduleId,
        activityName: r.activityName,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        averageOccupancy: occupancy,
      };
    });
  }

  private async getNoShowRate(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    // Phase 117 D-04: the real booking enum value is 'confirmado' (see
    // bookingStatusEnum in db/schema/bookings.ts). The previous 'confirmed'
    // typo never matched any row, so the denominator collapsed to just the
    // no_show rows and the rate read ~100% (or 0% when none) — never the real
    // proportion. This bug survived because there was no test seeding real
    // 'confirmado' rows (D-18).
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.bookings.bookingDate} >= ${dateFrom}`,
      sql`${schema.bookings.bookingDate} <= ${dateTo}`,
      sql`${schema.bookings.status} IN ('confirmado', 'no_show')`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.schedules.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    const base = this.db
      .select({
        total: sql<number>`COUNT(*)`,
        noShows: sql<number>`SUM(CASE WHEN ${schema.bookings.status} = 'no_show' THEN 1 ELSE 0 END)`,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      );

    const [result] =
      country !== undefined
        ? await base
            .innerJoin(
              schema.branches,
              eq(schema.branches.id, schema.schedules.branchId),
            )
            .where(and(...conditions))
        : await base.where(and(...conditions));

    const total = Number(result?.total ?? 0);
    const noShows = Number(result?.noShows ?? 0);

    if (total === 0) return 0;
    return Math.round((noShows / total) * 100);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Financial Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async getRevenueTrend(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<Array<{ month: string; ARS: number; EUR: number }>> {
    // Phase 117 D-05 / D-17: group by (month, currency) and report ARS and EUR
    // separately — never summed into one figure. Mirrors the
    // getOutstandingByCurrency currency-split pattern.
    const conditions: SQL[] = [
      isNull(schema.financialTransactions.voidedAt),
      // Phase 137 (VAL-05): firm money counts only validated rows.
      eq(
        schema.financialTransactions.validationStatus,
        "validado",
      ) as unknown as SQL,
      inArray(schema.financialTransactions.kind, [
        "plan_charge",
        "debt_settlement",
      ]) as unknown as SQL,
      eq(schema.financialTransactions.direction, "inflow") as unknown as SQL,
      sql`${schema.financialTransactions.transactionDate} >= ${dateFrom}`,
      sql`${schema.financialTransactions.transactionDate} <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId) as unknown as SQL);
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country) as unknown as SQL);
    }

    const rows = await this.db
      .select({
        month: sql<string>`DATE_FORMAT(${schema.financialTransactions.transactionDate}, '%Y-%m')`,
        currency: schema.financialTransactions.currency,
        revenue: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions))
      .groupBy(
        sql`DATE_FORMAT(${schema.financialTransactions.transactionDate}, '%Y-%m')`,
        schema.financialTransactions.currency,
      )
      .orderBy(
        sql`DATE_FORMAT(${schema.financialTransactions.transactionDate}, '%Y-%m')`,
      );

    // Collapse the (month, currency) rows into one row per month carrying both
    // ARS and EUR totals.
    const byMonth = new Map<string, { ARS: number; EUR: number }>();
    for (const r of rows) {
      const month = String(r.month);
      const entry = byMonth.get(month) ?? { ARS: 0, EUR: 0 };
      if (r.currency === "ARS" || r.currency === "EUR") {
        entry[r.currency] = Number(r.revenue);
      }
      byMonth.set(month, entry);
    }
    return Array.from(byMonth.entries()).map(([month, totals]) => ({
      month,
      ARS: totals.ARS,
      EUR: totals.EUR,
    }));
  }

  private async getRevenueByMethod(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<{
    cash: RevenueByCurrency;
    transfer: RevenueByCurrency;
    card: RevenueByCurrency;
  }> {
    // Phase 117 D-05 / D-17: split each payment method per currency. The
    // payment-method type guard (T-105-17) is preserved so the kind/direction
    // filter's exclusion of aura_credit/internal is reinforced.
    const conditions: SQL[] = [
      isNull(schema.financialTransactions.voidedAt),
      // Phase 137 (VAL-05): firm money counts only validated rows.
      eq(
        schema.financialTransactions.validationStatus,
        "validado",
      ) as unknown as SQL,
      inArray(schema.financialTransactions.kind, [
        "plan_charge",
        "debt_settlement",
      ]) as unknown as SQL,
      eq(schema.financialTransactions.direction, "inflow") as unknown as SQL,
      sql`${schema.financialTransactions.transactionDate} >= ${dateFrom}`,
      sql`${schema.financialTransactions.transactionDate} <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId) as unknown as SQL);
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country) as unknown as SQL);
    }

    const rows = await this.db
      .select({
        method: schema.financialTransactions.paymentMethod,
        currency: schema.financialTransactions.currency,
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions))
      .groupBy(
        schema.financialTransactions.paymentMethod,
        schema.financialTransactions.currency,
      );

    const result = {
      cash: { ARS: 0, EUR: 0 } as RevenueByCurrency,
      transfer: { ARS: 0, EUR: 0 } as RevenueByCurrency,
      card: { ARS: 0, EUR: 0 } as RevenueByCurrency,
    };
    for (const row of rows) {
      const method = row.method;
      if (method !== "cash" && method !== "transfer" && method !== "card") {
        continue;
      }
      if (row.currency === "ARS" || row.currency === "EUR") {
        result[method][row.currency] = Number(row.total);
      }
    }
    return result;
  }

  private async getRevenueByBranch(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<
    Array<{ branchId: number; branchName: string; ARS: number; EUR: number }>
  > {
    // Phase 117 D-05 / D-17: each branch row carries ARS and EUR separately —
    // a single branch could (in theory) record both; never sum them.
    const conditions: SQL[] = [
      isNull(schema.financialTransactions.voidedAt),
      // Phase 137 (VAL-05): firm money counts only validated rows.
      eq(
        schema.financialTransactions.validationStatus,
        "validado",
      ) as unknown as SQL,
      inArray(schema.financialTransactions.kind, [
        "plan_charge",
        "debt_settlement",
      ]) as unknown as SQL,
      eq(schema.financialTransactions.direction, "inflow") as unknown as SQL,
      sql`${schema.financialTransactions.transactionDate} >= ${dateFrom}`,
      sql`${schema.financialTransactions.transactionDate} <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(
        eq(schema.financialTransactions.branchId, branchId) as unknown as SQL,
      );
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country) as unknown as SQL);
    }

    const rows = await this.db
      .select({
        branchId: schema.financialTransactions.branchId,
        branchName: schema.branches.name,
        currency: schema.financialTransactions.currency,
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      .where(and(...conditions))
      .groupBy(
        schema.financialTransactions.branchId,
        schema.branches.name,
        schema.financialTransactions.currency,
      );

    const byBranch = new Map<
      number,
      { branchName: string; ARS: number; EUR: number }
    >();
    for (const r of rows) {
      // Phase 139: financial_transactions.branchId is now nullable (movimientos/
      // egresos branch-less). The INNER JOIN branches already drops NULL-branch
      // rows; this guard makes the narrowing explicit for tsc and the Map key.
      if (r.branchId === null) continue;
      const entry = byBranch.get(r.branchId) ?? {
        branchName: r.branchName,
        ARS: 0,
        EUR: 0,
      };
      if (r.currency === "ARS" || r.currency === "EUR") {
        entry[r.currency] = Number(r.total);
      }
      byBranch.set(r.branchId, entry);
    }
    return Array.from(byBranch.entries()).map(([id, v]) => ({
      branchId: id,
      branchName: v.branchName,
      ARS: v.ARS,
      EUR: v.EUR,
    }));
  }

  /**
   * Total outstanding debt at "now", grouped by currency. Source: balances
   * WHERE amount > 0. Aligned with the Reports/Deudas tab (single source of
   * truth post-Phase 109). Uses LEFT JOIN to subscriptions/branches because
   * `target_kind='debt_balance'` rows have no subscription. branchId/country
   * filters apply through subscriptions, which implicitly excludes
   * debt_balance rows — same trade-off as `reports/service.ts::getOutstandingBalances`.
   *
   * Returns both ARS and EUR keys, defaulting to 0. Currencies are NEVER
   * summed across.
   */
  private async getOutstandingByCurrency(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
  ): Promise<OutstandingByCurrency> {
    const conditions: SQL[] = [
      gt(schema.balances.amount, 0),
      collectibleDebtCondition(),
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.subscriptions.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    const rows = await this.db
      .select({
        currency: schema.balances.currency,
        total: sql<number>`COALESCE(SUM(${schema.balances.amount}), 0)`,
      })
      .from(schema.balances)
      .leftJoin(
        schema.subscriptions,
        and(
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.subscriptions.id, schema.balances.targetId),
        ),
      )
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(and(...conditions))
      .groupBy(schema.balances.currency);

    const result: OutstandingByCurrency = { ARS: 0, EUR: 0 };
    for (const row of rows) {
      if (row.currency === "ARS" || row.currency === "EUR") {
        result[row.currency] = Number(row.total);
      }
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Shared Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async sumRevenue(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<RevenueByCurrency> {
    // Phase 117 D-05 / D-17: total revenue split per currency, never summed.
    const conditions: SQL[] = [
      isNull(schema.financialTransactions.voidedAt),
      // Phase 137 (VAL-05): firm money counts only validated rows.
      eq(
        schema.financialTransactions.validationStatus,
        "validado",
      ) as unknown as SQL,
      inArray(schema.financialTransactions.kind, [
        "plan_charge",
        "debt_settlement",
      ]) as unknown as SQL,
      eq(schema.financialTransactions.direction, "inflow") as unknown as SQL,
      sql`${schema.financialTransactions.transactionDate} >= ${dateFrom}`,
      sql`${schema.financialTransactions.transactionDate} <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId) as unknown as SQL);
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country) as unknown as SQL);
    }

    const rows = await this.db
      .select({
        currency: schema.financialTransactions.currency,
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions))
      .groupBy(schema.financialTransactions.currency);

    const result: RevenueByCurrency = { ARS: 0, EUR: 0 };
    for (const row of rows) {
      if (row.currency === "ARS" || row.currency === "EUR") {
        result[row.currency] = Number(row.total);
      }
    }
    return result;
  }

  private async computeDailyAvg(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    // Phase 117 D-08: half-open [dateFrom, dateTo+1) keeps the checkedInAt index
    // usable instead of wrapping the column in DATE().
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.attendance.checkedInAt} >= ${dateFrom}`,
      sql`${schema.attendance.checkedInAt} < ${nextDay(dateTo)}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.attendance.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    const base = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance);

    const [result] =
      country !== undefined
        ? await base
            .innerJoin(
              schema.branches,
              eq(schema.branches.id, schema.attendance.branchId),
            )
            .where(and(...conditions))
        : await base.where(and(...conditions));

    const total = Number(result?.count ?? 0);

    const dayMs = 1000 * 60 * 60 * 24;
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const days = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / dayMs) + 1,
    );

    return total / days;
  }

  /**
   * Resolve default date range to current month if not specified.
   */
  private resolveDefaults(filters: AnalyticsFilters): {
    dateFrom: string;
    dateTo: string;
  } {
    if (filters.dateFrom && filters.dateTo) {
      return { dateFrom: filters.dateFrom, dateTo: filters.dateTo };
    }

    const defaults = resolveMonthRange();
    return {
      dateFrom: filters.dateFrom ?? defaults.dateFrom,
      dateTo: filters.dateTo ?? defaults.dateTo,
    };
  }

  /**
   * Compute the prior period of equal length for trend comparison.
   * Delegates to shared date-utils for timezone-safe date arithmetic.
   */
  private computePriorPeriod(
    dateFrom: string,
    dateTo: string,
  ): { priorFrom: string; priorTo: string } {
    return computePriorPeriod(dateFrom, dateTo);
  }

  /**
   * Compute trend direction and percentage.
   */
  private computeTrend(current: number, prior: number): Trend {
    if (prior === 0 && current === 0) {
      return { direction: "flat", percentage: 0 };
    }

    if (prior === 0) {
      return { direction: "up", percentage: 100 };
    }

    const change = ((current - prior) / prior) * 100;
    const percentage = Math.round(Math.abs(change));

    if (Math.abs(change) < 1) {
      return { direction: "flat", percentage: 0 };
    }

    return {
      direction: change > 0 ? "up" : "down",
      percentage,
    };
  }
}
