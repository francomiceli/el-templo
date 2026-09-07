// Module: finance — Retiros de caja (feedback caja/cobros 2026-09-07)
//
// Un retiro es la plata que alguien (el dueño, o quien retira por su cuenta)
// se lleva de una caja. Contablemente sigue siendo un `expense` con el centro
// de costo "Retiros" (así lo quiso Martín: "los retiros son una categoría
// dentro de egresos, lo veo ok"), pero con dos cosas que un egreso común no
// tiene:
//
//   1. `responsible_name` obligatorio — quién se llevó la plata.
//   2. En una caja de EFECTIVO, vínculos (transaction_links, targetKind
//      'transaction') a los cobros en efectivo que se retiraron. El monto del
//      retiro es la suma de esos cobros: replica el Excel "Control de caja
//      efectivo" (tildar Check/Retiro por cobro y acumular). Un cobro con un
//      retiro activo está "retirado": no se puede anular ni volver a retirar.
//      Anular el retiro (POST /expenses/:id/void) libera sus cobros.
//
// En una cuenta BANCO no hay cajón que contar: el retiro lleva monto explícito
// y sin vínculos.
//
// Los egresos manuales con centro "Retiros" quedan bloqueados en
// MovementService.registerExpense — un retiro siempre entra por acá.
//
// NO toca `balances` (targetKind 'transaction' es de proveniencia, applyDelta
// lo ignora — mismo patrón que cash_transfer/adjustment).

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
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
import type { TxHandle } from "./balance-service";
import type { TransactionService } from "./transaction-service";
import { firmMoneyConditions } from "./firm-money";
import type {
  PendingWithdrawalResult,
  RegisterWithdrawalInput,
  TransactionKind,
  WithdrawalDetail,
  WithdrawalListFilters,
  WithdrawalListItem,
  WithdrawalPaymentItem,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** Nombre canónico del centro de costo de retiros (sembrado en la mig 0163). */
export const RETIROS_COST_CENTER_NAME = "Retiros";

/** Kinds de cobro de socio que pueden estar en el cajón y por lo tanto retirarse. */
const MEMBER_INFLOW_KINDS: ReadonlyArray<TransactionKind> = [
  "plan_charge",
  "debt_settlement",
  "advance_payment",
];

/** Roles cuyos nombres se ofrecen como sugerencia de responsable. */
const STAFF_ROLES = ["owner", "admin", "gestion", "recepcion", "coach"] as const;

interface CajaRef {
  id: number;
  name: string;
  type: "efectivo" | "banco";
  currency: string;
  branchId: number | null;
  branchCountry: string | null;
}

/**
 * Subquery escalar: id del retiro ACTIVO (expense no anulado) que incluye el
 * cobro `financial_transactions.id` de la query externa. Escrita con nombres
 * literales (no `${schema.x.col}`) porque dentro de `.select()` drizzle
 * renderiza esas referencias sin calificar y la correlación se rompe
 * (reference_drizzle_select_unqualified_columns). Cada tabla strict lleva su
 * tenant_id para el sentinel de tenancy.
 */
function activeWithdrawalIdSql(ctx: TenantContext) {
  return sql<number | null>`(
    SELECT w.id FROM transaction_links tl
    JOIN financial_transactions w ON w.id = tl.transaction_id
    WHERE tl.tenant_id = ${ctx.tenantId}
      AND w.tenant_id = ${ctx.tenantId}
      AND tl.target_kind = 'transaction'
      AND tl.target_id = financial_transactions.id
      AND w.kind = 'expense'
      AND w.responsible_name IS NOT NULL
      AND w.voided_at IS NULL
    ORDER BY w.id DESC
    LIMIT 1
  )`;
}

/** Misma correlación, pero devuelve la fecha del retiro activo. */
function activeWithdrawalDateSql(ctx: TenantContext) {
  return sql<string | null>`(
    SELECT w.transaction_date FROM transaction_links tl
    JOIN financial_transactions w ON w.id = tl.transaction_id
    WHERE tl.tenant_id = ${ctx.tenantId}
      AND w.tenant_id = ${ctx.tenantId}
      AND tl.target_kind = 'transaction'
      AND tl.target_id = financial_transactions.id
      AND w.kind = 'expense'
      AND w.responsible_name IS NOT NULL
      AND w.voided_at IS NULL
    ORDER BY w.id DESC
    LIMIT 1
  )`;
}

/**
 * Subquery escalar: concepto del cobro — nombre del plan imputado por link de
 * suscripción. Para un cobro suelto (sin link) cae a `notes` en TS.
 */
function planNameSql(ctx: TenantContext) {
  return sql<string | null>`(
    SELECT sp.name FROM transaction_links tl2
    JOIN subscriptions s ON s.id = tl2.target_id
    JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE tl2.tenant_id = ${ctx.tenantId}
      AND s.tenant_id = ${ctx.tenantId}
      AND sp.tenant_id = ${ctx.tenantId}
      AND tl2.target_kind = 'subscription'
      AND tl2.transaction_id = financial_transactions.id
    LIMIT 1
  )`;
}

export { activeWithdrawalIdSql, activeWithdrawalDateSql };

export class WithdrawalService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly txnService: TransactionService,
  ) {}

  // ---------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------

  private async loadCaja(ctx: TenantContext, cajaId: number): Promise<CajaRef> {
    const [caja] = await this.db
      .select({
        id: schema.cashRegisters.id,
        name: schema.cashRegisters.name,
        type: schema.cashRegisters.type,
        currency: schema.cashRegisters.currency,
        branchId: schema.cashRegisters.branchId,
        isActive: schema.cashRegisters.isActive,
        branchCountry: schema.branches.country,
      })
      .from(schema.cashRegisters)
      // Filtro de la sede en el ON, nunca en el WHERE: en el WHERE el LEFT se
      // vuelve INNER y las cajas sin sede (Central, banco) dejan de resolver.
      .leftJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.cashRegisters.branchId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, cajaId),
        ),
      )
      .limit(1);
    if (!caja) {
      throw new NotFoundError("Caja no encontrada");
    }
    if (!caja.isActive) {
      throw new BadRequestError("La caja está dada de baja");
    }
    return {
      id: caja.id,
      name: caja.name,
      type: caja.type,
      currency: caja.currency,
      branchId: caja.branchId,
      branchCountry: caja.branchCountry,
    };
  }

  /**
   * Centro de costo "Retiros" del país de la caja (o del gimnasio si la caja
   * no tiene sede). Si no existe se crea: el catálogo se siembra por país y
   * una sede nueva de otro país (ES) no lo trae. Idempotente.
   */
  private async resolveRetirosCostCenter(
    ctx: TenantContext,
    tx: TxHandle,
    caja: CajaRef,
  ): Promise<number> {
    const country = caja.branchCountry ?? (caja.currency === "EUR" ? "ES" : "AR");
    const [byCountry] = await tx
      .select({ id: schema.costCenters.id, isActive: schema.costCenters.isActive })
      .from(schema.costCenters)
      .where(
        and(
          tenantWhere(schema.costCenters, ctx),
          eq(schema.costCenters.name, RETIROS_COST_CENTER_NAME),
          eq(schema.costCenters.country, country),
        ),
      )
      .limit(1);
    if (byCountry) {
      if (!byCountry.isActive) {
        // Un retiro no puede quedar sin categoría porque alguien desactivó el
        // centro: se reactiva (es el centro reservado del sistema).
        await tx
          .update(schema.costCenters)
          .set({ isActive: true })
          .where(
            and(
              tenantWhere(schema.costCenters, ctx),
              eq(schema.costCenters.id, byCountry.id),
            ),
          );
      }
      return byCountry.id;
    }
    const inserted = await tx.insert(schema.costCenters).values(
      tenantValues(ctx, {
        name: RETIROS_COST_CENTER_NAME,
        country,
        isActive: true,
      }),
    );
    const id = Number(inserted[0].insertId);
    this.log.info(
      { costCenterId: id, country },
      "Centro de costo Retiros creado para el país de la caja",
    );
    return id;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------------
  // Cobros pendientes de retiro (lo que debería estar en el cajón)
  // ---------------------------------------------------------------------

  /**
   * Cobros en efectivo firmes (validados, no anulados) imputados a la caja y
   * SIN retiro activo, del más viejo al más nuevo. `dateTo` acota para cargar
   * retiros históricos ("todo lo cobrado hasta el 24/8"). Solo cajas efectivo.
   */
  async listPendingPayments(
    ctx: TenantContext,
    cajaId: number,
    opts: { dateTo?: string } = {},
  ): Promise<PendingWithdrawalResult> {
    const caja = await this.loadCaja(ctx, cajaId);
    if (caja.type !== "efectivo") {
      throw new BadRequestError(
        "Solo las cajas de efectivo tienen cobros pendientes de retiro",
      );
    }
    const rows = await this.queryPayments(ctx, {
      cashRegisterId: cajaId,
      onlyPending: true,
      dateTo: opts.dateTo,
    });
    return {
      cashRegisterId: caja.id,
      cashRegisterName: caja.name,
      currency: caja.currency,
      rows,
      total: rows.reduce((acc, r) => acc + r.amount, 0),
    };
  }

  /**
   * Query compartida entre "pendientes de retiro" (onlyPending) y "cobros de
   * un retiro" (withdrawalId). LEFT JOIN users: un cobro sin socio no existe
   * hoy, pero el listado no debe perder filas si algún kind lo permite mañana.
   */
  private async queryPayments(
    ctx: TenantContext,
    opts: {
      cashRegisterId?: number;
      onlyPending?: boolean;
      withdrawalId?: number;
      dateTo?: string;
    },
  ): Promise<WithdrawalPaymentItem[]> {
    const recorder = alias(schema.users, "recorder");
    const conds = [
      tenantWhere(schema.financialTransactions, ctx),
      eq(schema.financialTransactions.direction, "inflow"),
      eq(schema.financialTransactions.paymentMethod, "cash"),
      inArray(schema.financialTransactions.kind, [...MEMBER_INFLOW_KINDS]),
    ];
    if (opts.cashRegisterId !== undefined) {
      conds.push(
        eq(schema.financialTransactions.cashRegisterId, opts.cashRegisterId),
      );
    }
    if (opts.onlyPending) {
      conds.push(...firmMoneyConditions());
      conds.push(sql`${activeWithdrawalIdSql(ctx)} IS NULL`);
    }
    if (opts.withdrawalId !== undefined) {
      conds.push(sql`EXISTS (
        SELECT 1 FROM transaction_links tlw
        WHERE tlw.tenant_id = ${ctx.tenantId}
          AND tlw.transaction_id = ${opts.withdrawalId}
          AND tlw.target_kind = 'transaction'
          AND tlw.target_id = financial_transactions.id
      )`);
    }
    if (opts.dateTo !== undefined) {
      conds.push(lte(schema.financialTransactions.transactionDate, opts.dateTo));
    }

    const raw = await this.db
      .select({
        id: schema.financialTransactions.id,
        transactionDate: schema.financialTransactions.transactionDate,
        memberId: schema.financialTransactions.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        memberDni: schema.users.dni,
        kind: schema.financialTransactions.kind,
        amount: schema.financialTransactions.amount,
        currency: schema.financialTransactions.currency,
        notes: schema.financialTransactions.notes,
        planName: planNameSql(ctx),
        recorderFirstName: recorder.firstName,
        recorderLastName: recorder.lastName,
        createdAt: schema.financialTransactions.createdAt,
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
        asc(schema.financialTransactions.transactionDate),
        asc(schema.financialTransactions.id),
      );

    return raw.map((r) => ({
      id: r.id,
      transactionDate: String(r.transactionDate),
      memberId: r.memberId,
      memberName: `${r.memberFirstName ?? ""} ${r.memberLastName ?? ""}`.trim(),
      memberDni: r.memberDni ?? null,
      kind: r.kind,
      amount: r.amount,
      currency: r.currency,
      concept: r.planName ?? r.notes ?? null,
      recorderName:
        `${r.recorderFirstName ?? ""} ${r.recorderLastName ?? ""}`.trim(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ---------------------------------------------------------------------
  // Registrar retiro
  // ---------------------------------------------------------------------

  async registerWithdrawal(
    ctx: TenantContext,
    input: RegisterWithdrawalInput,
    adminId: number,
  ): Promise<{ withdrawalTxId: number; amount: number }> {
    const responsibleName = input.responsibleName.trim();
    if (responsibleName.length === 0) {
      throw new BadRequestError("Indicá quién se lleva la plata (responsable)");
    }
    const transactionDate = input.transactionDate ?? this.today();
    if (transactionDate > this.today()) {
      throw new BadRequestError("La fecha del retiro no puede ser futura");
    }
    const caja = await this.loadCaja(ctx, input.cajaId);

    // Dedup preservando orden. El schema ya exige enteros >= 1.
    const requestedIds = Array.from(new Set(input.transactionIds ?? []));

    if (caja.type === "efectivo") {
      if (requestedIds.length === 0) {
        throw new BadRequestError(
          "Elegí al menos un cobro en efectivo para retirar",
        );
      }
      if (input.amount !== undefined) {
        throw new BadRequestError(
          "En una caja de efectivo el monto del retiro es la suma de los cobros elegidos",
        );
      }
    } else {
      if (requestedIds.length > 0) {
        throw new BadRequestError(
          "Un retiro de cuenta banco no se vincula a cobros",
        );
      }
      if (input.amount === undefined || input.amount <= 0) {
        throw new BadRequestError("El monto del retiro debe ser mayor a 0");
      }
    }

    return await this.db.transaction(async (tx) => {
      const costCenterId = await this.resolveRetirosCostCenter(ctx, tx, caja);

      let amount = input.amount ?? 0;
      const links: Array<{
        targetKind: "transaction";
        targetId: number;
        allocatedAmount: number;
      }> = [];

      if (caja.type === "efectivo") {
        // FOR UPDATE: dos retiros simultáneos sobre el mismo cobro se
        // serializan acá y el segundo ve el link del primero.
        const rows = await tx
          .select({
            id: schema.financialTransactions.id,
            amount: schema.financialTransactions.amount,
            direction: schema.financialTransactions.direction,
            paymentMethod: schema.financialTransactions.paymentMethod,
            kind: schema.financialTransactions.kind,
            cashRegisterId: schema.financialTransactions.cashRegisterId,
            validationStatus: schema.financialTransactions.validationStatus,
            voidedAt: schema.financialTransactions.voidedAt,
            transactionDate: schema.financialTransactions.transactionDate,
            withdrawalId: activeWithdrawalIdSql(ctx),
          })
          .from(schema.financialTransactions)
          .where(
            and(
              tenantWhere(schema.financialTransactions, ctx),
              inArray(schema.financialTransactions.id, requestedIds),
            ),
          )
          .for("update");

        const byId = new Map(rows.map((r) => [r.id, r]));
        for (const id of requestedIds) {
          const row = byId.get(id);
          if (!row) {
            throw new NotFoundError(`El cobro #${id} no existe`);
          }
          if (
            row.direction !== "inflow" ||
            row.paymentMethod !== "cash" ||
            !MEMBER_INFLOW_KINDS.includes(row.kind)
          ) {
            throw new BadRequestError(
              `El cobro #${id} no es un cobro de socio en efectivo`,
            );
          }
          if (row.cashRegisterId !== caja.id) {
            throw new BadRequestError(
              `El cobro #${id} no está imputado a la caja ${caja.name}`,
            );
          }
          if (row.voidedAt !== null) {
            throw new BadRequestError(`El cobro #${id} está anulado`);
          }
          if (row.validationStatus !== "validado") {
            throw new BadRequestError(
              `El cobro #${id} todavía no está validado: validalo antes de retirarlo`,
            );
          }
          if (row.withdrawalId !== null) {
            throw new BadRequestError(
              `El cobro #${id} ya fue retirado (retiro #${row.withdrawalId})`,
            );
          }
          if (String(row.transactionDate) > transactionDate) {
            throw new BadRequestError(
              `El cobro #${id} es posterior a la fecha del retiro (${transactionDate})`,
            );
          }
          links.push({
            targetKind: "transaction",
            targetId: id,
            allocatedAmount: row.amount,
          });
          amount += row.amount;
        }
      }

      const expense = await this.txnService.create(
        ctx,
        {
          memberId: null,
          kind: "expense",
          direction: "outflow",
          amount,
          currency: caja.currency,
          paymentMethod: "internal",
          transactionDate,
          effectiveDate: transactionDate,
          branchId: caja.branchId,
          cashRegisterId: caja.id,
          costCenterId,
          notes: input.notes?.trim() ? input.notes.trim() : null,
          responsibleName,
          links,
        },
        adminId,
        tx,
      );

      this.log.info(
        {
          withdrawalTxId: expense.id,
          cajaId: caja.id,
          amount,
          paymentCount: links.length,
          responsibleName,
          adminId,
        },
        "Withdrawal registered",
      );
      return { withdrawalTxId: expense.id, amount };
    });
  }

  // ---------------------------------------------------------------------
  // Listado y detalle
  // ---------------------------------------------------------------------

  async list(
    ctx: TenantContext,
    filters: WithdrawalListFilters,
  ): Promise<PaginatedResult<WithdrawalListItem>> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;
    const recorder = alias(schema.users, "recorder");

    const conds = [
      tenantWhere(schema.financialTransactions, ctx),
      eq(schema.financialTransactions.kind, "expense"),
      sql`${schema.financialTransactions.responsibleName} IS NOT NULL`,
    ];
    if (filters.cashRegisterId !== undefined) {
      conds.push(
        eq(schema.financialTransactions.cashRegisterId, filters.cashRegisterId),
      );
    }
    if (filters.branchId !== undefined) {
      conds.push(eq(schema.financialTransactions.branchId, filters.branchId));
    }
    if (filters.dateFrom !== undefined) {
      conds.push(
        gte(schema.financialTransactions.transactionDate, filters.dateFrom),
      );
    }
    if (filters.dateTo !== undefined) {
      conds.push(
        lte(schema.financialTransactions.transactionDate, filters.dateTo),
      );
    }
    // Scope de país (no-owner): solo cajas con sede del país. Las cajas sin
    // sede (Central, banco) son owner-only, igual que en Saldos.
    if (!filters.isOwner) {
      conds.push(isNotNull(schema.branches.id));
      if (filters.country !== undefined) {
        conds.push(eq(schema.branches.country, filters.country));
      }
    } else if (filters.country !== undefined) {
      const countryOrCentral = or(
        isNull(schema.branches.id),
        eq(schema.branches.country, filters.country),
      );
      if (countryOrCentral) conds.push(countryOrCentral);
    }

    const base = () =>
      this.db
        .select({
          id: schema.financialTransactions.id,
          transactionDate: schema.financialTransactions.transactionDate,
          amount: schema.financialTransactions.amount,
          currency: schema.financialTransactions.currency,
          cashRegisterId: schema.financialTransactions.cashRegisterId,
          cashRegisterName: schema.cashRegisters.name,
          cashRegisterType: schema.cashRegisters.type,
          branchId: schema.financialTransactions.branchId,
          branchName: schema.branches.name,
          responsibleName: schema.financialTransactions.responsibleName,
          recordedBy: schema.financialTransactions.recordedBy,
          recorderFirstName: recorder.firstName,
          recorderLastName: recorder.lastName,
          notes: schema.financialTransactions.notes,
          voidedAt: schema.financialTransactions.voidedAt,
          voidReason: schema.financialTransactions.voidReason,
          createdAt: schema.financialTransactions.createdAt,
          paymentCount: sql<number>`(
            SELECT COUNT(*) FROM transaction_links tlc
            WHERE tlc.tenant_id = ${ctx.tenantId}
              AND tlc.transaction_id = financial_transactions.id
              AND tlc.target_kind = 'transaction'
          )`,
        })
        .from(schema.financialTransactions)
        .innerJoin(
          schema.cashRegisters,
          and(
            tenantWhere(schema.cashRegisters, ctx),
            eq(schema.cashRegisters.id, schema.financialTransactions.cashRegisterId),
          ),
        )
        .leftJoin(
          schema.branches,
          and(
            tenantWhere(schema.branches, ctx),
            eq(schema.branches.id, schema.financialTransactions.branchId),
          ),
        )
        .leftJoin(
          recorder,
          and(
            tenantWhere(recorder, ctx),
            eq(recorder.id, schema.financialTransactions.recordedBy),
          ),
        )
        .where(and(...conds));

    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.cashRegisters,
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, schema.financialTransactions.cashRegisterId),
        ),
      )
      .leftJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.financialTransactions.branchId),
        ),
      )
      .where(and(...conds));
    const total = Number(countRow?.count ?? 0);

    const raw = await base()
      .orderBy(
        desc(schema.financialTransactions.transactionDate),
        desc(schema.financialTransactions.id),
      )
      .limit(limit)
      .offset(offset);

    const rows = raw.map((r) => this.toListItem(r));
    return { rows, total, page, limit };
  }

  private toListItem(r: {
    id: number;
    transactionDate: string;
    amount: number;
    currency: string;
    cashRegisterId: number | null;
    cashRegisterName: string;
    cashRegisterType: "efectivo" | "banco";
    branchId: number | null;
    branchName: string | null;
    responsibleName: string | null;
    recordedBy: number;
    recorderFirstName: string | null;
    recorderLastName: string | null;
    notes: string | null;
    voidedAt: Date | null;
    voidReason: string | null;
    createdAt: Date;
    paymentCount: number;
  }): WithdrawalListItem {
    return {
      id: r.id,
      transactionDate: String(r.transactionDate),
      amount: r.amount,
      currency: r.currency,
      cashRegisterId: r.cashRegisterId ?? 0,
      cashRegisterName: r.cashRegisterName,
      cashRegisterType: r.cashRegisterType,
      branchId: r.branchId,
      branchName: r.branchName,
      responsibleName: r.responsibleName ?? "",
      recordedBy: r.recordedBy,
      recorderName:
        `${r.recorderFirstName ?? ""} ${r.recorderLastName ?? ""}`.trim(),
      notes: r.notes,
      paymentCount: Number(r.paymentCount),
      voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
      voidReason: r.voidReason,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /** Detalle de un retiro con sus cobros. 404 si no es un retiro del gimnasio. */
  async getById(ctx: TenantContext, id: number): Promise<WithdrawalDetail> {
    const recorder = alias(schema.users, "recorder");
    const [r] = await this.db
      .select({
        id: schema.financialTransactions.id,
        transactionDate: schema.financialTransactions.transactionDate,
        amount: schema.financialTransactions.amount,
        currency: schema.financialTransactions.currency,
        cashRegisterId: schema.financialTransactions.cashRegisterId,
        cashRegisterName: schema.cashRegisters.name,
        cashRegisterType: schema.cashRegisters.type,
        branchId: schema.financialTransactions.branchId,
        branchName: schema.branches.name,
        responsibleName: schema.financialTransactions.responsibleName,
        recordedBy: schema.financialTransactions.recordedBy,
        recorderFirstName: recorder.firstName,
        recorderLastName: recorder.lastName,
        notes: schema.financialTransactions.notes,
        voidedAt: schema.financialTransactions.voidedAt,
        voidReason: schema.financialTransactions.voidReason,
        createdAt: schema.financialTransactions.createdAt,
        paymentCount: sql<number>`(
          SELECT COUNT(*) FROM transaction_links tlc
          WHERE tlc.tenant_id = ${ctx.tenantId}
            AND tlc.transaction_id = financial_transactions.id
            AND tlc.target_kind = 'transaction'
        )`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.cashRegisters,
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, schema.financialTransactions.cashRegisterId),
        ),
      )
      .leftJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.financialTransactions.branchId),
        ),
      )
      .leftJoin(
        recorder,
        and(
          tenantWhere(recorder, ctx),
          eq(recorder.id, schema.financialTransactions.recordedBy),
        ),
      )
      .where(
        and(
          tenantWhere(schema.financialTransactions, ctx),
          eq(schema.financialTransactions.id, id),
          eq(schema.financialTransactions.kind, "expense"),
          sql`${schema.financialTransactions.responsibleName} IS NOT NULL`,
        ),
      )
      .limit(1);
    if (!r) {
      throw new NotFoundError("Retiro no encontrado");
    }
    const payments = await this.queryPayments(ctx, { withdrawalId: id });
    return { ...this.toListItem(r), payments };
  }

  /**
   * Sugerencias de responsable para el autocompletado: nombres ya usados en
   * retiros del gimnasio + nombres del staff activo. Ordenado, sin duplicados.
   */
  async listResponsibles(ctx: TenantContext): Promise<string[]> {
    const used = await this.db
      .selectDistinct({ name: schema.financialTransactions.responsibleName })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, ctx),
          eq(schema.financialTransactions.kind, "expense"),
          sql`${schema.financialTransactions.responsibleName} IS NOT NULL`,
        ),
      );
    const staff = await this.db
      .select({
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx),
          inArray(schema.users.role, [...STAFF_ROLES]),
          sql`(${schema.users.staffDisabled} IS NULL OR ${schema.users.staffDisabled} = 0)`,
        ),
      );
    const names = new Set<string>();
    for (const u of used) {
      if (u.name && u.name.trim()) names.add(u.name.trim());
    }
    for (const s of staff) {
      const n = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
      if (n) names.add(n);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "es"));
  }

  // ---------------------------------------------------------------------
  // Guard para TransactionService.void: un cobro retirado no se anula
  // ---------------------------------------------------------------------

  /**
   * Retiro activo que incluye el cobro `transactionId`, o null. Corre sobre el
   * tx del caller (void). Devuelve id y fecha para el mensaje de error.
   */
  static async findActiveWithdrawalForPayment(
    ctx: TenantContext,
    tx: TxHandle,
    transactionId: number,
  ): Promise<{ id: number; transactionDate: string } | null> {
    const link = alias(schema.transactionLinks, "wlink");
    const [row] = await tx
      .select({
        id: schema.financialTransactions.id,
        transactionDate: schema.financialTransactions.transactionDate,
      })
      .from(link)
      .innerJoin(
        schema.financialTransactions,
        and(
          tenantWhere(schema.financialTransactions, ctx),
          eq(schema.financialTransactions.id, link.transactionId),
        ),
      )
      .where(
        and(
          tenantWhere(link, ctx),
          eq(link.targetKind, "transaction"),
          eq(link.targetId, transactionId),
          eq(schema.financialTransactions.kind, "expense"),
          sql`${schema.financialTransactions.responsibleName} IS NOT NULL`,
          isNull(schema.financialTransactions.voidedAt),
        ),
      )
      .limit(1);
    return row ? { id: row.id, transactionDate: String(row.transactionDate) } : null;
  }
}
