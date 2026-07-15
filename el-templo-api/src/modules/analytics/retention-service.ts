/**
 * Retention Service (Phase 118 D-04 / D-05 / D-06 / D-09 / D-11).
 *
 * A NEW domain service (per D-09: new strategic metrics live in their own
 * service — the `analytics/service.ts` monolith is NOT touched; that split is
 * v4.9). Computes retention by COHORTS OF PLAN CYCLES (not calendar months),
 * consumed by the admin Retención tab (frontend in a later plan):
 *
 *   - getRetention: per cohort (month of the member's FIRST active
 *     subscription, D-06), the % of the cohort that reached cycle 2, 3, 4...
 *     A member's "cycle N+1" is the next subscription iff
 *     `next.startDate − prev.endDate ≤ CONSECUTIVE_CYCLE_GAP_DAYS` days (D-04).
 *     A larger gap CUTS the streak (D-05): the member leaves their cohort's
 *     curve at that cycle and the later (reactivation) subscriptions do NOT
 *     re-inflate the original cohort.
 *   - cycleDistribution: among CURRENTLY ACTIVE members (canonical
 *     `activeMemberExists` predicate, NEVER `users.status`), how many sit in
 *     cycle 1 / 2 / 3+ by their current consecutive streak — a proxy of base
 *     maturity.
 *
 * Scope (D-11 / T-118-04): every query routes through `applyScope` on
 * `subscriptions.branchId` so an admin of sede X / país X never sees subs of
 * sede Y / país Y. The endpoint itself is ADMIN_ROLES-only (requireAdminAnalytics).
 *
 * Defensive validation (T-118-05): subscriptions with a null start/end date or
 * an inverted window (end < start) are EXCLUDED from streak computation (they do
 * not break a streak — they are simply skipped) and counted in `invalidWindowSubs`
 * so the frontend can surface a caveat. The gap is measured in WHOLE days.
 *
 * Uses constructor DI pattern (Phase 56 convention), same shape as
 * AttendanceMetricsService / EngagementService / AnalyticsService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { activeMemberExists } from "../shared/active-member";
import { excludeEspecialSubs } from "./especial-exclusion";
import type {
  AnalyticsFilters,
  RetentionAnalytics,
  RetentionCohort,
  CycleDistribution,
  RetentionPlanOption,
} from "./types";

/**
 * Consecutive-cycle gap threshold (Phase 118 D-04). Two subscriptions of the
 * same member count as consecutive cycles iff the second starts within this many
 * days of the first ending. NOT an env var, NOT a DB column — a fixed product
 * rule exported for reuse/testing.
 */
export const CONSECUTIVE_CYCLE_GAP_DAYS = 30;

/** A subscription row reduced to what the streak algorithm needs. */
interface SubRow {
  userId: number;
  startDate: string | null;
  endDate: string | null;
}

/** A member's ordered, valid-window subscriptions. */
interface MemberSubs {
  userId: number;
  /** Sorted ascending by startDate; only valid-window subs. */
  subs: Array<{ startDate: string; endDate: string }>;
}

/**
 * Whole-day difference `b − a` (both `YYYY-MM-DD`). Positive when `b` is after
 * `a`. Uses UTC midnight so DST / timezone never shifts the count.
 */
