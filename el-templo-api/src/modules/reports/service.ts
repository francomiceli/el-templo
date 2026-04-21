/**
 * Reports Service
 *
 * Query methods for access log, charge history, expiring memberships,
 * and inactive members reports. All data is read-only.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, isNull, isNotNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type {
  AccessReportFilters,
  AccessReportRow,
  ChargeReportFilters,
  ChargeReportRow,
  ExpiringReportFilters,
  ExpiringReportRow,
  InactiveReportFilters,
  InactiveReportRow,
  PaginatedResult,
} from "./types";

const DAY_LABELS: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mie",
  4: "Jue",
  5: "Vie",
  6: "Sab",
};

export class ReportsService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  // ─── Access Log ───────────────────────────────────────────────────────────

  async getAccessLog(
    filters: AccessReportFilters,
  ): Promise<PaginatedResult<AccessReportRow>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = this.buildAccessConditions(filters);

    // Count total
    // NOTE: join on branches already present; buildAccessConditions may emit
    // `branches.country = ?` so the join must remain on both count + select.
    const [countResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendance.memberId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.attendance.branchId),
      )
      .where(and(...conditions));

    const total = Number(countResult?.count ?? 0);

    // Fetch rows with joins
    const rows = await this.db
      .select({
        id: schema.attendance.id,
        checkedInAt: schema.attendance.checkedInAt,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        memberId: schema.attendance.memberId,
        branchName: schema.branches.name,
        source: schema.attendance.source,
        scheduleId: schema.attendance.scheduleId,
      })
      .from(schema.attendance)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendance.memberId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.attendance.branchId),
      )
      .where(and(...conditions))
      .orderBy(sql`${schema.attendance.checkedInAt} DESC`)
      .limit(limit)
      .offset(offset);

    // Gather schedule IDs that need slot info
    const scheduleIds = rows
      .map((r) => r.scheduleId)
      .filter((id): id is number => id !== null);

    const scheduleMap = new Map<number, string>();
    if (scheduleIds.length > 0) {
      const uniqueIds = [...new Set(scheduleIds)];
      const scheduleRows = await this.db
        .select({
          id: schema.schedules.id,
          dayOfWeek: schema.schedules.dayOfWeek,
          startTime: schema.schedules.startTime,
          activityName: schema.activities.name,
        })
        .from(schema.schedules)
        .innerJoin(
          schema.activities,
          eq(schema.activities.id, schema.schedules.activityId),
        )
        .where(
          sql`${schema.schedules.id} IN (${sql.join(
            uniqueIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );

      for (const s of scheduleRows) {
        const dayLabel = DAY_LABELS[s.dayOfWeek] ?? `D${s.dayOfWeek}`;
        scheduleMap.set(s.id, `${dayLabel} ${s.startTime} - ${s.activityName}`);
      }
    }

    const mappedRows: AccessReportRow[] = rows.map((r) => ({
      id: r.id,
      checkedInAt: r.checkedInAt.toISOString(),
      memberName: `${r.memberFirstName ?? ""} ${r.memberLastName ?? ""}`.trim(),
      memberId: r.memberId,
      branchName: r.branchName,
      source: r.source as "qr" | "manual",
      scheduleSlot: r.scheduleId
        ? (scheduleMap.get(r.scheduleId) ?? null)
        : null,
    }));

    return { rows: mappedRows, total, page, limit };
  }

  // ─── Charge History ───────────────────────────────────────────────────────

  async getChargeHistory(
    filters: ChargeReportFilters,
  ): Promise<PaginatedResult<ChargeReportRow>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const memberAlias = schema.users;
    const recorderAlias = sql`recorder`;

    const conditions = this.buildChargeConditions(filters);

    // Count total — join branches so country filter in buildChargeConditions
    // resolves without reference errors.
    const [countResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.payments)
      .innerJoin(memberAlias, eq(memberAlias.id, schema.payments.memberId))
      .innerJoin(schema.branches, eq(schema.branches.id, memberAlias.branchId))
      .where(and(...conditions));

    const total = Number(countResult?.count ?? 0);

    // Fetch rows — use raw SQL for recorder self-join since drizzle doesn't support
    // multiple aliases on the same table easily. Alias `branches b` so the raw
    // `b.country = ?` predicate from buildChargeConditionsRaw resolves.
    const rows = await this.db.execute(sql`
      SELECT
        p.id,
        p.payment_date AS paymentDate,
        CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, '')) AS memberName,
        p.member_id AS memberId,
        sp.name AS planName,
        p.amount,
        p.currency,
        p.payment_method AS paymentMethod,
        CONCAT(COALESCE(r.first_name, ''), ' ', COALESCE(r.last_name, '')) AS recorderName,
        p.voided_at AS voidedAt
      FROM payments p
      INNER JOIN users m ON m.id = p.member_id
      INNER JOIN branches b ON b.id = m.branch_id
      INNER JOIN subscriptions s ON s.id = p.subscription_id
      INNER JOIN subscription_plans sp ON sp.id = s.plan_id
      INNER JOIN users r ON r.id = p.recorded_by
      WHERE ${this.buildChargeConditionsRaw(filters)}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const resultRows = (rows as unknown as [Array<Record<string, unknown>>])[0];

    const mappedRows: ChargeReportRow[] = (resultRows ?? []).map(
      (r: Record<string, unknown>) => ({
        id: Number(r.id),
        paymentDate: String(r.paymentDate),
        memberName: String(r.memberName).trim(),
        memberId: Number(r.memberId),
        planName: String(r.planName),
        amount: Number(r.amount),
        currency: r.currency ? String(r.currency) : "ARS",
        paymentMethod: String(r.paymentMethod) as "cash" | "transfer" | "card",
        recorderName: String(r.recorderName).trim(),
        voidedAt: r.voidedAt ? String(r.voidedAt) : null,
      }),
    );

    return { rows: mappedRows, total, page, limit };
  }

  // ─── Expiring Memberships ────────────────────────────────────────────────

  async getExpiringMemberships(
    filters: ExpiringReportFilters,
  ): Promise<ExpiringReportRow[]> {
    const daysWindow = filters.daysWindow ?? 7;
    const includeExpired = filters.includeExpired ?? true;

    const statusValues = includeExpired
      ? ["active", "paused", "expired"]
      : ["active", "paused"];

    const conditions: ReturnType<typeof sql>[] = [
      sql`${schema.subscriptions.status} IN (${sql.join(
        statusValues.map((s) => sql`${s}`),
        sql`, `,
      )})`,
      sql`${schema.subscriptions.endDate} IS NOT NULL`,
      sql`${schema.subscriptions.endDate} <= DATE_ADD(CURDATE(), INTERVAL ${daysWindow} DAY)`,
    ];

    if (!includeExpired) {
      // Only show those not yet expired
      conditions.push(sql`${schema.subscriptions.endDate} >= CURDATE()`);
    }

    if (filters.branchId !== undefined) {
      conditions.push(eq(schema.subscriptions.branchId, filters.branchId));
    }

    if (filters.country !== undefined) {
      conditions.push(eq(schema.branches.country, filters.country));
    }

    const rows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        planName: schema.subscriptionPlans.name,
        endDate: schema.subscriptions.endDate,
        phone: schema.users.phone,
        currency: schema.subscriptions.currency,
        daysRemaining: sql<number>`DATEDIFF(${schema.subscriptions.endDate}, CURDATE())`,
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
      .where(and(...conditions))
      .orderBy(sql`DATEDIFF(${schema.subscriptions.endDate}, CURDATE()) ASC`);

    return rows.map((r) => ({
      userId: r.userId,
      memberName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      planName: r.planName,
      endDate: r.endDate ?? "",
      daysRemaining: Number(r.daysRemaining),
      phone: r.phone,
      currency: r.currency ?? "ARS",
    }));
  }

  // ─── Inactive Members ────────────────────────────────────────────────────

  async getInactiveMembers(
    filters: InactiveReportFilters,
  ): Promise<InactiveReportRow[]> {
    const daysThreshold = filters.daysThreshold ?? 14;

    const branchCondition =
      filters.branchId !== undefined
        ? sql`AND s.branch_id = ${filters.branchId}`
        : sql``;

    const countryCondition =
      filters.country !== undefined
        ? sql`AND b.country = ${filters.country}`
        : sql``;

    const rows = await this.db.execute(sql`
      SELECT
        s.user_id AS userId,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS memberName,
        sp.name AS planName,
        MAX(a.checked_in_at) AS lastCheckIn,
        u.phone,
        s.start_date AS startDate
      FROM subscriptions s
      INNER JOIN users u ON u.id = s.user_id
      INNER JOIN branches b ON b.id = s.branch_id
      INNER JOIN subscription_plans sp ON sp.id = s.plan_id
      LEFT JOIN attendance a ON a.member_id = s.user_id
      WHERE s.subscription_status IN ('active', 'paused')
        ${branchCondition}
        ${countryCondition}
      GROUP BY s.user_id, u.first_name, u.last_name, sp.name, u.phone, s.start_date
      HAVING lastCheckIn IS NULL
        OR DATEDIFF(CURDATE(), lastCheckIn) >= ${daysThreshold}
      ORDER BY
        CASE WHEN lastCheckIn IS NULL
          THEN DATEDIFF(CURDATE(), s.start_date)
          ELSE DATEDIFF(CURDATE(), lastCheckIn)
        END DESC
    `);

    const resultRows = (rows as unknown as [Array<Record<string, unknown>>])[0];

    return (resultRows ?? []).map((r: Record<string, unknown>) => {
      const lastCheckIn = r.lastCheckIn ? String(r.lastCheckIn) : null;
      const startDate = String(r.startDate);

      // Calculate daysSinceCheckIn
      let daysSinceCheckIn: number;
      if (lastCheckIn) {
        const checkInDate = new Date(lastCheckIn);
        const now = new Date();
        daysSinceCheckIn = Math.floor(
          (now.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24),
        );
      } else {
        const start = new Date(startDate);
        const now = new Date();
        daysSinceCheckIn = Math.floor(
          (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      return {
        userId: Number(r.userId),
        memberName: String(r.memberName).trim(),
        planName: String(r.planName),
        lastCheckIn,
        daysSinceCheckIn,
        phone: r.phone ? String(r.phone) : null,
      };
    });
  }

  // ─── Export Methods (no pagination) ───────────────────────────────────────

  async exportAccessLog(
    filters: AccessReportFilters,
  ): Promise<AccessReportRow[]> {
    const result = await this.getAccessLog({
      ...filters,
      page: 1,
      limit: 100000,
    });
    return result.rows;
  }

  async exportChargeHistory(
    filters: ChargeReportFilters,
  ): Promise<ChargeReportRow[]> {
    const result = await this.getChargeHistory({
      ...filters,
      page: 1,
      limit: 100000,
    });
    return result.rows;
  }

  async exportExpiringMemberships(
    filters: ExpiringReportFilters,
  ): Promise<ExpiringReportRow[]> {
    return this.getExpiringMemberships(filters);
  }

  async exportInactiveMembers(
    filters: InactiveReportFilters,
  ): Promise<InactiveReportRow[]> {
    return this.getInactiveMembers(filters);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private buildAccessConditions(
    filters: AccessReportFilters,
  ): ReturnType<typeof sql>[] {
    const conditions: ReturnType<typeof sql>[] = [sql`1 = 1`];

    if (filters.branchId !== undefined) {
      conditions.push(eq(schema.attendance.branchId, filters.branchId));
    }

    if (filters.country !== undefined) {
      conditions.push(eq(schema.branches.country, filters.country));
    }

    if (filters.dateFrom) {
      conditions.push(
        sql`DATE(${schema.attendance.checkedInAt}) >= ${filters.dateFrom}`,
      );
    }

    if (filters.dateTo) {
      conditions.push(
        sql`DATE(${schema.attendance.checkedInAt}) <= ${filters.dateTo}`,
      );
    }

    if (filters.source) {
      conditions.push(eq(schema.attendance.source, filters.source));
    }

    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        sql`(CONCAT(COALESCE(${schema.users.firstName}, ''), ' ', COALESCE(${schema.users.lastName}, '')) LIKE ${searchTerm} OR ${schema.users.dni} LIKE ${searchTerm})`,
      );
    }

    return conditions;
  }

  private buildChargeConditions(
    filters: ChargeReportFilters,
  ): ReturnType<typeof sql>[] {
    const conditions: ReturnType<typeof sql>[] = [sql`1 = 1`];

    if (filters.branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, filters.branchId));
    }

    if (filters.country !== undefined) {
      conditions.push(eq(schema.branches.country, filters.country));
    }

    if (filters.dateFrom) {
      conditions.push(
        sql`${schema.payments.paymentDate} >= ${filters.dateFrom}`,
      );
    }

    if (filters.dateTo) {
      conditions.push(sql`${schema.payments.paymentDate} <= ${filters.dateTo}`);
    }

    if (filters.paymentMethod) {
      conditions.push(eq(schema.payments.paymentMethod, filters.paymentMethod));
    }

    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        sql`(CONCAT(COALESCE(${schema.users.firstName}, ''), ' ', COALESCE(${schema.users.lastName}, '')) LIKE ${searchTerm} OR ${schema.users.dni} LIKE ${searchTerm})`,
      );
    }

    return conditions;
  }

  private buildChargeConditionsRaw(
    filters: ChargeReportFilters,
  ): ReturnType<typeof sql> {
    const parts: ReturnType<typeof sql>[] = [sql`1 = 1`];

    if (filters.branchId !== undefined) {
      parts.push(sql`m.branch_id = ${filters.branchId}`);
    }

    if (filters.country !== undefined) {
      parts.push(sql`b.country = ${filters.country}`);
    }

    if (filters.dateFrom) {
      parts.push(sql`p.payment_date >= ${filters.dateFrom}`);
    }

    if (filters.dateTo) {
      parts.push(sql`p.payment_date <= ${filters.dateTo}`);
    }

    if (filters.paymentMethod) {
      parts.push(sql`p.payment_method = ${filters.paymentMethod}`);
    }

    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      parts.push(
        sql`(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, '')) LIKE ${searchTerm} OR m.dni LIKE ${searchTerm})`,
      );
    }

    return sql.join(parts, sql` AND `);
  }
}
