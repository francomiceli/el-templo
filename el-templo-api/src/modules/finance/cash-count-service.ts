// Module: finance — Arqueos / cierre de caja (feedback caja/cobros 2026-09-08)
//
// El profe, al terminar (check-out de Mi jornada), cuenta la plata de la caja
// de efectivo de su sede. El sistema le muestra lo que ESPERA en el cajón:
//
//   esperado = fondo de cambio + saldo firme + cobros pendientes de validación
//
// (la plata de un cobro del profe está en el cajón aunque gestión no lo haya
// validado todavía — por eso el pendiente entra acá y NUNCA en el saldo firme).
// El profe carga lo contado; si difiere, deja una nota y cierra igual. El
// arqueo es una OBSERVACIÓN: no toca financial_transactions. La diferencia la
// ve gestión (pestaña Retiros / listado de arqueos) y decide si asienta un
// ajuste manual.
//
// No hay turno mañana/tarde (opción A, decisión de Franco 2026-09-08): cada
// arqueo muestra lo cobrado desde el arqueo anterior de ESA caja. Si nadie
// cerró antes, el siguiente incluye todo. Solo cajas de efectivo.
//
// 2026-09-09 — el esperado se recalcula siempre desde el corte de la caja, así
// que si gestión ANULA un cobro que el profe ya contó en un cierre anterior,
// el esperado siguiente baja sin que nadie haya retirado plata. Para que ese
// descuadre no quede mudo, `getExpected` lista además los cobros que estaban
// en el cajón al último cierre y se anularon después (`voidedSinceLastCount`).
// Sigue sin tocar el ledger ni el arqueo ya guardado: los arqueos son
// append-only y lo anulado se deriva por fechas (created_at ≤ último cierre <
// voided_at), no hace falta una tabla puente.
//
// OJO relojes: drizzle escribe los timestamps que vienen de JS (voided_at,
// validated_at, y desde hoy counted_at) en reloj UTC, mientras que los
// `defaultNow()` del DB (created_at) van en el reloj de la sesión MySQL. Si el
// server no está en UTC (WSL local: -03) mezclarlos corre horas. Por eso cada
// comparación se hace dentro de UNA familia: `created_at` de los cobros contra
// `created_at` del arqueo (DB vs DB) y `voided_at` contra `counted_at` (JS vs
// JS). Las dos columnas del arqueo se escriben en el mismo INSERT, así que
// representan el mismo instante en los dos relojes.

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import type { PaginatedResult } from "../shared/types";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import type { CashRegisterService } from "./cash-register-service";
import type {
  CashCountExpected,
  CashCountListFilters,
  CashCountListItem,
  CashCountPaymentItem,
  CashCountSummary,
  CashCountVoidedItem,
  RegisterCashCountInput,
  TransactionKind,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

const MEMBER_INFLOW_KINDS: ReadonlyArray<TransactionKind> = [
  "plan_charge",
  "debt_settlement",
  "advance_payment",
];

interface CajaRef {
  id: number;
  name: string;
  type: "efectivo" | "banco";
  currency: string;
  branchId: number | null;
  changeFund: number;
}

interface LastCountRef {
  summary: CashCountSummary;
  /** Reloj JS (drizzle → UTC): comparar solo con voided_at / validated_at. */
  countedAt: Date;
  /** Reloj del DB (defaultNow): comparar solo con created_at de los cobros. */
  createdAt: Date;
}

export class CashCountService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly cashRegisterService: CashRegisterService,
  ) {}

  private async loadCaja(ctx: TenantContext, cajaId: number): Promise<CajaRef> {
    const [caja] = await this.db
      .select({
        id: schema.cashRegisters.id,
        name: schema.cashRegisters.name,
        type: schema.cashRegisters.type,
        currency: schema.cashRegisters.currency,
        branchId: schema.cashRegisters.branchId,
        changeFund: schema.cashRegisters.changeFund,
        isActive: schema.cashRegisters.isActive,
      })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, cajaId),
        ),
      )
      .limit(1);
    if (!caja) throw new NotFoundError("Caja no encontrada");
    if (!caja.isActive) throw new BadRequestError("La caja está dada de baja");
    if (caja.type !== "efectivo") {
      throw new BadRequestError("Solo se arquean cajas de efectivo");
    }
    return caja;
  }

  /**
   * Caja de efectivo activa de una sede en una moneda. El profe no elige
   * caja: opera sobre la de su sede. NotFound si la sede no tiene caja.
   */
  async resolveCajaForBranch(
    ctx: TenantContext,
    branchId: number,
    currency = "ARS",
  ): Promise<number> {
    const [caja] = await this.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.type, "efectivo"),
          eq(schema.cashRegisters.branchId, branchId),
          eq(schema.cashRegisters.currency, currency),
          eq(schema.cashRegisters.isActive, true),
        ),
      )
      .limit(1);
    if (!caja) {
      throw new NotFoundError("La sede no tiene caja de efectivo");
    }
    return caja.id;
  }

  /**
   * Último arqueo de la caja con sus dos marcas del mismo instante:
   * `countedAt` (escrita desde JS, comparable con voided_at) y `createdAt`
   * (defaultNow del DB, comparable con created_at de los cobros).
   */
  private async lastCount(
    ctx: TenantContext,
    cajaId: number,
  ): Promise<LastCountRef | null> {
    const [row] = await this.db
      .select({
        id: schema.cashCounts.id,
        countedAt: schema.cashCounts.countedAt,
        createdAt: schema.cashCounts.createdAt,
        countedBy: schema.cashCounts.countedBy,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        expectedAmount: schema.cashCounts.expectedAmount,
        countedAmount: schema.cashCounts.countedAmount,
        difference: schema.cashCounts.difference,
        notes: schema.cashCounts.notes,
      })
      .from(schema.cashCounts)
      .leftJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.cashCounts.countedBy),
        ),
      )
      .where(
        and(
          tenantWhere(schema.cashCounts, ctx),
          eq(schema.cashCounts.cashRegisterId, cajaId),
        ),
      )
      .orderBy(desc(schema.cashCounts.countedAt), desc(schema.cashCounts.id))
      .limit(1);
    if (!row) return null;
    return {
      summary: {
        id: row.id,
        countedAt: row.countedAt.toISOString(),
        countedBy: row.countedBy,
        counterName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
        expectedAmount: row.expectedAmount,
        countedAmount: row.countedAmount,
        difference: row.difference,
        notes: row.notes,
      },
      countedAt: row.countedAt,
      createdAt: row.createdAt,
    };
  }

  /** Cobros en efectivo (no anulados, cualquier estado) cargados después del último arqueo. */
  private async paymentsSince(
    ctx: TenantContext,
    cajaId: number,
    last: LastCountRef | null,
  ): Promise<CashCountPaymentItem[]> {
    const conds = [isNull(schema.financialTransactions.voidedAt)];
    if (last) conds.push(gt(schema.financialTransactions.createdAt, last.createdAt));
    const rows = await this.queryCashPayments(ctx, cajaId, conds, "createdAt");
    return rows.map(({ voidedAt: _voidedAt, voidReason: _voidReason, ...p }) => p);
  }

  /**
   * Cobros que ya estaban en el cajón al último cierre (`created_at ≤` el del
   * arqueo, reloj DB) y se anularon después (`voided_at >` counted_at, reloj
   * JS). Incluye los "corregidos" (la corrección anula el original y crea
   * otro, que aparece como nuevo). Sin cierre previo no hay nada que explicar.
   */
  private async voidedSince(
    ctx: TenantContext,
    cajaId: number,
    last: LastCountRef | null,
  ): Promise<CashCountVoidedItem[]> {
    if (!last) return [];
    const rows = await this.queryCashPayments(
      ctx,
      cajaId,
      [
        isNotNull(schema.financialTransactions.voidedAt),
        gt(schema.financialTransactions.voidedAt, last.countedAt),
        lte(schema.financialTransactions.createdAt, last.createdAt),
      ],
      "voidedAt",
    );
    return rows.flatMap((r) =>
      r.voidedAt === null ? [] : [{ ...r, voidedAt: r.voidedAt }],
    );
  }

  /**
   * Query compartida de cobros en efectivo de socio imputados a la caja.
   * `extraConds` distingue vivos-desde-X de anulados-después-de-X.
   */
  private async queryCashPayments(
    ctx: TenantContext,
    cajaId: number,
    extraConds: SQL[],
    orderBy: "createdAt" | "voidedAt",
  ): Promise<Array<CashCountPaymentItem & { voidedAt: string | null; voidReason: string | null }>> {
    const recorder = alias(schema.users, "recorder");
    const conds = [
      tenantWhere(schema.financialTransactions, ctx),
      eq(schema.financialTransactions.cashRegisterId, cajaId),
      eq(schema.financialTransactions.direction, "inflow"),
      eq(schema.financialTransactions.paymentMethod, "cash"),
      inArray(schema.financialTransactions.kind, [...MEMBER_INFLOW_KINDS]),
      ...extraConds,
    ];
    const rows = await this.db
      .select({
        id: schema.financialTransactions.id,
        transactionDate: schema.financialTransactions.transactionDate,
        createdAt: schema.financialTransactions.createdAt,
        voidedAt: schema.financialTransactions.voidedAt,
        voidReason: schema.financialTransactions.voidReason,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        amount: schema.financialTransactions.amount,
        currency: schema.financialTransactions.currency,
        notes: schema.financialTransactions.notes,
        validationStatus: schema.financialTransactions.validationStatus,
        recorderFirstName: recorder.firstName,
        recorderLastName: recorder.lastName,
        // Concepto: plan imputado por link. Literal (no `${schema.x.col}`)
        // porque en .select() drizzle no califica y la correlación se rompe.
        planName: sql<string | null>`(
          SELECT sp.name FROM transaction_links tl
          JOIN subscriptions s ON s.id = tl.target_id
          JOIN subscription_plans sp ON sp.id = s.plan_id
          WHERE tl.tenant_id = ${ctx.tenantId}
            AND s.tenant_id = ${ctx.tenantId}
            AND sp.tenant_id = ${ctx.tenantId}
            AND tl.target_kind = 'subscription'
            AND tl.transaction_id = financial_transactions.id
          LIMIT 1
        )`,
      })
      .from(schema.financialTransactions)
      .leftJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.financialTransactions.memberId),
        ),
      )
      .leftJoin(
        recorder,
        and(
          tenantWhere(recorder, ctx),
          eq(recorder.id, schema.financialTransactions.recordedBy),
        ),
      )
      .where(and(...conds))
      .orderBy(
        orderBy === "voidedAt"
          ? asc(schema.financialTransactions.voidedAt)
          : asc(schema.financialTransactions.createdAt),
        asc(schema.financialTransactions.id),
      );
    return rows.map((r) => ({
      id: r.id,
      transactionDate: String(r.transactionDate),
      createdAt: r.createdAt.toISOString(),
      voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
      voidReason: r.voidReason,
      memberName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      amount: r.amount,
      currency: r.currency,
      concept: r.planName ?? r.notes ?? null,
      validationStatus: r.validationStatus,
      recorderName:
        `${r.recorderFirstName ?? ""} ${r.recorderLastName ?? ""}`.trim(),
    }));
  }

  /** Lo que el profe ve antes de contar. */
  async getExpected(
    ctx: TenantContext,
    cajaId: number,
  ): Promise<CashCountExpected> {
    const caja = await this.loadCaja(ctx, cajaId);
    const balance = await this.cashRegisterService.getBalance(ctx, caja.id);
    const last = await this.lastCount(ctx, caja.id);
    const [payments, voided] = await Promise.all([
      this.paymentsSince(ctx, caja.id, last),
      this.voidedSince(ctx, caja.id, last),
    ]);
    return {
      cashRegisterId: caja.id,
      cashRegisterName: caja.name,
      branchId: caja.branchId,
      currency: caja.currency,
      changeFund: caja.changeFund,
      firmeAmount: balance.firmeBalance,
      pendienteAmount: balance.pendienteAmount,
      expectedAmount:
        caja.changeFund + balance.firmeBalance + balance.pendienteAmount,
      lastCount: last ? last.summary : null,
      paymentsSinceLastCount: payments,
      paymentsSinceLastCountTotal: payments.reduce((a, p) => a + p.amount, 0),
      voidedSinceLastCount: voided,
      voidedSinceLastCountTotal: voided.reduce((a, p) => a + p.amount, 0),
    };
  }

  /**
   * Registrar el conteo. El esperado se recalcula ACÁ (nunca viene del body).
   * Diferencia ≠ 0 exige nota. No traba: se cierra igual.
   */
  async registerCount(
    ctx: TenantContext,
    input: RegisterCashCountInput,
    userId: number,
  ): Promise<CashCountListItem> {
    if (!Number.isInteger(input.countedAmount) || input.countedAmount < 0) {
      throw new BadRequestError("El monto contado no puede ser negativo");
    }
    const expected = await this.getExpected(ctx, input.cajaId);
    const difference = input.countedAmount - expected.expectedAmount;
    const notes = input.notes?.trim() ? input.notes.trim() : null;
    if (difference !== 0 && !notes) {
      throw new BadRequestError(
        `La plata contada difiere del esperado en ${difference > 0 ? "+" : ""}${difference}: indicá el motivo en las notas`,
      );
    }
    let staffShiftId: number | null = null;
    if (input.staffShiftId !== undefined) {
      const [shift] = await this.db
        .select({ id: schema.staffShifts.id })
        .from(schema.staffShifts)
        .where(
          and(
            tenantWhere(schema.staffShifts, ctx),
            eq(schema.staffShifts.id, input.staffShiftId),
            eq(schema.staffShifts.userId, userId),
          ),
        )
        .limit(1);
      if (!shift) throw new NotFoundError("Jornada no encontrada");
      staffShiftId = shift.id;
    }
    const inserted = await this.db.insert(schema.cashCounts).values(
      tenantValues(ctx, {
        cashRegisterId: expected.cashRegisterId,
        countedBy: userId,
        // Explícito desde JS (no defaultNow) para que viva en el mismo reloj
        // que voided_at: es contra lo que se compara en voidedSince.
        countedAt: new Date(),
        staffShiftId,
        changeFund: expected.changeFund,
        firmeAmount: expected.firmeAmount,
        pendienteAmount: expected.pendienteAmount,
        expectedAmount: expected.expectedAmount,
        countedAmount: input.countedAmount,
        difference,
        paymentsCount: expected.paymentsSinceLastCount.length,
        notes,
      }),
    );
    const id = Number(inserted[0].insertId);
    this.log.info(
      {
        cashCountId: id,
        cajaId: expected.cashRegisterId,
        expected: expected.expectedAmount,
        counted: input.countedAmount,
        difference,
        userId,
      },
      "Cash count registered",
    );
    const row = await this.getById(ctx, id);
    if (!row) throw new NotFoundError("Arqueo no encontrado");
    return row;
  }

  async getById(
    ctx: TenantContext,
    id: number,
  ): Promise<CashCountListItem | null> {
    const { rows } = await this.list(ctx, { isOwner: true, id, limit: 1 });
    return rows[0] ?? null;
  }

  /** Historial para gestión. Scope de país igual que retiros/saldos. */
  async list(
    ctx: TenantContext,
    filters: CashCountListFilters & { id?: number },
  ): Promise<PaginatedResult<CashCountListItem>> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;

    const conds = [tenantWhere(schema.cashCounts, ctx)];
    if (filters.id !== undefined) conds.push(eq(schema.cashCounts.id, filters.id));
    if (filters.cashRegisterId !== undefined) {
      conds.push(eq(schema.cashCounts.cashRegisterId, filters.cashRegisterId));
    }
    if (filters.branchId !== undefined) {
      conds.push(eq(schema.cashRegisters.branchId, filters.branchId));
    }
    if (filters.dateFrom !== undefined) {
      conds.push(gte(schema.cashCounts.countedAt, new Date(`${filters.dateFrom}T00:00:00`)));
    }
    if (filters.dateTo !== undefined) {
      conds.push(lte(schema.cashCounts.countedAt, new Date(`${filters.dateTo}T23:59:59`)));
    }
    if (!filters.isOwner) {
      conds.push(isNotNull(schema.branches.id));
      if (filters.country !== undefined) {
        conds.push(eq(schema.branches.country, filters.country));
      }
    } else if (filters.country !== undefined) {
      const c = or(
        isNull(schema.branches.id),
        eq(schema.branches.country, filters.country),
      );
      if (c) conds.push(c);
    }

    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.cashCounts)
      .innerJoin(
        schema.cashRegisters,
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, schema.cashCounts.cashRegisterId),
        ),
      )
      .leftJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.cashRegisters.branchId),
        ),
      )
      .where(and(...conds));
    const total = Number(countRow?.count ?? 0);

    const raw = await this.db
      .select({
        id: schema.cashCounts.id,
        countedAt: schema.cashCounts.countedAt,
        countedBy: schema.cashCounts.countedBy,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        expectedAmount: schema.cashCounts.expectedAmount,
        countedAmount: schema.cashCounts.countedAmount,
        difference: schema.cashCounts.difference,
        notes: schema.cashCounts.notes,
        cashRegisterId: schema.cashCounts.cashRegisterId,
        cashRegisterName: schema.cashRegisters.name,
        branchId: schema.cashRegisters.branchId,
        branchName: schema.branches.name,
        currency: schema.cashRegisters.currency,
        changeFund: schema.cashCounts.changeFund,
        firmeAmount: schema.cashCounts.firmeAmount,
        pendienteAmount: schema.cashCounts.pendienteAmount,
        paymentsCount: schema.cashCounts.paymentsCount,
        staffShiftId: schema.cashCounts.staffShiftId,
      })
      .from(schema.cashCounts)
      .innerJoin(
        schema.cashRegisters,
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, schema.cashCounts.cashRegisterId),
        ),
      )
      .leftJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.cashRegisters.branchId),
        ),
      )
      .leftJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.cashCounts.countedBy),
        ),
      )
      .where(and(...conds))
      .orderBy(desc(schema.cashCounts.countedAt), desc(schema.cashCounts.id))
      .limit(limit)
      .offset(offset);

    const rows: CashCountListItem[] = raw.map((r) => ({
      id: r.id,
      countedAt: r.countedAt.toISOString(),
      countedBy: r.countedBy,
      counterName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      expectedAmount: r.expectedAmount,
      countedAmount: r.countedAmount,
      difference: r.difference,
      notes: r.notes,
      cashRegisterId: r.cashRegisterId,
      cashRegisterName: r.cashRegisterName,
      branchId: r.branchId,
      branchName: r.branchName,
      currency: r.currency,
      changeFund: r.changeFund,
      firmeAmount: r.firmeAmount,
      pendienteAmount: r.pendienteAmount,
      paymentsCount: r.paymentsCount,
      staffShiftId: r.staffShiftId,
    }));
    return { rows, total, page, limit };
  }
}
