/**
 * Especial Report Service (Phase 162-03, REP-01 / D-04 / D-05).
 *
 * Reporte de asistencias a las actividades especiales ("Actividades con Aura")
 * por mes, separando el origen del asistente en **socio** vs **externo**, como
 * insumo del reparto MANUAL a los profes (la regla de reparto es de Nacho). El
 * reporte es de asistencias, SIN plata (D-04): este service NUNCA joinea
 * `financial_transactions` / caja ni expone importes en pesos.
 *
 * Hallazgo estructural (fase 161 RESEARCH Pattern 6): `attendance` NO guarda
 * `subscription_id` — solo `member_id`, `schedule_id`, `session_date`,
 * `branch_id`. La clasificación socio/externo se DERIVA del plan
 * `requires_presencial` de la sub especial que **cubre** `session_date`:
 *   requires_presencial = 1 → socio ; = 0 → externo.
 *
 * Regla de fallback (asistencia especial SIN sub especial que cubra la fecha —
 * caso raro, sólo por bypass de staff D-07): se clasifica por la mejor evidencia
 * disponible — si el member tenía una sub PRESENCIAL active/paused cubriendo la
 * `session_date` → socio; si no → externo. Documentada en el JS de clasificación.
 *
 * Anti JOIN-fanout (Pitfall 4): la clasificación NO se hace con un JOIN a
 * `subscriptions` (una renovación Externo→Socio con períodos solapados/contiguos
 * cubriría la fecha con DOS subs especial y duplicaría la fila de attendance).
 * En cambio se usan subqueries CORRELACIONADAS: cada asistencia produce
 * exactamente UNA fila y la sub que cubre la fecha se elige de forma
 * determinística (start_date más reciente = la renovación vigente, p. ej. Socio).
 *
 * Estructura de clase espejo de `AttendanceMetricsService` (constructor DI
 * `db` + `log`, queries sobre `attendance`). Scope por sede/país vía `applyScope`
 * (D-17) — un admin de sede X nunca ve asistencias de sede Y.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import type { AnalyticsFilters } from "./types";

export type EspecialOrigin = "socio" | "externo";

/** Una fila del reporte: asistencias a una actividad especial en el mes, por origen. */
export interface EspecialActivityRow {
  activityId: number;
  activityName: string;
  socioCount: number;
  externoCount: number;
  total: number;
}

/** KPIs D-05: subs especiales activas (active/paused) separadas por origen. */
export interface EspecialReportKpis {
  sociosActivos: number;
  externosActivos: number;
}

export interface EspecialReportResult {
  month: string; // YYYY-MM
  kpis: EspecialReportKpis;
  rows: EspecialActivityRow[];
}

/**
 * Rango de un mes `YYYY-MM` como `[start, endExclusive)` en fechas YYYY-MM-DD.
 * `session_date` es una columna DATE (string mode) — la comparación lexicográfica
 * de strings YYYY-MM-DD es correcta y mantiene el índice
 * idx_attendance_schedule_session_date usable.
 */