function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export class RetentionService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Retention by cohorts of plan cycles (D-06). Reads every subscription in
   * scope (optionally filtered by plan_category), groups by member, computes the
   * consecutive-cycle streak per member (D-04/D-05), assigns each member to the
   * cohort = month of their FIRST valid subscription's start date, and aggregates
   * the % of each cohort reaching at least cycle N. Also computes the
   * distribution of current consecutive cycles among active members.
   */
  async getRetention(filters: AnalyticsFilters): Promise<RetentionAnalytics> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    // D-11: el pase especial no forma cohortes/ciclos de retención de membresía.
    const conditions: SQL[] = [excludeEspecialSubs(), ...scopeConditions];

    // Plan filter (follow-up): exact match on subscriptions.plan_id. No plan join
    // needed — plan_id lives on the subscription row. Undefined → no restriction.
    if (filters.planId !== undefined) {
      conditions.push(eq(schema.subscriptions.planId, filters.planId));
    }

    // Build the SELECT, conditionally joining branches (country scope). Order by
    // member then startDate so the streak walk is a single linear pass per member.
    let query = this.db
      .select({
        userId: schema.subscriptions.userId,
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
      })
      .from(schema.subscriptions)
      .$dynamic();

    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      );
    }

    const rows: SubRow[] = await query
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(schema.subscriptions.userId, schema.subscriptions.startDate);

    // Group rows by member, dropping invalid-window subs (T-118-05).
    let invalidWindowSubs = 0;
    const byMember = new Map<number, MemberSubs>();
    for (const r of rows) {
      if (
        r.startDate === null ||
        r.endDate === null ||
        dayDiff(r.startDate, r.endDate) < 0
      ) {
        invalidWindowSubs += 1;
        continue;
      }
      let m = byMember.get(r.userId);
      if (m === undefined) {
        m = { userId: r.userId, subs: [] };
        byMember.set(r.userId, m);
      }
      m.subs.push({ startDate: r.startDate, endDate: r.endDate });
    }

    // For each member compute (a) the cohort month (first valid sub's start) and
    // (b) the consecutive-cycle streak length from the first sub.
    // cohortBuckets: cohort month → { size, reachedCycle[] } where
    // reachedCycle[i] counts members who reached at least cycle i+1.
    const cohortMap = new Map<
      string,
      { size: number; reachedCycle: number[] }
    >();
    let maxCycle = 0;

    for (const m of byMember.values()) {
      // subs already sorted ascending by startDate within member (query order),
      // but re-sort defensively in case of equal startDates / driver ordering.
      const subs = [...m.subs].sort((a, b) =>
        a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0,
      );
      const first = subs[0];
      const cohort = first.startDate.slice(0, 7); // YYYY-MM

      const streak = this.streakLength(subs);
      maxCycle = Math.max(maxCycle, streak);

      let bucket = cohortMap.get(cohort);
      if (bucket === undefined) {
        bucket = { size: 0, reachedCycle: [] };
        cohortMap.set(cohort, bucket);
      }
      bucket.size += 1;
      // A member with streak S reached cycles 1..S.
      for (let i = 0; i < streak; i += 1) {
        bucket.reachedCycle[i] = (bucket.reachedCycle[i] ?? 0) + 1;
      }
    }

    const cohorts: RetentionCohort[] = [...cohortMap.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([cohort, bucket]) => {
        const cycleRetention: number[] = [];
        for (let i = 0; i < maxCycle; i += 1) {
          const reached = bucket.reachedCycle[i] ?? 0;
          cycleRetention.push(
            bucket.size > 0 ? Math.round((reached / bucket.size) * 100) : 0,
          );
        }
        return { cohort, size: bucket.size, cycleRetention };
      });

    const cycleDistribution = await this.cycleDistribution(filters);
    const availablePlans = await this.availablePlans(filters);

    return {
      cohorts,
      maxCycle,
      cycleDistribution,
      invalidWindowSubs,
      availablePlans,
    };
  }

  /**
   * Distinct plans (id, name, durationDays) present among the scoped
   * subscriptions — the frontend builds the plan filter options from this and
   * shows the duration in parentheses. Honors scope but NOT the plan filter
   * itself, so the dropdown always lists every plan available in scope (selecting
   * one never shrinks the option list). Sorted by duration then name.
   */
  private async availablePlans(
    filters: AnalyticsFilters,
  ): Promise<RetentionPlanOption[]> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    let query = this.db
      .selectDistinct({
        id: schema.subscriptionPlans.id,
        name: schema.subscriptionPlans.name,
        durationDays: schema.subscriptionPlans.durationDays,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .$dynamic();

    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      );
    }

    const rows = await query.where(
      // D-11: el pase especial no aparece como opción de plan en retención.
      and(
        ne(schema.subscriptionPlans.planCategory, "especial"),
        ...scopeConditions,
      ),
    );

    return rows.sort((a, b) => {
      const da = a.durationDays ?? Number.MAX_SAFE_INTEGER;
      const db = b.durationDays ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  /**
   * Length of the consecutive-cycle streak starting from the first subscription
   * (D-04/D-05). Cycle 1 = first sub. Cycle N+1 counts iff the next sub starts
   * within `CONSECUTIVE_CYCLE_GAP_DAYS` whole days of the previous sub ending. A
   * larger gap ends the streak — later subs (reactivations) are ignored for this
   * curve. `subs` MUST be sorted ascending by startDate and contain only
   * valid-window subs. Returns 0 only if `subs` is empty (never happens here).
   */
  private streakLength(
    subs: Array<{ startDate: string; endDate: string }>,
  ): number {
    if (subs.length === 0) return 0;
    let streak = 1;
    for (let i = 1; i < subs.length; i += 1) {
      const prev = subs[i - 1];
      const next = subs[i];
      const gap = dayDiff(prev.endDate, next.startDate);
      if (gap <= CONSECUTIVE_CYCLE_GAP_DAYS) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  }

  /**
   * Distribution of current consecutive-cycle streaks among CURRENTLY ACTIVE
   * members (D-06). "Active" is the canonical `activeMemberExists` predicate
   * (NEVER `users.status`). Buckets: cycle 1 / 2 / 3+. Reads the same scoped (and
   * optionally plan-filtered) subscriptions per active member and reuses
   * `streakLength`. An inactive member with 3 historical cycles is NOT counted.
   */
  private async cycleDistribution(
    filters: AnalyticsFilters,
  ): Promise<CycleDistribution> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    const conditions: SQL[] = [
      // Only subscriptions of members who are active RIGHT NOW (canonical).
      activeMemberExists(schema.subscriptions.userId),
      // D-11: no contar los ciclos del pase especial (el externo-solo-pase queda
      // con 0 filas → fuera de la distribución de ciclos de membresía).
      excludeEspecialSubs(),
      ...scopeConditions,
    ];

    // Plan filter (follow-up): exact match on subscriptions.plan_id (no join).
    if (filters.planId !== undefined) {
      conditions.push(eq(schema.subscriptions.planId, filters.planId));
    }

    let query = this.db
      .select({
        userId: schema.subscriptions.userId,
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
      })
      .from(schema.subscriptions)
      .$dynamic();

    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      );
    }

    const rows: SubRow[] = await query
      .where(and(...conditions))
      .orderBy(schema.subscriptions.userId, schema.subscriptions.startDate);

    // Group valid-window subs per active member.
    const byMember = new Map<
      number,
      Array<{ startDate: string; endDate: string }>
    >();
    for (const r of rows) {
      if (
        r.startDate === null ||
        r.endDate === null ||
        dayDiff(r.startDate, r.endDate) < 0
      ) {
        continue;
      }
      const list = byMember.get(r.userId) ?? [];
      list.push({ startDate: r.startDate, endDate: r.endDate });
      byMember.set(r.userId, list);
    }

    const dist: CycleDistribution = { ciclo1: 0, ciclo2: 0, ciclo3plus: 0 };
    for (const subs of byMember.values()) {
      const sorted = [...subs].sort((a, b) =>
        a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0,
      );
      const streak = this.streakLength(sorted);
      if (streak <= 1) dist.ciclo1 += 1;
      else if (streak === 2) dist.ciclo2 += 1;
      else dist.ciclo3plus += 1;
    }

    return dist;
  }
}
