/**
 * Trial-session Funnel Service (Phase 123 Block 3, FUNNEL-01..05).
 *
 * A NEW domain service — the conversion funnel `reservó → asistió → compró` for
 * trial sessions, distinct from the Phase-118 freemium funnel
 * (freemium → prueba → activo, hidden in UI). This funnel is anchored by the
 * SCHEDULED-SESSION date (`bookings.bookingDate`, D-123-10), counts ONLY new
 * leads (no PRIOR paid subscription), and marks `compró` via the lead's FIRST
 * paid subscription within a configurable ~21d attribution window measured from
 * the session date (D-123-09/12). The cohort "matures itself": a period whose
 * window has not fully elapsed is flagged `provisional`.
 *
 * Cascade (D-123-07/08/09):
 *   - Reservó (denominator): every `bookings.isTrial = 1` row of a new lead in
 *     the cohort, regardless of final status (cancelado/no_show still count).
 *   - Asistió: `bookings.status IN ('qr_escaneado','confirmado')` — NOT the
 *     `attendance` table (a trial lead has no active sub, so the QR check-in path
 *     never produces an `attendance` row; `bookings.status` is the only reliable
 *     trial-attendance signal — D-123-07).
 *   - Compró: the lead's FIRST paid subscription (`pricePaid > 0` AND
 *     `priceTypeApplied != 'zero'`) within `[sessionDate, sessionDate + window)`.
 *     The plan axis groups by the plan they BOUGHT (subscriptions.planId →
 *     subscriptionPlans.name/country), NOT the trial plan.
 *
 * Rates (D-123-11): `tasa_show = asistieron ÷ reservaron`,
 * `tasa_cierre = compraron ÷ asistieron` (denominator = ASISTENTES),
 * `punta_a_punta = compraron ÷ reservaron` — each `metricShape`, div-by-zero → 0
 * never NaN.
 *
 * Scope (D-123-14 / T-123-06/07): sede comes from `schedules.branchId`
 * (`bookings` has no `branch_id`), so `applyScope` filters on
 * `schema.schedules.branchId`; the `branches` join is added CONDITIONALLY via
 * `.$dynamic()` when `needsBranchJoin` (active country filter) — else the
 * `branches.country` condition references a table not in the FROM → 500 (121/122
 * lesson). The endpoint is ADMIN_ROLES-only (requireAdminAnalytics, gestión 403).
 *
 * Correlated subqueries (T-123-09): the new-lead-exclusion and
 * first-paid-sub-in-window subselects reference the OUTER `bookings` columns with
 * the explicit `schema.bookings.<col>` prefix — Drizzle renders unqualified refs
 * against the INNER (subscriptions) table, silently binding wrong (121/122
 * lesson).
 *
 * Uses constructor DI (Phase 56 convention), same shape as ChurnService /
 * FunnelService. Does NOT import or extend the Phase-118 freemium funnel module.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { bucketExpr, rangeConditions } from "./cohorts";
import { metricShape } from "./metric-shape";
import type {
  AnalyticsFilters,
  TrialFunnelAnalytics,
  TrialFunnelAxis,
  TrialFunnelBreakdownRow,
  TrialFunnelRates,
  TrialFunnelSeriesRow,
  TrialFunnelStageCounts,
  TrialTurno,
} from "./types";

// Re-exported from `./types` (the single shared literal) so existing importers of
// `TrialTurno` from this service keep working while `AnalyticsFilters` references
// it without a circular service import.
export type { TrialTurno } from "./types";

// ── Turno cutoffs (D-123-13) — named constants, NOT env vars ────────────────
// `schedules.startTime` is `HH:MM` wall-clock in the sede's LOCAL timezone
// (schedules are sede-local), so bucketing is a pure parse of the leading hour —
// no cross-TZ conversion is needed. Ranges are half-open on the hour:
//   mañana = 07:00–09:59, tarde = 17:00–19:59, everything else → "otro".
export const TURNO_MANANA_START_HOUR = 7;
export const TURNO_MANANA_END_HOUR = 10;
export const TURNO_TARDE_START_HOUR = 17;
export const TURNO_TARDE_END_HOUR = 20;

/** The default attribution window (D-123-12) when the caller passes no `window`. */
export const TRIAL_ATTRIBUTION_WINDOW_DEFAULT_DAYS = 21;