function monthRange(month: string): { start: string; endExclusive: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const endExclusive = `${next.y}-${String(next.m).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

export class EspecialReportService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Reporte completo REP-01 para un mes: filas actividad×origen + KPIs D-05.
   */
  async getReport(
    month: string,
    filters: AnalyticsFilters,
  ): Promise<EspecialReportResult> {
    const rows = await this.getActivityRows(month, filters);
    const kpis = await this.getActiveCounts(filters);
    return { month, kpis, rows };
  }

  /**
   * Asistencias a actividades especiales del mes, agregadas por
   * (actividad × origen socio/externo). Una fila por actividad con los dos
   * contadores + total.
   */
  private async getActivityRows(
    month: string,
    filters: AnalyticsFilters,
  ): Promise<EspecialActivityRow[]> {
    const { start, endExclusive } = monthRange(month);
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.attendance.branchId,
    });

    const conditions: SQL[] = [
      sql`${schema.attendance.sessionDate} >= ${start}`,
      sql`${schema.attendance.sessionDate} < ${endExclusive}`,
      ...scopeConditions,
    ];

    // Cada asistencia produce UNA fila (INNER JOIN attendance→schedules→activities
    // is_special). La clasificación viaja en subqueries correlacionadas para NO
    // duplicar por fanout de subs (Pitfall 4):
    //  - `especialRequiresPresencial`: requires_presencial (1/0) de la sub especial
    //    que cubre session_date; si hay varias (renovación solapada/contigua) se
    //    elige la de start_date más reciente. NULL si no hay ninguna.
    //  - `hasCoveringPresencial`: existe una sub PRESENCIAL active/paused que cubre
    //    session_date (input de la regla de fallback).
    const especialRequiresPresencial = sql<number | null>`(
      SELECT sp.requires_presencial
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.user_id = ${schema.attendance.memberId}
        AND sp.plan_category = 'especial'
        AND s.subscription_status <> 'cancelled'
        AND s.start_date <= ${schema.attendance.sessionDate}
        AND (s.end_date IS NULL OR s.end_date >= ${schema.attendance.sessionDate})
      ORDER BY s.start_date DESC, s.id DESC
      LIMIT 1
    )`;

    const hasCoveringPresencial = sql<number>`(
      SELECT EXISTS(
        SELECT 1
        FROM subscriptions s
        JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE s.user_id = ${schema.attendance.memberId}
          AND sp.plan_category = 'presencial'
          AND s.subscription_status IN ('active', 'paused')
          AND s.start_date <= ${schema.attendance.sessionDate}
          AND (s.end_date IS NULL OR s.end_date >= ${schema.attendance.sessionDate})
      )
    )`;

    const base = this.db
      .select({
        activityId: schema.activities.id,
        activityName: schema.activities.name,
        especialRequiresPresencial,
        hasCoveringPresencial,
      })
      .from(schema.attendance)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.attendance.scheduleId),
      )
      .innerJoin(
        schema.activities,
        and(
          eq(schema.activities.id, schema.schedules.activityId),
          eq(schema.activities.isSpecial, true),
        ),
      );

    const raw = needsBranchJoin
      ? await base
          .innerJoin(
            schema.branches,
            eq(schema.branches.id, schema.attendance.branchId),
          )
          .where(and(...conditions))
      : await base.where(and(...conditions));

    // Agregación + clasificación en JS (una fila por asistencia → sin fanout).
    const byActivity = new Map<number, EspecialActivityRow>();
    for (const r of raw) {
      const rp = r.especialRequiresPresencial;
      let origin: EspecialOrigin;
      if (rp === null || rp === undefined) {
        // Fallback (bypass staff, D-07): sin sub especial que cubra la fecha →
        // presencial active/paused cubriendo la fecha ⇒ socio, si no ⇒ externo.
        origin = Number(r.hasCoveringPresencial) === 1 ? "socio" : "externo";
      } else {
        origin = Number(rp) === 1 ? "socio" : "externo";
      }

      let row = byActivity.get(r.activityId);
      if (!row) {
        row = {
          activityId: r.activityId,
          activityName: r.activityName,
          socioCount: 0,
          externoCount: 0,
          total: 0,
        };
        byActivity.set(r.activityId, row);
      }
      if (origin === "socio") row.socioCount += 1;
      else row.externoCount += 1;
      row.total += 1;
    }

    return Array.from(byActivity.values()).sort((a, b) =>
      a.activityName.localeCompare(b.activityName),
    );
  }

  /**
   * KPIs D-05: conteo de suscripciones especiales activas (active/paused)
   * separadas por origen (requires_presencial → socio/externo). Scoped por
   * sede/país sobre `subscriptions.branchId`.
   */
  private async getActiveCounts(
    filters: AnalyticsFilters,
  ): Promise<EspecialReportKpis> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    const conditions: SQL[] = [
      sql`${schema.subscriptionPlans.planCategory} = 'especial'`,
      sql`${schema.subscriptions.status} IN ('active', 'paused')`,
      ...scopeConditions,
    ];

    const base = this.db
      .select({
        requiresPresencial: schema.subscriptionPlans.requiresPresencial,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      );

    const rows = needsBranchJoin
      ? await base
          .innerJoin(
            schema.branches,
            eq(schema.branches.id, schema.subscriptions.branchId),
          )
          .where(and(...conditions))
          .groupBy(schema.subscriptionPlans.requiresPresencial)
      : await base
          .where(and(...conditions))
          .groupBy(schema.subscriptionPlans.requiresPresencial);

    let sociosActivos = 0;
    let externosActivos = 0;
    for (const r of rows) {
      const count = Number(r.count ?? 0);
      if (r.requiresPresencial) sociosActivos = count;
      else externosActivos = count;
    }
    return { sociosActivos, externosActivos };
  }
}
