/**
 * Frecuencia de asistencia service (Phase 123 Block 4 — FREQ-01..06).
 *
 * A NEW read-only domain service (per the analytics convention: strategic
 * metrics live in their own service; the `analytics/service.ts` monolith is
 * NOT touched). It computes, per ACTIVE member, the average visits/week over
 * the rolling last 4 weeks (D-123-03), normalized for members with <4 weeks of
 * membership so a brand-new member with 2 visits in their only week is NOT
 * falsely classified "Bajo". From that it derives:
 *
 *   - the band distribution Inactivo / Bajo / Medio / Alto (D-123-04),
 *     INCLUDING active members with 0 visits → Inactivo (the actionable signal);
 *   - the "enfriándose" (cooling-down) list — members whose CURRENT-window band
 *     dropped ≥1 band vs the PRIOR 4-week window, with the % de variación
 *     alongside (informative; the trigger is the band drop, not the raw % —
 *     D-123-05);
 *   - the per-branch check-in adoption ratio as a validity gate, REUSING
 *     `AttendanceMetricsService.checkInAdoptionByBranch` — NOT reimplemented
 *     (D-123-06);
 *   - the band counts opened by branch / country / duration / plan (D-123-14).
 *
 * It also exposes `coolingOrInactiveUserIds(windowDays)` — the single batched
 * "golden-case" query (active member with 0 visits in the window OR cooling
 * down) that the Plan 03 segmentation cron consumes, so the window math lives in
 * ONE place (D-123-01).
 *
 * Scope (T-123-02 / T-123-03): every attendance/subscription query spreads
 * `applyScope(...).conditions`; when a country filter is active
 * (`needsBranchJoin`) the query conditionally `.$dynamic().innerJoin(branches)`
 * — else the `branches.country` condition references a table not in FROM → 500
 * (121/122 lesson). Breakdown axes are ADDITIVE groupBy keys, never access
 * filters.
 *
 * Defensive (T-120-12): every distribution count goes through `metricShape` and
 * every % de variación is guarded — a zero population / zero prior reports 0 /
 * null, never NaN.
 *
 * Constructor DI (Phase 56), same shape as ChurnService / AttendanceMetricsService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { metricShape } from "./metric-shape";
import { deriveDurationTier } from "./duration-tier";
import { breakdownSegmentKey, type BreakdownAxis } from "./breakdowns";
import { AttendanceMetricsService } from "./attendance-metrics-service";
import type {
  AnalyticsFilters,
  CheckInAdoptionRow,
  FrequencyAnalytics,
  FrequencyDistributionRow,
  FrequencyCoolingRow,
  FrequencySegmentRow,
  FrequencyBreakdownAxis,
} from "./types";

/**
 * Inclusive-exclusive upper cutoff (visits/week) for the "Bajo" band. A member
 * with `visitsPerWeek > 0` and `< BAJO_MAX_VISITS_PER_WEEK` is "Bajo" (the
 * ~1/sem band of the spec, D-123-04). Exported product rule — NOT an env var.
 *
 * Spec mapping (D-123-04): Inactivo = 0 visits; Bajo ≈ 1/sem; Medio ≈ 2/sem;
 * Alto = 3+/sem. With these cutoffs: (0, 1.5) → Bajo, [1.5, 2.5) → Medio,
 * [2.5, ∞) → Alto.
 */
export const BAJO_MAX_VISITS_PER_WEEK = 1.5;

/**
 * Inclusive-exclusive upper cutoff (visits/week) for the "Medio" band. A member
 * with `visitsPerWeek >= BAJO_MAX_VISITS_PER_WEEK` and `< MEDIO_MAX_VISITS_PER_WEEK`
 * is "Medio" (the ~2/sem band, D-123-04); at or above it the member is "Alto"
 * (3+/sem). Exported product rule — NOT an env var.
 */
export const MEDIO_MAX_VISITS_PER_WEEK = 2.5;

/** Rolling frequency window length in days (4 weeks, D-123-03). */
const FREQUENCY_WINDOW_DAYS = 28;

/** Days in a week — visits/week normalization divisor base (D-123-03). */
const DAYS_PER_WEEK = 7;

/**
 * The four bands a member is classified into by visits/week (D-123-04).
 * `inactivo` is the actionable 0-visit signal; the cutoffs between bajo / medio
 * / alto are the named constants above.
 */
