/**
 * Funnel Service (Phase 118 D-01 / D-03 / D-09 / D-11).
 *
 * A NEW domain service (per D-09: new strategic metrics live in their own
 * service — the `analytics/service.ts` monolith is NOT touched; that split is
 * v4.9). Computes the conversion funnel `freemium → prueba → activo` with the
 * median time spent in each stage, grouped by cohort, consumed by the admin
 * Funnel tab (frontend in a later plan):
 *
 *   - getFunnel: per cohort (month of `users.created_at`, D-03) computes the
 *     cohort size, the % that reached the `prueba` stage, the % that reached the
 *     `activo` stage, the median days `freemium → prueba` and the median days
 *     `prueba → activo`.
 *
 * Stage detection (D-01 caveat — historical data is approximate):
 *   - `prueba`: a transition to 'prueba' in `user_status_history`. These rows are
 *     precise ONLY forward-only since the hooks shipped on 2026-05-26 (Plan 01) —
 *     older cohorts have no `prueba` row, so their `toPruebaPct` is an
 *     under-count. The frontend (Plan 06) surfaces the ramp-up caveat.
 *   - `activo`: a transition to 'activo' in `user_status_history` OR, as a
 *     historical approximation (D-01), the existence of at least one subscription
 *     (`MIN(subscriptions.created_at)` per user). The earliest of those two
 *     timestamps is taken as the moment of `activo`.
 *
 * Medians are computed in JS over the per-cohort array of whole-day deltas
 * (sorted, middle element / mean of the two central elements). A cohort with no
 * converters reports 0% and a `null` median — NEVER NaN (T-118-12).
 *
 * Scope (D-11 / T-118-11): every query routes through `applyScope` on
 * `users.branchId` so an admin of sede X / país X never sees users of sede Y /
 * país Y. The endpoint itself is ADMIN_ROLES-only (requireAdminAnalytics).
 *
 * Uses constructor DI pattern (Phase 56 convention), same shape as
 * RetentionService / AttendanceMetricsService / AnalyticsService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
// Path directo, NUNCA por el barrel `shared/index.ts` (fase 169).
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type {
  AnalyticsFilters,
  FunnelAnalytics,
  FunnelCohort,
  FunnelEntryOrigin,
} from "./types";

/** A user reduced to what the funnel algorithm needs. */
interface UserRow {
  userId: number;
  /** Month of `users.created_at` — the cohort (YYYY-MM, D-03). */
  cohort: string;
  /** Full `users.created_at` timestamp as a parseable string. */
  createdAt: string;
}

/** Per-user stage timestamps (epoch millis), null when the stage was not reached. */
interface UserStages {
  createdAtMs: number;
  pruebaAtMs: number | null;
  activoAtMs: number | null;
}

/**
 * Whole-day difference `b − a` (epoch millis). Floored to whole days so a
 * transition recorded later the same day still counts as 0 days, never negative
 * for forward transitions. Returns 0 when `b < a` (clamped — a defensive guard
 * against clock skew between `created_at` and a backfilled history row).
 */
function dayDiffMs(aMs: number, bMs: number): number {
  const days = Math.floor((bMs - aMs) / 86_400_000);
  return days < 0 ? 0 : days;
}

/**
 * Median of a numeric array. Returns `null` for an empty array (T-118-12 — no
 * converters → null median, never NaN). Sorts a copy ascending and takes the
 * middle element (odd length) or the mean of the two central elements (even).
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Parse a SQL datetime/timestamp string to epoch millis (UTC-anchored). */
function toMs(value: string): number {
  // Drizzle returns timestamps as "YYYY-MM-DD HH:MM:SS" (or with a T). Normalize
  // to an ISO string anchored at UTC so the parse is timezone-stable.
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const ms = Date.parse(iso.endsWith("Z") ? iso : `${iso}Z`);
  return Number.isNaN(ms) ? Date.parse(value) : ms;
}

