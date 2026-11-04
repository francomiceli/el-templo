/**
 * Calculadora del Tablero semanal (fase 206-05): llama UNA vez a cada servicio
 * de origen y devuelve mapas por sede con ceros explícitos.
 *
 * Las queries son del tenant entero (nada de `scope.country`, D-27): el
 * servicio filtra después por las columnas visibles. Cada fuente se consulta
 * una vez por semana necesaria, nunca una vez por sede (T-206-16).
 *
 * Los servicios de origen devuelven mapas SIN las sedes sin datos (clave
 * ausente = ceros). Acá se vuelve explícito: "0" (hubo consulta y no pasó nada)
 * no es "sin dato" (null, que decide el servicio según la foto).
 */
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { addDays } from "../shared/date-utils";
import type { TenantContext } from "../shared/tenant";
import { ReportsService } from "../reports/service";
import { RenewalsService } from "../renewals/service";
import { AnalyticsService } from "../analytics/service";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../finance";
import { weekRange } from "./week";
import type {
  BoardBranch,
  BoardWarning,
  LateBlockValues,
  MainBlockValues,
} from "./types";

/** Flujos de la semana: lo que se calcula sobre el rango (cobrado, vencen la semana que viene). */
export interface WeekFlows {
  cobrado: number;
  vencenSemanaSiguiente: number;
}

/** Foto del momento: deuda y activos "a hoy" (D-20, D-21). */
export interface PointInTime {
  deudaCobrable: number;
  deudaMas10: number;
  deudaIncobrable: number;
  activos: number;
}

export class BoardCalculator {
  private reports: ReportsService;
  private renewals: RenewalsService;
  private transactions: TransactionService;
  private analytics: AnalyticsService;

