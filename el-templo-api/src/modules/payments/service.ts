/**
 * Payment Service
 *
 * Business logic for payment recording, voiding, member balance
 * computation, overdue detection, global payment list with filters,
 * and financial summary reports.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, desc, isNull, isNotNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { NotFoundError, BadRequestError } from "../shared/errors";
import type {
  PaymentDetail,
  RecordPaymentInput,
  MemberBalance,
  PaymentListParams,
  PaymentListItem,
  FinancialSummary,
  OverdueMember,
  PaymentMethod,
} from "./types";

export class PaymentService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  // ─── Record & Void ──────────────────────────────────────────────────────

  /**
   * Record a new payment for a member.
   */
  async recordPayment(
    input: RecordPaymentInput,
    recordedBy: number,
  ): Promise<PaymentDetail> {
    // Validate member exists
    const [member] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, input.memberId));

    if (!member) {
      throw new NotFoundError("Miembro no encontrado");
    }

    // Validate subscription exists if provided
    if (input.subscriptionId) {
      const [sub] = await this.db
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, input.subscriptionId));

      if (!sub) {
        throw new NotFoundError("Suscripcion no encontrada");
      }
    }

    const result = await this.db.insert(schema.payments).values({
      memberId: input.memberId,
      subscriptionId: input.subscriptionId ?? null,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      paymentDate: input.paymentDate,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      recordedBy,
    });

    const paymentId = Number(result[0].insertId);
    const payment = await this.getPaymentById(paymentId);
    if (!payment) {
      throw new Error("Failed to retrieve newly created payment");
    }

    this.log.info(
      {
        paymentId,
        memberId: input.memberId,
        amount: input.amount,
        recordedBy,
      },
      "Payment recorded",
    );

    return payment;
  }

  /**
   * Void a payment. Sets voidedAt, voidedBy, and voidReason.
   * Returns 400 if already voided, 404 if not found.
   */
  async voidPayment(
    paymentId: number,
    reason: string,
    voidedBy: number,
  ): Promise<PaymentDetail> {
    const existing = await this.getPaymentById(paymentId);
    if (!existing) {
      throw new NotFoundError("Pago no encontrado");
    }

    if (existing.voidedAt) {
      throw new BadRequestError("El pago ya fue anulado");
    }

    await this.db
      .update(schema.payments)
      .set({
        voidedAt: new Date(),
        voidedBy,
        voidReason: reason,
      })
      .where(eq(schema.payments.id, paymentId));

    const updated = await this.getPaymentById(paymentId);
    if (!updated) {
      throw new Error("Failed to retrieve voided payment");
    }

    this.log.info({ paymentId, voidedBy, reason }, "Payment voided");

    return updated;
  }

  // ─── Member Payments & Balance ──────────────────────────────────────────

  /**
   * Get all payments for a member, ordered by paymentDate desc.
   * Includes voided payments.
   */
  async getMemberPayments(memberId: number): Promise<PaymentDetail[]> {
    const memberAlias = schema.users;
    const recorderAlias = schema.users;

    const rows = await this.db
      .select({
        id: schema.payments.id,
        memberId: schema.payments.memberId,
        memberFirstName: memberAlias.firstName,
        memberLastName: memberAlias.lastName,
        subscriptionId: schema.payments.subscriptionId,
        planName: schema.subscriptionPlans.name,
        amount: schema.payments.amount,
        paymentMethod: schema.payments.paymentMethod,
        paymentDate: schema.payments.paymentDate,
        reference: schema.payments.reference,
        notes: schema.payments.notes,
        recordedBy: schema.payments.recordedBy,
        recorderFirstName: sql<string | null>`recorder.first_name`,
        recorderLastName: sql<string | null>`recorder.last_name`,
        voidedAt: schema.payments.voidedAt,
        voidedBy: schema.payments.voidedBy,
        voidReason: schema.payments.voidReason,
        createdAt: schema.payments.createdAt,
      })
      .from(schema.payments)
      .innerJoin(memberAlias, eq(memberAlias.id, schema.payments.memberId))
      .leftJoin(
        sql`users as recorder`,
        sql`recorder.id = ${schema.payments.recordedBy}`,
      )
      .leftJoin(
        schema.subscriptions,
        eq(schema.subscriptions.id, schema.payments.subscriptionId),
      )
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(eq(schema.payments.memberId, memberId))
      .orderBy(desc(schema.payments.paymentDate));

    return rows.map((r) => this.mapPaymentRow(r));
  }

  /**
   * Compute member balance for the most recent active/expired subscription.
   * Returns null if member has no subscription.
   */
  async getMemberBalance(memberId: number): Promise<MemberBalance | null> {
    // Find the most recent subscription (active first, then any)
    const [sub] = await this.db
      .select({
        id: schema.subscriptions.id,
        planName: schema.subscriptionPlans.name,
        pricePaid: schema.subscriptions.pricePaid,
        endDate: schema.subscriptions.endDate,
        status: schema.subscriptions.status,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(eq(schema.subscriptions.userId, memberId))
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);

    if (!sub) return null;

    // Sum non-voided payments for this subscription
    const [paymentSum] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.memberId, memberId),
          eq(schema.payments.subscriptionId, sub.id),
          isNull(schema.payments.voidedAt),
        ),
      );

    const totalPaid = Number(paymentSum?.total ?? 0);
    const remaining = Math.max(0, sub.pricePaid - totalPaid);

    const today = new Date().toISOString().split("T")[0];
    const isOverdue =
      sub.endDate !== null && sub.endDate < today && remaining > 0;

    return {
      subscriptionId: sub.id,
      planName: sub.planName,
      pricePaid: sub.pricePaid,
      totalPaid,
      remaining,
      isOverdue,
    };
  }

  // ─── Global Payment List ───────────────────────────────────────────────

  /**
   * Global paginated list of payments with filters.
   */
  async listPayments(
    params: PaymentListParams,
  ): Promise<{ payments: PaymentListItem[]; total: number }> {
    const { branchId, paymentMethod, dateFrom, dateTo, search, page, limit } =
      params;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }

    if (paymentMethod !== undefined) {
      conditions.push(eq(schema.payments.paymentMethod, paymentMethod));
    }

    if (dateFrom !== undefined) {
      conditions.push(sql`${schema.payments.paymentDate} >= ${dateFrom}`);
    }

    if (dateTo !== undefined) {
      conditions.push(sql`${schema.payments.paymentDate} <= ${dateTo}`);
    }

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        sql`(${schema.users.firstName} LIKE ${searchPattern} OR ${schema.users.lastName} LIKE ${searchPattern})`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count
    const [countResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .where(whereClause);

    const total = Number(countResult?.count ?? 0);

    // Rows
    const rows = await this.db
      .select({
        id: schema.payments.id,
        memberId: schema.payments.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        subscriptionId: schema.payments.subscriptionId,
        planName: schema.subscriptionPlans.name,
        amount: schema.payments.amount,
        paymentMethod: schema.payments.paymentMethod,
        paymentDate: schema.payments.paymentDate,
        reference: schema.payments.reference,
        notes: schema.payments.notes,
        recordedBy: schema.payments.recordedBy,
        recorderFirstName: sql<string | null>`recorder.first_name`,
        recorderLastName: sql<string | null>`recorder.last_name`,
        voidedAt: schema.payments.voidedAt,
        voidedBy: schema.payments.voidedBy,
        voidReason: schema.payments.voidReason,
        createdAt: schema.payments.createdAt,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .leftJoin(
        sql`users as recorder`,
        sql`recorder.id = ${schema.payments.recordedBy}`,
      )
      .leftJoin(
        schema.subscriptions,
        eq(schema.subscriptions.id, schema.payments.subscriptionId),
      )
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(whereClause)
      .orderBy(desc(schema.payments.paymentDate))
      .limit(limit)
      .offset(offset);

    return {
      payments: rows.map((r) => this.mapPaymentRow(r)),
      total,
    };
  }

  // ─── Financial Summary ─────────────────────────────────────────────────

  /**
   * Compute financial summary: revenue, outstanding, collection rate,
   * breakdowns by payment method and branch.
   */
  async getFinancialSummary(
    branchId?: number,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<FinancialSummary> {
    // Revenue conditions: non-voided payments within date range
    const revenueConditions: ReturnType<typeof eq>[] = [
      isNull(schema.payments.voidedAt),
    ];

    if (branchId !== undefined) {
      revenueConditions.push(eq(schema.users.branchId, branchId));
    }

    if (dateFrom) {
      revenueConditions.push(
        sql`${schema.payments.paymentDate} >= ${dateFrom}`,
      );
    }

    if (dateTo) {
      revenueConditions.push(sql`${schema.payments.paymentDate} <= ${dateTo}`);
    }

    // If no date range specified, default to current month
    if (!dateFrom && !dateTo) {
      revenueConditions.push(
        sql`MONTH(${schema.payments.paymentDate}) = MONTH(CURDATE()) AND YEAR(${schema.payments.paymentDate}) = YEAR(CURDATE())`,
      );
    }

    const revenueWhere = and(...revenueConditions);

    // Monthly revenue (total)
    const [revenueResult] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .where(revenueWhere);

    const monthlyRevenue = Number(revenueResult?.total ?? 0);

    // Revenue by method
    const methodRows = await this.db
      .select({
        method: schema.payments.paymentMethod,
        total: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .where(revenueWhere)
      .groupBy(schema.payments.paymentMethod);

    const revenueByMethod = { cash: 0, transfer: 0, card: 0 };
    for (const row of methodRows) {
      const method = row.method as PaymentMethod;
      revenueByMethod[method] = Number(row.total);
    }

    // Revenue by branch
    const branchRows = await this.db
      .select({
        branchId: schema.users.branchId,
        branchName: schema.branches.name,
        total: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)`,
      })
      .from(schema.payments)
      .innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(revenueWhere)
      .groupBy(schema.users.branchId, schema.branches.name);

    const revenueByBranch = branchRows.map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName,
      revenue: Number(r.total),
    }));

    // Total outstanding: SUM of remaining balances for active/expired subs
    // where subscription has overdue status
    const overdueConditions: ReturnType<typeof eq>[] = [];
    if (branchId !== undefined) {
      overdueConditions.push(eq(schema.subscriptions.branchId, branchId));
    }

    const overdueWhere =
      overdueConditions.length > 0 ? and(...overdueConditions) : undefined;

    const outstandingRows = await this.db
      .select({
        pricePaid: schema.subscriptions.pricePaid,
        endDate: schema.subscriptions.endDate,
        paid: sql<number>`COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.subscription_id = ${schema.subscriptions.id}
          AND p.voided_at IS NULL
        ), 0)`,
      })
      .from(schema.subscriptions)
      .where(
        overdueWhere
          ? and(sql`${schema.subscriptions.endDate} < CURDATE()`, overdueWhere)
          : sql`${schema.subscriptions.endDate} < CURDATE()`,
      );

    let totalOutstanding = 0;
    let totalOwed = 0;
    let totalCollected = 0;

    for (const row of outstandingRows) {
      const remaining = Math.max(0, row.pricePaid - Number(row.paid));
      if (remaining > 0) {
        totalOutstanding += remaining;
      }
      totalOwed += row.pricePaid;
      totalCollected += Math.min(row.pricePaid, Number(row.paid));
    }

    const collectionRate =
      totalOwed > 0 ? Math.round((totalCollected / totalOwed) * 100) : 100;

    return {
      monthlyRevenue,
      totalOutstanding,
      collectionRate,
      revenueByMethod,
      revenueByBranch,
    };
  }

  // ─── Overdue Detection ─────────────────────────────────────────────────

  /**
   * List members whose subscription is overdue:
   * endDate < today AND SUM(non-voided payments) < pricePaid.
   */
  async getOverdueMembers(branchId?: number): Promise<OverdueMember[]> {
    const conditions: ReturnType<typeof eq>[] = [
      sql`${schema.subscriptions.endDate} < CURDATE()`,
    ];

    if (branchId !== undefined) {
      conditions.push(eq(schema.subscriptions.branchId, branchId));
    }

    const rows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        branchName: schema.branches.name,
        planName: schema.subscriptionPlans.name,
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
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(and(...conditions))
      .having(
        sql`COALESCE((
          SELECT SUM(p2.amount) FROM payments p2
          WHERE p2.subscription_id = ${schema.subscriptions.id}
          AND p2.voided_at IS NULL
        ), 0) < ${schema.subscriptions.pricePaid}`,
      );

    return rows.map((r) => ({
      userId: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      branchName: r.branchName,
      planName: r.planName,
      amountOwed: r.pricePaid,
      amountPaid: Number(r.paid),
      amountDue: Math.max(0, r.pricePaid - Number(r.paid)),
    }));
  }

  /**
   * Count of overdue members.
   */
  async getMorososCount(branchId?: number): Promise<number> {
    const members = await this.getOverdueMembers(branchId);
    return members.length;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  /**
   * Get a single payment by ID with all joins.
   */
  private async getPaymentById(
    paymentId: number,
  ): Promise<PaymentDetail | null> {
    const memberAlias = schema.users;

    const rows = await this.db
      .select({
        id: schema.payments.id,
        memberId: schema.payments.memberId,
        memberFirstName: memberAlias.firstName,
        memberLastName: memberAlias.lastName,
        subscriptionId: schema.payments.subscriptionId,
        planName: schema.subscriptionPlans.name,
        amount: schema.payments.amount,
        paymentMethod: schema.payments.paymentMethod,
        paymentDate: schema.payments.paymentDate,
        reference: schema.payments.reference,
        notes: schema.payments.notes,
        recordedBy: schema.payments.recordedBy,
        recorderFirstName: sql<string | null>`recorder.first_name`,
        recorderLastName: sql<string | null>`recorder.last_name`,
        voidedAt: schema.payments.voidedAt,
        voidedBy: schema.payments.voidedBy,
        voidReason: schema.payments.voidReason,
        createdAt: schema.payments.createdAt,
      })
      .from(schema.payments)
      .innerJoin(memberAlias, eq(memberAlias.id, schema.payments.memberId))
      .leftJoin(
        sql`users as recorder`,
        sql`recorder.id = ${schema.payments.recordedBy}`,
      )
      .leftJoin(
        schema.subscriptions,
        eq(schema.subscriptions.id, schema.payments.subscriptionId),
      )
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(eq(schema.payments.id, paymentId));

    if (rows.length === 0) return null;
    return this.mapPaymentRow(rows[0]);
  }

  /**
   * Map a raw payment join row to PaymentDetail.
   */
  private mapPaymentRow(row: {
    id: number;
    memberId: number;
    memberFirstName: string | null;
    memberLastName: string | null;
    subscriptionId: number | null;
    planName: string | null;
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    reference: string | null;
    notes: string | null;
    recordedBy: number;
    recorderFirstName: string | null;
    recorderLastName: string | null;
    voidedAt: Date | null;
    voidedBy: number | null;
    voidReason: string | null;
    createdAt: Date;
  }): PaymentDetail {
    return {
      id: row.id,
      memberId: row.memberId,
      memberName: [row.memberFirstName, row.memberLastName]
        .filter(Boolean)
        .join(" "),
      subscriptionId: row.subscriptionId,
      planName: row.planName ?? null,
      amount: row.amount,
      paymentMethod: row.paymentMethod as PaymentMethod,
      paymentDate: row.paymentDate,
      reference: row.reference,
      notes: row.notes,
      recordedBy: row.recordedBy,
      recorderName: [row.recorderFirstName, row.recorderLastName]
        .filter(Boolean)
        .join(" "),
      voidedAt: row.voidedAt?.toISOString() ?? null,
      voidedBy: row.voidedBy,
      voidReason: row.voidReason,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
