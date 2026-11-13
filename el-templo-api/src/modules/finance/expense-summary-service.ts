// Módulo: finance — fase 209 (Egresos): el Resumen mensual por destino (DI-12).
//
// Para un mes `AAAA-MM` y un país, en la moneda del país (ARS en AR, con los
// gastos en USD convertidos por su tipo de cambio de referencia; EUR en ES),
// por destino (cada sede operativa, las sedes inactivas que tengan reparto ese
// mes, Casa Matriz solo en AR y el Total) se miden TRES cosas:
//
//   1. PAGADO EN EL MES: los pagos vigentes con `paid_on` dentro del mes,
//      prorrateados entre los destinos del reparto de SU gasto. Un pago de
//      octubre de una factura de septiembre cuenta en octubre.
//   2. COSTO DEL MES: el reparto de los gastos IMPUTADOS al mes (`imputation_month`),
//      estén pagados o no, con el subtotal de los estimados aparte.
//   3. PENDIENTE: la parte impaga de ese costo.
//
// Y de ahí sale una cuarta columna derivada: `costPaid = cost - pending` ("pagado
// de ese costo"), de modo que por destino y en el total SIEMPRE se cumple
// `cost = costPaid + pending` y ninguna parte es negativa.
//
// Interpretación registrada (plan 209-09): el "pendiente" en pesos de un gasto en
// USD es el saldo impago en USD × el tipo de cambio de referencia del gasto, con
// tope en su costo. El "pagado de ese costo" es costo - pendiente (así la
// identidad es exacta aunque los pagos hayan usado otro tipo de cambio: lo que
// efectivamente salió en pesos está en "pagado en el mes", que usa `amount_ars`).
// Lo pendiente se prorratea con `prorateCapped` sobre el costo de cada destino.
//
// Toda la aritmética es entera y sale de `expense-math.ts` (prorrateos con resto
// al último destino y suma exacta). Acá no hay redondeos propios y `fx_rate`
// nunca se suma: solo convierte, una vez, dentro de `expense-math.ts`.
//
// Un único cálculo (`computeMonth`) alimenta el Resumen, el detalle por rubro y
// concepto y, en 209-10, el Excel: los tres muestran los mismos números.
//
// Tenancy: toda query lleva `tenantWhere` (también el join, en el ON). Sin N+1:
// una query por tabla para el mes y agregación en memoria.
import { and, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { shiftMonth } from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  CASA_MATRIZ_LABEL,
  branchNamesByIds,
  casaMatrizAllowed,
  listOperationalBranches,
} from "./expense-branches";
import {
  countryCurrencyOf,
  expenseCostInCountryCurrency,
  expenseStatusOf,
  isValidImputationMonth,
  prorateByWeights,
  prorateCapped,
  toCountryCurrency,
} from "./expense-math";
import {
  toExpenseCurrency,
  type ExpenseRecordService,
} from "./expense-record-service";
import type {
  ExpenseAmountStatus,
  ExpenseCountry,
  ExpenseCurrency,
  ExpenseSummary,
  ExpenseSummaryColumn,
  ExpenseSummaryConcept,
  ExpenseSummaryDetail,
  ExpenseSummaryDetailGroup,
} from "./expense-types";

type DbInstance = MySql2Database<typeof schema>;

/** Clave de la columna de Casa Matriz. */
export const SUMMARY_CASA_MATRIZ_KEY = "casa_matriz";
/** Clave de la columna del total. */
export const SUMMARY_TOTAL_KEY = "total";

/** Parte de un gasto que le toca a un destino. Enteros, en la moneda del país. */
export interface ExpenseMonthShare {
  /** parte del costo del mes (solo si el gasto está imputado al mes) */
  cost: number;
  /** la parte de `cost` que viene de un importe estimado */
  costEstimated: number;
  /** parte impaga de `cost` */
  pending: number;
  /** parte de los pagos del mes */
  paidInMonth: number;
}

