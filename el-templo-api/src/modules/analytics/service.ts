/**
 * Analytics Service
 *
 * Aggregation queries for KPI stats, member analytics,
 * attendance analytics, and financial analytics.
 * All data is read-only -- no writes to any table.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, isNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type {
  KpiStats,
  MemberAnalytics,
  AttendanceAnalytics,
  FinancialAnalytics,
  AnalyticsFilters,
  Trend,
  AttentionMember,
  HeatmapCell,
  SlotOccupancy,
} from "./types";

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

    const [activeMembers, monthlyRevenue, dailyAttendanceAvg, morososCount] =
      await Promise.all([
        this.getActiveMembersKpi(
          branchId,
          dateFrom,
          dateTo,
          priorFrom,
          priorTo,
        ),
        this.getMonthlyRevenueKpi(
          branchId,
          dateFrom,
          dateTo,
          priorFrom,
          priorTo,
        ),
        this.getDailyAttendanceKpi(
          branchId,
          dateFrom,
          dateTo,
          priorFrom,
          priorTo,
        ),
        this.getMorososKpi(branchId, dateFrom, dateTo, priorFrom, priorTo),
      ]);

    return { activeMembers, monthlyRevenue, dailyAttendanceAvg, morososCount };
  }

  // ─── Member Analytics ──────────────────────────────────────────────────────

  async getMemberAnalytics(
    filters: AnalyticsFilters,
  ): Promise<MemberAnalytics> {
    const { dateFrom, dateTo } = this.resolveDefaults(filters);
    const branchId = filters.branchId;

    const [
      newMembers,
      churnedMembers,
      retentionRate,
      planDistribution,
      attentionList,
    ] = await Promise.all([
      this.countNewMembers(branchId, dateFrom, dateTo),
      this.countChurnedMembers(branchId, dateFrom, dateTo),
      this.computeRetentionRate(branchId, dateFrom, dateTo),
      this.getPlanDistribution(branchId),
      this.getAttentionList(branchId),
    ]);

    return {
      newMembers,
      churnedMembers,
      retentionRate,
      planDistribution,
      attentionList,
    };
  }

  // ─── Attendance Analytics ──────────────────────────────────────────────────

  async getAttendanceAnalytics(
    filters: AnalyticsFilters,
  ): Promise<AttendanceAnalytics> {
    const { dateFrom, dateTo } = this.resolveDefaults(filters);
    const branchId = filters.branchId;

    const [dailyCheckins, peakHoursHeatmap, slotOccupancy, noShowRate] =
      await Promise.all([
        this.getDailyCheckins(branchId, dateFrom, dateTo),
        this.getPeakHoursHeatmap(branchId, dateFrom, dateTo),
        this.getSlotOccupancy(branchId, dateFrom, dateTo),
        this.getNoShowRate(branchId, dateFrom, dateTo),
      ]);

    return { dailyCheckins, peakHoursHeatmap, slotOccupancy, noShowRate };
  }

  // ─── Financial Analytics ───────────────────────────────────────────────────

  async getFinancialAnalytics(
    filters: AnalyticsFilters,
  ): Promise<FinancialAnalytics> {
    const { dateFrom, dateTo } = this.resolveDefaults(filters);
    const branchId = filters.branchId;

    const [revenueTrend, revenueByMethod, revenueByBranch, outstanding] =
      await Promise.all([
        this.getRevenueTrend(branchId, dateFrom, dateTo),
        this.getRevenueByMethod(branchId, dateFrom, dateTo),
        this.getRevenueByBranch(branchId, dateFrom, dateTo),
        this.getOutstandingAndCollection(branchId),
      ]);

    return {
      revenueTrend,
      revenueByMethod,
      revenueByBranch,
      totalOutstanding: outstanding.totalOutstanding,
      collectionRate: outstanding.collectionRate,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private KPI Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async getActiveMembersKpi(
    branchId: number | undefined,
    dateFrom: string,
    dateTo: string,
    priorFrom: string,
    priorTo: string,
  ): Promise<{ value: number; trend: Trend }> {
    const currentCount = await this.countActiveMembers(branchId);
    // For trend: estimate prior period active members by subtracting
    // new members added during current period and adding back churned ones
    const newInPeriod = await this.countNewMembers(branchId, dateFrom, dateTo);
    const churnedInPeriod = await this.countChurnedMembers(
      branchId,
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
  ): Promise<number> {
    const conditions = [
      eq(schema.users.role, "member"),
      eq(schema.users.isActive, true),
    ];
    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }

    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .where(and(...conditions));

    return Number(result?.count ?? 0);
  }

  private async getMonthlyRevenueKpi(
    branchId: number | undefined,
    dateFrom: string,
    dateTo: string,
    priorFrom: string,
    priorTo: string,
  ): Promise<{ value: number; trend: Trend }> {
    const current = await this.sumRevenue(branchId, dateFrom, dateTo);
    const prior = await this.sumRevenue(branchId, priorFrom, priorTo);

    return {
      value: current,
      trend: this.computeTrend(current, prior),
    };
  }

  private async getDailyAttendanceKpi(
    branchId: number | undefined,
    dateFrom: string,
    dateTo: string,
    priorFrom: string,
    priorTo: string,
  ): Promise<{ value: number; trend: Trend }> {
    const currentAvg = await this.computeDailyAvg(branchId, dateFrom, dateTo);
    const priorAvg = await this.computeDailyAvg(branchId, priorFrom, priorTo);

    return {
      value: Math.round(currentAvg * 10) / 10,
      trend: this.computeTrend(currentAvg, priorAvg),
    };
  }

  private async getMorososKpi(
    branchId: number | undefined,
    dateFrom: string,
    dateTo: string,
    priorFrom: string,
    priorTo: string,
  ): Promise<{ value: number; trend: Trend }> {
    const current = await this.countMorosos(branchId);
    // Morosos count is a snapshot, not period-based -- trend shows direction
    // We approximate prior by assuming flat for now (no historical snapshot)
    // A simple heuristic: compare with revenue trend direction
    return {
      value: current,
      trend: { direction: "flat", percentage: 0 },
    };
  }

  private async countMorosos(branchId: number | undefined): Promise<number> {
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.endDate} < CURDATE()`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.subscriptions.branchId, branchId));
    }

    const rows = await this.db
      .select({
        pricePaid: schema.subscriptions.pricePaid,
        paid: sql<number>`COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.subscription_id = ${schema.subscriptions.id}
          AND p.voided_at IS NULL
        ), 0)`,
      })
      .from(schema.subscriptions)
      .where(and(...conditions))
      .having(
        sql`COALESCE((
          SELECT SUM(p2.amount) FROM payments p2
          WHERE p2.subscription_id = ${schema.subscriptions.id}
          AND p2.voided_at IS NULL
        ), 0) < ${schema.subscriptions.pricePaid}`,
      );

    return rows.length;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Member Analytics Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async countNewMembers(
    branchId: number | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    const conditions = [
      eq(schema.users.role, "member"),
      sql`DATE(${schema.users.createdAt}) >= ${dateFrom}`,
      sql`DATE(${schema.users.createdAt}) <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }

    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .where(and(...conditions));

    return Number(result?.count ?? 0);
  }

  private async countChurnedMembers(
    branchId: number | undefined,
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

    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.subscriptions)
      .where(and(...conditions));

    return Number(result?.count ?? 0);
  }

  private async computeRetentionRate(
    branchId: number | undefined,
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

    const [endingResult] = await this.db
      .select({
        count: sql<number>`COUNT(DISTINCT ${schema.subscriptions.userId})`,
      })
      .from(schema.subscriptions)
      .where(and(...endingConditions));

    const totalEnding = Number(endingResult?.count ?? 0);
    if (totalEnding === 0) return 100;

    // Count those who have an active/paused subscription (renewed)
    const renewedConditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.endDate} >= ${dateFrom}`,
      sql`${schema.subscriptions.endDate} <= ${dateTo}`,
      sql`EXISTS (
        SELECT 1 FROM subscriptions s2
        WHERE s2.user_id = ${schema.subscriptions.userId}
        AND s2.subscription_status IN ('active', 'paused')
        AND s2.id != ${schema.subscriptions.id}
      )`,
    ];

    if (branchId !== undefined) {
      renewedConditions.push(eq(schema.subscriptions.branchId, branchId));
    }

    const [renewedResult] = await this.db
      .select({
        count: sql<number>`COUNT(DISTINCT ${schema.subscriptions.userId})`,
      })
      .from(schema.subscriptions)
      .where(and(...renewedConditions));

    const totalRenewed = Number(renewedResult?.count ?? 0);

    return Math.round((totalRenewed / totalEnding) * 100);
  }

  private async getPlanDistribution(
    branchId: number | undefined,
  ): Promise<Array<{ planName: string; count: number }>> {
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.status} IN ('active', 'paused')`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.subscriptions.branchId, branchId));
    }

    const rows = await this.db
      .select({
        planName: schema.subscriptionPlans.name,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(and(...conditions))
      .groupBy(schema.subscriptionPlans.name);

    return rows.map((r) => ({
      planName: r.planName,
      count: Number(r.count),
    }));
  }

  private async getAttentionList(
    branchId: number | undefined,
  ): Promise<AttentionMember[]> {
    // Expiring: active subscriptions ending in next 7 days
    const expiringConditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.status} = 'active'`,
      sql`${schema.subscriptions.endDate} >= CURDATE()`,
      sql`${schema.subscriptions.endDate} <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
    ];

    if (branchId !== undefined) {
      expiringConditions.push(eq(schema.subscriptions.branchId, branchId));
    }

    const expiringRows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        planName: schema.subscriptionPlans.name,
        phone: schema.users.phone,
        endDate: schema.subscriptions.endDate,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(and(...expiringConditions))
      .limit(10);

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
      };
    });

    // Overdue: morosos -- expired subscription with insufficient payments
    const overdueConditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.endDate} < CURDATE()`,
    ];

    if (branchId !== undefined) {
      overdueConditions.push(eq(schema.subscriptions.branchId, branchId));
    }

    const overdueRows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        planName: schema.subscriptionPlans.name,
        phone: schema.users.phone,
        endDate: schema.subscriptions.endDate,
        pricePaid: schema.subscriptions.pricePaid,
        paid: sql<number>`COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.subscription_id = ${schema.subscriptions.id}
          AND p.voided_at IS NULL
        ), 0)`,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(and(...overdueConditions))
      .having(
        sql`COALESCE((
          SELECT SUM(p2.amount) FROM payments p2
          WHERE p2.subscription_id = ${schema.subscriptions.id}
          AND p2.voided_at IS NULL
        ), 0) < ${schema.subscriptions.pricePaid}`,
      )
      .limit(10);

    const overdue: AttentionMember[] = overdueRows.map((r) => {
      const endDate = r.endDate ? new Date(r.endDate) : new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysOverdue = Math.ceil(
        (today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      return {
        userId: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        planName: r.planName,
        phone: r.phone,
        type: "overdue" as const,
        daysUntilExpiry: null,
        daysOverdue,
      };
    });

    // Combine and sort: expiring first (by days ascending), then overdue (by days desc)
    const combined = [...expiring, ...overdue];
    combined.sort((a, b) => {
      if (a.type === "expiring" && b.type === "overdue") return -1;
      if (a.type === "overdue" && b.type === "expiring") return 1;
      if (a.type === "expiring" && b.type === "expiring") {
        return (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0);
      }
      // Both overdue
      return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0);
    });

    return combined.slice(0, 20);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Attendance Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async getDailyCheckins(
    branchId: number | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<Array<{ date: string; count: number }>> {
    const conditions: ReturnType<typeof eq>[] = [
      sql`DATE(${schema.attendance.checkedInAt}) >= ${dateFrom}`,
      sql`DATE(${schema.attendance.checkedInAt}) <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.attendance.branchId, branchId));
    }

    const rows = await this.db
      .select({
        date: sql<string>`DATE(${schema.attendance.checkedInAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.attendance)
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
    dateFrom: string,
    dateTo: string,
  ): Promise<HeatmapCell[]> {
    const conditions: ReturnType<typeof eq>[] = [
      sql`DATE(${schema.attendance.checkedInAt}) >= ${dateFrom}`,
      sql`DATE(${schema.attendance.checkedInAt}) <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.attendance.branchId, branchId));
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

    const rows = await this.db
      .select({
        dayOfWeek: sql<number>`DAYOFWEEK(${schema.attendance.checkedInAt})`,
        hour: sql<number>`HOUR(${schema.attendance.checkedInAt})`,
        total: sql<number>`COUNT(*)`,
      })
      .from(schema.attendance)
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
    dateFrom: string,
    dateTo: string,
  ): Promise<SlotOccupancy[]> {
    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.schedules.isActive, true),
      sql`${schema.bookings.bookingDate} >= ${dateFrom}`,
      sql`${schema.bookings.bookingDate} <= ${dateTo}`,
      eq(schema.bookings.status, "confirmed"),
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.schedules.branchId, branchId));
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
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.bookings.bookingDate} >= ${dateFrom}`,
      sql`${schema.bookings.bookingDate} <= ${dateTo}`,
      sql`${schema.bookings.status} IN ('confirmed', 'no_show')`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.schedules.branchId, branchId));
    }

    const [result] = await this.db
      .select({
        total: sql<number>`COUNT(*)`,
        noShows: sql<number>`SUM(CASE WHEN ${schema.bookings.status} = 'no_show' THEN 1 ELSE 0 END)`,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .where(and(...conditions));

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
    dateFrom: string,
    dateTo: string,
  ): Promise<Array<{ month: string; revenue: number }>> {
    const conditions: ReturnType<typeof eq>[] = [
      isNull(schema.payments.voidedAt),
      sql`${schema.payments.paymentDate} >= ${dateFrom}`,
      sql`${schema.payments.paymentDate} <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }

    const rows = await this.db
      .select({
        month: sql<string>`DATE_FORMAT(${schema.payments.paymentDate}, '%Y-%m')`,
        revenue: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .where(and(...conditions))
      .groupBy(sql`DATE_FORMAT(${schema.payments.paymentDate}, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(${schema.payments.paymentDate}, '%Y-%m')`);

    return rows.map((r) => ({
      month: String(r.month),
      revenue: Number(r.revenue),
    }));
  }

  private async getRevenueByMethod(
    branchId: number | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<{ cash: number; transfer: number; card: number }> {
    const conditions: ReturnType<typeof eq>[] = [
      isNull(schema.payments.voidedAt),
      sql`${schema.payments.paymentDate} >= ${dateFrom}`,
      sql`${schema.payments.paymentDate} <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }

    const rows = await this.db
      .select({
        method: schema.payments.paymentMethod,
        total: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .where(and(...conditions))
      .groupBy(schema.payments.paymentMethod);

    const result = { cash: 0, transfer: 0, card: 0 };
    for (const row of rows) {
      const method = row.method as "cash" | "transfer" | "card";
      result[method] = Number(row.total);
    }
    return result;
  }

  private async getRevenueByBranch(
    branchId: number | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<Array<{ branchId: number; branchName: string; revenue: number }>> {
    const conditions: ReturnType<typeof eq>[] = [
      isNull(schema.payments.voidedAt),
      sql`${schema.payments.paymentDate} >= ${dateFrom}`,
      sql`${schema.payments.paymentDate} <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }

    const rows = await this.db
      .select({
        branchId: schema.users.branchId,
        branchName: schema.branches.name,
        total: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions))
      .groupBy(schema.users.branchId, schema.branches.name);

    return rows.map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName,
      revenue: Number(r.total),
    }));
  }

  private async getOutstandingAndCollection(
    branchId: number | undefined,
  ): Promise<{ totalOutstanding: number; collectionRate: number }> {
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.endDate} < CURDATE()`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.subscriptions.branchId, branchId));
    }

    const rows = await this.db
      .select({
        pricePaid: schema.subscriptions.pricePaid,
        paid: sql<number>`COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.subscription_id = ${schema.subscriptions.id}
          AND p.voided_at IS NULL
        ), 0)`,
      })
      .from(schema.subscriptions)
      .where(and(...conditions));

    let totalOutstanding = 0;
    let totalOwed = 0;
    let totalCollected = 0;

    for (const row of rows) {
      const remaining = Math.max(0, row.pricePaid - Number(row.paid));
      if (remaining > 0) {
        totalOutstanding += remaining;
      }
      totalOwed += row.pricePaid;
      totalCollected += Math.min(row.pricePaid, Number(row.paid));
    }

    const collectionRate =
      totalOwed > 0 ? Math.round((totalCollected / totalOwed) * 100) : 100;

    return { totalOutstanding, collectionRate };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Shared Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async sumRevenue(
    branchId: number | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    const conditions: ReturnType<typeof eq>[] = [
      isNull(schema.payments.voidedAt),
      sql`${schema.payments.paymentDate} >= ${dateFrom}`,
      sql`${schema.payments.paymentDate} <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }

    const [result] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .where(and(...conditions));

    return Number(result?.total ?? 0);
  }

  private async computeDailyAvg(
    branchId: number | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    const conditions: ReturnType<typeof eq>[] = [
      sql`DATE(${schema.attendance.checkedInAt}) >= ${dateFrom}`,
      sql`DATE(${schema.attendance.checkedInAt}) <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.attendance.branchId, branchId));
    }

    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .where(and(...conditions));

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

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();

    return {
      dateFrom: filters.dateFrom ?? `${year}-${month}-01`,
      dateTo:
        filters.dateTo ??
        `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
    };
  }

  /**
   * Compute the prior period of equal length for trend comparison.
   */
  private computePriorPeriod(
    dateFrom: string,
    dateTo: string,
  ): { priorFrom: string; priorTo: string } {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const durationMs = to.getTime() - from.getTime();

    const priorTo = new Date(from.getTime() - 1); // day before current period
    const priorFrom = new Date(priorTo.getTime() - durationMs);

    return {
      priorFrom: priorFrom.toISOString().split("T")[0],
      priorTo: priorTo.toISOString().split("T")[0],
    };
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
