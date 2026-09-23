// Module: finance — Retiros de caja (feedback caja/cobros 2026-09-07)
//
// Un retiro es la plata que alguien (el dueño, o quien retira por su cuenta)
// se lleva de una caja. Contablemente sigue siendo un `expense` con el centro
// de costo "Retiros" (así lo quiso Martín: "los retiros son una categoría
// dentro de egresos, lo veo ok"), con `responsible_name` obligatorio — quién
// se llevó la plata.
//
// 2026-09-23 — el retiro en EFECTIVO pasó a ser "una masa de plata" (feedback
// de Martín en staging). Antes se tildaban cobros y el monto era su suma, así
// que las salidas pagadas desde la misma caja (la yerba, un remís) no se
// restaban y se leían como faltante. Ahora:
//
//   1. El resumen (`listPendingPayments().summary`) arma la cuenta que hace
//      quien abre el cajón: quedó al último retiro + ingresos − salidas desde
//      entonces = disponible (el saldo firme). Aparte, fondo de cambio y
//      cobros sin validar: están en el cajón pero no se retiran.
//   2. El retiro lleva MONTO libre, con tope en el disponible (mismo guard que
//      egresos y movimientos: la caja no queda en negativo).
//   3. Opcionalmente, el conteo físico (`countedAmount`, solo retiros de hoy).
//      Si difiere del esperado exige nota y asienta un `adjustment`
//      (faltante/sobrante) linkeado al retiro — la caja queda igual a la
//      realidad — y el conteo queda además como arqueo en `cash_counts`.
//   4. Se auto-vinculan (transaction_links, targetKind 'transaction') TODOS
//      los cobros firmes de la caja sin retiro hasta la fecha del retiro:
//      procedencia, no suma (el monto ya no es Σ cobros). Un cobro con un
//      retiro activo está "retirado": no se puede anular hasta anular el
//      retiro (POST /expenses/:id/void libera sus cobros y su ajuste).
//
// En una cuenta BANCO no hay cajón que contar: monto explícito, sin vínculos
// ni conteo.
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
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  not,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { assertBranchInEnforcedScope } from "../shared/branch-access";
import type { PaginatedResult } from "../shared/types";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import type { TxHandle } from "./balance-service";
import type { CashRegisterService } from "./cash-register-service";
import type { TransactionService } from "./transaction-service";
import { assertEfectivoCoversOutflow } from "./efectivo-guard";
import { firmMoneyConditions } from "./firm-money";
import type {
  PendingWithdrawalResult,
  RegisterWithdrawalInput,
  TransactionKind,
  WithdrawalDetail,
  WithdrawalFlowItem,
  WithdrawalListFilters,
  WithdrawalListItem,
  WithdrawalPaymentItem,
  WithdrawalSummary,
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
const STAFF_ROLES = [
  "owner",
  "admin",
  "gestion",
  "recepcion",
  "coach",
] as const;

interface CajaRef {
  id: number;
  name: string;
  type: "efectivo" | "banco";
  currency: string;
  branchId: number | null;
  branchCountry: string | null;
  /** YYYY-MM-DD. Piso del saldo derivado (D-08): lo anterior no cuenta. */
  cutoffDate: string;
  /** Fondo de cambio: queda en el cajón, fuera del saldo firme. */
  changeFund: number;
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

/** Texto de una fila del resumen del cajón: quién pagó, en qué se gastó, etc. */
function describeFlow(r: {
  kind: TransactionKind;
  direction: "inflow" | "outflow";
  memberName: string;
  costCenterName: string | null;
  counterpartCaja: string | null;
}): string {
  switch (r.kind) {
    case "plan_charge":
    case "debt_settlement":
    case "advance_payment":
      return r.memberName || "Cobro";
    case "expense":
      return r.costCenterName ?? "Gasto";
    case "cash_transfer":
      return r.direction === "inflow"
        ? `Movimiento desde ${r.counterpartCaja ?? "otra caja"}`
        : `Movimiento a ${r.counterpartCaja ?? "otra caja"}`;
    case "adjustment":
      return r.direction === "inflow"
        ? "Ajuste de caja (sobrante)"
        : "Ajuste de caja (faltante)";
    case "refund":
      return r.memberName ? `Devolución a ${r.memberName}` : "Devolución";
  }
}

export class WithdrawalService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly txnService: TransactionService,
    private readonly cashRegisterService: CashRegisterService,
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
        cutoffDate: schema.cashRegisters.cutoffDate,
        changeFund: schema.cashRegisters.changeFund,
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
      cutoffDate: String(caja.cutoffDate),
      changeFund: caja.changeFund,
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
    const country =
      caja.branchCountry ?? (caja.currency === "EUR" ? "ES" : "AR");
    const [byCountry] = await tx
      .select({
        id: schema.costCenters.id,
        isActive: schema.costCenters.isActive,
      })
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
    opts: { dateTo?: string; branchIds?: number[] } = {},
  ): Promise<PendingWithdrawalResult> {
    const caja = await this.loadCaja(ctx, cajaId);
    // 2026-09-08 — alcance FORZADO por sede (`enforcedBranchIds`, rol
    // `admin_sede`). Esta ruta se direcciona por `cashRegisterId`, no por sede,
    // así que el recorte va acá. 404 y no 403 (criterio ISO-03): una caja de
    // otra sede tiene que ser indistinguible de una que no existe.
    assertBranchInEnforcedScope(
      caja.branchId,
      opts.branchIds,
      "Caja no encontrada",
    );
    if (caja.type !== "efectivo") {
      throw new BadRequestError(
        "Solo las cajas de efectivo tienen cobros pendientes de retiro",
      );
    }
    // 2026-09-18 — piso en el corte de la caja. El saldo firme (D-08) solo
    // cuenta cobros desde `cutoff_date`, pero este listado ofrecía TODO el
    // historial: en prod se retiraron cobros de abril a junio que el saldo ya
    // excluía y las 5 cajas de efectivo quedaron en negativo (migración 0234).
    // Lo anterior al corte no está en el cajón, así que no se puede retirar.
    const [rows, awaiting] = await Promise.all([
      this.queryPayments(ctx, {
        cashRegisterId: cajaId,
        onlyPending: true,
        dateFrom: caja.cutoffDate,
        dateTo: opts.dateTo,
      }),
      // 2026-09-09 — el arqueo del profe cuenta los cobros sin validar (la
      // plata está en el cajón) pero acá no se pueden retirar hasta que
      // gestión los valide. Se informan aparte para que quien retira sepa
      // por qué ve menos que el último cierre.
      this.queryPayments(ctx, {
        cashRegisterId: cajaId,
        onlyAwaitingValidation: true,
        dateFrom: caja.cutoffDate,
        dateTo: opts.dateTo,
      }),
    ]);
    const summary = await this.buildSummary(ctx, caja);
    return {
      cashRegisterId: caja.id,
      cashRegisterName: caja.name,
      currency: caja.currency,
      rows,
      total: rows.reduce((acc, r) => acc + r.amount, 0),
      awaitingValidation: {
        rows: awaiting,
        total: awaiting.reduce((acc, r) => acc + r.amount, 0),
      },
      summary,
    };
  }

  // ---------------------------------------------------------------------
  // Resumen del cajón desde el último retiro (2026-09-23)
  // ---------------------------------------------------------------------

  /** Último retiro ACTIVO de la caja (el de id más alto), o null. */
  private async lastActiveWithdrawal(
    ctx: TenantContext,
    cajaId: number,
  ): Promise<WithdrawalSummary["lastWithdrawal"]> {
    const [row] = await this.db
      .select({
        id: schema.financialTransactions.id,
        transactionDate: schema.financialTransactions.transactionDate,
        amount: schema.financialTransactions.amount,
        responsibleName: schema.financialTransactions.responsibleName,
        createdAt: schema.financialTransactions.createdAt,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, ctx),
          eq(schema.financialTransactions.cashRegisterId, cajaId),
          eq(schema.financialTransactions.kind, "expense"),
          isNotNull(schema.financialTransactions.responsibleName),
          isNull(schema.financialTransactions.voidedAt),
        ),
      )
      .orderBy(desc(schema.financialTransactions.id))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      transactionDate: String(row.transactionDate),
      amount: row.amount,
      responsibleName: row.responsibleName ?? "",
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * La cuenta del cajón: quedó al último retiro + ingresos − salidas =
   * disponible (saldo firme). Siempre "a hoy": no depende del `dateTo` del
   * listado de cobros.
   *
   * ¿Qué es "desde el último retiro"?
   *   - Un COBRO de socio en efectivo entra si no tiene retiro activo. Criterio
   *     por vínculo y no por id porque un cobro cargado antes del retiro pero
   *     validado después no estaba en la plata retirable de ese momento: si
   *     se contara por id, el "quedó al último retiro" lo absorbería.
   *   - Todo lo demás (gastos, movimientos, ajustes, devoluciones) entra si
   *     nació después del retiro (id mayor). El ajuste por conteo de un retiro
   *     se inserta ANTES que el retiro, así que nunca aparece como "después".
   *   - Sin retiro previo: todo lo firme desde el corte.
   *
   * `previousBalance` se DERIVA (firme − ingresos + salidas) para que la cuenta
   * cierre siempre. Si después del retiro se anuló algo que ya estaba
   * contado, el anterior baja: es lo que efectivamente queda en el saldo.
   */
  private async buildSummary(
    ctx: TenantContext,
    caja: CajaRef,
  ): Promise<WithdrawalSummary> {
    const [balance, lastWithdrawal] = await Promise.all([
      this.cashRegisterService.getBalance(ctx, caja.id),
      this.lastActiveWithdrawal(ctx, caja.id),
    ]);
    const flow = await this.queryFlowSince(ctx, caja, lastWithdrawal?.id ?? 0);
    const inflows = flow.filter((f) => f.direction === "inflow");
    const outflows = flow.filter((f) => f.direction === "outflow");
    const inflowTotal = inflows.reduce((acc, f) => acc + f.amount, 0);
    const outflowTotal = outflows.reduce((acc, f) => acc + f.amount, 0);
    return {
      lastWithdrawal,
      previousBalance: balance.firmeBalance - inflowTotal + outflowTotal,
      inflows,
      inflowTotal,
      outflows,
      outflowTotal,
      firmeBalance: balance.firmeBalance,
      changeFund: caja.changeFund,
      expectedInDrawer:
        caja.changeFund + balance.firmeBalance + balance.pendienteAmount,
    };
  }

  /** Filas firmes de la caja posteriores al retiro `lastWithdrawalId` (0 = ninguno). */
  private async queryFlowSince(
    ctx: TenantContext,
    caja: CajaRef,
    lastWithdrawalId: number,
  ): Promise<WithdrawalFlowItem[]> {
    const ft = schema.financialTransactions;
    const recorder = alias(schema.users, "recorder");
    const isMemberCashCobro = and(
      eq(ft.direction, "inflow"),
      eq(ft.paymentMethod, "cash"),
      inArray(ft.kind, [...MEMBER_INFLOW_KINDS]),
    );
    if (!isMemberCashCobro) {
      throw new Error("Condición de cobro de socio vacía");
    }
    const raw = await this.db
      .select({
        id: ft.id,
        transactionDate: ft.transactionDate,
        kind: ft.kind,
        direction: ft.direction,
        amount: ft.amount,
        notes: ft.notes,
        createdAt: ft.createdAt,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        costCenterName: schema.costCenters.name,
        planName: planNameSql(ctx),
        // Caja de la otra pata de un movimiento. Literal por la misma razón
        // que activeWithdrawalIdSql (correlación sin calificar en .select()).
        counterpartCaja: sql<string | null>`(
          SELECT cr.name FROM transaction_links tlm
          JOIN financial_transactions o ON o.id = tlm.target_id
          JOIN cash_registers cr ON cr.id = o.cash_register_id
          WHERE tlm.tenant_id = ${ctx.tenantId}
            AND o.tenant_id = ${ctx.tenantId}
            AND cr.tenant_id = ${ctx.tenantId}
            AND tlm.target_kind = 'transaction'
            AND tlm.transaction_id = financial_transactions.id
            AND o.kind = 'cash_transfer'
          LIMIT 1
        )`,
        recorderFirstName: recorder.firstName,
        recorderLastName: recorder.lastName,
      })
      .from(ft)
      .leftJoin(
        schema.users,
        and(tenantWhere(schema.users, ctx), eq(schema.users.id, ft.memberId)),
      )
      .leftJoin(
        schema.costCenters,
        and(
          tenantWhere(schema.costCenters, ctx),
          eq(schema.costCenters.id, ft.costCenterId),
        ),
      )
      .leftJoin(
        recorder,
        and(tenantWhere(recorder, ctx), eq(recorder.id, ft.recordedBy)),
      )
      .where(
        and(
          tenantWhere(ft, ctx),
          eq(ft.cashRegisterId, caja.id),
          ...firmMoneyConditions(),
          gte(ft.transactionDate, caja.cutoffDate),
          or(
            and(isMemberCashCobro, sql`${activeWithdrawalIdSql(ctx)} IS NULL`),
            and(not(isMemberCashCobro), gt(ft.id, lastWithdrawalId)),
          ),
        ),
      )
      .orderBy(asc(ft.transactionDate), asc(ft.id));

    return raw.map((r) => {
      const memberName =
        `${r.memberFirstName ?? ""} ${r.memberLastName ?? ""}`.trim();
      const isCobro = MEMBER_INFLOW_KINDS.includes(r.kind);
      return {
        id: r.id,
        transactionDate: String(r.transactionDate),
        kind: r.kind,
        direction: r.direction,
        amount: r.amount,
        description: describeFlow({ ...r, memberName }),
        detail: isCobro ? (r.planName ?? r.notes ?? null) : r.notes,
        recorderName:
          `${r.recorderFirstName ?? ""} ${r.recorderLastName ?? ""}`.trim(),
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /**
   * Query compartida entre "pendientes de retiro" (onlyPending), "sin validar
   * todavía" (onlyAwaitingValidation: validation_status = pendiente, no
   * anulados, mismo universo que el `pendienteAmount` del saldo) y "cobros de
   * un retiro" (withdrawalId). LEFT JOIN users: un cobro sin socio no existe
   * hoy, pero el listado no debe perder filas si algún kind lo permite mañana.
   */
  private async queryPayments(
    ctx: TenantContext,
    opts: {
      cashRegisterId?: number;
      onlyPending?: boolean;
      onlyAwaitingValidation?: boolean;
      withdrawalId?: number;
      /** Inclusive. Se usa para el piso del corte de la caja. */
      dateFrom?: string;
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
    if (opts.onlyAwaitingValidation) {
      conds.push(
        isNull(schema.financialTransactions.voidedAt),
        eq(schema.financialTransactions.validationStatus, "pendiente"),
      );
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
    if (opts.dateFrom !== undefined) {
      conds.push(
        gte(schema.financialTransactions.transactionDate, opts.dateFrom),
      );
    }
    if (opts.dateTo !== undefined) {
      conds.push(
        lte(schema.financialTransactions.transactionDate, opts.dateTo),
      );
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
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new BadRequestError("El monto del retiro debe ser mayor a 0");
    }
    const today = this.today();
    const transactionDate = input.transactionDate ?? today;
    if (transactionDate > today) {
      throw new BadRequestError("La fecha del retiro no puede ser futura");
    }
    const notes = input.notes?.trim() ? input.notes.trim() : null;
    const caja = await this.loadCaja(ctx, input.cajaId);
    const counted = input.countedAmount;

    if (caja.type === "banco") {
      if (counted !== undefined) {
        throw new BadRequestError(
          "Una cuenta banco no se cuenta: el conteo es solo para cajas de efectivo",
        );
      }
    } else {
      // El saldo firme solo existe desde el corte: un retiro anterior no
      // saldría de ninguna plata que el sistema conozca.
      if (transactionDate < caja.cutoffDate) {
        throw new BadRequestError(
          `La fecha del retiro es anterior al corte de la caja ${caja.name} (${caja.cutoffDate})`,
        );
      }
      if (counted !== undefined && transactionDate !== today) {
        throw new BadRequestError(
          "El conteo de la caja solo se carga en un retiro de hoy: la plata contada es la de ahora",
        );
      }
    }

    return await this.db.transaction(async (tx) => {
      // Candado sobre la caja: dos retiros simultáneos se serializan acá y el
      // segundo lee el saldo con el primero ya commiteado (getBalance corre en
      // otra conexión y ve lo commiteado). Mismo candado para los cobros que
      // se vinculan, más abajo.
      await tx
        .select({ id: schema.cashRegisters.id })
        .from(schema.cashRegisters)
        .where(
          and(
            tenantWhere(schema.cashRegisters, ctx),
            eq(schema.cashRegisters.id, caja.id),
          ),
        )
        .for("update");

      const costCenterId = await this.resolveRetirosCostCenter(ctx, tx, caja);

      let adjustmentTxId: number | null = null;
      let links: Array<{ id: number; amount: number }> = [];
      let countSnapshot: {
        firme: number;
        pendiente: number;
        expected: number;
        difference: number;
      } | null = null;

      if (caja.type === "efectivo") {
        const balance = await this.cashRegisterService.getBalance(ctx, caja.id);
        let available = balance.firmeBalance;

        if (counted !== undefined) {
          // Mismo esperado que el arqueo del profe: la plata sin validar está
          // en el cajón aunque no esté en el saldo firme.
          const expected =
            caja.changeFund + balance.firmeBalance + balance.pendienteAmount;
          const difference = counted - expected;
          if (difference !== 0 && !notes) {
            throw new BadRequestError(
              `La plata contada difiere de lo esperado en ${difference > 0 ? "+" : ""}${difference}: explicá la diferencia en las notas`,
            );
          }
          if (difference !== 0) {
            // Se inserta ANTES que el retiro (id menor): el resumen del
            // próximo retiro toma "lo posterior al retiro" por id y este
            // ajuste pertenece a éste. Mismo asiento que la reconciliación
            // de movimientos (movement-service.ts, D-04).
            const adjustment = await this.txnService.create(
              ctx,
              {
                memberId: null,
                kind: "adjustment",
                direction: difference > 0 ? "inflow" : "outflow",
                amount: Math.abs(difference),
                currency: caja.currency,
                paymentMethod: "internal",
                transactionDate,
                effectiveDate: transactionDate,
                branchId: caja.branchId,
                cashRegisterId: caja.id,
                notes: `${difference > 0 ? "Sobrante" : "Faltante"} al retirar: esperado ${expected}, contado ${counted}. ${notes}`,
                links: [],
              },
              adminId,
              tx,
            );
            adjustmentTxId = adjustment.id;
            available += difference;
          }
          countSnapshot = {
            firme: balance.firmeBalance,
            pendiente: balance.pendienteAmount,
            expected,
            difference,
          };
        }

        assertEfectivoCoversOutflow(caja, input.amount, available, "El retiro");

        // Procedencia: TODOS los cobros firmes sin retiro hasta la fecha del
        // retiro y desde el corte. FOR UPDATE para que dos retiros no se
        // lleven el mismo cobro.
        const ft = schema.financialTransactions;
        links = await tx
          .select({ id: ft.id, amount: ft.amount })
          .from(ft)
          .where(
            and(
              tenantWhere(ft, ctx),
              eq(ft.cashRegisterId, caja.id),
              eq(ft.direction, "inflow"),
              eq(ft.paymentMethod, "cash"),
              inArray(ft.kind, [...MEMBER_INFLOW_KINDS]),
              ...firmMoneyConditions(),
              gte(ft.transactionDate, caja.cutoffDate),
              lte(ft.transactionDate, transactionDate),
              sql`${activeWithdrawalIdSql(ctx)} IS NULL`,
            ),
          )
          .for("update");
      }

      const expense = await this.txnService.create(
        ctx,
        {
          memberId: null,
          kind: "expense",
          direction: "outflow",
          amount: input.amount,
          currency: caja.currency,
          paymentMethod: "internal",
          transactionDate,
          effectiveDate: transactionDate,
          branchId: caja.branchId,
          cashRegisterId: caja.id,
          costCenterId,
          notes,
          responsibleName,
          // Los vínculos a cobros van aparte: ya no suman el monto (TXN-06
          // exige Σ allocated = amount cuando hay links en el create).
          links: [],
        },
        adminId,
        tx,
      );

      if (links.length > 0) {
        await tx.insert(schema.transactionLinks).values(
          links.map((l) =>
            tenantValues(ctx, {
              transactionId: expense.id,
              targetKind: "transaction" as const,
              targetId: l.id,
              allocatedAmount: l.amount,
            }),
          ),
        );
      }
      if (adjustmentTxId !== null) {
        // El ajuste cuelga del retiro: anular el retiro lo anula (voidExpense).
        await tx.insert(schema.transactionLinks).values(
          tenantValues(ctx, {
            transactionId: adjustmentTxId,
            targetKind: "transaction",
            targetId: expense.id,
            allocatedAmount: 0,
          }),
        );
      }

      if (counted !== undefined && countSnapshot !== null) {
        // El retiro con conteo es también un cierre de caja: el próximo
        // arqueo del profe arranca desde acá. La diferencia ya quedó
        // asentada como ajuste; el arqueo la registra igual (es una foto).
        await tx.insert(schema.cashCounts).values(
          tenantValues(ctx, {
            cashRegisterId: caja.id,
            countedBy: adminId,
            // Desde JS, como registerCount: mismo reloj que voided_at.
            countedAt: new Date(),
            staffShiftId: null,
            changeFund: caja.changeFund,
            firmeAmount: countSnapshot.firme,
            pendienteAmount: countSnapshot.pendiente,
            expectedAmount: countSnapshot.expected,
            countedAmount: counted,
            difference: countSnapshot.difference,
            paymentsCount: links.length,
            notes: `Conteo al retirar (retiro #${expense.id})${notes ? `. ${notes}` : ""}`,
          }),
        );
      }

      this.log.info(
        {
          withdrawalTxId: expense.id,
          cajaId: caja.id,
          amount: input.amount,
          countedAmount: counted ?? null,
          adjustmentTxId,
          paymentCount: links.length,
          responsibleName,
          adminId,
        },
        "Withdrawal registered",
      );
      return { withdrawalTxId: expense.id, amount: input.amount };
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
    // 2026-09-08 — alcance FORZADO por sede (`enforcedBranchIds`, rol
    // `admin_sede`). Se suma al `branchId` puntual (que ya viene validado por
    // `requireBranchAccess`) y, sobre todo, cubre el caso "sin branchId": sin
    // esto el listado caía al filtro de país y mostraba los retiros de TODAS
    // las sedes. Los retiros de cajas sin sede (Central/banco) tienen
    // `branchId` NULL y quedan fuera del IN — que es lo correcto acá.
    if (filters.branchIds !== undefined) {
      conds.push(
        filters.branchIds.length === 0
          ? sql`1 = 0`
          : inArray(schema.financialTransactions.branchId, filters.branchIds),
      );
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
            eq(
              schema.cashRegisters.id,
              schema.financialTransactions.cashRegisterId,
            ),
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
          eq(
            schema.cashRegisters.id,
            schema.financialTransactions.cashRegisterId,
          ),
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
  async getById(
    ctx: TenantContext,
    id: number,
    /** Alcance forzado por sede (rol `admin_sede`). Ver `assertCajaEnAlcance`. */
    branchIds?: number[],
  ): Promise<WithdrawalDetail> {
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
          eq(
            schema.cashRegisters.id,
            schema.financialTransactions.cashRegisterId,
          ),
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
    // Mismo criterio que `listPendingPayments`: fuera de alcance = inexistente.
    assertBranchInEnforcedScope(r.branchId, branchIds, "Retiro no encontrado");
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
    return row
      ? { id: row.id, transactionDate: String(row.transactionDate) }
      : null;
  }
}