/**
 * Classify a schedule `startTime` (`"HH:MM"`, sede-local wall-clock) into a turno
 * (D-123-13). Parses the leading hour; mañana = [07,10), tarde = [17,20), else
 * "otro". A malformed / unparseable string falls back to "otro" (defensive).
 *
 * @param startTime the schedule start time as `"HH:MM"`.
 * @returns the turno bucket.
 */
export function classifyTurno(startTime: string): TrialTurno {
  const hour = Number.parseInt(startTime.slice(0, 2), 10);
  if (Number.isNaN(hour)) return "otro";
  if (hour >= TURNO_MANANA_START_HOUR && hour < TURNO_MANANA_END_HOUR) {
    return "manana";
  }
  if (hour >= TURNO_TARDE_START_HOUR && hour < TURNO_TARDE_END_HOUR) {
    return "tarde";
  }
  return "otro";
}

/** A trial booking of a new lead reduced to what the cascade fold needs. */
interface TrialBookingRow {
  /** The booking's scheduled-session date (`YYYY-MM-DD`, the cohort anchor). */
  bookingDate: string;
  /** The booking status — drives the asistió flag. */
  status: string;
  /** The schedule start time (`"HH:MM"`) — drives the turno axis. */
  startTime: string;
  /** The sede name (breakdown key). */
  branchName: string | null;
  /** The sede country (breakdown key). */
  branchCountry: string | null;
  /** The bought plan's name when compró within window, else null. */
  boughtPlanName: string | null;
  /** The bought plan's country when compró within window, else null. */
  boughtPlanCountry: string | null;
  /** 1 when the lead bought a first paid sub within the window from this session. */
  compro: number;
  /** 1 when `sessionDate + window` is still in the future today (not matured). */
  provisional: number;
}

/** Per-segment cascade accumulator. */
interface CascadeAcc {
  reservaron: number;
  asistieron: number;
  compraron: number;
}

function emptyCascadeAcc(): CascadeAcc {
  return { reservaron: 0, asistieron: 0, compraron: 0 };
}

/** Fold a booking's stage flags into a cascade accumulator. */
function foldCascade(acc: CascadeAcc, asistio: boolean, compro: boolean): void {
  // Reservó: every cohort row counts regardless of final status (D-123-08).
  acc.reservaron += 1;
  if (asistio) acc.asistieron += 1;
  if (compro) acc.compraron += 1;
}

/** Build the three cascade rates from an accumulator (D-123-11). */
function ratesFromAcc(acc: CascadeAcc): TrialFunnelRates {
  return {
    tasaShow: metricShape(acc.asistieron, acc.reservaron),
    // tasa_cierre denominator = ASISTENTES, NOT reservas (D-123-11).
    tasaCierre: metricShape(acc.compraron, acc.asistieron),
    puntaAPunta: metricShape(acc.compraron, acc.reservaron),
  };
}

/** Build the plain cascade counts from an accumulator. */
function countsFromAcc(acc: CascadeAcc): TrialFunnelStageCounts {
  return {
    reservaron: acc.reservaron,
    asistieron: acc.asistieron,
    compraron: acc.compraron,
  };
}

/** A booking's status counts as `asistió` only for these enum values (D-123-07). */
function statusIsAsistio(status: string): boolean {
  return status === "qr_escaneado" || status === "confirmado";
}

