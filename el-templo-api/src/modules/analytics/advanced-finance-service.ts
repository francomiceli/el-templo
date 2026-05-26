/**
 * Advanced Finance Service (Phase 118 D-07 / D-08 / D-09 / D-11).
 *
 * A NEW domain service (per D-09: new strategic metrics live in their own
 * service — the `analytics/service.ts` monolith is NOT touched; that split is
 * v4.9). Implements PROPUESTA #4: Caja vs Devengado + ARPU, EVERYTHING split
 * per currency (ARS/EUR are NEVER summed), consumed by the admin Finanzas
 * Avanzadas tab (frontend in a later plan):
 *
 *   - CAJA (cash basis, D-08): the same canonical revenue figure `getRevenueTrend`
 *     reports — `financial_transactions` with `kind IN ('plan_charge',
 *     'debt_settlement')`, `direction='inflow'`, `voided_at IS NULL`, grouped by
 *     (month, currency). A long plan paid up-front lands FULLY in the month of
 *     payment. We REPLICATE the query here (D-09) — never invoke the monolith's
 *     private method.
 *
 *   - DEVENGADO (accrual basis, D-07): `price_paid` of each subscription is
 *     prorated over the EFFECTIVE window and distributed month-by-month
 *     proportional to the days the window touches each month:
 *       aporte(mes) = price_paid × (días-de-la-sub-dentro-del-mes ÷ días-totales)
 *     The EFFECTIVE window is `[startDate, MIN(endDate, cancelledAt)]` when
 *     `cancelledAt` is set and earlier than `endDate`, else `[startDate, endDate]`.
 *     This matters because `cancelSubscription` (subscriptions/service.ts) sets
 *     `status='cancelled'` + `cancelledAt` but does NOT shorten `end_date`
 *     (confirmed in code). Without the MIN, a cancelled long plan would inflate
 *     the accrued revenue of months that were never actually served.
 *
 *   - ARPU (D-08): per month and currency, `devengadoDelMes ÷ activosDelMes`,
 *     where `activosDelMes` is the count of members matching the canonical
 *     `activeMemberExists` predicate (NEVER `users.status`).
 *
 * Defensive validation (T-118-08): subscriptions with a null start/end date, an
 * inverted window (end < start), or a zero-day effective window are EXCLUDED from
 * the accrual (they are skipped, never divided by) and counted in
 * `excludedInvalidWindow` so the frontend can surface a caveat. The ARPU
 * denominator (active count) is guarded against zero (→ ARPU 0).
 *
 * Scope (D-11 / T-118-07): every query routes through `applyScope`. The endpoint
 * itself is ADMIN_ROLES-only (requireAdminAnalytics).
 *
 * Uses constructor DI pattern (Phase 56 convention), same shape as
 * AttendanceMetricsService / EngagementService / RetentionService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, isNull, inArray, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { activeMemberExists } from "../shared/active-member";
import type {
  AnalyticsFilters,
  AdvancedFinanceAnalytics,
  RevenueByCurrency,
} from "./types";

/** A subscription row reduced to what the accrual algorithm needs. */
interface AccrualSubRow {
  startDate: string | null;
  endDate: string | null;
  cancelledAt: Date | string | null;
  pricePaid: number;
  currency: string;
}

/** Per-month, per-currency accumulator. */
type CurrencyMap = Map<string, { ARS: number; EUR: number }>;

const MS_PER_DAY = 86_400_000;

/**
 * Whole-day difference `b − a` (both `YYYY-MM-DD`). Positive when `b` is after
 * `a`. Uses UTC midnight so DST / timezone never shifts the count. Returned in
 * INCLUSIVE-day terms by the caller where needed (this is the raw delta).
 */
function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / MS_PER_DAY);
}

/** Parse a `Date | string | null` cancelledAt into a `YYYY-MM-DD` or null. */
function cancelledDateOnly(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // MySQL/Drizzle may hand back a string like "2026-05-26 14:30:00".
  return value.slice(0, 10);
}

/** First day of `month` (`YYYY-MM`) as `YYYY-MM-DD`. */
function monthStart(month: string): string {
  return `${month}-01`;
}

/** Last day of `month` (`YYYY-MM`) as `YYYY-MM-DD`. */
function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  // Day 0 of the next month = last day of this month.
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/** Advance `YYYY-MM` to the next month. */
function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // m is 1-based → Date month index = m → next month
  return d.toISOString().slice(0, 7);
}

