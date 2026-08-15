/**
 * Class ratings analytics service — the "Clases" tab.
 *
 * A NEW read-only domain service (analytics convention: strategic metrics live
 * in their own service; the `analytics/service.ts` monolith is NOT touched).
 * It reads the CLASS dimension of `coach_ratings` (`class_stars`), the sibling
 * of the PROFE dimension (`stars`) that backs /puntuaciones. Only rows with a
 * non-null `class_stars` are counted — pre-split historical rows (class_stars
 * IS NULL) are excluded so the trend starts cleanly at the feature launch.
 *
 * Surfaces (user-confirmed): a daily TREND, a per-BRANCH average, and a
 * per-TURNO average (mañana/tarde). No per-activity breakdown and no comments
 * here — the comment stays on /puntuaciones only.
 *
 * TURNO note: the class rating was attributed via the roster SLOT, which splits
 * at 12:00 (RatingsService.slotFromStartTime), NOT the analytics turno bands
 * ([07,10)/[17,20)). We group by that SAME 12:00 slot for consistency with how
 * each rating was attributed. This tab therefore does NOT take the global turno
 * filter (band-based) — it always shows both slots.
 *
 * Scope (T-117-01): every query routes branch/country through `applyScope` on
 * `coachRatings.branchId`; the route is ADMIN_ROLES-only (requireAdminAnalytics).
 * Constructor DI (Phase 56), same shape as the other analytics services.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, isNotNull, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
// Path directo, NUNCA por el barrel `shared/index.ts` (fase 169).
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { rangeConditions, bucketExpr } from "./cohorts";
import type {
  AnalyticsFilters,
  ClassRatingsAnalytics,
  ClassRatingTrendPoint,
  ClassRatingBranchRow,
  ClassRatingTurnoRow,
} from "./types";

/** Round an AVG(stars) to 2 decimals (matches getOwnerRatings), null-safe. */
function roundAvg(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : Math.round(n * 100) / 100;
}

export class ClassRatingsService {
  constructor(
    private readonly db: MySql2Database<typeof schema>,
    private readonly log: FastifyBaseLogger,
  ) {}

  async getClassRatings(
    ctx: TenantContext,
    filters: AnalyticsFilters,
  ): Promise<ClassRatingsAnalytics> {
    const [overall, trend, byBranch, byTurno] = await Promise.all([
      this.getOverall(ctx, filters),
      this.getTrend(ctx, filters),
      this.getByBranch(ctx, filters),
      this.getByTurno(ctx, filters),
    ]);
    return { overall, trend, byBranch, byTurno };
  }