export class TrialFunnelService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * The trial-session funnel payload (FUNNEL-01..05). Reads the new-lead trial
   * cohort anchored on `bookings.bookingDate`, resolves each booking's asistió
   * (from status) and compró (first paid sub in `[sessionDate, sessionDate +
   * window)`) flags + the bought plan, then folds into the official cascade, the
   * weekly+monthly provisional series, and the branch/country/turno/plan
   * breakdowns.
   */
  async getTrialFunnel(
    filters: AnalyticsFilters,
  ): Promise<TrialFunnelAnalytics> {
    const attributionWindowDays =
      filters.window ?? TRIAL_ATTRIBUTION_WINDOW_DEFAULT_DAYS;

    const fetched = await this.readCohort(filters, attributionWindowDays);

    // Turno INPUT filter (Phase 132 D-10): restrict the already-scoped cohort to
    // bookings whose schedule classifies to the selected turno. Applied in-memory
    // AFTER the scoped DB fetch (mirroring foldBreakdown's r.startTime read), so
    // turno NEVER relaxes the country/branch scope (T-132-01). "otro" is never a
    // selectable input (schema enum is manana/tarde); guarded defensively anyway.
    const rows =
      filters.turno === undefined || filters.turno === "otro"
        ? fetched
        : fetched.filter((r) => classifyTurno(r.startTime) === filters.turno);

    // ── Official cascade over the whole new-lead cohort ────────────────────
    const overall = emptyCascadeAcc();
    for (const r of rows) {
      foldCascade(overall, statusIsAsistio(r.status), Number(r.compro) === 1);
    }

    // ── Weekly + monthly provisional series ────────────────────────────────
    const series: TrialFunnelSeriesRow[] = [
      ...this.foldSeries(rows, "weekly"),
      ...this.foldSeries(rows, "monthly"),
    ];

    // ── Branch / country / turno / plan-bought breakdowns ──────────────────
    const breakdowns: TrialFunnelBreakdownRow[] = [
      ...this.foldBreakdown(rows, "branch"),
      ...this.foldBreakdown(rows, "country"),
      ...this.foldBreakdown(rows, "turno"),
      ...this.foldBreakdown(rows, "plan"),
    ];

    return {
      counts: countsFromAcc(overall),
      rates: ratesFromAcc(overall),
      series,
      breakdowns,
      attributionWindowDays,
    };
  }

  /**
   * Read the new-lead trial cohort with each booking's asistió-driving status,
   * its turno startTime, its sede, the bought-plan info, the in-window compró
   * flag, and the provisional (not-yet-matured) flag.
   *
   * Scope: `applyScope` on `schedules.branchId`; the `branches` join is added
   * conditionally via `.$dynamic()` when `needsBranchJoin` (active country
   * filter — 121/122 lesson). Cohort windowed half-open on `bookings.bookingDate`
   * (D-123-10).
   *
   * The new-lead exclusion (D-123-10) and first-paid-sub-in-window (D-123-09)
   * are correlated subqueries that reference the OUTER `bookings` columns with
   * the explicit `schema.bookings.<col>` prefix (T-123-09 — Drizzle would
   * otherwise bind the unqualified ref to the inner subscriptions table).
   */
  private async readCohort(
    filters: AnalyticsFilters,
    windowDays: number,
  ): Promise<TrialBookingRow[]> {
    const { conditions: scopeConditions } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.schedules.branchId,
    });

    // "Paid sub" = pricePaid > 0 AND priceTypeApplied != 'zero' (a zero-price
    // freemium/promo grant is NOT a purchase — D-123-09).
    const paidSubPredicate = sql`s.price_paid > 0 AND s.price_type_applied <> 'zero'`;

    // Plan INPUT filter (Phase 132 D-10): the plan axis groups by the plan BOUGHT,
    // so the planId filter restricts the compró/bought-plan detection to that plan
    // ONLY — a lead who bought a DIFFERENT plan then counts as not-compró under
    // this filter. The new-lead exclusion deliberately stays UNRESTRICTED (a prior
    // paid sub of ANY plan still makes the lead a returner). Appended as an EXTRA
    // predicate after the paid-sub predicate — never relaxes scope (T-132-01).
    const boughtPlanPredicate =
      filters.planId === undefined
        ? paidSubPredicate
        : sql`${paidSubPredicate} AND s.plan_id = ${filters.planId}`;

    // New-lead exclusion (D-123-10): EXCLUDE any booking whose member already has
    // a PRIOR paid subscription that started strictly before the session date.
    // Outer refs qualified with the literal schema.bookings.* prefix (T-123-09).
    // Uses the UNRESTRICTED paid-sub predicate (any plan makes a returner).
    const newLeadCondition = sql`NOT EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = ${schema.bookings.memberId}
        AND ${paidSubPredicate}
        AND s.start_date < ${schema.bookings.bookingDate}
    )`;

    // Compró (D-123-09): 1 when the member has at least one paid subscription
    // whose start_date falls in the half-open window [sessionDate, sessionDate +
    // windowDays). DATE_ADD with a bound integer keeps the window service-typed
    // (T-123-08). Outer refs explicitly qualified (T-123-09). Under a planId
    // filter only purchases of that plan count (boughtPlanPredicate).
    const comproExpr = sql<number>`(
      EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.user_id = ${schema.bookings.memberId}
          AND ${boughtPlanPredicate}
          AND s.start_date >= ${schema.bookings.bookingDate}
          AND s.start_date < DATE_ADD(${schema.bookings.bookingDate}, INTERVAL ${windowDays} DAY)
      )
    )`;

    // The plan the lead BOUGHT (D-123-09): the plan of the FIRST in-window paid
    // sub. Correlated scalar subselects, outer refs qualified (T-123-09).
    const boughtPlanNameExpr = sql<string | null>`(
      SELECT sp.name FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.user_id = ${schema.bookings.memberId}
        AND ${boughtPlanPredicate}
        AND s.start_date >= ${schema.bookings.bookingDate}
        AND s.start_date < DATE_ADD(${schema.bookings.bookingDate}, INTERVAL ${windowDays} DAY)
      ORDER BY s.start_date ASC, s.id ASC
      LIMIT 1
    )`;
    const boughtPlanCountryExpr = sql<string | null>`(
      SELECT sp.country FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.user_id = ${schema.bookings.memberId}
        AND ${boughtPlanPredicate}
        AND s.start_date >= ${schema.bookings.bookingDate}
        AND s.start_date < DATE_ADD(${schema.bookings.bookingDate}, INTERVAL ${windowDays} DAY)
      ORDER BY s.start_date ASC, s.id ASC
      LIMIT 1
    )`;

    // Provisional (D-123-12): 1 when this session's attribution window has NOT
    // fully elapsed yet (sessionDate + windowDays > today) — the cohort matures
    // itself as the window closes.
    const provisionalExpr = sql<number>`(
      DATE_ADD(${schema.bookings.bookingDate}, INTERVAL ${windowDays} DAY) > CURDATE()
    )`;

    // `branches` is joined UNCONDITIONALLY (flavor A): the branch/country/turno
    // breakdowns always need the branch row, and the single cohort scan feeds both
    // the top-line and every breakdown axis in JS. Because branches is always in
    // the FROM, the country scope condition (`branches.country = ?`, added to
    // `scopeConditions` only when the filter is active) is always resolvable — so
    // the `needsBranchJoin` 500-risk from churn/renewal (where branches was NOT
    // joined) does not apply here. The joins live in the STATIC chain (no
    // `.$dynamic()`): selecting `schema.branches.*` requires branches to be in the
    // FROM at `.select()` time, otherwise Drizzle infers those columns as `never`
    // and the prepared-query type breaks at build (post-merge tsc gate).
    const conditions: SQL[] = [
      eq(schema.bookings.isTrial, true),
      newLeadCondition,
      ...rangeConditions(
        schema.bookings.bookingDate,
        filters.dateFrom,
        filters.dateTo,
      ),
      ...scopeConditions,
    ];

    const result = await this.db
      .select({
        bookingDate: sql<string>`${schema.bookings.bookingDate}`,
        status: sql<string>`${schema.bookings.status}`,
        startTime: schema.schedules.startTime,
        branchName: schema.branches.name,
        branchCountry: schema.branches.country,
        boughtPlanName: boughtPlanNameExpr,
        boughtPlanCountry: boughtPlanCountryExpr,
        compro: comproExpr,
        provisional: provisionalExpr,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .where(and(...conditions));

    return result.map((r) => ({
      bookingDate: String(r.bookingDate),
      status: String(r.status),
      startTime: String(r.startTime),
      branchName: r.branchName ?? null,
      branchCountry: r.branchCountry ?? null,
      boughtPlanName: r.boughtPlanName ?? null,
      boughtPlanCountry: r.boughtPlanCountry ?? null,
      compro: Number(r.compro),
      provisional: Number(r.provisional),
    }));
  }

  /**
   * Fold the cohort into a weekly or monthly cascade series (D-123-04/10/12).
   * Buckets each booking by `bucketExpr(bookingDate, bucket)` in JS (the SQL
   * expression contract is shared with cohorts.ts); a bucket is `provisional`
   * when ANY of its bookings has not yet matured.
   */
  private foldSeries(
    rows: TrialBookingRow[],
    bucket: "weekly" | "monthly",
  ): TrialFunnelSeriesRow[] {
    // `bucketExpr` is the SQL contract; mirror its semantics in JS so the series
    // bucket keys match the documented `%x-W%v` / `%Y-%m` formats without a
    // second DB round-trip.
    void bucketExpr;
    const byBucket = new Map<
      string,
      { acc: CascadeAcc; provisional: boolean }
    >();
    for (const r of rows) {
      const key =
        bucket === "monthly"
          ? monthKey(r.bookingDate)
          : isoWeekKey(r.bookingDate);
      let entry = byBucket.get(key);
      if (entry === undefined) {
        entry = { acc: emptyCascadeAcc(), provisional: false };
        byBucket.set(key, entry);
      }
      if (Number(r.provisional) === 1) entry.provisional = true;
      foldCascade(entry.acc, statusIsAsistio(r.status), Number(r.compro) === 1);
    }

    const out: TrialFunnelSeriesRow[] = [];
    for (const [key, entry] of byBucket) {
      out.push({
        bucket: key,
        counts: countsFromAcc(entry.acc),
        rates: ratesFromAcc(entry.acc),
        provisional: entry.provisional,
      });
    }
    out.sort((a, b) => a.bucket.localeCompare(b.bucket));
    return out;
  }

  /**
   * Fold the cohort into one breakdown axis (FUNNEL-05). branch/country come from
   * the sede join; turno is the funnel-LOCAL `classifyTurno(startTime)` axis (NOT
   * added to the shared breakdowns.ts); plan groups by the plan they BOUGHT
   * (boughtPlanName/Country composite — D-123-09). Each segment yields the three
   * cascade counts → three metricShapes. Deterministic .sort().
   */
  private foldBreakdown(
    rows: TrialBookingRow[],
    axis: TrialFunnelAxis,
  ): TrialFunnelBreakdownRow[] {
    const bySegment = new Map<string, CascadeAcc>();
    for (const r of rows) {
      const key = this.breakdownKey(r, axis);
      if (key === null) continue; // e.g. plan axis on a non-buyer
      let acc = bySegment.get(key);
      if (acc === undefined) {
        acc = emptyCascadeAcc();
        bySegment.set(key, acc);
      }
      foldCascade(acc, statusIsAsistio(r.status), Number(r.compro) === 1);
    }

    const out: TrialFunnelBreakdownRow[] = [];
    for (const [key, acc] of bySegment) {
      out.push({
        axis,
        key,
        counts: countsFromAcc(acc),
        rates: ratesFromAcc(acc),
      });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }

  /**
   * The segment key for one booking under one axis. Returns `null` to DROP the
   * booking from the axis (the plan axis drops non-buyers, since "the plan they
   * bought" is undefined for a lead who never converted).
   */
  private breakdownKey(
    r: TrialBookingRow,
    axis: TrialFunnelAxis,
  ): string | null {
    switch (axis) {
      case "branch":
        return r.branchName ?? "—";
      case "country":
        return r.branchCountry ?? "—";
      case "turno":
        return classifyTurno(r.startTime);
      case "plan":
        // Only buyers contribute a plan-bought segment.
        if (r.boughtPlanName === null) return null;
        return `${r.boughtPlanName} (${r.boughtPlanCountry ?? "—"})`;
    }
  }
}

/** `YYYY-MM` month key for a `YYYY-MM-DD` date (mirrors `DATE_FORMAT(col,'%Y-%m')`). */
function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * ISO year-week key `%x-W%v` for a `YYYY-MM-DD` date (ISO week-based year + ISO
 * week number, weeks starting Monday) — mirrors `bucketExpr(col, "weekly")`.
 */
function isoWeekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  // ISO week: Thursday of the current week decides the week-year.
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