export type FrequencyBand = "inactivo" | "bajo" | "medio" | "alto";

/** All bands in ascending order — drives both the distribution and the rank. */
const FREQUENCY_BANDS: readonly FrequencyBand[] = [
  "inactivo",
  "bajo",
  "medio",
  "alto",
];

/** The four breakdown axes frequency opens by (D-123-14). */
const FREQUENCY_AXES: readonly FrequencyBreakdownAxis[] = [
  "branch",
  "country",
  "duration",
  "plan",
];

/**
 * Numeric rank of a band (inactivo < bajo < medio < alto) — used to detect a
 * band DROP (current rank < prior rank) for the cooling-down list (D-123-05).
 */
function bandRank(band: FrequencyBand): number {
  return FREQUENCY_BANDS.indexOf(band);
}

/**
 * Classify a member into a frequency band from their normalized visits/week
 * (D-123-04). `0` visits → `inactivo`; otherwise the `BAJO_MAX` / `MEDIO_MAX`
 * cutoffs apply. Pure — no DB, no logging.
 *
 * @param visitsPerWeek the member's normalized visits/week (>= 0).
 * @returns the band.
 */
export function classifyBand(visitsPerWeek: number): FrequencyBand {
  if (visitsPerWeek <= 0) return "inactivo";
  if (visitsPerWeek < BAJO_MAX_VISITS_PER_WEEK) return "bajo";
  if (visitsPerWeek < MEDIO_MAX_VISITS_PER_WEEK) return "medio";
  return "alto";
}

