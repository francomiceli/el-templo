/**
 * Ticket promedio service (Phase 120 Block 6 — TICKET-01..04).
 *
 * A NEW read-only domain service (per the analytics convention: strategic
 * metrics live in their own service; the `analytics/service.ts` monolith is NOT
 * touched). It is the FIRST real consumer of the Phase 120 foundation, composing
 * `deriveDurationTier` (Plan 01), `metricShape` / `median` (Plan 01),
 * `rangeConditions` (Plan 01) and the per-currency `CurrencyMap` discipline
 * (Plan 02) — none of those primitives are re-implemented here.
 *
 * UNIVERSE / PERIOD (D-04): the charge universe is the Phase 105 canonical
 * revenue filter restricted to `kind='plan_charge'` ONLY (membership charges, not
 * debt-settlement rows), `direction='inflow'`, `voided_at IS NULL`, windowed by
 * `transaction_date` over
 * the half-open `[from, to)` range, isolated per currency. `financial_transactions`
 * supplies WHICH charges fall in the period (the COUNT / denominator) + the
 * currency + the period filter — and NOTHING ELSE.
 *
 * TICKET VALUE + DISCOUNT NUMERATOR (user-confirmed): come from the LINKED
 * `subscriptions.price_paid` (the agreed membership price), NOT from
 * `financial_transactions.amount`. `ft.amount` is cash RECEIVED and can be a
 * partial payment — using it would misreport a partial payment as a discount.
 * The join path (FT has no plan/subscription column, only `member_id`):
 *
 *   financial_transactions
 *     JOIN transaction_links tl ON tl.transaction_id = ft.id
 *                              AND tl.target_kind = 'subscription'
 *     JOIN subscriptions      s  ON s.id = tl.target_id
 *     JOIN subscription_plans p  ON p.id = s.plan_id
 *
 * The INNER join on `target_kind='subscription'` CORRECTLY EXCLUDES `plan_charge`s
 * linked via `target_kind='enrollment'` (program-enrollment charges — NOT
 * membership charges). Their count (and any unlinked `plan_charge`) is surfaced in
 * the MANDATORY `excludedNoLink` field, computed as the in-period `plan_charge`
 * universe count MINUS the matched-subscription count.
 *
 * Math, PER CURRENCY (ARS/EUR NEVER summed, FUND-04):
 *   - perPlan ticket = mean of `price_paid > 0` charges grouped by `(name, country)`.
 *   - global ticket  = `SUM(price_paid) / COUNT(charges)` over `price_paid > 0`
 *     (volume-weighted, TICKET-02 — NOT the mean of the per-plan means).
 *   - zeroCount/zeroPct for `price_paid === 0` (excluded from every average).
 *   - discount per charge = `(listBase - price_paid) / listBase` where
 *     `listBase = priceRegularSnapshot ?? plan.priceRegular` (snapshot-null rows
 *     increment `historicalFallbackCount`); BOTH mean and `median` reported.
 *   - cohort split (per plan AND global): `listPrice` (`price_paid === listBase`
 *     AND `priceOverrideAmount` null) vs `discounted` (`price_paid < listBase` OR
 *     `priceOverrideAmount` non-null).
 *   - duration / branch breakdowns via `deriveDurationTier` + the foundation axes.
 *
 * Defensive (T-120-12): every division is guarded — a cohort/plan/branch/global
 * with zero priced charges reports `0`/`null`, never NaN; `listBase <= 0` charges
 * are skipped from discount + cohort classification.
 *
 * Scope (T-120-10): every query routes through `applyScope` on
 * `financialTransactions.branchId`; the route is ADMIN_ROLES-only.
 *
 * Constructor DI (Phase 56), same shape as AdvancedFinanceService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, ne, sql, isNull, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { rangeConditions } from "./cohorts";
// Path directo, NUNCA por el barrel `shared/index.ts` (fase 169).
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { metricShape, median } from "./metric-shape";
import { deriveDurationTier, type DurationTier } from "./duration-tier";
import type {
  AnalyticsFilters,
  TicketAnalytics,
  TicketCurrencyBlock,
  TicketCohortAverage,
  TicketCohortSplit,
  TicketPlanRow,
  TicketBranchRow,
  TicketDurationRow,
} from "./types";

/** The two currencies the ticket reports, NEVER summed. */
type Currency = "ARS" | "EUR";
const CURRENCIES: readonly Currency[] = ["ARS", "EUR"];

