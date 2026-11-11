// Módulo: finance — fase 209 (Egresos): el gasto, su reparto y su estado.
//
// Modelo (DI-01): un GASTO (`expense_records`) es lo que carga administración:
// concepto, rubro, mes de imputación e importe. Su REPARTO (`expense_allocations`)
// lo asigna a sedes y/o a Casa Matriz (`branch_id` NULL). Cada PAGO
// (`expense_payments`) lo cancela de a partes desde una cuenta. OJO con el
// vocabulario: "expense record" es el gasto; `kind = 'expense'` del ledger es la
// salida de plata de un pago.
//
// Reglas de oro:
//   - La plata va en ENTEROS (D-23). El único decimal es `fx_rate`, informativo:
//     se usa UNA vez para calcular un entero y nunca se suma ni se compara. Este
//     service valida `Number.isInteger` por su cuenta: puede usarse sin rutas.
//   - El estado del gasto (pendiente / parcial / pagado), el saldo y el "pagado
//     de más" se CALCULAN y no se guardan (DI-11). El único lugar que lo decide
//     es `expenseStatusOf` y el único origen del "pagado" es `loadPaidByRecord`.
//   - Todo el rastro (alta, ediciones, pagos, anulaciones) va a `audit_log` con
//     `target_kind = 'expense_record'` y `target_id` = id del gasto (DI-09). El
//     historial del detalle se lee de ahí.
//
// Supuesto: el país del gasto lo decide la ruta desde el scope (209-07) y NO se
// puede editar después; tampoco la moneda (DI-09 no los lista como editables).
//
// Tenancy: toda lectura lleva `tenantWhere` (también en los joins: el filtro de
// la tabla unida va en el ON) y todo insert `tenantValues`.
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { auditLog } from "../shared/audit-log";
import { isDuplicateKeyError } from "../shared/sql-errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import {
  CASA_MATRIZ_LABEL,
  branchNamesByIds,
  casaMatrizAllowed,
  listOperationalBranches,
} from "./expense-branches";
import {
  EXPENSE_CURRENCIES_BY_COUNTRY,
  MAX_MONEY,
  assertValidFxRate,
  expenseCostInCountryCurrency,
  expenseStatusOf,
  isValidImputationMonth,
  normalizeReceiptLinks,
  prorateByWeights,
  validateAllocations,
} from "./expense-math";
import {
  EXPENSE_PAYMENT_METHODS,
  type CreateExpenseRecordInput,
  type ExpenseAllocationInput,
  type ExpenseAllocationItem,
  type ExpenseCountry,
  type ExpenseCurrency,
  type ExpenseHistoryItem,
  type ExpensePaymentItem,
  type ExpensePaymentMethod,
  type ExpenseRecordDetail,
  type ExpenseRecordListItem,
} from "./expense-types";
import { RETIROS_COST_CENTER_NAME } from "./withdrawal-service";

type DbInstance = MySql2Database<typeof schema>;

/** Fila de `expense_records` tal como la devuelve Drizzle. */
export type ExpenseRecordRow = typeof schema.expenseRecords.$inferSelect;

const COUNTRY_NAMES: Record<ExpenseCountry, string> = {
  AR: "Argentina",
  ES: "España",
};

const MAX_CONCEPT = 200;
const MAX_BENEFICIARY = 200;
const MAX_NOTES = 2000;
const MAX_IDEMPOTENCY_KEY = 64;

/** País de una fila de DB (varchar) como tipo cerrado. Otro valor es un dato corrupto. */
export function toExpenseCountry(value: string): ExpenseCountry {
  if (value === "AR" || value === "ES") return value;
  throw new Error(`País de gasto inesperado: ${value}`);
}

/** Moneda de una fila de DB (varchar) como tipo cerrado. */
export function toExpenseCurrency(value: string): ExpenseCurrency {
  if (value === "ARS" || value === "USD" || value === "EUR") return value;
  throw new Error(`Moneda de gasto inesperada: ${value}`);
}

function toExpensePaymentMethod(value: string): ExpensePaymentMethod {
  const found = EXPENSE_PAYMENT_METHODS.find((m) => m === value);
  if (!found) throw new Error(`Medio de pago de gasto inesperado: ${value}`);
  return found;
}

