// Módulo: finance — fase 211 (Resultado por sede y consolidado)
//
// Junta lo que ya existe en un solo informe, sin consultas propias de gastos
// (DI-08): el COSTO sale únicamente de `ExpenseSummaryService.computeMonth` (la
// misma instancia y el mismo cálculo que el Resumen) y los COBROS de
// `TransactionService.getMemberIncomeByBranch`. El armado de la matriz es de
// `expense-result-math.ts` (puro).
//
//   - DI-02/DI-03: cobros firmes a alumnos por la sede del alumno; solo las
//     sedes del país cuentan.
//   - DI-04: una sede del país con cobros en otra moneda no se suma ni se
//     convierte: queda en `foreignIncome` y se avisa en el log.
//   - DI-05: base mixta. Cobros por fecha de pago dentro del mes; costo por mes
//     de imputación, con los estimados incluidos.
//   - DI-06/DI-07: columnas por sede, Casa Matriz (solo AR) y Consolidado;
//     todo en enteros, el margen es el único decimal (presentación).
//   - DI-10: JSON y Excel salen de `getResult`, una sola función.
//
// Tenancy: `computeMonth`, el lector de cobros y `listCountryBranches` filtran
// con `tenantWhere`.
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import type { TenantContext } from "../shared/tenant";
import { listCountryBranches } from "./expense-branches";
import { countryCurrencyOf, isValidImputationMonth } from "./expense-math";
import {
  buildResultMatrix,
  monthDateRange,
  partitionIncome,
} from "./expense-result-math";
import type { ExpenseSummaryService } from "./expense-summary-service";
import type { ExpenseCountry, ExpenseResult } from "./expense-types";
import type { TransactionService } from "./transaction-service";

type DbInstance = MySql2Database<typeof schema>;

export class ExpenseResultService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly summaryService: ExpenseSummaryService,
    private readonly transactionService: TransactionService,
  ) {}

  /**
   * Resultado del mes para un país: columnas por sede, Casa Matriz (solo AR) y
   * Consolidado, con cobros, costo por rubro, resultado y margen.
   *
   * @throws BadRequestError mes mal formado.
   */
  async getResult(
    ctx: TenantContext,
    country: ExpenseCountry,
    month: string,
  ): Promise<ExpenseResult> {
    if (!isValidImputationMonth(month)) {
      throw new BadRequestError("El mes tiene que tener el formato AAAA-MM");
    }
    const [computed, rawIncome, countryBranches] = await Promise.all([
      this.summaryService.computeMonth(ctx, country, month),
      this.transactionService.getMemberIncomeByBranch(
        ctx,
        monthDateRange(month),
      ),
      listCountryBranches(this.db, ctx, country),
    ]);

    const currency = countryCurrencyOf(country);
    const { incomeByBranch, foreignIncome } = partitionIncome(
      rawIncome,
      countryBranches,
      currency,
    );
    if (foreignIncome.length > 0) {
      this.log.warn(
        { country, month, foreignIncome },
        "Resultado por sede: cobros en otra moneda, no se suman",
      );
    }

    const { columns, costCenters } = buildResultMatrix({
      destinations: computed.destinations,
      records: computed.records,
      incomeByBranch,
      countryBranches,
    });

    return {
      month,
      country,
      currency,
      columns,
      costCenters,
      incomplete: computed.incomplete,
      foreignIncome,
    };
  }
}