/** Un destino del Resumen (todavía sin el Total). */
export interface ExpenseMonthDestination {
  /** id de sede como string o "casa_matriz" */
  key: string;
  branchId: number | null;
  name: string;
  isActive: boolean;
}

/** Un gasto que aporta algo al mes, con su parte por destino. */
export interface ExpenseMonthRecord {
  id: number;
  concept: string;
  beneficiary: string | null;
  costCenterId: number;
  costCenterName: string;
  imputationMonth: string;
  amountStatus: ExpenseAmountStatus;
  currency: ExpenseCurrency;
  /** destKey -> su parte. Solo trae los destinos del reparto del gasto. */
  shares: Map<string, ExpenseMonthShare>;
}

/** Resultado de `computeMonth`: base común de resumen, detalle y Excel. */
export interface ExpenseMonthComputation {
  country: ExpenseCountry;
  month: string;
  currency: "ARS" | "EUR";
  /** En el orden del Resumen, sin el Total. */
  destinations: ExpenseMonthDestination[];
  records: ExpenseMonthRecord[];
  incomplete: ExpenseSummary["incomplete"];
}

/** Una fila del detalle del Excel: un gasto en un destino. Enteros, en la moneda del país. */
export interface ExpenseExportRow {
  /** nombre de la sede o "Casa Matriz" */
  destination: string;
  destinationKey: string;
  destinationIsActive: boolean;
  /** posición del destino entre las columnas del Resumen (para ordenar) */
  destinationOrder: number;
  costCenterName: string;
  costCenterId: number;
  expenseRecordId: number;
  concept: string;
  beneficiary: string | null;
  imputationMonth: string;
  estimated: boolean;
  cost: number;
  pending: number;
  paidInMonth: number;
}

/** Lo que necesita `buildExpenseSummaryWorkbook`. */
export interface ExpenseExportData {
  summary: ExpenseSummary;
  rows: ExpenseExportRow[];
}

const EMPTY_SHARE: ExpenseMonthShare = {
  cost: 0,
  costEstimated: 0,
  pending: 0,
  paidInMonth: 0,
};

function destKeyOf(branchId: number | null): string {
  return branchId === null ? SUMMARY_CASA_MATRIZ_KEY : String(branchId);
}

function hasAnyValue(s: ExpenseMonthShare): boolean {
  return s.cost !== 0 || s.pending !== 0 || s.paidInMonth !== 0;
}

function addShare(
  a: ExpenseMonthShare,
  b: ExpenseMonthShare,
): ExpenseMonthShare {
  return {
    cost: a.cost + b.cost,
    costEstimated: a.costEstimated + b.costEstimated,
    pending: a.pending + b.pending,
    paidInMonth: a.paidInMonth + b.paidInMonth,
  };
}

function shareOf(
  shares: Map<string, ExpenseMonthShare>,
  key: string,
): ExpenseMonthShare {
  let share = shares.get(key);
  if (!share) {
    share = { ...EMPTY_SHARE };
    shares.set(key, share);
  }
  return share;
}