  constructor(
    db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {
    this.reports = new ReportsService(db, log);
    this.renewals = new RenewalsService(db, log);
    this.transactions = new TransactionService(
      db,
      log,
      new BalanceService(db, log),
      new CashRegisterService(db, log),
    );
    this.analytics = new AnalyticsService(db, log);
  }

  /**
   * Cobrado de la semana (por sede del alumno, D-12/D-14, en la moneda de la
   * sede) y "vencen la semana que viene" (vencimientos de W+1, D-18).
   *
   * Un monto en otra moneda que la de la sede (supuesto A2 de la research) no se
   * suma: queda como `BoardWarning` y en el log.
   */
  async computeWeekFlows(
    ctx: TenantContext,
    weekStart: string,
    branches: BoardBranch[],
  ): Promise<{ values: Map<number, WeekFlows>; warnings: BoardWarning[] }> {
    const [income, nextWeekKpis] = await Promise.all([
      this.transactions.getIncomeByMemberBranch(ctx, weekRange(weekStart)),
      this.renewals.computeKpisByMemberBranch(
        ctx,
        weekRange(addDays(weekStart, 7)),
      ),
    ]);

    const warnings: BoardWarning[] = [];
    const values = new Map<number, WeekFlows>();
    for (const branch of branches) {
      const amounts = income.get(branch.id);
      this.collectForeignCurrency(
        warnings,
        branch,
        "cobrado",
        amounts ?? new Map<string, number>(),
        weekStart,
      );
      values.set(branch.id, {
        cobrado: amounts?.get(branch.currency) ?? 0,
        vencenSemanaSiguiente: nextWeekKpis.get(branch.id)?.total ?? 0,
      });
    }
    return { values, warnings };
  }

  /**
   * Foto del momento (D-20, D-21): deuda por estado y alumnos activos "a hoy".
   * Para la semana en curso se lee así; para las cerradas se lee de la foto
   * (la deuda y los activos no se pueden pedir "a tal fecha").
   */
  async computePointInTime(
    ctx: TenantContext,
    branches: BoardBranch[],
  ): Promise<{ values: Map<number, PointInTime>; warnings: BoardWarning[] }> {
    const [debts, actives] = await Promise.all([
      this.reports.getDebtTotalsByMemberBranch(ctx),
      this.analytics.countActivePayingMembersByBranch(ctx),
    ]);

    const warnings: BoardWarning[] = [];
    const values = new Map<number, PointInTime>();
    for (const branch of branches) {
      const byCurrency = debts.get(branch.id);
      if (byCurrency) {
        const foreign = new Map<string, number>();
        for (const [currency, totals] of byCurrency) {
          if (currency !== branch.currency) {
            foreign.set(currency, totals.cobrable + totals.incobrable);
          }
        }
        this.collectForeignCurrency(warnings, branch, "deuda", foreign);
      }
      const own = byCurrency?.get(branch.currency);
      values.set(branch.id, {
        deudaCobrable: own?.cobrable ?? 0,
        deudaMas10: own?.mas10 ?? 0,
        deudaIncobrable: own?.incobrable ?? 0,
        activos: actives.get(branch.id) ?? 0,
      });
    }
    return { values, warnings };
  }

  /**
   * Bloque tardío de la semana (embudo + renovaciones) en vivo, con conteos
   * crudos (D-26). Embudo por sede de la clase (D-13); renovaciones por sede
   * del alumno (D-29).
   */
  async computeLate(
    ctx: TenantContext,
    weekStart: string,
    branches: BoardBranch[],
  ): Promise<Map<number, LateBlockValues>> {
    const range = weekRange(weekStart);
    const [tallies, kpis] = await Promise.all([
      this.reports.getTrialSessionTalliesByBranch(ctx, range),
      this.renewals.computeKpisByMemberBranch(ctx, range),
    ]);

    const out = new Map<number, LateBlockValues>();
    for (const branch of branches) {
      const tally = tallies.get(branch.id);
      const kpi = kpis.get(branch.id);
      out.set(branch.id, {
        reservas: tally?.reservations ?? 0,
        reservasOcurridas: tally?.occurred ?? 0,
        asistieron: tally?.attended ?? 0,
        compraron: tally?.purchased ?? 0,
        compraronOcurridas: tally?.purchasedOccurred ?? 0,
        compraronAsistieron: tally?.purchasedAttended ?? 0,
        vencimientos: kpi?.total ?? 0,
        renovaron: kpi?.renovo ?? 0,
        noRenueva: kpi?.noRenovo ?? 0,
        volvioTarde: kpi?.volvioTarde ?? 0,
        sinContactar: kpi?.sinContactar ?? 0,
      });
    }
    return out;
  }

  /**
   * Arma el bloque principal en vivo de una sede. `pointInTime === null` es una
   * semana vieja sin foto: deuda y activos no se pueden reconstruir y van null
   * (D-11); cobrado y "vencen la semana que viene" sí se calculan.
   */
  static composeMain(
    flows: WeekFlows | undefined,
    pointInTime: PointInTime | null | undefined,
  ): MainBlockValues {
    return {
      cobrado: flows ? flows.cobrado : null,
      vencenSemanaSiguiente: flows ? flows.vencenSemanaSiguiente : null,
      deudaCobrable: pointInTime ? pointInTime.deudaCobrable : null,
      deudaMas10: pointInTime ? pointInTime.deudaMas10 : null,
      deudaIncobrable: pointInTime ? pointInTime.deudaIncobrable : null,
      activos: pointInTime ? pointInTime.activos : null,
    };
  }

  /** Avisa de montos en otra moneda que la de la sede: no se suman, se muestran como advertencia. */
  private collectForeignCurrency(
    warnings: BoardWarning[],
    branch: BoardBranch,
    metric: BoardWarning["metric"],
    amounts: Map<string, number>,
    weekStart?: string,
  ): void {
    for (const [currency, amount] of amounts) {
      if (currency === branch.currency || amount === 0) continue;
      warnings.push({ branchId: branch.id, metric, currency, amount });
      this.log.warn(
        {
          branchId: branch.id,
          metric,
          currency,
          expectedCurrency: branch.currency,
          amount,
          weekStart,
        },
        "Tablero: monto en otra moneda que la de la sede, no se suma",
      );
    }
  }
}