export class FunnelService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Conversion funnel `freemium → prueba → activo` by cohort (D-03). Reads every
   * user in scope (cohort = month of `users.created_at`), the `prueba`/`activo`
   * transitions from `user_status_history`, and the `MIN(subscriptions.created_at)`
   * per user as the historical `activo` approximation (D-01). For each cohort it
   * returns the size, % reaching `prueba`, % reaching `activo`, and the median
   * days per stage. Guards: cohort with no converters → 0% and `null` median.
   *
   * Fase 173 (D-02): `ctx` PRIMERO. Dos consultas de este método tocan tablas
   * del módulo — la de `users` (cohorte) y la de `user_status_history`
   * (transiciones) — cada una con su propio `tenantWhere` inline. `subRows`
   * (sobre `subscriptions`) NO se toca (D-02: otra fase).
   */
  async getFunnel(
    ctx: TenantContext,
    filters: AnalyticsFilters,
  ): Promise<FunnelAnalytics> {
    // Entry-origin segment (funnel follow-up). `all` = classic 3-stage funnel
    // over the whole cohort; `directo`/`freemium` restrict the cohort to trials
    // of that origin (the `from_status` of the earliest `prueba` transition) and
    // read as a 2-stage prueba → activo funnel.
    const entryOrigin: FunnelEntryOrigin = filters.entryOrigin ?? "all";

    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.users.branchId,
    });

    // ── Users in scope → cohort by month of created_at (D-03) ──────────────
    // `tenantWhere` INLINE y el `.where(...)` va ANTES del `.innerJoin`
    // condicional (Drizzle arma el SQL por config acumulada, no por orden de
    // llamada): así el `.from(schema.users)` y el `tenantWhere` quedan en el
    // MISMO statement de JS — si el filtro viviera en un `.where(...)` después
    // del `if`, sería otro statement y el lint marcaría `.from(schema.users)`
    // como sin filtrar aunque la query sí filtre.
    let usersQuery = this.db
      .select({
        userId: schema.users.id,
        cohort: sql<string>`DATE_FORMAT(${schema.users.createdAt}, '%Y-%m')`,
        createdAt: sql<string>`${schema.users.createdAt}`,
      })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), ...scopeConditions))
      .$dynamic();

    if (needsBranchJoin) {
      usersQuery = usersQuery.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.users.branchId),
      );
    }

    const userRows: UserRow[] = await usersQuery;

    if (userRows.length === 0) {
      return { cohorts: [], entryOrigin };
    }

    const userIds = userRows.map((u) => u.userId);

    // ── prueba / activo transitions from user_status_history ───────────────
    // All prueba/activo rows for the in-scope users; we reduce to the EARLIEST
    // per (user, stage) in JS so we can also keep the `from_status` of the first
    // prueba transition (the entry-origin discriminator — not recoverable from a
    // MIN(changed_at) GROUP BY). Forward-only precise data since the Plan 01
    // hooks (D-01); older cohorts simply have no row.
    const historyRows = await this.db
      .select({
        userId: schema.userStatusHistory.userId,
        fromStatus: schema.userStatusHistory.fromStatus,
        toStatus: schema.userStatusHistory.toStatus,
        changedAt: sql<string>`${schema.userStatusHistory.changedAt}`,
      })
      .from(schema.userStatusHistory)
      .where(
        and(
          // Fase 173 (D-02): tabla propia del módulo, `tenantWhere` propio —
          // aunque `users` ya filtró arriba, esta tabla lleva el suyo (D-02
          // acceptance: dos tablas del módulo en el mismo método, dos filtros).
          tenantWhere(schema.userStatusHistory, ctx),
          sql`${schema.userStatusHistory.toStatus} IN ('prueba','activo')`,
          // Restrict to the in-scope users (avoids reading the whole table).
          sql`${schema.userStatusHistory.userId} IN (${sql.join(
            userIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      );

    const pruebaAt = new Map<number, number>();
    const activoFromHistory = new Map<number, number>();
    // Origin of the EARLIEST prueba transition per user: from_status NULL →
    // 'directo' (created as prueba), 'freemium' → 'freemium' (converted lead),
    // anything else (e.g. inactivo → prueba rebound) → 'otro' (matches neither
    // segment). Used only when entryOrigin !== 'all'.
    const pruebaOrigin = new Map<number, FunnelEntryOrigin | "otro">();
    for (const r of historyRows) {
      if (r.changedAt === null) continue;
      const ms = toMs(r.changedAt);
      if (r.toStatus === "prueba") {
        const prev = pruebaAt.get(r.userId);
        if (prev === undefined || ms < prev) {
          pruebaAt.set(r.userId, ms);
          pruebaOrigin.set(
            r.userId,
            r.fromStatus === null
              ? "directo"
              : r.fromStatus === "freemium"
                ? "freemium"
                : "otro",
          );
        }
      } else if (r.toStatus === "activo") {
        const prev = activoFromHistory.get(r.userId);
        if (prev === undefined || ms < prev)
          activoFromHistory.set(r.userId, ms);
      }
    }

    // ── activo historical approximation: MIN(subscriptions.created_at) ─────
    const subRows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        firstSub: sql<string>`MIN(${schema.subscriptions.createdAt})`,
      })
      .from(schema.subscriptions)
      .where(
        sql`${schema.subscriptions.userId} IN (${sql.join(
          userIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
      .groupBy(schema.subscriptions.userId);

    const activoFromSub = new Map<number, number>();
    for (const r of subRows) {
      if (r.firstSub === null) continue;
      activoFromSub.set(r.userId, toMs(r.firstSub));
    }

    // ── Resolve per-user stage timestamps ──────────────────────────────────
    const stagesByUser = new Map<number, UserStages>();
    for (const u of userRows) {
      const createdAtMs = toMs(u.createdAt);
      const pAt = pruebaAt.get(u.userId) ?? null;

      // activo = earliest of the history transition and the sub approximation
      // (D-01). Either alone is sufficient to count the user as having reached
      // the activo stage.
      const aHist = activoFromHistory.get(u.userId) ?? null;
      const aSub = activoFromSub.get(u.userId) ?? null;
      let aAt: number | null = null;
      if (aHist !== null && aSub !== null) aAt = Math.min(aHist, aSub);
      else if (aHist !== null) aAt = aHist;
      else if (aSub !== null) aAt = aSub;

      stagesByUser.set(u.userId, {
        createdAtMs,
        pruebaAtMs: pAt,
        activoAtMs: aAt,
      });
    }

    // ── Aggregate per cohort ───────────────────────────────────────────────
    interface CohortAcc {
      size: number;
      toPrueba: number;
      toActivo: number;
      daysFreemiumToPrueba: number[];
      daysPruebaToActivo: number[];
    }
    const cohortMap = new Map<string, CohortAcc>();

    for (const u of userRows) {
      const stages = stagesByUser.get(u.userId);
      if (stages === undefined) continue;

      // Entry-origin segmentation: keep only trials whose earliest prueba came
      // from the requested origin. Users without a prueba transition (no entry
      // in pruebaOrigin) and 'otro' rebounds are excluded from segmented views —
      // they appear only in `all`.
      if (entryOrigin !== "all" && pruebaOrigin.get(u.userId) !== entryOrigin) {
        continue;
      }

      let acc = cohortMap.get(u.cohort);
      if (acc === undefined) {
        acc = {
          size: 0,
          toPrueba: 0,
          toActivo: 0,
          daysFreemiumToPrueba: [],
          daysPruebaToActivo: [],
        };
        cohortMap.set(u.cohort, acc);
      }
      acc.size += 1;

      if (stages.pruebaAtMs !== null) {
        acc.toPrueba += 1;
        acc.daysFreemiumToPrueba.push(
          dayDiffMs(stages.createdAtMs, stages.pruebaAtMs),
        );
      }
      if (stages.activoAtMs !== null) {
        acc.toActivo += 1;
        // prueba → activo median only over users who passed through BOTH stages
        // (D-03 — measured on those who actually moved between the two stages,
        // not the whole cohort).
        if (stages.pruebaAtMs !== null) {
          acc.daysPruebaToActivo.push(
            dayDiffMs(stages.pruebaAtMs, stages.activoAtMs),
          );
        }
      }
    }

    const cohorts: FunnelCohort[] = [...cohortMap.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([cohortMonth, acc]) => ({
        cohortMonth,
        size: acc.size,
        // Guard div-by-zero defensively (acc.size >= 1 here by construction).
        toPruebaPct:
          acc.size > 0 ? Math.round((acc.toPrueba / acc.size) * 100) : 0,
        toActivoPct:
          acc.size > 0 ? Math.round((acc.toActivo / acc.size) * 100) : 0,
        medianDaysFreemiumToPrueba: median(acc.daysFreemiumToPrueba),
        medianDaysPruebaToActivo: median(acc.daysPruebaToActivo),
      }));

    return { cohorts, entryOrigin };
  }
}