/**
 * One in-period membership charge, reduced to what the ticket math needs. The
 * VALUE fields (`pricePaid`, `priceRegularSnapshot`, `priceOverrideAmount`) come
 * from the LINKED subscription row — NOT from `financial_transactions.amount`.
 */
interface ChargeRow {
  currency: string;
  planName: string;
  planCountry: string;
  durationDays: number;
  planPriceRegular: number;
  branchName: string;
  /** The agreed membership price (the ticket value + discount numerator). */
  pricePaid: number;
  /** Forward snapshot of the list price; NULL for historical rows (→ fallback). */
  priceRegularSnapshot: number | null;
  /** Non-null when a custom/override price was applied (cohort signal). */
  priceOverrideAmount: number | null;
}

/** Mutable accumulator for one plan within one currency. */
interface PlanAcc {
  planName: string;
  country: string;
  durationTier: DurationTier | null;
  pricedValues: number[]; // price_paid of charges with price_paid > 0
  discountFractions: number[]; // (listBase - pricePaid)/listBase, listBase>0
  zeroCount: number;
  totalCount: number; // priced + zero (the plan's whole charge population)
  listPriceValues: number[];
  discountedValues: number[];
}

/** Mutable accumulator for one branch within one currency. */
interface BranchAcc {
  branchName: string;
  pricedValues: number[];
  discountFractions: number[];
}

/** Mutable accumulator for one duration tier within one currency. */
interface DurationAcc {
  pricedValues: number[];
}

/** Everything accumulated for a single currency before it is finalized. */
interface CurrencyAcc {
  globalPricedValues: number[];
  globalDiscountFractions: number[];
  globalZeroCount: number;
  globalTotalCount: number;
  globalListPriceValues: number[];
  globalDiscountedValues: number[];
  plans: Map<string, PlanAcc>;
  branches: Map<string, BranchAcc>;
  durations: Map<DurationTier, DurationAcc>;
}

/** U+2016 — illegal in plan names / country codes, so the composite key is safe. */
const PLAN_KEY_SEP = "‖";

/** Mean of a numeric array, or `null` when empty (never NaN). */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Build a `{ average, n }` cohort figure from its priced values. */
function cohortAverage(values: number[]): TicketCohortAverage {
  return { average: mean(values), n: values.length };
}

/** A fresh, empty per-currency accumulator. */
function emptyCurrencyAcc(): CurrencyAcc {
  return {
    globalPricedValues: [],
    globalDiscountFractions: [],
    globalZeroCount: 0,
    globalTotalCount: 0,
    globalListPriceValues: [],
    globalDiscountedValues: [],
    plans: new Map(),
    branches: new Map(),
    durations: new Map(),
  };
}

