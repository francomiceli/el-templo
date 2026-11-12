// Módulo: finance — fase 209 (Egresos): pagos de un gasto.
//
// Un PAGO = una fila de `expense_payments` + su fila `expense`/`outflow` del
// ledger (`financial_transactions`), creadas en la MISMA transacción (DI-04).
// Así los saldos, Caja → Movimientos y Saldos por caja funcionan sin tocar
// ninguno de sus lectores: el ledger no distingue un pago de gasto de un egreso
// viejo, salvo porque el pago NUNCA lleva `responsible_name` (con él, el marcador
// de `withdrawal-marker.ts` lo leería como retiro).
//
// Reglas de oro:
//   - Plata en ENTEROS (D-23). El tipo de cambio entra UNA vez a
//     `computePaymentAmounts` y de ahí salen `applied_amount` y `amount_ars`.
//   - Candados, siempre en este orden y dentro de la tx: fila del gasto
//     `FOR UPDATE` → fila de la cuenta `FOR UPDATE` → leer lo pagado. El alta y la
//     edición del gasto (`ExpenseRecordService`) toman el gasto primero también:
//     mismo orden, sin deadlocks.
//   - Anular un pago: gasto `FOR UPDATE` → pago `FOR UPDATE`, y la fila del ledger
//     se anula con `txnService.voidInTx` en la MISMA tx (no se reimplementa).
//
// Tenancy: `tenantWhere` en toda lectura (en los joins, el filtro de la tabla
// unida va en el ON) y `tenantValues` en los inserts.
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import { auditLog } from "../shared/audit-log";
import { isDuplicateKeyError } from "../shared/sql-errors";
import { isValidIsoDate } from "../shared/week-dates";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import type { CashRegisterService } from "./cash-register-service";
import { assertEfectivoCoversOutflow } from "./efectivo-guard";
import {
  CASA_MATRIZ_LABEL,
  casaMatrizAllowed,
  countryToday,
  listOperationalBranches,
} from "./expense-branches";
import {
  EXPENSE_CURRENCIES_BY_COUNTRY,
  MAX_MONEY,
  computePaymentAmounts,
  countryCurrencyOf,
  expenseStatusOf,
} from "./expense-math";
import {
  optionalText,
  toExpenseCountry,
  toExpenseCurrency,
  type ExpenseRecordService,
} from "./expense-record-service";
import {
  EXPENSE_PAYMENT_METHODS,
  type ExpenseCountry,
  type ExpenseDestinationOption,
  type ExpenseFormOptions,
  type ExpensePaymentAccount,
  type ExpensePaymentItem,
  type ExpenseRecordDetail,
  type RegisterExpensePaymentInput,
} from "./expense-types";
import { assertMethodAllowedForAccount } from "./payment-method-rules";
import type { TransactionService } from "./transaction-service";
import { RETIROS_COST_CENTER_NAME } from "./withdrawal-service";

type DbInstance = MySql2Database<typeof schema>;

const MAX_REFERENCE = 100;
const MAX_NOTES = 2000;
const MAX_IDEMPOTENCY_KEY = 64;

/** Clave de idempotencia recortada: vacía = sin clave; más de 64 caracteres, 400. */
function normalizeIdempotencyKey(
  key: string | null | undefined,
): string | null {
  if (key === null || key === undefined) return null;
  const trimmed = String(key).trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_IDEMPOTENCY_KEY) {
    throw new BadRequestError(
      `La clave de idempotencia no puede superar los ${MAX_IDEMPOTENCY_KEY} caracteres`,
    );
  }
  return trimmed;
}