export class ExpenseSummaryService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly recordService: ExpenseRecordService,
  ) {}

  /**
   * Resumen del mes: una columna por destino y la del Total (suma de las
   * anteriores). Por columna `cost = costPaid + pending`.
   */
  async getSummary(
    ctx: TenantContext,
    country: ExpenseCountry,
    month: string,
  ): Promise<ExpenseSummary> {
    return this.summaryOf(await this.computeMonth(ctx, country, month));
  }

  /**
   * Datos del Excel (DI-12): el Resumen y el detalle por gasto y destino salen
   * de UN SOLO `computeMonth`, así que el Excel muestra exactamente los mismos
   * números que `getSummary` y `getDetail` (nada se recalcula).
   *
   * `rows` trae una fila por gasto y destino con algún valor distinto de cero,
   * ordenadas por destino (en el orden de las columnas del Resumen), rubro y
   * concepto. No incluye el Total: sumar las filas de un destino da su columna.
   */
  async getExportData(
    ctx: TenantContext,
    country: ExpenseCountry,
    month: string,
  ): Promise<ExpenseExportData> {
    const computed = await this.computeMonth(ctx, country, month);
    const summary = this.summaryOf(computed);

    const rows: ExpenseExportRow[] = [];
    computed.destinations.forEach((destination, destinationOrder) => {
      for (const r of computed.records) {
        const share = r.shares.get(destination.key);
        if (!share || !hasAnyValue(share)) continue;
        rows.push({
          destination: destination.name,
          destinationKey: destination.key,
          destinationIsActive: destination.isActive,
          destinationOrder,
          costCenterName: r.costCenterName,
          costCenterId: r.costCenterId,
          expenseRecordId: r.id,
          concept: r.concept,
          beneficiary: r.beneficiary,
          imputationMonth: r.imputationMonth,
          estimated: r.amountStatus === "estimado",
          cost: share.cost,
          pending: share.pending,
          paidInMonth: share.paidInMonth,
        });
      }
    });
    rows.sort(
      (a, b) =>
        a.destinationOrder - b.destinationOrder ||
        a.costCenterName.localeCompare(b.costCenterName, "es") ||
        a.costCenterId - b.costCenterId ||
        a.concept.localeCompare(b.concept, "es") ||
        a.expenseRecordId - b.expenseRecordId,
    );

    return { summary, rows };
  }

  /** Arma las columnas del Resumen (y el Total) desde el cálculo del mes. */
  private summaryOf(computed: ExpenseMonthComputation): ExpenseSummary {
    const columns: ExpenseSummaryColumn[] = computed.destinations.map((d) => {
      let total = { ...EMPTY_SHARE };
      for (const r of computed.records) {
        const share = r.shares.get(d.key);
        if (share) total = addShare(total, share);
      }
      return {
        key: d.key,
        branchId: d.branchId,
        name: d.name,
        isActive: d.isActive,
        paidInMonth: total.paidInMonth,
        cost: total.cost,
        costEstimated: total.costEstimated,
        costPaid: total.cost - total.pending,
        pending: total.pending,
      };
    });

    const totalColumn: ExpenseSummaryColumn = {
      key: SUMMARY_TOTAL_KEY,
      branchId: null,
      name: "Total",
      isActive: true,
      paidInMonth: columns.reduce((acc, c) => acc + c.paidInMonth, 0),
      cost: columns.reduce((acc, c) => acc + c.cost, 0),
      costEstimated: columns.reduce((acc, c) => acc + c.costEstimated, 0),
      costPaid: columns.reduce((acc, c) => acc + c.costPaid, 0),
      pending: columns.reduce((acc, c) => acc + c.pending, 0),
    };
    columns.push(totalColumn);

    this.log.debug(
      {
        country: computed.country,
        month: computed.month,
        destinations: computed.destinations.length,
      },
      "Resumen de egresos calculado",
    );

    return {
      month: computed.month,
      country: computed.country,
      currency: computed.currency,
      columns,
      incomplete: computed.incomplete,
    };
  }

  /**
   * Detalle de un destino (o del Total) agrupado por rubro y concepto, con los
   * mismos números que su columna del Resumen. Solo las filas con algún valor
   * distinto de cero para ese destino.
   *
   * @throws NotFoundError destino que no es una sede del gimnasio y del país, o
   *   "casa_matriz" en un país que no la admite.
   */
  async getDetail(
    ctx: TenantContext,
    country: ExpenseCountry,
    month: string,
    destination: "total" | "casa_matriz" | number,
  ): Promise<ExpenseSummaryDetail> {
    if (!isValidImputationMonth(month)) {
      throw new BadRequestError("El mes tiene que tener el formato AAAA-MM");
    }

    let destinationKey: string;
    let destinationName: string;
    if (destination === SUMMARY_TOTAL_KEY) {
      destinationKey = SUMMARY_TOTAL_KEY;
      destinationName = "Total";
    } else if (destination === SUMMARY_CASA_MATRIZ_KEY) {
      if (!casaMatrizAllowed(country)) {
        throw new NotFoundError("Destino no encontrado");
      }
      destinationKey = SUMMARY_CASA_MATRIZ_KEY;
      destinationName = CASA_MATRIZ_LABEL;
    } else if (
      typeof destination === "number" &&
      Number.isInteger(destination)
    ) {
      const [branch] = await this.db
        .select({ id: schema.branches.id, name: schema.branches.name })
        .from(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, ctx),
            eq(schema.branches.id, destination),
            eq(schema.branches.country, country),
          ),
        )
        .limit(1);
      if (!branch) throw new NotFoundError("Destino no encontrado");
      destinationKey = String(branch.id);
      destinationName = branch.name;
    } else {
      throw new NotFoundError("Destino no encontrado");
    }

    const computed = await this.computeMonth(ctx, country, month);

    const groups = new Map<number, ExpenseSummaryDetailGroup>();
    for (const r of computed.records) {
      let share: ExpenseMonthShare = { ...EMPTY_SHARE };
      if (destinationKey === SUMMARY_TOTAL_KEY) {
        for (const s of r.shares.values()) share = addShare(share, s);
      } else {
        share = r.shares.get(destinationKey) ?? share;
      }
      if (!hasAnyValue(share)) continue;

      let group = groups.get(r.costCenterId);
      if (!group) {
        group = {
          costCenterId: r.costCenterId,
          costCenterName: r.costCenterName,
          cost: 0,
          pending: 0,
          paidInMonth: 0,
          concepts: [],
        };
        groups.set(r.costCenterId, group);
      }
      const concept: ExpenseSummaryConcept = {
        expenseRecordId: r.id,
        concept: r.concept,
        beneficiary: r.beneficiary,
        imputationMonth: r.imputationMonth,
        estimated: r.amountStatus === "estimado",
        cost: share.cost,
        pending: share.pending,
        paidInMonth: share.paidInMonth,
      };
      group.concepts.push(concept);
      group.cost += share.cost;
      group.pending += share.pending;
      group.paidInMonth += share.paidInMonth;
    }

    const ordered = [...groups.values()].sort(
      (a, b) =>
        a.costCenterName.localeCompare(b.costCenterName, "es") ||
        a.costCenterId - b.costCenterId,
    );
    for (const g of ordered) {
      g.concepts.sort(
        (a, b) =>
          a.concept.localeCompare(b.concept, "es") ||
          a.expenseRecordId - b.expenseRecordId,
      );
    }

    return {
      month: computed.month,
      country: computed.country,
      currency: computed.currency,
      destination: destinationKey,
      destinationName,
      groups: ordered,
    };
  }

  /**
   * Cálculo único del mes (ver el docblock del archivo). Lo reutilizan el
   * resumen, el detalle y el Excel.
   *
   * Un gasto aporta al mes si está imputado a él (costo y pendiente) y/o si tiene
   * pagos vigentes con fecha dentro del mes (pagado). Los gastos y los pagos
   * anulados no cuentan.
   *
   * @throws BadRequestError mes mal formado.
   * @throws Error datos corruptos (gasto sin reparto, pago en pesos sin
   *   `amount_ars`): es un error visible, nunca un número silenciosamente mal.
   */
  async computeMonth(
    ctx: TenantContext,
    country: ExpenseCountry,
    month: string,
  ): Promise<ExpenseMonthComputation> {
    if (!isValidImputationMonth(month)) {
      throw new BadRequestError("El mes tiene que tener el formato AAAA-MM");
    }
    const monthStart = `${month}-01`;
    const nextMonthStart = `${shiftMonth(month, 1)}-01`;
    const countryCurrency = countryCurrencyOf(country);

    // 1. Pagos vigentes del mes de gastos vigentes del país.
    const paymentRows = await this.db
      .select({
        id: schema.expensePayments.id,
        expenseRecordId: schema.expensePayments.expenseRecordId,
        amount: schema.expensePayments.amount,
        amountArs: schema.expensePayments.amountArs,
      })
      .from(schema.expensePayments)
      .innerJoin(
        schema.expenseRecords,
        and(
          eq(schema.expenseRecords.id, schema.expensePayments.expenseRecordId),
          tenantWhere(schema.expenseRecords, ctx),
        ),
      )
      .where(
        and(
          tenantWhere(schema.expensePayments, ctx),
          isNull(schema.expensePayments.voidedAt),
          gte(schema.expensePayments.paidOn, monthStart),
          lt(schema.expensePayments.paidOn, nextMonthStart),
          eq(schema.expenseRecords.country, country),
          isNull(schema.expenseRecords.voidedAt),
        ),
      );
    const paidRecordIds = [
      ...new Set(paymentRows.map((p) => p.expenseRecordId)),
    ];

    // 2. Gastos relevantes: imputados al mes o con pagos en el mes.
    const monthCondition =
      paidRecordIds.length > 0
        ? or(
            eq(schema.expenseRecords.imputationMonth, month),
            inArray(schema.expenseRecords.id, paidRecordIds),
          )
        : eq(schema.expenseRecords.imputationMonth, month);
    const recordRows = await this.db
      .select()
      .from(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, ctx),
          eq(schema.expenseRecords.country, country),
          isNull(schema.expenseRecords.voidedAt),
          monthCondition,
        ),
      );

    const recordIds = recordRows.map((r) => r.id);
    const imputedIds = recordRows
      .filter((r) => r.imputationMonth === month)
      .map((r) => r.id);
    const costCenterIds = [...new Set(recordRows.map((r) => r.costCenterId))];

    // 3. Reparto, pagado vigente, rubros y sedes operativas: una query cada uno.
    const [
      allocationsByRecord,
      paidByRecord,
      costCenterRows,
      operationalBranches,
    ] = await Promise.all([
      this.recordService.loadAllocations(ctx, recordIds),
      this.recordService.loadPaidByRecord(ctx, imputedIds),
      costCenterIds.length === 0
        ? Promise.resolve([] as Array<{ id: number; name: string }>)
        : this.db
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
      listOperationalBranches(this.db, ctx, country),
    ]);
    const costCenterNames = new Map(costCenterRows.map((c) => [c.id, c.name]));

    const allocationsOf = (recordId: number) => {
      const parts = allocationsByRecord.get(recordId);
      if (!parts || parts.length === 0) {
        throw new Error(`El gasto ${recordId} no tiene reparto`);
      }
      return parts;
    };

    // 4. Parte de cada gasto por destino.
    const records = new Map<number, ExpenseMonthRecord>();
    const incomplete = {
      total: 0,
      estimated: 0,
      missingFxRate: 0,
      missingReceipts: 0,
    };

    for (const row of recordRows) {
      const currency = toExpenseCurrency(row.currency);
      const record: ExpenseMonthRecord = {
        id: row.id,
        concept: row.concept,
        beneficiary: row.beneficiary,
        costCenterId: row.costCenterId,
        costCenterName:
          costCenterNames.get(row.costCenterId) ?? `Rubro ${row.costCenterId}`,
        imputationMonth: row.imputationMonth,
        amountStatus: row.amountStatus,
        currency,
        shares: new Map(),
      };
      records.set(row.id, record);

      if (row.imputationMonth !== month) continue;

      // Costo y pendiente: solo los gastos imputados al mes.
      const parts = allocationsOf(row.id);
      const isEstimated = row.amountStatus === "estimado";
      const missingFxRate =
        country === "AR" && currency === "USD" && row.fxRate === null;
      const missingReceipts = (row.receiptLinks?.length ?? 0) === 0;
      if (isEstimated) incomplete.estimated += 1;
      if (missingFxRate) incomplete.missingFxRate += 1;
      if (missingReceipts) incomplete.missingReceipts += 1;
      if (isEstimated || missingFxRate || missingReceipts) {
        incomplete.total += 1;
      }

      const costCC = expenseCostInCountryCurrency({
        country,
        currency,
        amount: row.amount,
        fxRate: row.fxRate,
      });
      // USD sin tipo de cambio: el costo se desconoce y no aporta.
      if (costCC === null) continue;

      const costByDest = prorateByWeights(
        costCC,
        parts.map((p) => p.amount),
      );
      const paid = paidByRecord.get(row.id) ?? 0;
      const remaining = expenseStatusOf(row.amount, paid).pending;
      let pendingCC = remaining;
      if (currency !== countryCurrency) {
        // Gasto en USD de AR: si llegó acá es porque `costCC` no es null, o sea
        // que tiene tipo de cambio.
        if (row.fxRate === null) {
          throw new Error(`El gasto ${row.id} en USD no tiene tipo de cambio`);
        }
        pendingCC = Math.min(toCountryCurrency(remaining, row.fxRate), costCC);
      }
      // prorateCapped lanza Error si pendingCC > costCC: no puede pasar con
      // datos válidos (remaining <= amount) y, si pasa, tiene que verse.
      const pendingByDest = prorateCapped(pendingCC, costByDest);

      parts.forEach((p, i) => {
        const share = shareOf(record.shares, destKeyOf(p.branchId));
        share.cost += costByDest[i];
        share.pending += pendingByDest[i];
        if (isEstimated) share.costEstimated += costByDest[i];
      });
    }

    // Pagado en el mes: cada pago prorrateado según el reparto de SU gasto.
    for (const payment of paymentRows) {
      const record = records.get(payment.expenseRecordId);
      if (!record) {
        throw new Error(
          `El pago ${payment.id} apunta a un gasto fuera del cálculo del mes`,
        );
      }
      const valueCC = country === "AR" ? payment.amountArs : payment.amount;
      if (valueCC === null) {
        throw new Error(`El pago ${payment.id} no tiene su importe en pesos`);
      }
      const parts = allocationsOf(payment.expenseRecordId);
      const paidByDest = prorateByWeights(
        valueCC,
        parts.map((p) => p.amount),
      );
      parts.forEach((p, i) => {
        shareOf(record.shares, destKeyOf(p.branchId)).paidInMonth +=
          paidByDest[i];
      });
    }

    // 5. Destinos en orden: operativas, otras sedes con reparto, Casa Matriz.
    const destinations: ExpenseMonthDestination[] = operationalBranches.map(
      (b) => ({
        key: String(b.id),
        branchId: b.id,
        name: b.name,
        isActive: true,
      }),
    );
    const operationalKeys = new Set(destinations.map((d) => d.key));
    const usedKeys = new Set<string>();
    for (const r of records.values()) {
      for (const key of r.shares.keys()) usedKeys.add(key);
    }

    const extraBranchIds = [...usedKeys]
      .filter((k) => k !== SUMMARY_CASA_MATRIZ_KEY && !operationalKeys.has(k))
      .map(Number);
    if (extraBranchIds.length > 0) {
      const names = await branchNamesByIds(this.db, ctx, extraBranchIds);
      const extras = extraBranchIds
        .map((id) => ({
          id,
          name: names.get(id)?.name ?? `Sede ${id}`,
          isActive: names.get(id)?.isActive ?? false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "es") || a.id - b.id);
      for (const e of extras) {
        destinations.push({
          key: String(e.id),
          branchId: e.id,
          name: e.name,
          isActive: e.isActive,
        });
      }
    }
    if (casaMatrizAllowed(country)) {
      destinations.push({
        key: SUMMARY_CASA_MATRIZ_KEY,
        branchId: null,
        name: CASA_MATRIZ_LABEL,
        isActive: true,
      });
    }

    return {
      country,
      month,
      currency: countryCurrency,
      destinations,
      records: [...records.values()].sort((a, b) => a.id - b.id),
      incomplete,
    };
  }
}