export class TicketService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * The full ticket payload (TICKET-01..04). Reads the linked membership charges
   * and the bare in-period `plan_charge` universe (for `excludedNoLink`), then
   * folds both into the per-currency blocks.
   *
   * `ctx` PRIMERO (regla 169-06). Fase 172 (D-01): las DOS consultas leen
   * `financial_transactions` y la primera además joinea `transaction_links` —
   * las dos son tablas strict de `finance`, así que el gimnasio viaja a ambas.
   */
  async getTicket(
    ctx: TenantContext,
    filters: AnalyticsFilters,
  ): Promise<TicketAnalytics> {
    const [charges, universeByCurrency] = await Promise.all([
      this.linkedCharges(ctx, filters),
      this.universeCountByCurrency(ctx, filters),
    ]);

    const accByCurrency = new Map<Currency, CurrencyAcc>([
      ["ARS", emptyCurrencyAcc()],
      ["EUR", emptyCurrencyAcc()],
    ]);
    let historicalFallbackCount = 0;
    const matchedByCurrency = new Map<Currency, number>([
      ["ARS", 0],
      ["EUR", 0],
    ]);

    for (const row of charges) {
      const currency =
        row.currency === "EUR" ? "EUR" : row.currency === "ARS" ? "ARS" : null;
      if (currency === null) continue; // unknown currency — never summed in
      const acc = accByCurrency.get(currency);
      if (acc === undefined) continue;

      matchedByCurrency.set(
        currency,
        (matchedByCurrency.get(currency) ?? 0) + 1,
      );

      const durationTier = deriveDurationTier(row.durationDays);
      const planKey = `${row.planName}${PLAN_KEY_SEP}${row.planCountry}`;
      let plan = acc.plans.get(planKey);
      if (plan === undefined) {
        plan = {
          planName: row.planName,
          country: row.planCountry,
          durationTier,
          pricedValues: [],
          discountFractions: [],
          zeroCount: 0,
          totalCount: 0,
          listPriceValues: [],
          discountedValues: [],
        };
        acc.plans.set(planKey, plan);
      }
      let branch = acc.branches.get(row.branchName);
      if (branch === undefined) {
        branch = {
          branchName: row.branchName,
          pricedValues: [],
          discountFractions: [],
        };
        acc.branches.set(row.branchName, branch);
      }

      // Whole-population counts (priced + $0) for the zeroPct denominator.
      plan.totalCount += 1;
      acc.globalTotalCount += 1;

      const pricePaid = row.pricePaid;

      if (pricePaid === 0) {
        // $0 charge: excluded from EVERY average AND both cohorts; counted only.
        plan.zeroCount += 1;
        acc.globalZeroCount += 1;
        continue;
      }

      // --- priced charge (price_paid > 0) -------------------------------
      plan.pricedValues.push(pricePaid);
      branch.pricedValues.push(pricePaid);
      acc.globalPricedValues.push(pricePaid);

      if (durationTier !== null) {
        let duration = acc.durations.get(durationTier);
        if (duration === undefined) {
          duration = { pricedValues: [] };
          acc.durations.set(durationTier, duration);
        }
        duration.pricedValues.push(pricePaid);
      }

      // listBase = the snapshot when present, else the plan's CURRENT priceRegular
      // (historical fallback — count it for the caveat).
      let listBase: number;
      if (row.priceRegularSnapshot === null) {
        historicalFallbackCount += 1;
        listBase = row.planPriceRegular;
      } else {
        listBase = row.priceRegularSnapshot;
      }

      // Guard (T-120-12): a non-positive list base cannot yield a valid discount
      // or cohort classification — skip this charge from discount + cohorts (it
      // still counts toward the ticket average above).
      if (listBase <= 0) continue;

      const discountFraction = (listBase - pricePaid) / listBase;
      plan.discountFractions.push(discountFraction);
      branch.discountFractions.push(discountFraction);
      acc.globalDiscountFractions.push(discountFraction);

      // Cohort split: list-price = exactly list base AND no override; everything
      // else priced (below base OR an override applied) is discounted/customized.
      const isListPrice =
        pricePaid === listBase && row.priceOverrideAmount === null;
      if (isListPrice) {
        plan.listPriceValues.push(pricePaid);
        acc.globalListPriceValues.push(pricePaid);
      } else {
        plan.discountedValues.push(pricePaid);
        acc.globalDiscountedValues.push(pricePaid);
      }
    }

    const byCurrency = {
      ARS: this.finalizeCurrency(
        accByCurrency.get("ARS") ?? emptyCurrencyAcc(),
      ),
      EUR: this.finalizeCurrency(
        accByCurrency.get("EUR") ?? emptyCurrencyAcc(),
      ),
    };

    // excludedNoLink = in-period plan_charge universe MINUS matched membership
    // charges, summed across currencies (enrollment-only + any unlinked charge).
    // When a planId INPUT filter is active the universe count is NOT plan-scoped
    // (it has no subscription join), so the diff would over-report — the no-link
    // diagnostic is meaningless for a single-plan view, so report 0 instead.
    let excludedNoLink = 0;
    if (filters.planId === undefined) {
      for (const currency of CURRENCIES) {
        const universe = universeByCurrency.get(currency) ?? 0;
        const matched = matchedByCurrency.get(currency) ?? 0;
        const diff = universe - matched;
        excludedNoLink += diff > 0 ? diff : 0;
      }
    }

    return { byCurrency, historicalFallbackCount, excludedNoLink };
  }

  /** Finalize one currency accumulator into its wire block (guarded divisions). */
  private finalizeCurrency(acc: CurrencyAcc): TicketCurrencyBlock {
    const globalMean = mean(acc.globalPricedValues);
    const global = metricShape(
      Math.round(globalMean ?? 0),
      acc.globalPricedValues.length,
    );

    const perPlan: TicketPlanRow[] = [];
    for (const plan of acc.plans.values()) {
      perPlan.push(this.finalizePlan(plan));
    }
    // Deterministic order: by plan name then country.
    perPlan.sort(
      (a, b) =>
        a.planName.localeCompare(b.planName) ||
        a.country.localeCompare(b.country),
    );

    const byBranch: TicketBranchRow[] = [];
    for (const branch of acc.branches.values()) {
      byBranch.push({
        branchName: branch.branchName,
        ticket: metricShape(
          Math.round(mean(branch.pricedValues) ?? 0),
          branch.pricedValues.length,
        ),
        discountMean: mean(branch.discountFractions),
        discountMedian: median(branch.discountFractions),
      });
    }
    byBranch.sort((a, b) => a.branchName.localeCompare(b.branchName));

    const byDuration: TicketDurationRow[] = [];
    for (const tier of ["monthly", "long_term"] as const) {
      const duration = acc.durations.get(tier);
      if (duration === undefined) continue;
      byDuration.push({
        durationTier: tier,
        ticket: metricShape(
          Math.round(mean(duration.pricedValues) ?? 0),
          duration.pricedValues.length,
        ),
      });
    }

    return {
      global,
      globalCohorts: this.cohortSplit(
        acc.globalListPriceValues,
        acc.globalDiscountedValues,
      ),
      zeroCount: acc.globalZeroCount,
      zeroPct:
        acc.globalTotalCount > 0
          ? Math.round((acc.globalZeroCount / acc.globalTotalCount) * 100)
          : 0,
      discountMean: mean(acc.globalDiscountFractions),
      discountMedian: median(acc.globalDiscountFractions),
      perPlan,
      byBranch,
      byDuration,
    };
  }

  /** Finalize one plan accumulator into its wire row (guarded divisions). */
  private finalizePlan(plan: PlanAcc): TicketPlanRow {
    return {
      planName: plan.planName,
      country: plan.country,
      durationTier: plan.durationTier,
      ticket: metricShape(
        Math.round(mean(plan.pricedValues) ?? 0),
        plan.pricedValues.length,
      ),
      discountMean: mean(plan.discountFractions),
      discountMedian: median(plan.discountFractions),
      zeroCount: plan.zeroCount,
      zeroPct:
        plan.totalCount > 0
          ? Math.round((plan.zeroCount / plan.totalCount) * 100)
          : 0,
      cohorts: this.cohortSplit(plan.listPriceValues, plan.discountedValues),
    };
  }

  /** Build a `{ listPrice, discounted }` split from each cohort's priced values. */
  private cohortSplit(
    listPriceValues: number[],
    discountedValues: number[],
  ): TicketCohortSplit {
    return {
      listPrice: cohortAverage(listPriceValues),
      discounted: cohortAverage(discountedValues),
    };
  }

  /**
   * The in-period membership charges: the canonical `plan_charge` universe
   * INNER-joined through `transaction_links` (`target_kind='subscription'`) to the
   * subscription + plan. Selects the ticket-driving fields FROM THE SUBSCRIPTION
   * (NOT `ft.amount`). Branch axis name comes from the joined `branches` row; the
   * join is unconditional here because the branch breakdown always needs the name.
   */
  private async linkedCharges(
    ctx: TenantContext,
    filters: AnalyticsFilters,
  ): Promise<ChargeRow[]> {
    const { conditions: scopeConditions } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.financialTransactions.branchId,
    });

    const conditions: SQL[] = [
      isNull(schema.financialTransactions.voidedAt),
      // Phase 137 (VAL-05): firm money counts only validated rows.
      eq(
        schema.financialTransactions.validationStatus,
        "validado",
      ) as unknown as SQL,
      eq(schema.financialTransactions.kind, "plan_charge") as unknown as SQL,
      eq(schema.financialTransactions.direction, "inflow") as unknown as SQL,
      ...scopeConditions,
      ...rangeConditions(
        schema.financialTransactions.transactionDate,
        filters.dateFrom,
        filters.dateTo,
      ),
      // D-11: el pase especial no distorsiona el ticket promedio de membresía.
      // La plata del pase igual cuenta en caja/cobros/advanced-finance (intactos):
      // esto excluye solo la MÉTRICA de ticket, no el ingreso. El join a
      // subscriptionPlans existe abajo, así que el filtro es directo.
      ne(schema.subscriptionPlans.planCategory, "especial") as unknown as SQL,
    ];
    // D-10 plan INPUT filter: restrict to the linked subscription's plan,
    // AND-ed AFTER scope (T-132-01 — never a scope bypass). The subscriptions
    // join already exists below; the planId column is qualified.
    if (filters.planId !== undefined) {
      conditions.push(eq(schema.subscriptions.planId, filters.planId));
    }

    const rows = await this.db
      .select({
        currency: schema.financialTransactions.currency,
        planName: schema.subscriptionPlans.name,
        planCountry: schema.subscriptionPlans.country,
        durationDays: schema.subscriptionPlans.durationDays,
        planPriceRegular: schema.subscriptionPlans.priceRegular,
        branchName: schema.branches.name,
        pricePaid: schema.subscriptions.pricePaid,
        priceRegularSnapshot: schema.subscriptions.priceRegularSnapshot,
        priceOverrideAmount: schema.subscriptions.priceOverrideAmount,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.transactionLinks,
        and(
          eq(
            schema.transactionLinks.transactionId,
            schema.financialTransactions.id,
          ),
          eq(schema.transactionLinks.targetKind, "subscription"),
        ),
      )
      .innerJoin(
        schema.subscriptions,
        eq(schema.subscriptions.id, schema.transactionLinks.targetId),
      )
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      )
      // DOS `tenantWhere`, uno por tabla strict presente en el statement. NO es
      // un requisito que el sentinel verifique (IN-01, fase 173): el sentinel
      // evalúa por QUERY completa y le alcanza con UN literal `tenant_id` en
      // cualquier lado del statement para dar verde (trampa (h), doc 07 §4) —
      // el guard de cobros vivos de `subscriptions/service.ts` (WR-02) probó
      // exactamente eso: filtraba una sola de dos tablas strict y el sentinel
      // no lo cazó. Filtrar cada tabla strict del join es CONVENCIÓN del
      // módulo (defensa en profundidad) — la lente que la hace cumplir es el
      // lint POR TABLA (`pnpm lint:tenant`), no el sentinel de runtime. Un join
      // entre dos tablas de plata scopeando sólo una deja el otro lado sin
      // filtrar (T-172-02-03).
      .where(
        and(
          tenantWhere(schema.financialTransactions, ctx),
          tenantWhere(schema.transactionLinks, ctx),
          ...conditions,
        ),
      );

    return rows.map((r) => ({
      currency: String(r.currency),
      planName: String(r.planName),
      planCountry: String(r.planCountry),
      durationDays: Number(r.durationDays),
      planPriceRegular: Number(r.planPriceRegular),
      branchName: String(r.branchName ?? ""),
      pricePaid: Number(r.pricePaid),
      priceRegularSnapshot:
        r.priceRegularSnapshot === null ? null : Number(r.priceRegularSnapshot),
      priceOverrideAmount:
        r.priceOverrideAmount === null ? null : Number(r.priceOverrideAmount),
    }));
  }

  /**
   * Count of in-period `plan_charge`s (the FT universe BEFORE the subscription
   * join), per currency. Subtracting the matched-subscription count from this
   * yields `excludedNoLink` (enrollment-only + any unlinked charge). Same
   * canonical filter + scope + range as `linkedCharges`, but NO link join.
   */
  private async universeCountByCurrency(
    ctx: TenantContext,
    filters: AnalyticsFilters,
  ): Promise<Map<Currency, number>> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.financialTransactions.branchId,
    });

    const conditions: SQL[] = [
      isNull(schema.financialTransactions.voidedAt),
      // Phase 137 (VAL-05): firm money counts only validated rows.
      eq(
        schema.financialTransactions.validationStatus,
        "validado",
      ) as unknown as SQL,
      eq(schema.financialTransactions.kind, "plan_charge") as unknown as SQL,
      eq(schema.financialTransactions.direction, "inflow") as unknown as SQL,
      // D-11: excluir del UNIVERSO los cargos ligados a un pase especial, para que
      // el conteo case con `linkedCharges` (que ya excluye especial) y no inflen
      // `excludedNoLink`. Esta query no joinea planes → NOT EXISTS por link.
      // Fase 172 (D-01): `transaction_links` es tabla strict y acá se nombra en
      // un `sql` crudo, donde la convención lockeada es el literal
      // `tenant_id = ${ctx.tenantId}` (shared/tenant.ts:20). Va PRIMERO en el
      // WHERE de la subconsulta, antes de la correlación.
      sql`NOT EXISTS (
        SELECT 1 FROM transaction_links tl
        JOIN subscriptions s ON s.id = tl.target_id AND tl.target_kind = 'subscription'
        JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE tl.tenant_id = ${ctx.tenantId}
          AND tl.transaction_id = financial_transactions.id
          AND sp.plan_category = 'especial'
      )`,
      ...scopeConditions,
      ...rangeConditions(
        schema.financialTransactions.transactionDate,
        filters.dateFrom,
        filters.dateTo,
      ),
    ];

    // El WHERE se arma JUNTO al `from` (y no después del join condicional) para
    // que el statement que nombra `financial_transactions` sea el mismo que
    // nombra el gimnasio. `$dynamic()` desactiva el orden fijo del builder, y
    // Drizzle ensambla el SQL desde la config: el `innerJoin` de abajo entra en
    // el FROM igual, se haya encadenado antes o después del `where`.
    let query = this.db
      .select({
        currency: schema.financialTransactions.currency,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.financialTransactions)
      .where(and(tenantWhere(schema.financialTransactions, ctx), ...conditions))
      .$dynamic();

    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.financialTransactions.branchId),
      );
    }

    const rows = await query.groupBy(schema.financialTransactions.currency);

    const out = new Map<Currency, number>([
      ["ARS", 0],
      ["EUR", 0],
    ]);
    for (const r of rows) {
      if (r.currency === "ARS" || r.currency === "EUR") {
        out.set(r.currency, Number(r.count));
      }
    }
    return out;
  }
}