export class ExpensePaymentService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly txnService: TransactionService,
    private readonly cashRegisterService: CashRegisterService,
    private readonly recordService: ExpenseRecordService,
  ) {}

  /**
   * Registra un pago de un gasto (DI-04, DI-05, DI-03).
   *
   * Todo en UNA transacción: candado del gasto → candado de la cuenta →
   * validaciones → fila del ledger (`txnService.create` con la misma tx) → fila de
   * `expense_payments` → audit. Si algo falla no queda nada escrito.
   *
   * Idempotencia (DI-16): con `idempotencyKey` repetida sobre el MISMO gasto
   * devuelve el pago ya creado (`created: false`); sobre otro gasto, 409.
   *
   * @param opts.country si viene y difiere del país del gasto, 404 (un gasto de
   *   otro país es inexistente para quien no es owner).
   */
  async registerPayment(
    ctx: TenantContext,
    recordId: number,
    input: RegisterExpensePaymentInput,
    adminId: number,
    opts: { country?: ExpenseCountry | null } = {},
  ): Promise<{
    record: ExpenseRecordDetail;
    payment: ExpensePaymentItem;
    created: boolean;
  }> {
    // 1. Idempotencia.
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    if (idempotencyKey !== null) {
      const existing = await this.findByIdempotencyKey(ctx, idempotencyKey);
      if (existing !== null) {
        return this.existingResult(ctx, recordId, existing, opts.country);
      }
    }

    // 2. Validaciones sin DB.
    if (
      !Number.isInteger(input.amount) ||
      input.amount < 1 ||
      input.amount > MAX_MONEY
    ) {
      throw new BadRequestError(
        `El importe del pago tiene que ser un entero entre 1 y ${MAX_MONEY}`,
      );
    }
    if (typeof input.paidOn !== "string" || !isValidIsoDate(input.paidOn)) {
      throw new BadRequestError("La fecha del pago no es válida");
    }
    if (
      !(EXPENSE_PAYMENT_METHODS as readonly string[]).includes(
        input.paymentMethod,
      )
    ) {
      throw new BadRequestError("Ese medio no sirve para pagar gastos");
    }
    const reference = optionalText(
      input.reference,
      MAX_REFERENCE,
      "La referencia",
    );
    const notes = optionalText(input.notes, MAX_NOTES, "Las notas");
    const paidOn = input.paidOn;

    // 3. Una transacción.
    let paymentId: number;
    try {
      paymentId = await this.db.transaction(async (tx) => {
        // a. Gasto, PRIMER candado.
        const [record] = await tx
          .select()
          .from(schema.expenseRecords)
          .where(
            and(
              tenantWhere(schema.expenseRecords, ctx),
              eq(schema.expenseRecords.id, recordId),
            ),
          )
          .limit(1)
          .for("update");
        if (!record || (opts.country && record.country !== opts.country)) {
          throw new NotFoundError("Gasto no encontrado");
        }
        if (record.voidedAt !== null) {
          throw new BadRequestError("El gasto está anulado: no admite pagos");
        }
        const country = toExpenseCountry(record.country);
        const expenseCurrency = toExpenseCurrency(record.currency);

        // b. Cuenta, SEGUNDO candado. Misma respuesta para "no existe" y "es de
        // otro gimnasio" (T-209-15). La sede se lee aparte: un FOR UPDATE con
        // join bloquearía también la fila de la sede.
        const [account] = await tx
          .select()
          .from(schema.cashRegisters)
          .where(
            and(
              tenantWhere(schema.cashRegisters, ctx),
              eq(schema.cashRegisters.id, input.cashRegisterId),
            ),
          )
          .limit(1)
          .for("update");
        if (!account) throw new BadRequestError("Cuenta no encontrada");
        if (!account.isActive) {
          throw new BadRequestError(`La cuenta ${account.name} está inactiva`);
        }
        if (account.branchId !== null) {
          const [branch] = await tx
            .select({ country: schema.branches.country })
            .from(schema.branches)
            .where(
              and(
                tenantWhere(schema.branches, ctx),
                eq(schema.branches.id, account.branchId),
              ),
            )
            .limit(1);
          if (!branch || branch.country !== country) {
            throw new BadRequestError(
              `La cuenta ${account.name} es de una sede de otro país`,
            );
          }
        }
        // Una cuenta sin sede vale para cualquier gasto de su moneda/país (DI-05).
        if (
          !(
            EXPENSE_CURRENCIES_BY_COUNTRY[country] as readonly string[]
          ).includes(account.currency)
        ) {
          throw new BadRequestError(
            `La cuenta ${account.name} está en ${account.currency}: no sirve para pagar este gasto`,
          );
        }

        // c. Fechas (DI-05).
        const today = await countryToday(this.db, ctx, country);
        if (paidOn > today) {
          throw new BadRequestError("La fecha del pago no puede ser futura");
        }
        if (paidOn < account.cutoffDate) {
          throw new BadRequestError(
            `La fecha del pago es anterior al corte de la cuenta ${account.name} (${account.cutoffDate}): el pago no restaría del saldo`,
          );
        }

        // d. Regla medio ↔ cuenta.
        assertMethodAllowedForAccount(input.paymentMethod, {
          type: account.type,
          name: account.name,
        });

        // e. Un solo cálculo de importes (DI-03).
        const { appliedAmount, amountArs, fxRate } = computePaymentAmounts({
          country,
          expenseCurrency,
          accountCurrency: account.currency,
          amount: input.amount,
          fxRate: input.fxRate ?? null,
        });

        // f. Pagado de más: solo en un gasto `confirmado` (en `estimado` se
        // admite y el detalle marca `overpaid`). `loadPaidByRecord` lee lo
        // commiteado y el gasto está bloqueado: no hay otro pago en vuelo.
        if (record.amountStatus === "confirmado") {
          const paid =
            (await this.recordService.loadPaidByRecord(ctx, [recordId])).get(
              recordId,
            ) ?? 0;
          const { pending } = expenseStatusOf(record.amount, paid);
          if (appliedAmount > pending) {
            throw new BadRequestError(
              pending === 0
                ? "El gasto ya está pagado"
                : `El pago cancela ${appliedAmount} y al gasto le quedan ${pending} por pagar`,
            );
          }
        }

        // g. Tope de efectivo (mismo patrón que el retiro).
        if (account.type === "efectivo") {
          const balance = await this.cashRegisterService.getBalance(
            ctx,
            account.id,
          );
          assertEfectivoCoversOutflow(
            account,
            input.amount,
            balance.firmeBalance,
            "El pago",
          );
        }

        // h. Fila del ledger. SIN responsable (no es un retiro) y SIN
        // `idempotencyKey` (la clave vive en `expense_payments`). `validationStatus`
        // queda en su default `validado`: cuenta en el saldo.
        const txn = await this.txnService.create(
          ctx,
          {
            memberId: null,
            kind: "expense",
            direction: "outflow",
            amount: input.amount,
            currency: account.currency,
            paymentMethod: input.paymentMethod,
            transactionDate: paidOn,
            effectiveDate: paidOn,
            branchId: account.branchId,
            cashRegisterId: account.id,
            costCenterId: record.costCenterId,
            notes: `Pago de gasto #${recordId}: ${record.concept}`,
            links: [],
          },
          adminId,
          tx,
        );

        // i. Fila del pago.
        const [row] = await tx
          .insert(schema.expensePayments)
          .values(
            tenantValues(ctx, {
              expenseRecordId: recordId,
              transactionId: txn.id,
              paidOn,
              cashRegisterId: account.id,
              paymentMethod: input.paymentMethod,
              amount: input.amount,
              currency: account.currency,
              appliedAmount,
              fxRate,
              amountArs,
              reference,
              notes,
              idempotencyKey,
              createdBy: adminId,
            }),
          )
          .$returningId();

        // j. Rastro en el historial del gasto.
        await auditLog.write(ctx, tx, {
          actorId: adminId,
          action: "expense_payment_registered",
          targetKind: "expense_record",
          targetId: recordId,
          payload: {
            paymentId: row.id,
            transactionId: txn.id,
            paidOn,
            cashRegisterId: account.id,
            paymentMethod: input.paymentMethod,
            amount: input.amount,
            currency: account.currency,
            appliedAmount,
            fxRate,
            amountArs,
          },
        });

        this.log.info(
          {
            expenseRecordId: recordId,
            paymentId: row.id,
            transactionId: txn.id,
            cashRegisterId: account.id,
            amount: input.amount,
            currency: account.currency,
            appliedAmount,
          },
          "Pago de gasto registrado",
        );
        return row.id;
      });
    } catch (err: unknown) {
      // 4. Carrera de idempotencia: otro request con la misma clave ganó el
      // insert (la tx perdedora se deshizo entera, ledger incluido).
      if (idempotencyKey !== null && isDuplicateKeyError(err).isDuplicate) {
        const existing = await this.findByIdempotencyKey(ctx, idempotencyKey);
        if (existing !== null) {
          return this.existingResult(ctx, recordId, existing, opts.country);
        }
      }
      throw err;
    }

    const record = await this.recordService.getDetail(ctx, recordId, {
      country: opts.country,
    });
    return {
      record,
      payment: this.pickPayment(record, paymentId),
      created: true,
    };
  }

  /**
   * Anula un pago de un gasto (DI-10). Marca la fila de `expense_payments` y anula
   * su fila del ledger con `voidInTx` (el camino de anulación existente) en UNA
   * transacción: el saldo de la cuenta vuelve exacto y el estado del gasto se
   * recalcula solo (los pagos anulados no cuentan).
   *
   * Candados en el mismo orden que el alta de pagos: gasto → pago.
   *
   * @param opts.country si viene y difiere del país del gasto, 404.
   */
  async voidPayment(
    ctx: TenantContext,
    recordId: number,
    paymentId: number,
    reason: string,
    adminId: number,
    opts: { country?: ExpenseCountry | null } = {},
  ): Promise<ExpenseRecordDetail> {
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    if (trimmedReason.length === 0) {
      throw new BadRequestError("El motivo de la anulación es obligatorio");
    }

    await this.db.transaction(async (tx) => {
      // a. Gasto, PRIMER candado.
      const [record] = await tx
        .select({
          id: schema.expenseRecords.id,
          country: schema.expenseRecords.country,
        })
        .from(schema.expenseRecords)
        .where(
          and(
            tenantWhere(schema.expenseRecords, ctx),
            eq(schema.expenseRecords.id, recordId),
          ),
        )
        .limit(1)
        .for("update");
      if (!record || (opts.country && record.country !== opts.country)) {
        throw new NotFoundError("Gasto no encontrado");
      }

      // b. Pago de ESE gasto, SEGUNDO candado.
      const [payment] = await tx
        .select()
        .from(schema.expensePayments)
        .where(
          and(
            tenantWhere(schema.expensePayments, ctx),
            eq(schema.expensePayments.id, paymentId),
            eq(schema.expensePayments.expenseRecordId, recordId),
          ),
        )
        .limit(1)
        .for("update");
      if (!payment) throw new NotFoundError("Pago no encontrado");
      if (payment.voidedAt !== null) {
        throw new BadRequestError("El pago ya está anulado");
      }

      // c. Fila del ledger: el camino de anulación existente, en esta tx.
      await this.txnService.voidInTx(ctx, tx, payment.transactionId, adminId, {
        reason: trimmedReason,
      });

      // d. Fila del pago.
      await tx
        .update(schema.expensePayments)
        .set({
          voidedAt: new Date(),
          voidedBy: adminId,
          voidReason: trimmedReason,
        })
        .where(
          and(
            tenantWhere(schema.expensePayments, ctx),
            eq(schema.expensePayments.id, paymentId),
          ),
        );

      // e. Rastro en el historial del gasto.
      await auditLog.write(ctx, tx, {
        actorId: adminId,
        action: "expense_payment_voided",
        targetKind: "expense_record",
        targetId: recordId,
        payload: {
          paymentId,
          transactionId: payment.transactionId,
          amount: payment.amount,
          appliedAmount: payment.appliedAmount,
          currency: payment.currency,
        },
        reason: trimmedReason,
      });

      this.log.info(
        {
          expenseRecordId: recordId,
          paymentId,
          transactionId: payment.transactionId,
          amount: payment.amount,
          currency: payment.currency,
        },
        "Pago de gasto anulado",
      );
    });

    return this.recordService.getDetail(ctx, recordId, {
      country: opts.country,
    });
  }

  /**
   * Cuentas desde las que se puede pagar un gasto del país (DI-07): activas, en
   * una moneda del país y sin sede o de una sede del país. Incluye bancos, Caja
   * central y Tesoro. NUNCA devuelve saldos: gestion tiene que poder elegirlas
   * aunque Saldos por caja sea owner-only para las cuentas sin sede (T-209-18).
   *
   * Orden: efectivo de sede (por nombre de sede), efectivo sin sede (Central y
   * después Tesoros) y bancos; dentro de cada grupo, por nombre.
   */
  async listPaymentAccounts(
    ctx: TenantContext,
    country: ExpenseCountry,
  ): Promise<ExpensePaymentAccount[]> {
    const cr = schema.cashRegisters;
    const br = schema.branches;
    const rows = await this.db
      .select({
        id: cr.id,
        name: cr.name,
        type: cr.type,
        currency: cr.currency,
        branchId: cr.branchId,
        branchName: br.name,
        isTreasury: cr.isTreasury,
        cutoffDate: cr.cutoffDate,
      })
      .from(cr)
      .leftJoin(br, and(tenantWhere(br, ctx), eq(br.id, cr.branchId)))
      .where(
        and(
          tenantWhere(cr, ctx),
          eq(cr.isActive, true),
          inArray(cr.currency, [...EXPENSE_CURRENCIES_BY_COUNTRY[country]]),
          or(isNull(cr.branchId), eq(br.country, country)),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${cr.type} = 'efectivo' AND ${cr.branchId} IS NOT NULL THEN 0 WHEN ${cr.type} = 'efectivo' THEN 1 ELSE 2 END`,
        asc(br.name),
        asc(cr.isTreasury),
        asc(cr.name),
        asc(cr.id),
      );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      currency: r.currency,
      branchId: r.branchId,
      branchName: r.branchName,
      isTreasury: Boolean(r.isTreasury),
      cutoffDate: r.cutoffDate,
    }));
  }

  /**
   * Opciones del formulario de gasto y de pago: moneda y monedas del país,
   * "hoy" del país, cuentas para pagar (sin saldos), destinos del reparto
   * (sedes operativas y, solo en Argentina, Casa Matriz al final) y rubros
   * activos del país sin el de Retiros.
   */
  async getFormOptions(
    ctx: TenantContext,
    country: ExpenseCountry,
  ): Promise<ExpenseFormOptions> {
    const [today, accounts, branches, costCenters] = await Promise.all([
      countryToday(this.db, ctx, country),
      this.listPaymentAccounts(ctx, country),
      listOperationalBranches(this.db, ctx, country),
      this.db
        .select({
          id: schema.costCenters.id,
          name: schema.costCenters.name,
        })
        .from(schema.costCenters)
        .where(
          and(
            tenantWhere(schema.costCenters, ctx),
            eq(schema.costCenters.country, country),
            eq(schema.costCenters.isActive, true),
            ne(schema.costCenters.name, RETIROS_COST_CENTER_NAME),
          ),
        )
        .orderBy(asc(schema.costCenters.name), asc(schema.costCenters.id)),
    ]);

    const destinations: ExpenseDestinationOption[] = branches.map((b) => ({
      branchId: b.id,
      name: b.name,
    }));
    if (casaMatrizAllowed(country)) {
      destinations.push({ branchId: null, name: CASA_MATRIZ_LABEL });
    }

    return {
      country,
      countryCurrency: countryCurrencyOf(country),
      expenseCurrencies: [...EXPENSE_CURRENCIES_BY_COUNTRY[country]],
      today,
      accounts,
      destinations,
      costCenters,
    };
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  /** Pago ya creado con esa clave (en cualquier gasto del gimnasio), o null. */
  private async findByIdempotencyKey(
    ctx: TenantContext,
    key: string,
  ): Promise<{ id: number; expenseRecordId: number } | null> {
    const [existing] = await this.db
      .select({
        id: schema.expensePayments.id,
        expenseRecordId: schema.expensePayments.expenseRecordId,
      })
      .from(schema.expensePayments)
      .where(
        and(
          tenantWhere(schema.expensePayments, ctx),
          eq(schema.expensePayments.idempotencyKey, key),
        ),
      )
      .limit(1);
    return existing ?? null;
  }

  /** Respuesta de un reintento: el pago que ya existe, sin crear nada. */
  private async existingResult(
    ctx: TenantContext,
    recordId: number,
    existing: { id: number; expenseRecordId: number },
    country: ExpenseCountry | null | undefined,
  ): Promise<{
    record: ExpenseRecordDetail;
    payment: ExpensePaymentItem;
    created: boolean;
  }> {
    if (existing.expenseRecordId !== recordId) {
      throw new ConflictError("Esa clave de pago ya se usó en otro gasto");
    }
    const record = await this.recordService.getDetail(ctx, recordId, {
      country,
    });
    return {
      record,
      payment: this.pickPayment(record, existing.id),
      created: false,
    };
  }

  private pickPayment(
    record: ExpenseRecordDetail,
    paymentId: number,
  ): ExpensePaymentItem {
    const payment = record.payments.find((p) => p.id === paymentId);
    if (!payment) {
      throw new Error(
        `El pago ${paymentId} no aparece en el detalle del gasto ${record.id}`,
      );
    }
    return payment;
  }
}
