/**
 * Payment Service
 *
 * Business logic for payment recording, voiding, global payment list
 * with filters, and financial summary reports.
 *
 * All payments are subscription-linked (subscriptionId NOT NULL).
 * Voided payments are excluded from list and summary views.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, desc, isNull, isNotNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { NotFoundError, BadRequestError } from "../shared/errors";
import type {
  PaymentDetail,
  RecordPaymentInput,
  PaymentListParams,
  PaymentListItem,
  FinancialSummary,
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

    // Validate subscription exists
    const [sub] = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, input.subscriptionId));

    if (!sub) {
      throw new NotFoundError("Suscripcion no encontrada");
    }

    const result = await this.db.insert(schema.payments).values({
      memberId: input.memberId,
      subscriptionId: input.subscriptionId,
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

  // ─── Member Payments ─────────────────────────────────────────────────────

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

  // ─── Global Payment List ───────────────────────────────────────────────

  /**
   * Global paginated list of payments with filters.
   * Excludes voided payments. Only shows subscription-linked payments.
   */
  async listPayments(
    params: PaymentListParams,
  ): Promise<{ payments: PaymentListItem[]; total: number }> {
    const { branchId, paymentMethod, dateFrom, dateTo, search, page, limit } =
      params;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [
      isNull(schema.payments.voidedAt),
      isNotNull(schema.payments.subscriptionId),
    ];

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

    const whereClause = and(...conditions);

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
   * Compute financial summary: revenue breakdowns by payment method and branch.
   * Only includes non-voided, subscription-linked payments.
   */
  async getFinancialSummary(
    branchId?: number,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<FinancialSummary> {
    // Revenue conditions: non-voided, subscription-linked payments within date range
    const revenueConditions: ReturnType<typeof eq>[] = [
      isNull(schema.payments.voidedAt),
      isNotNull(schema.payments.subscriptionId),
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

    return {
      monthlyRevenue,
      revenueByMethod,
      revenueByBranch,
    };
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
      subscriptionId: row.subscriptionId!,
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
