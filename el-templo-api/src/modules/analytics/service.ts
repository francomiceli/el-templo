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
import { resolveMonthRange, computePriorPeriod } from "../shared/date-utils";
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
    ] = await Promise.all([
      this.countNewMembers(branchId, country, dateFrom, dateTo),
      this.countChurnedMembers(branchId, country, dateFrom, dateTo),
      this.computeRetentionRate(branchId, country, dateFrom, dateTo),
      this.getPlanDistribution(branchId, country),
      this.getAttentionList(branchId, country),
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
      expectedRevenue,
      collectedRevenue,
    ] = await Promise.all([
      this.getRevenueTrend(branchId, country, dateFrom, dateTo),
      this.getRevenueByMethod(branchId, country, dateFrom, dateTo),
      this.getRevenueByBranch(branchId, country, dateFrom, dateTo),
      this.getExpectedRevenue(branchId, country, dateFrom, dateTo),
      this.sumRevenue(branchId, country, dateFrom, dateTo),
    ]);

    const totalOutstanding = Math.max(0, expectedRevenue - collectedRevenue);
    const collectionRate =
      expectedRevenue > 0
        ? Math.round((collectedRevenue / expectedRevenue) * 1000) / 10
        : 100;

    return {
      revenueTrend,
      revenueByMethod,
      revenueByBranch,
      totalOutstanding,
      collectionRate,
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
    // Phase 103 (R10): users.is_active was dropped in migration 0100. The
    // commercial "active member" definition is now first-class on
    // users.status — same row count as the legacy isActive=true projection
    // because Plan 02 backfilled the column from the same EXISTS predicate.
    const conditions = [
      eq(schema.users.role, "member"),
      eq(schema.users.status, "activo"),
    ];
    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
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
  ): Promise<{ value: number; trend: Trend }> {
    const current = await this.sumRevenue(branchId, country, dateFrom, dateTo);
    const prior = await this.sumRevenue(branchId, country, priorFrom, priorTo);

    return {
      value: current,
      trend: this.computeTrend(current, prior),
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
    const conditions = [
      eq(schema.users.role, "member"),
      sql`DATE(${schema.users.createdAt}) >= ${dateFrom}`,
      sql`DATE(${schema.users.createdAt}) <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions));

    return Number(result?.count ?? 0);
  }

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
  ): Promise<Array<{ planName: string; count: number }>> {
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.status} IN ('active', 'paused')`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.subscriptions.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
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
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
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
    country: "AR" | "ES" | undefined,
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
    if (country !== undefined) {
      expiringConditions.push(eq(schema.branches.country, country));
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
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
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

    // Sort expiring by days ascending (most urgent first)
    expiring.sort(
      (a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0),
    );

    return expiring.slice(0, 20);
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
    const conditions: ReturnType<typeof eq>[] = [
      sql`DATE(${schema.attendance.checkedInAt}) >= ${dateFrom}`,
      sql`DATE(${schema.attendance.checkedInAt}) <= ${dateTo}`,
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
    const conditions: ReturnType<typeof eq>[] = [
      sql`DATE(${schema.attendance.checkedInAt}) >= ${dateFrom}`,
      sql`DATE(${schema.attendance.checkedInAt}) <= ${dateTo}`,
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
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.bookings.bookingDate} >= ${dateFrom}`,
      sql`${schema.bookings.bookingDate} <= ${dateTo}`,
      sql`${schema.bookings.status} IN ('confirmed', 'no_show')`,
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
  ): Promise<Array<{ month: string; revenue: number }>> {
    const conditions: ReturnType<typeof eq>[] = [
      isNull(schema.payments.voidedAt),
      sql`${schema.payments.paymentDate} >= ${dateFrom}`,
      sql`${schema.payments.paymentDate} <= ${dateTo}`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    const rows = await this.db
      .select({
        month: sql<string>`DATE_FORMAT(${schema.payments.paymentDate}, '%Y-%m')`,
        revenue: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
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
    country: "AR" | "ES" | undefined,
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
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    const rows = await this.db
      .select({
        method: schema.payments.paymentMethod,
        total: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
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
    country: "AR" | "ES" | undefined,
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
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
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

  /**
   * Sum pricePaid from subscriptions whose period overlaps the date range.
   * Excludes zero-price subscriptions (free/complimentary).
   */
  private async getExpectedRevenue(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.startDate} <= ${dateTo}`,
      sql`(${schema.subscriptions.endDate} >= ${dateFrom} OR ${schema.subscriptions.endDate} IS NULL)`,
      sql`${schema.subscriptions.status} IN ('active', 'paused', 'expired', 'completed', 'changed')`,
      sql`${schema.subscriptions.pricePaid} > 0`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.subscriptions.branchId, branchId));
    }
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    const base = this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.subscriptions.pricePaid}), 0)`,
      })
      .from(schema.subscriptions);

    const [result] =
      country !== undefined
        ? await base
            .innerJoin(
              schema.branches,
              eq(schema.branches.id, schema.subscriptions.branchId),
            )
            .where(and(...conditions))
        : await base.where(and(...conditions));

    return Number(result?.total ?? 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Shared Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private async sumRevenue(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
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
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    const [result] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions));

    return Number(result?.total ?? 0);
  }

  private async computeDailyAvg(
    branchId: number | undefined,
    country: "AR" | "ES" | undefined,
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