  /**
   * Base WHERE conditions shared by every query: rated class + scope + range.
   *
   * T-175.1-01-03 (D-04, hallazgo del gap-fix): `coach_ratings` es gym-owned
   * (tiene `tenant_id`, ver src/db/schema/coach-ratings.ts) y NINGUNA de las
   * cuatro queries de este archivo lo filtraba por tenant — solo `branches`
   * (D4 derivado) y, en `getByTurno`, `schedules`. Sin `tenantWhere` acá el
   * tab "Clases" mezclaba calificaciones de TODOS los gimnasios. `ctx` ya
   * estaba disponible en el call site (`getClassRatings`); se threadea a las
   * tres funciones que no lo recibían.
   */
  private baseConditions(
    ctx: TenantContext,
    filters: AnalyticsFilters,
  ): {
    conditions: SQL[];
    needsBranchJoin: boolean;
  } {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.coachRatings.branchId,
    });

    const conditions: SQL[] = [
      tenantWhere(schema.coachRatings, ctx),
      isNotNull(schema.coachRatings.classStars) as unknown as SQL,
      ...scopeConditions,
      ...rangeConditions(
        schema.coachRatings.sessionDate,
        filters.dateFrom,
        filters.dateTo,
      ),
    ];

    return { conditions, needsBranchJoin };
  }

  /** Global average + count over the scoped, ranged, rated universe. */
  private async getOverall(
    ctx: TenantContext,
    filters: AnalyticsFilters,
  ): Promise<{ avgStars: number | null; count: number }> {
    const { conditions, needsBranchJoin } = this.baseConditions(ctx, filters);

    // `.where(...)` va ANTES de `.$dynamic()` (mismo statement que `.from(...)`,
    // D-02 fase 174.1-03, molde en advanced-finance-service.ts): si el
    // `tenantWhere` quedara en un `.where(...)` posterior al `if` de abajo,
    // sería otro statement y el lint marcaría `.from(...)` como sin filtrar
    // aunque la query sí filtre. `tenantWhere` inline (no solo en
    // `conditions`): `conditions` es una variable — el lint busca el literal
    // `tenantWhere(` en ESTE statement.
    let query = this.db
      .select({
        avgStars: sql<string>`AVG(${schema.coachRatings.classStars})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.coachRatings)
      .where(and(tenantWhere(schema.coachRatings, ctx), ...conditions))
      .$dynamic();

    if (needsBranchJoin) {
      /* tenant-safe: branches joineado por FK para resolver country/nombre de una fila de coach_ratings ya scopeada por tenantWhere arriba, no expone datos cross-gym (D4) */
      query = query.innerJoin(
        schema.branches,
        sql`/* tenant-safe: branches joineado por FK para resolver country/nombre de una fila de coach_ratings ya scopeada por tenantWhere arriba, no expone datos cross-gym (D4) */ ${schema.branches.id} = ${schema.coachRatings.branchId}`,
      );
    }

    const [row] = await query;
    return {
      avgStars: roundAvg(row?.avgStars),
      count: Number(row?.count ?? 0),
    };
  }

  /** Daily trend of the class average (YYYY-MM-DD buckets). */
  private async getTrend(
    ctx: TenantContext,
    filters: AnalyticsFilters,
  ): Promise<ClassRatingTrendPoint[]> {
    const { conditions, needsBranchJoin } = this.baseConditions(ctx, filters);
    const bucket = bucketExpr(schema.coachRatings.sessionDate, "daily");

    // `.where(...)` va ANTES de `.$dynamic()` (mismo statement que `.from(...)`,
    // D-02 fase 174.1-03): ver el comentario extenso en `getOverall`.
    let query = this.db
      .select({
        period: bucket,
        avgStars: sql<string>`AVG(${schema.coachRatings.classStars})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.coachRatings)
      .where(and(tenantWhere(schema.coachRatings, ctx), ...conditions))
      .$dynamic();

    if (needsBranchJoin) {
      /* tenant-safe: branches joineado por FK para resolver country/nombre de una fila de coach_ratings ya scopeada por tenantWhere arriba, no expone datos cross-gym (D4) */
      query = query.innerJoin(
        schema.branches,
        sql`/* tenant-safe: branches joineado por FK para resolver country/nombre de una fila de coach_ratings ya scopeada por tenantWhere arriba, no expone datos cross-gym (D4) */ ${schema.branches.id} = ${schema.coachRatings.branchId}`,
      );
    }

    const rows = await query.groupBy(bucket).orderBy(bucket);

    return rows.map((r) => ({
      period: r.period,
      avgStars: roundAvg(r.avgStars) ?? 0,
      count: Number(r.count),
    }));
  }

  /** Per-branch average + count (always joins branches for the name). */
  private async getByBranch(
    ctx: TenantContext,
    filters: AnalyticsFilters,
  ): Promise<ClassRatingBranchRow[]> {
    const { conditions } = this.baseConditions(ctx, filters);

    /* tenant-safe: branches joineado por FK para resolver el nombre de una fila de coach_ratings ya scopeada por tenantWhere en baseConditions (via `conditions`, filtrado en el .where de abajo), no expone datos cross-gym (D4) */
    const rows = await this.db
      .select({
        branchId: schema.coachRatings.branchId,
        branchName: schema.branches.name,
        avgStars: sql<string>`AVG(${schema.coachRatings.classStars})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.coachRatings)
      .innerJoin(
        schema.branches,
        sql`/* tenant-safe: branches joineado por FK para resolver el nombre de una fila de coach_ratings ya scopeada por tenantWhere en baseConditions, no expone datos cross-gym (D4) */ ${schema.branches.id} = ${schema.coachRatings.branchId}`,
      )
      .where(and(...conditions))
      .groupBy(schema.coachRatings.branchId, schema.branches.name)
      .orderBy(schema.branches.name);

    return rows.map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName,
      avgStars: roundAvg(r.avgStars) ?? 0,
      count: Number(r.count),
    }));
  }

  /**
   * Per-turno average, split at 12:00 on the schedule startTime — the SAME
   * slot boundary the roster used to attribute the rating. Rows whose schedule
   * is missing a startTime are dropped from this breakdown (they cannot be
   * classified), which is why byTurno counts may sum below `overall.count`.
   */
  private async getByTurno(
    ctx: TenantContext,
    filters: AnalyticsFilters,
  ): Promise<ClassRatingTurnoRow[]> {
    const { conditions, needsBranchJoin } = this.baseConditions(ctx, filters);

    // Fase 174.1-03 (D-02): el CASE WHEN se escribe INLINE (no en un `const`
    // aparte) en cada uno de los dos statements que lo usan — `select` abajo, y
    // `groupBy`/`orderBy` en el `const rows` de más abajo — para que el
    // `tenantWhere(schema.schedules, ctx)` de CADA statement cubra también su
    // propia interpolación de `schema.schedules.startTime` (el lint juzga por
    // statement, no por línea; un `const turnoExpr` compartido dejaría su
    // propio statement de definición sin el filtro).
    let query = this.db
      .select({
        turno: sql<string>`CASE WHEN ${schema.schedules.startTime} < '12:00' THEN 'manana' ELSE 'tarde' END`,
        avgStars: sql<string>`AVG(${schema.coachRatings.classStars})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.coachRatings)
      .innerJoin(
        schema.schedules,
        and(
          tenantWhere(schema.schedules, ctx),
          eq(schema.schedules.id, schema.coachRatings.scheduleId),
        ),
      )
      .$dynamic();

    if (needsBranchJoin) {
      /* tenant-safe: branches joineado por FK para resolver country/nombre de una fila de coach_ratings ya scopeada por tenantWhere en baseConditions, no expone datos cross-gym (D4) */
      query = query.innerJoin(
        schema.branches,
        sql`/* tenant-safe: branches joineado por FK para resolver country/nombre de una fila de coach_ratings ya scopeada por tenantWhere en baseConditions, no expone datos cross-gym (D4) */ ${schema.branches.id} = ${schema.coachRatings.branchId}`,
      );
    }

    const rows = await query
      .where(and(tenantWhere(schema.schedules, ctx), ...conditions))
      .groupBy(
        sql<string>`CASE WHEN ${schema.schedules.startTime} < '12:00' THEN 'manana' ELSE 'tarde' END`,
      )
      .orderBy(
        sql<string>`CASE WHEN ${schema.schedules.startTime} < '12:00' THEN 'manana' ELSE 'tarde' END`,
      );

    return rows.map((r) => ({
      turno: r.turno === "manana" ? "manana" : "tarde",
      avgStars: roundAvg(r.avgStars) ?? 0,
      count: Number(r.count),
    }));
  }
}