/** Nombre y apellido de un usuario, o null si no tiene ninguno. */
function fullName(
  firstName: string | null,
  lastName: string | null,
): string | null {
  const joined = [firstName, lastName]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(" ");
  return joined.length > 0 ? joined : null;
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** Texto opcional recortado: vacío → null, y tope de largo con mensaje en español. */
function optionalText(
  value: string | null | undefined,
  max: number,
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    throw new BadRequestError(
      `${label} no puede superar los ${max} caracteres`,
    );
  }
  return trimmed;
}

export class ExpenseRecordService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Alta de un gasto con su reparto, en UNA transacción, con rastro en
   * `audit_log` (`expense_record_created`).
   *
   * Idempotencia (DI-16): con `idempotencyKey` repetida devuelve el gasto ya
   * creado (`created: false`) sin validar el resto ni escribir nada.
   *
   * Todas las validaciones son `BadRequestError` y corren ANTES de escribir.
   */
  async create(
    ctx: TenantContext,
    country: ExpenseCountry,
    input: CreateExpenseRecordInput,
    adminId: number,
  ): Promise<{ record: ExpenseRecordDetail; created: boolean }> {
    // 1. Idempotencia.
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    if (idempotencyKey !== null) {
      const existing = await this.findByIdempotencyKey(
        ctx,
        country,
        idempotencyKey,
      );
      if (existing !== null) {
        return {
          record: await this.getDetail(ctx, existing, { country }),
          created: false,
        };
      }
    }

    // 2. Validaciones.
    const concept = (input.concept ?? "").trim();
    if (concept.length === 0) {
      throw new BadRequestError("El concepto es obligatorio");
    }
    if (concept.length > MAX_CONCEPT) {
      throw new BadRequestError(
        `El concepto no puede superar los ${MAX_CONCEPT} caracteres`,
      );
    }
    const beneficiary = optionalText(
      input.beneficiary,
      MAX_BENEFICIARY,
      "El beneficiario",
    );
    if (!isValidImputationMonth(input.imputationMonth)) {
      throw new BadRequestError(
        "El mes de imputación tiene que tener el formato AAAA-MM",
      );
    }
    const amount = input.amount;
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_MONEY) {
      throw new BadRequestError(
        "El importe tiene que ser un número entero mayor a 0",
      );
    }
    const currency = input.currency;
    if (
      !(EXPENSE_CURRENCIES_BY_COUNTRY[country] as readonly string[]).includes(
        currency,
      )
    ) {
      throw new BadRequestError(
        country === "AR"
          ? "Los gastos de Argentina van en ARS o USD"
          : "Los gastos de España van en EUR",
      );
    }
    // Tipo de cambio de referencia (DI-03): solo los gastos de AR en USD lo llevan.
    const fxRate = input.fxRate ?? null;
    if (country === "AR" && currency === "USD") {
      if (fxRate === null) {
        throw new BadRequestError(
          "Un gasto en dólares necesita el tipo de cambio de referencia",
        );
      }
      assertValidFxRate(fxRate);
    } else if (fxRate !== null) {
      throw new BadRequestError(
        "El tipo de cambio solo se carga en gastos en dólares",
      );
    }
    if (
      input.amountStatus !== "estimado" &&
      input.amountStatus !== "confirmado"
    ) {
      throw new BadRequestError(
        "El estado del importe tiene que ser estimado o confirmado",
      );
    }
    await this.assertUsableCostCenter(ctx, country, input.costCenterId);
    const receiptLinks = normalizeReceiptLinks(input.receiptLinks);
    const notes = optionalText(input.notes, MAX_NOTES, "Las observaciones");

    // Destinos válidos del reparto (DI-08): sedes operativas del país del
    // scope, nunca las que vengan en el body sin chequear (T-209-07).
    const operational = await listOperationalBranches(this.db, ctx, country);
    validateAllocations({
      amount,
      allocations: input.allocations ?? [],
      validBranchIds: new Set(operational.map((b) => b.id)),
      allowCasaMatriz: casaMatrizAllowed(country),
    });
    const allocations: ExpenseAllocationInput[] = input.allocations.map(
      (a) => ({ branchId: a.branchId, amount: a.amount }),
    );

    // 3. Una transacción: gasto + reparto + audit.
    let recordId: number;
    try {
      recordId = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.expenseRecords)
          .values(
            tenantValues(ctx, {
              country,
              concept,
              beneficiary,
              costCenterId: input.costCenterId,
              imputationMonth: input.imputationMonth,
              amount,
              currency,
              amountStatus: input.amountStatus,
              fxRate,
              receiptLinks: receiptLinks.length > 0 ? receiptLinks : null,
              notes,
              idempotencyKey,
              createdBy: adminId,
            }),
          )
          .$returningId();

        await tx.insert(schema.expenseAllocations).values(
          allocations.map((a) =>
            tenantValues(ctx, {
              expenseRecordId: row.id,
              branchId: a.branchId,
              amount: a.amount,
            }),
          ),
        );

        await auditLog.write(ctx, tx, {
          actorId: adminId,
          action: "expense_record_created",
          targetKind: "expense_record",
          targetId: row.id,
          payload: {
            concept,
            amount,
            currency,
            amountStatus: input.amountStatus,
            fxRate,
            imputationMonth: input.imputationMonth,
            costCenterId: input.costCenterId,
            allocations,
          },
        });
        return row.id;
      });
    } catch (err: unknown) {
      // 4. Carrera de idempotencia: otro request con la misma clave ganó el
      // insert. Se devuelve el gasto que quedó, sin crear nada.
      if (idempotencyKey !== null && isDuplicateKeyError(err).isDuplicate) {
        const existing = await this.findByIdempotencyKey(
          ctx,
          country,
          idempotencyKey,
        );
        if (existing !== null) {
          return {
            record: await this.getDetail(ctx, existing, { country }),
            created: false,
          };
        }
      }
      throw err;
    }

    // 5. Log sin links ni notas (pueden tener datos sensibles).
    this.log.info(
      { expenseRecordId: recordId, country, amount, currency },
      "Gasto registrado",
    );
    return {
      record: await this.getDetail(ctx, recordId, { country }),
      created: true,
    };
  }

  /**
   * Detalle de un gasto: lista + links, notas, quién lo cargó/anuló, todos los
   * pagos (anulados incluidos) e historial leído de `audit_log`.
   *
   * @param opts.country si viene y difiere del país del gasto, 404: un gasto de
   *   otro país es inexistente para quien no es owner.
   * @throws NotFoundError si no existe, es de otro gimnasio o de otro país.
   */
  async getDetail(
    ctx: TenantContext,
    id: number,
    opts: { country?: ExpenseCountry | null } = {},
  ): Promise<ExpenseRecordDetail> {
    const [row] = await this.db
      .select()
      .from(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, ctx),
          eq(schema.expenseRecords.id, id),
        ),
      )
      .limit(1);
    if (!row || (opts.country && row.country !== opts.country)) {
      throw new NotFoundError("Gasto no encontrado");
    }

    const [item] = await this.toListItems(ctx, [row]);
    const [payments, history] = await Promise.all([
      this.loadPayments(ctx, id),
      this.loadHistory(ctx, id),
    ]);

    // Nombres de usuarios: UNA query para todo lo que muestra el detalle.
    const userIds = new Set<number>([row.createdBy]);
    if (row.voidedBy !== null) userIds.add(row.voidedBy);
    const names = await this.userNamesByIds(ctx, [
      ...userIds,
      ...payments.userIds,
      ...history.userIds,
    ]);
    const nameOf = (userId: number | null): string | null =>
      userId === null ? null : (names.get(userId) ?? null);

    return {
      ...item,
      receiptLinks: row.receiptLinks ?? [],
      notes: row.notes,
      createdByName: nameOf(row.createdBy),
      voidReason: row.voidReason,
      voidedByName: nameOf(row.voidedBy),
      payments: payments.items.map(({ item: p, createdBy, voidedBy }) => ({
        ...p,
        createdByName: nameOf(createdBy),
        voidedByName: nameOf(voidedBy),
      })),
      history: history.items.map(({ item: h, actorId }) => ({
        ...h,
        actorName: nameOf(actorId),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Cargadores en lote (reutilizables por el listado 209-04 y el Resumen 209-09).
  // Cada uno hace UNA query por tabla con `inArray`: ninguno consulta dentro de
  // un loop por gasto.
  // ---------------------------------------------------------------------------

  /**
   * Reparto de varios gastos, en orden de id. Los nombres salen de `branches`
   * (incluye sedes inactivas, para repartos históricos) y `branch_id` NULL se
   * muestra como Casa Matriz.
   */
  async loadAllocations(
    ctx: TenantContext,
    recordIds: number[],
  ): Promise<
    Map<
      number,
      Array<{ branchId: number | null; branchName: string; amount: number }>
    >
  > {
    const result = new Map<
      number,
      Array<{ branchId: number | null; branchName: string; amount: number }>
    >();
    if (recordIds.length === 0) return result;
    const rows = await this.db
      .select({
        expenseRecordId: schema.expenseAllocations.expenseRecordId,
        branchId: schema.expenseAllocations.branchId,
        amount: schema.expenseAllocations.amount,
      })
      .from(schema.expenseAllocations)
      .where(
        and(
          tenantWhere(schema.expenseAllocations, ctx),
          inArray(schema.expenseAllocations.expenseRecordId, recordIds),
        ),
      )
      .orderBy(asc(schema.expenseAllocations.id));

    const branchIds = [
      ...new Set(
        rows.map((r) => r.branchId).filter((b): b is number => b !== null),
      ),
    ];
    const names = await branchNamesByIds(this.db, ctx, branchIds);
    for (const r of rows) {
      const list = result.get(r.expenseRecordId) ?? [];
      list.push({
        branchId: r.branchId,
        branchName:
          r.branchId === null
            ? CASA_MATRIZ_LABEL
            : (names.get(r.branchId)?.name ?? `Sede ${r.branchId}`),
        amount: r.amount,
      });
      result.set(r.expenseRecordId, list);
    }
    return result;
  }

  /**
   * Lo pagado de cada gasto, en la moneda del gasto: Σ `applied_amount` de los
   * pagos con `voided_at IS NULL`. ÚNICA fuente del "pagado" (DI-11): el estado,
   * el saldo y el Resumen salen de acá. Un gasto sin pagos vigentes no aparece
   * en el Map (el que lee usa 0).
   */
  async loadPaidByRecord(
    ctx: TenantContext,
    recordIds: number[],
  ): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (recordIds.length === 0) return result;
    const rows = await this.db
      .select({
        expenseRecordId: schema.expensePayments.expenseRecordId,
        paid: sql<string>`COALESCE(SUM(${schema.expensePayments.appliedAmount}), 0)`,
      })
      .from(schema.expensePayments)
      .where(
        and(
          tenantWhere(schema.expensePayments, ctx),
          inArray(schema.expensePayments.expenseRecordId, recordIds),
          isNull(schema.expensePayments.voidedAt),
        ),
      )
      .groupBy(schema.expensePayments.expenseRecordId);
    for (const r of rows) result.set(r.expenseRecordId, Number(r.paid));
    return result;
  }

  /**
   * Pagos de un gasto (anulados incluidos) por fecha de pago e id, con el
   * nombre de la cuenta. Devuelve también los ids de usuario para que el
   * detalle resuelva nombres con una sola query (`userNamesByIds`).
   */
  async loadPayments(
    ctx: TenantContext,
    recordId: number,
  ): Promise<{
    items: Array<{
      item: Omit<ExpensePaymentItem, "createdByName" | "voidedByName">;
      createdBy: number;
      voidedBy: number | null;
    }>;
    userIds: number[];
  }> {
    const rows = await this.db
      .select({
        payment: schema.expensePayments,
        cashRegisterName: schema.cashRegisters.name,
      })
      .from(schema.expensePayments)
      .leftJoin(
        schema.cashRegisters,
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, schema.expensePayments.cashRegisterId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.expensePayments, ctx),
          eq(schema.expensePayments.expenseRecordId, recordId),
        ),
      )
      .orderBy(
        asc(schema.expensePayments.paidOn),
        asc(schema.expensePayments.id),
      );

    const userIds: number[] = [];
    const items = rows.map(({ payment: p, cashRegisterName }) => {
      userIds.push(p.createdBy);
      if (p.voidedBy !== null) userIds.push(p.voidedBy);
      return {
        item: {
          id: p.id,
          transactionId: p.transactionId,
          paidOn: p.paidOn,
          cashRegisterId: p.cashRegisterId,
          cashRegisterName: cashRegisterName ?? `Cuenta ${p.cashRegisterId}`,
          paymentMethod: toExpensePaymentMethod(p.paymentMethod),
          amount: p.amount,
          currency: p.currency,
          appliedAmount: p.appliedAmount,
          fxRate: p.fxRate,
          amountArs: p.amountArs,
          reference: p.reference,
          notes: p.notes,
          createdAt: p.createdAt.toISOString(),
          voidedAt: iso(p.voidedAt),
          voidReason: p.voidReason,
        },
        createdBy: p.createdBy,
        voidedBy: p.voidedBy,
      };
    });
    return { items, userIds };
  }

  /**
   * Historial de un gasto leído de `audit_log` (`target_kind = 'expense_record'`
   * y `target_id` = id), en orden cronológico. Incluye los eventos de sus pagos
   * (comparten `target_id`; el id del pago va en el payload).
   */
  async loadHistory(
    ctx: TenantContext,
    recordId: number,
  ): Promise<{
    items: Array<{
      item: Omit<ExpenseHistoryItem, "actorName">;
      actorId: number;
    }>;
    userIds: number[];
  }> {
    const rows = await this.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, ctx),
          eq(schema.auditLog.targetKind, "expense_record"),
          eq(schema.auditLog.targetId, recordId),
        ),
      )
      .orderBy(asc(schema.auditLog.createdAt), asc(schema.auditLog.id));
    return {
      items: rows.map((r) => ({
        item: {
          id: r.id,
          at: r.createdAt.toISOString(),
          action: r.action,
          reason: r.reason,
          payload: r.payloadJson,
        },
        actorId: r.actorId,
      })),
      userIds: rows.map((r) => r.actorId),
    };
  }

  /**
   * Convierte filas de `expense_records` en `ExpenseRecordListItem` con UNA
   * query por tabla relacionada (rubros, reparto, pagado). Es el único lugar que
   * arma el estado derivado del gasto:
   *   - `costInCountryCurrency`: costo en la moneda del país (null si es AR en
   *     USD sin tipo de cambio).
   *   - `amountInCountryCurrency` por parte: prorrateo entero con el resto a la
   *     última parte, así la suma de las partes es exactamente el costo.
   *   - `paid` / `pending` / `status` / `overpaid`: `expenseStatusOf` sobre la
   *     suma de pagos vigentes.
   *   - `incomplete` (DI-12): importe estimado, USD sin tipo de cambio o sin
   *     links de comprobante.
   */
  async toListItems(
    ctx: TenantContext,
    rows: ExpenseRecordRow[],
  ): Promise<ExpenseRecordListItem[]> {
    if (rows.length === 0) return [];
    const recordIds = rows.map((r) => r.id);
    const costCenterIds = [...new Set(rows.map((r) => r.costCenterId))];

    const [costCenterRows, allocationsByRecord, paidByRecord] =
      await Promise.all([
        this.db
          .select({
            id: schema.costCenters.id,
            name: schema.costCenters.name,
          })
          .from(schema.costCenters)
          .where(
            and(
              tenantWhere(schema.costCenters, ctx),
              inArray(schema.costCenters.id, costCenterIds),
            ),
          ),
        this.loadAllocations(ctx, recordIds),
        this.loadPaidByRecord(ctx, recordIds),
      ]);
    const costCenterNames = new Map(costCenterRows.map((c) => [c.id, c.name]));

    return rows.map((row) => {
      const country = toExpenseCountry(row.country);
      const currency = toExpenseCurrency(row.currency);
      const costInCountryCurrency = expenseCostInCountryCurrency({
        country,
        currency,
        amount: row.amount,
        fxRate: row.fxRate,
      });
      const parts = allocationsByRecord.get(row.id) ?? [];
      const inCountry =
        costInCountryCurrency === null
          ? null
          : prorateByWeights(
              costInCountryCurrency,
              parts.map((p) => p.amount),
            );
      const allocations: ExpenseAllocationItem[] = parts.map((p, i) => ({
        branchId: p.branchId,
        branchName: p.branchName,
        amount: p.amount,
        amountInCountryCurrency: inCountry === null ? null : inCountry[i],
      }));

      const paid = paidByRecord.get(row.id) ?? 0;
      const { status, pending, overpaid } = expenseStatusOf(row.amount, paid);
      const receiptLinksCount = row.receiptLinks?.length ?? 0;
      const missingFxRate =
        country === "AR" && currency === "USD" && row.fxRate === null;

      return {
        id: row.id,
        country,
        concept: row.concept,
        beneficiary: row.beneficiary,
        costCenterId: row.costCenterId,
        costCenterName:
          costCenterNames.get(row.costCenterId) ?? `Rubro ${row.costCenterId}`,
        imputationMonth: row.imputationMonth,
        amount: row.amount,
        currency,
        amountStatus: row.amountStatus,
        fxRate: row.fxRate,
        costInCountryCurrency,
        paid,
        pending,
        status,
        overpaid,
        receiptLinksCount,
        incomplete:
          row.amountStatus === "estimado" ||
          missingFxRate ||
          receiptLinksCount === 0,
        allocations,
        voidedAt: iso(row.voidedAt),
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  /**
   * Nombre y apellido de varios usuarios en UNA query. Los ids que no existen
   * (o son de otro gimnasio) no aparecen en el Map.
   */
  async userNamesByIds(
    ctx: TenantContext,
    userIds: number[],
  ): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return result;
    const rows = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx), inArray(schema.users.id, ids)),
      );
    for (const r of rows) {
      const name = fullName(r.firstName, r.lastName);
      if (name !== null) result.set(r.id, name);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private normalizeIdempotencyKey(
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

  /**
   * Gasto ya creado con esa clave (id), o null. Una clave usada en otro país
   * es un error del cliente: no se devuelve el gasto ajeno.
   */
  private async findByIdempotencyKey(
    ctx: TenantContext,
    country: ExpenseCountry,
    key: string,
  ): Promise<number | null> {
    const [existing] = await this.db
      .select({
        id: schema.expenseRecords.id,
        country: schema.expenseRecords.country,
      })
      .from(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, ctx),
          eq(schema.expenseRecords.idempotencyKey, key),
        ),
      )
      .limit(1);
    if (!existing) return null;
    if (existing.country !== country) {
      throw new BadRequestError(
        "La clave de idempotencia ya se usó en un gasto de otro país",
      );
    }
    return existing.id;
  }

  /**
   * El rubro tiene que ser del gimnasio, estar activo, ser del país del gasto y
   * no ser "Retiros" (los retiros se registran desde Caja, igual que en
   * `registerExpense`). El id llega del body: input no confiable (T-209-07).
   */
  private async assertUsableCostCenter(
    ctx: TenantContext,
    country: ExpenseCountry,
    costCenterId: number,
  ): Promise<void> {
    const [costCenter] = await this.db
      .select({ id: schema.costCenters.id, name: schema.costCenters.name })
      .from(schema.costCenters)
      .where(
        and(
          tenantWhere(schema.costCenters, ctx),
          eq(schema.costCenters.id, costCenterId),
          eq(schema.costCenters.isActive, true),
          eq(schema.costCenters.country, country),
        ),
      )
      .limit(1);
    if (!costCenter) {
      throw new BadRequestError(
        `Elegí un rubro activo de ${COUNTRY_NAMES[country]}`,
      );
    }
    if (costCenter.name === RETIROS_COST_CENTER_NAME) {
      throw new BadRequestError(
        "Los retiros se registran desde Caja → Retiros, no como gasto",
      );
    }
  }
}