/** Format a Date as MySQL TIMESTAMP literal "YYYY-MM-DD HH:MM:SS". */
function isoSecond(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Per-member elapsed weeks of membership, clamped to `[1, 4]` (D-123-03). A
 * member with <1 week of tenure still divides by 1 week (avoids div-by-zero and
 * inflating visits/week); a member with >=4 weeks divides by the full 4 (the
 * rolling window). `createdAt` is the membership-age anchor (CONTEXT: "tiempo
 * real de membresía").
 */
function normalizedWeeks(createdAt: Date, now: Date): number {
  const elapsedDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
  const elapsedWeeks = elapsedDays / DAYS_PER_WEEK;
  const windowWeeks = FREQUENCY_WINDOW_DAYS / DAYS_PER_WEEK; // 4
  return Math.min(Math.max(elapsedWeeks, 1), windowWeeks);
}

/**
 * % de variación between current and prior visits/week (D-123-05, informative).
 * Returns `null` when `prior` is 0 (declared null-safe — no division by zero,
 * never NaN); otherwise the integer-rounded percentage change.
 */
function pctVariacion(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

/** One active member reduced to what the band folding needs. */
interface ActiveMemberRow {
  userId: number;
  createdAt: Date;
  branchName: string;
  country: string;
  planName: string;
  durationDays: number | null;
}

/** Per-member computed bands for the current and prior windows. */
interface MemberBands {
  userId: number;
  currentBand: FrequencyBand;
  priorBand: FrequencyBand;
  currentVisitsPerWeek: number;
  priorVisitsPerWeek: number;
}

export class FrequencyService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * The full frequency payload (FREQ-01..04). Computes the active-member
   * population, the per-member current/prior visits/week (normalized), the band
   * distribution (incl. active-0-visits → Inactivo), the cooling-down list, the
   * reused check-in adoption, and the 4-axis breakdowns over the active cohort.
   */
  async getFrequency(filters: AnalyticsFilters): Promise<FrequencyAnalytics> {
    const now = new Date();

    // Active member population (the distribution denominator). Scoped on the
    // subscription branch (D-123-04 "active" = has active/paused subscription).
    const activeMembers = await this.activeMemberPopulation(filters, now);

    // Per-member visit counts for the current [now-28d, now) and prior
    // [now-56d, now-28d) windows, scoped on the attendance branch.
    const [currentCounts, priorCounts] = await Promise.all([
      this.visitCountsForWindow(filters, now, 0),
      this.visitCountsForWindow(filters, now, FREQUENCY_WINDOW_DAYS),
    ]);

    const memberBands = this.computeBands(
      activeMembers,
      currentCounts,
      priorCounts,
      now,
    );

    const distribution = this.buildDistribution(memberBands);
    const coolingDown = this.buildCoolingDown(memberBands);
    const breakdowns = this.buildBreakdowns(activeMembers, memberBands);

    // Check-in adoption is REUSED verbatim, not reimplemented (D-123-06).
    const checkInAdoption: CheckInAdoptionRow[] =
      await new AttendanceMetricsService(
        this.db,
        this.log,
      ).checkInAdoptionByBranch(filters);

    return { distribution, coolingDown, checkInAdoption, breakdowns };
  }

  /**
   * The active-member population (D-123-04): members with an active/paused
   * subscription, joined to their plan for the breakdown axes. One row per
   * member (DISTINCT-ish: a member with multiple active subs would appear once
   * per sub — the band fold dedups by userId on the LAST seen row, which is
   * acceptable since the band only depends on the member's visits, not the sub).
   * Scoped on `subscriptions.branchId`; country filter joins `branches`.
   */
  private async activeMemberPopulation(
    filters: AnalyticsFilters,
    _now: Date,
  ): Promise<ActiveMemberRow[]> {
    const { conditions: scopeConditions } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    // Country scope filters on `branches.country`; this query joins `branches`
    // unconditionally (flavor A) because every axis below also needs the branch
    // name, so the join is always present and `needsBranchJoin` is moot here.
    const rows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        createdAt: schema.users.createdAt,
        branchName: schema.branches.name,
        country: schema.subscriptionPlans.country,
        planName: schema.subscriptionPlans.name,
        durationDays: schema.subscriptionPlans.durationDays,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.users,
        sql`${schema.users.id} = ${schema.subscriptions.userId}`,
      )
      .innerJoin(
        schema.branches,
        sql`${schema.branches.id} = ${schema.subscriptions.branchId}`,
      )
      .innerJoin(
        schema.subscriptionPlans,
        sql`${schema.subscriptionPlans.id} = ${schema.subscriptions.planId}`,
      )
      .where(
        and(
          inArray(schema.subscriptions.status, ["active", "paused"]),
          ...scopeConditions,
        ),
      );

    // Dedup by userId (keep the first seen sub) so a member with >1 active sub
    // is one population member.
    const byUser = new Map<number, ActiveMemberRow>();
    for (const r of rows) {
      if (byUser.has(r.userId)) continue;
      byUser.set(r.userId, {
        userId: r.userId,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
        branchName: String(r.branchName ?? ""),
        country: String(r.country ?? ""),
        planName: String(r.planName ?? ""),
        durationDays: r.durationDays === null ? null : Number(r.durationDays),
      });
    }
    return [...byUser.values()];
  }

  /**
   * Per-member visit counts over the window `[now - (offsetDays + 28d),
   * now - offsetDays)` grouped by `attendance.memberId`. `offsetDays = 0` →
   * current window; `offsetDays = 28` → prior window (D-123-03/05). Half-open on
   * the raw `checkedInAt` column (index-friendly). Scoped on
   * `attendance.branchId`; country filter conditionally joins `branches`
   * (121/122 lesson — else 500).
   */
  private async visitCountsForWindow(
    filters: AnalyticsFilters,
    now: Date,
    offsetDays: number,
  ): Promise<Map<number, number>> {
    const upperExclusive = isoSecond(
      new Date(now.getTime() - offsetDays * 86_400_000),
    );
    const lower = isoSecond(
      new Date(
        now.getTime() - (offsetDays + FREQUENCY_WINDOW_DAYS) * 86_400_000,
      ),
    );

    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.attendance.branchId,
    });

    const conditions: SQL[] = [
      sql`${schema.attendance.checkedInAt} >= ${lower}`,
      sql`${schema.attendance.checkedInAt} < ${upperExclusive}`,
      ...scopeConditions,
    ];

    let query = this.db
      .select({
        memberId: schema.attendance.memberId,
        visits: sql<number>`COUNT(*)`,
      })
      .from(schema.attendance)
      .$dynamic();
    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.attendance.branchId),
      );
    }
    const rows = await query
      .where(and(...conditions))
      .groupBy(schema.attendance.memberId);

    const map = new Map<number, number>();
    for (const r of rows) {
      map.set(Number(r.memberId), Number(r.visits ?? 0));
    }
    return map;
  }

  /**
   * Compute each active member's current + prior band from their visit counts,
   * normalizing visits/week by their real membership weeks (D-123-03). Members
   * with no row in a window have 0 visits → Inactivo for that window.
   */
  private computeBands(
    activeMembers: ActiveMemberRow[],
    currentCounts: Map<number, number>,
    priorCounts: Map<number, number>,
    now: Date,
  ): MemberBands[] {
    return activeMembers.map((m) => {
      const weeks = normalizedWeeks(m.createdAt, now);
      const currentVisits = currentCounts.get(m.userId) ?? 0;
      const priorVisits = priorCounts.get(m.userId) ?? 0;
      const currentVisitsPerWeek = currentVisits / weeks;
      const priorVisitsPerWeek = priorVisits / weeks;
      return {
        userId: m.userId,
        currentBand: classifyBand(currentVisitsPerWeek),
        priorBand: classifyBand(priorVisitsPerWeek),
        currentVisitsPerWeek,
        priorVisitsPerWeek,
      };
    });
  }

  /**
   * The band distribution (D-123-04): count of active members per band over the
   * active population, each via `metricShape`. Active-with-0-visits members fold
   * into Inactivo (they are in `activeMembers` with a 0 current count).
   */
  private buildDistribution(
    memberBands: MemberBands[],
  ): FrequencyDistributionRow[] {
    const total = memberBands.length;
    const counts = new Map<FrequencyBand, number>();
    for (const band of FREQUENCY_BANDS) counts.set(band, 0);
    for (const m of memberBands) {
      counts.set(m.currentBand, (counts.get(m.currentBand) ?? 0) + 1);
    }
    return FREQUENCY_BANDS.map((band) => ({
      band,
      count: metricShape(counts.get(band) ?? 0, total),
    }));
  }

  /**
   * The cooling-down list (D-123-05): members whose current-window band rank is
   * strictly lower than their prior-window band rank, with the % de variación
   * (null-safe). Sorted by userId for determinism.
   */
  private buildCoolingDown(memberBands: MemberBands[]): FrequencyCoolingRow[] {
    const out: FrequencyCoolingRow[] = [];
    for (const m of memberBands) {
      if (bandRank(m.currentBand) < bandRank(m.priorBand)) {
        out.push({
          userId: m.userId,
          currentBand: m.currentBand,
          priorBand: m.priorBand,
          pctVariacion: pctVariacion(
            m.currentVisitsPerWeek,
            m.priorVisitsPerWeek,
          ),
        });
      }
    }
    out.sort((a, b) => a.userId - b.userId);
    return out;
  }

  /**
   * Band counts opened by branch / country / duration / plan (D-123-14). Folds
   * each active member's CURRENT band into the per-segment per-band accumulator;
   * one-off duration plans (tier null) are dropped from the duration axis.
   * Additive grouping only — scope stays in `applyScope` (T-123-02).
   */
  private buildBreakdowns(
    activeMembers: ActiveMemberRow[],
    memberBands: MemberBands[],
  ): FrequencySegmentRow[] {
    const bandByUser = new Map<number, FrequencyBand>();
    for (const m of memberBands) bandByUser.set(m.userId, m.currentBand);

    const out: FrequencySegmentRow[] = [];

    for (const axis of FREQUENCY_AXES) {
      // segmentKey → (band → count) and segmentKey → total.
      const bySegment = new Map<string, Map<FrequencyBand, number>>();
      const totalBySegment = new Map<string, number>();

      for (const m of activeMembers) {
        // Drop excluded one-off plans from the duration axis (never surface
        // the "excluded" segment).
        if (
          axis === "duration" &&
          deriveDurationTier(m.durationDays) === null
        ) {
          continue;
        }

        const key = breakdownSegmentKey(axis as BreakdownAxis, {
          branchName: m.branchName,
          country: m.country,
          planName: m.planName,
          durationDays: m.durationDays,
        });

        const band = bandByUser.get(m.userId) ?? "inactivo";
        let bandCounts = bySegment.get(key);
        if (bandCounts === undefined) {
          bandCounts = new Map<FrequencyBand, number>();
          for (const b of FREQUENCY_BANDS) bandCounts.set(b, 0);
          bySegment.set(key, bandCounts);
        }
        bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
        totalBySegment.set(key, (totalBySegment.get(key) ?? 0) + 1);
      }

      for (const [key, bandCounts] of bySegment) {
        const total = totalBySegment.get(key) ?? 0;
        for (const band of FREQUENCY_BANDS) {
          out.push({
            axis,
            key,
            band,
            count: metricShape(bandCounts.get(band) ?? 0, total),
          });
        }
      }
    }

    out.sort(
      (a, b) =>
        a.axis.localeCompare(b.axis) ||
        a.key.localeCompare(b.key) ||
        bandRank(a.band) - bandRank(b.band),
    );
    return out;
  }

  /**
   * The golden-case set Plan 03's segmentation cron consumes (D-123-01): the
   * user IDs of ACTIVE members (active/paused subscription) that are Inactivo (0
   * visits in `[now - windowDays, now)`) OR cooling down (current band rank <
   * prior band rank vs the immediately-preceding window of equal length). This
   * is the single batched query — the cron MUST NOT duplicate the window math.
   *
   * Scope-UNAWARE on purpose (the nightly batch is global): no branch/country
   * filter is applied. Reuses the same normalization + band logic as
   * `getFrequency` so the signal is consistent.
   *
   * @param windowDays the rolling window length in days (defaults to the
   *   28-day frequency window when not provided / non-positive).
   * @returns the set of golden-case user IDs.
   */
  async coolingOrInactiveUserIds(windowDays: number): Promise<Set<number>> {
    const now = new Date();
    const window =
      Number.isFinite(windowDays) && windowDays > 0
        ? Math.floor(windowDays)
        : FREQUENCY_WINDOW_DAYS;

    // Global active population (scope-unaware).
    const activeRows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        createdAt: schema.users.createdAt,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.users,
        sql`${schema.users.id} = ${schema.subscriptions.userId}`,
      )
      .where(inArray(schema.subscriptions.status, ["active", "paused"]));

    const createdAtByUser = new Map<number, Date>();
    for (const r of activeRows) {
      if (createdAtByUser.has(r.userId)) continue;
      createdAtByUser.set(
        r.userId,
        r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
      );
    }

    const [currentCounts, priorCounts] = await Promise.all([
      this.globalVisitCounts(now, 0, window),
      this.globalVisitCounts(now, window, window),
    ]);

    const golden = new Set<number>();
    for (const [userId, createdAt] of createdAtByUser) {
      const weeks = normalizedWeeksForWindow(createdAt, now, window);
      const currentVpw = (currentCounts.get(userId) ?? 0) / weeks;
      const priorVpw = (priorCounts.get(userId) ?? 0) / weeks;
      const currentBand = classifyBand(currentVpw);
      const priorBand = classifyBand(priorVpw);
      const inactivo = (currentCounts.get(userId) ?? 0) === 0;
      const coolingDown = bandRank(currentBand) < bandRank(priorBand);
      if (inactivo || coolingDown) golden.add(userId);
    }
    return golden;
  }

  /**
   * Global (scope-unaware) per-member visit counts over the window
   * `[now - (offsetDays + windowDays), now - offsetDays)`. Used only by the
   * golden-case helper, which is global by design (D-123-01).
   */
  private async globalVisitCounts(
    now: Date,
    offsetDays: number,
    windowDays: number,
  ): Promise<Map<number, number>> {
    const upperExclusive = isoSecond(
      new Date(now.getTime() - offsetDays * 86_400_000),
    );
    const lower = isoSecond(
      new Date(now.getTime() - (offsetDays + windowDays) * 86_400_000),
    );

    const rows = await this.db
      .select({
        memberId: schema.attendance.memberId,
        visits: sql<number>`COUNT(*)`,
      })
      .from(schema.attendance)
      .where(
        and(
          sql`${schema.attendance.checkedInAt} >= ${lower}`,
          sql`${schema.attendance.checkedInAt} < ${upperExclusive}`,
        ),
      )
      .groupBy(schema.attendance.memberId);

    const map = new Map<number, number>();
    for (const r of rows) {
      map.set(Number(r.memberId), Number(r.visits ?? 0));
    }
    return map;
  }
}

/**
 * Per-member elapsed weeks clamped to `[1, windowDays/7]` for an arbitrary
 * window length (used by the golden-case helper, which may run on a window
 * other than 28d). Mirrors `normalizedWeeks` (D-123-03).
 */
function normalizedWeeksForWindow(
  createdAt: Date,
  now: Date,
  windowDays: number,
): number {
  const elapsedWeeks =
    (now.getTime() - createdAt.getTime()) / 86_400_000 / DAYS_PER_WEEK;
  const windowWeeks = windowDays / DAYS_PER_WEEK;
  return Math.min(Math.max(elapsedWeeks, 1), windowWeeks);
}