export class AdvancedFinanceService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Caja + Devengado + ARPU, all per currency (D-07/D-08). Reads the canonical
   * cash trend, the accrual proration over effective windows, and the active
   * member denominator, then assembles the three monthly series.
   */
  async getAdvancedFinance(
    filters: AnalyticsFilters,
  ): Promise<AdvancedFinanceAnalytics> {
    const [cashMap, accrual] = await Promise.all([
      this.cashTrend(filters),
      this.accruedTrend(filters),
    ]);

    const activeMembers = await this.activeMemberCount(filters);

    // Union of months present in caja or devengado, sorted ascending.
    const months = new Set<string>([...cashMap.keys(), ...accrual.map.keys()]);
    const sortedMonths = [...months].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );

    const cashTrend: Array<{ month: string; ARS: number; EUR: number }> = [];
    const accruedTrend: Array<{ month: string; ARS: number; EUR: number }> = [];
    const arpu: Array<{ month: string; ARS: number; EUR: number }> = [];

    for (const month of sortedMonths) {
      const cash = cashMap.get(month) ?? { ARS: 0, EUR: 0 };
      const accr = accrual.map.get(month) ?? { ARS: 0, EUR: 0 };
      cashTrend.push({ month, ARS: cash.ARS, EUR: cash.EUR });
      accruedTrend.push({ month, ARS: accr.ARS, EUR: accr.EUR });
      // ARPU = devengado del mes ÷ activos. Guard div-by-zero (T-118-08): a
      // month with 0 active members reports ARPU 0 (documented), never NaN.
      arpu.push({
        month,
        ARS: activeMembers > 0 ? Math.round(accr.ARS / activeMembers) : 0,
        EUR: activeMembers > 0 ? Math.round(accr.EUR / activeMembers) : 0,
      });
    }

    return {
      cashTrend,
      accruedTrend,
      arpu,
      excludedInvalidWindow: accrual.excludedInvalidWindow,
    };
  }

  /**
   * CAJA (D-08). Replicates `getRevenueTrend`'s canonical filter
   * (`kind IN ('plan_charge','debt_settlement')`, `direction='inflow'`,
   * `voided_at IS NULL`) grouped by (month, currency). Scope goes through
   * `applyScope` on `users.branchId` (the cash query joins users → branches, so
   * the `branches` join is unconditional here — flavor A). Returns a Map keyed by
   * `YYYY-MM`.
   */
  private async cashTrend(filters: AnalyticsFilters): Promise<CurrencyMap> {
    const { conditions: scopeConditions } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.users.branchId,
    });

    const conditions: SQL[] = [
      isNull(schema.financialTransactions.voidedAt),
      inArray(schema.financialTransactions.kind, [
        "plan_charge",
        "debt_settlement",
      ]) as unknown as SQL,
      eq(schema.financialTransactions.direction, "inflow") as unknown as SQL,
      ...scopeConditions,
    ];
    if (filters.dateFrom !== undefined) {
      conditions.push(
        sql`${schema.financialTransactions.transactionDate} >= ${filters.dateFrom}`,
      );
    }
    if (filters.dateTo !== undefined) {
      conditions.push(
        sql`${schema.financialTransactions.transactionDate} <= ${filters.dateTo}`,
      );
    }

    const rows = await this.db
      .select({
        month: sql<string>`DATE_FORMAT(${schema.financialTransactions.transactionDate}, '%Y-%m')`,
        currency: schema.financialTransactions.currency,
        revenue: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      // Flavor A: branches always joined (country filter needs branches.country).
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions))
      .groupBy(
        sql`DATE_FORMAT(${schema.financialTransactions.transactionDate}, '%Y-%m')`,
        schema.financialTransactions.currency,
      );

    const byMonth: CurrencyMap = new Map();
    for (const r of rows) {
      const month = String(r.month);
      const entry = byMonth.get(month) ?? { ARS: 0, EUR: 0 };
      if (r.currency === "ARS" || r.currency === "EUR") {
        entry[r.currency] = Number(r.revenue);
      }
      byMonth.set(month, entry);
    }
    return byMonth;
  }

  /**
   * DEVENGADO prorrateado (D-07). Reads every subscription in scope (applyScope on
   * `subscriptions.branchId`, flavor B conditional branch join) and prorates
   * `pricePaid` over the EFFECTIVE window into the months it touches. The
   * arithmetic is done in JS (not SQL CASE) for portability. Returns the per-month
   * per-currency map and the count of subs excluded for an invalid window.
   */
  private async accruedTrend(
    filters: AnalyticsFilters,
  ): Promise<{ map: CurrencyMap; excludedInvalidWindow: number }> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    const conditions: SQL[] = [...scopeConditions];

    let query = this.db
      .select({
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
        cancelledAt: schema.subscriptions.cancelledAt,
        pricePaid: schema.subscriptions.pricePaid,
        currency: schema.subscriptions.currency,
      })
      .from(schema.subscriptions)
      .$dynamic();

    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      );
    }

    const rows: AccrualSubRow[] = await query.where(
      conditions.length > 0 ? and(...conditions) : undefined,
    );

    const map: CurrencyMap = new Map();
    let excludedInvalidWindow = 0;

    for (const r of rows) {
      const start = r.startDate;
      // EFFECTIVE end = MIN(endDate, cancelledAt) when cancelled earlier (D-07).
      const cancelled = cancelledDateOnly(r.cancelledAt);
      let effectiveEnd = r.endDate;
      if (
        cancelled !== null &&
        effectiveEnd !== null &&
        dayDiff(cancelled, effectiveEnd) > 0
      ) {
        // cancelled is before endDate → window ends at cancellation.
        effectiveEnd = cancelled;
      }

      // Guard (T-118-08): exclude invalid windows BEFORE any division.
      // duracionTotal is INCLUSIVE day count (start..end inclusive).
      if (start === null || effectiveEnd === null) {
        excludedInvalidWindow += 1;
        continue;
      }
      const spanDays = dayDiff(start, effectiveEnd); // end − start
      if (spanDays < 0) {
        // end < start → inverted window.
        excludedInvalidWindow += 1;
        continue;
      }
      const duracionTotal = spanDays + 1; // inclusive days
      if (duracionTotal <= 0) {
        // Defensive — unreachable given spanDays >= 0, but never divide by 0.
        excludedInvalidWindow += 1;
        continue;
      }

      const currency =
        r.currency === "EUR" ? "EUR" : r.currency === "ARS" ? "ARS" : null;
      if (currency === null) {
        // Unknown currency — skip silently (not an invalid window per se).
        continue;
      }

      // Walk each month the effective window touches and accrue the prorated
      // share = pricePaid × (díasDentroDelMes / duracionTotal).
      let month = start.slice(0, 7);
      const lastMonth = effectiveEnd.slice(0, 7);
      while (month <= lastMonth) {
        const mStart = monthStart(month);
        const mEnd = monthEnd(month);
        // Overlap of [start, effectiveEnd] with [mStart, mEnd], inclusive.
        const lo = start > mStart ? start : mStart;
        const hi = effectiveEnd < mEnd ? effectiveEnd : mEnd;
        const overlapDays = dayDiff(lo, hi) + 1; // inclusive
        if (overlapDays > 0) {
          const aporte = (r.pricePaid * overlapDays) / duracionTotal;
          const entry = map.get(month) ?? { ARS: 0, EUR: 0 };
          entry[currency] += aporte;
          map.set(month, entry);
        }
        month = nextMonth(month);
      }
    }

    // Round each accrued figure to whole units once at the end.
    for (const entry of map.values()) {
      entry.ARS = Math.round(entry.ARS);
      entry.EUR = Math.round(entry.EUR);
    }

    return { map, excludedInvalidWindow };
  }

  /**
   * Count of currently-active members (D-08 ARPU denominator). Uses the canonical
   * `activeMemberExists` predicate (NEVER `users.status`). Scoped via `applyScope`
   * on `users.branchId` (flavor B conditional branch join). This is a point-in-time
   * snapshot reused as the denominator for every month's ARPU — the canonical
   * predicate is "active right now", so ARPU is the per-active-member accrued
   * revenue of each month relative to the current active base.
   */
  private async activeMemberCount(filters: AnalyticsFilters): Promise<number> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.users.branchId,
    });

    const conditions: SQL[] = [
      activeMemberExists(schema.users.id),
      ...scopeConditions,
    ];

    let query = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .$dynamic();

    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.users.branchId),
      );
    }

    const [row] = await query.where(and(...conditions));
    return Number(row?.count ?? 0);
  }
}

/** Re-exported for callers that want the per-currency revenue shape. */
export type { RevenueByCurrency };
