/**
 * Member flows service — altas vs bajas mensuales + detalle de bajas.
 *
 * Pedido del staff (2026-07-10): entender la relación activos↔inactivos mes a
 * mes (altas y bajas en CONTEOS, no porcentajes) y poder bajar la lista de las
 * bajas de un mes con contexto de ficha (antigüedad, cuántas membresías pagó,
 * qué precio pagaba) para buscar patrones de churn.
 *
 * Read-only domain service (misma convención que ChurnService / RenewalService:
 * el monolito `analytics/service.ts` no se toca). Reutiliza el motor de cohorte
 * de vencimiento de la fase 121 (`expiry-cohort.ts`) para que las BAJAS de acá
 * sean EXACTAMENTE las mismas personas que cuenta el churn del tab Retención
 * (mismo denominador, misma ventana, misma madurez). Reemplaza a las métricas
 * legacy `countNewMembers`/`countChurnedMembers` (deprecated en 121 D-09) como
 * fuente de Nuevos/Bajas del tab Miembros.
 *
 * Definiciones:
 *   - BAJA (mes M): persona cuyo ÚLTIMO vencimiento cayó en M (D-04) y que NO
 *     renovó dentro de la ventana (D-05), contada solo si su ventana de gracia
 *     ya venció (D-08). Un mes con personas aún en gracia se marca provisional.
 *   - ALTA (mes M): persona con una suscripción que INICIA una racha de
 *     cobertura en M — su `startDate` cae en M y NO existe otra sub previa de
 *     la persona cuyo `endDate` llegue hasta `startDate - ventana` días. Así
 *     una renovación encadenada (o dentro de la ventana) NUNCA cuenta como
 *     alta, pero un reingreso post-churn SÍ — simétrico con la definición de
 *     baja, para que altas y bajas cierren entre sí.
 *
 * NO usa `user_status_history`: `users.status` queda stale hasta que una
 * acción toca la sub (no hay cron de recompute), así que las transiciones no
 * son confiables para el timing de la baja. Las suscripciones son la verdad.
 *
 * SQL-injection: fechas via parámetros (rangeConditions); `windowDays` es un
 * entero validado/acotado en la ruta y pasa por `sql.raw(String(n))` (mismo
 * contrato que el resto del motor). Referencias a la tabla externa dentro de
 * subqueries correlacionadas usan el prefijo literal `subscriptions.` (gotcha
 * documentado en expiry-cohort.ts — Drizzle des-califica columnas en
 * `.select()`).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { bucketExpr, rangeConditions } from "./cohorts";
import {
  expiryCohortConditions,
  lastExpiryPerPersonExpr,
  retainedExpr,
  maturedExpr,
  RENOVATION_WINDOW_DEFAULT_DAYS,
} from "./expiry-cohort";
import type {
  AnalyticsFilters,
  MemberFlowsResult,
  MemberFlowsPoint,
  ChurnedMemberRow,
} from "./types";

export class MemberFlowsService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Serie mensual de altas y bajas (conteos de personas distintas por mes)
   * sobre `[dateFrom, dateTo)`. Las bajas reutilizan la cohorte de vencimiento
   * del churn; `bajasProvisional` marca los meses cuya cohorte todavía no
   * maduró completa (los últimos `window` días).
   */
  async getMonthlyFlows(filters: AnalyticsFilters): Promise<MemberFlowsResult> {
    const window = filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS;

    const [altasByBucket, bajasByBucket] = await Promise.all([
      this.altasSeries(filters, window),
      this.bajasSeries(filters, window),
    ]);

    // Merge both maps over the union of buckets, ascending (YYYY-MM lexical).
    const buckets = new Set<string>([
      ...altasByBucket.keys(),
      ...bajasByBucket.keys(),
    ]);
    const series: MemberFlowsPoint[] = [...buckets]
      .sort((a, b) => a.localeCompare(b))
      .map((bucket) => ({
        bucket,
        altas: altasByBucket.get(bucket) ?? 0,
        bajas: bajasByBucket.get(bucket)?.bajas ?? 0,
        bajasProvisional: bajasByBucket.get(bucket)?.provisional ?? false,
      }));

    return { windowDays: window, series };
  }

  /**
   * Altas por mes: personas distintas con un inicio de racha de cobertura en
   * el bucket. El NOT EXISTS excluye subs encadenadas a una cobertura previa
   * (renovaciones, cambios de plan) — solo sobrevive la PRIMERA sub de cada
   * racha. Sin filtro de status: una sub luego cancelada/expirada igualmente
   * fue un alta cuando arrancó.
   */
  private async altasSeries(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<Map<string, number>> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    const n = sql.raw(String(window));
    // Outer refs use the literal `subscriptions.` prefix (see module doc):
    // an unqualified `user_id`/`start_date` inside the correlated subquery
    // resolves to the s_prev alias and rompe el predicado en silencio.
    const streakStartExpr = sql`NOT EXISTS (
      SELECT 1 FROM subscriptions s_prev
      WHERE s_prev.user_id = subscriptions.user_id
        AND s_prev.id <> subscriptions.id
        AND s_prev.start_date < subscriptions.start_date
        AND s_prev.end_date >= DATE_SUB(subscriptions.start_date, INTERVAL ${n} DAY)
    )`;

    const bucket = bucketExpr(schema.subscriptions.startDate, "monthly");

    let query = this.db
      .select({
        bucket,
        userId: schema.subscriptions.userId,
      })
      .from(schema.subscriptions)
      .$dynamic();
    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      );
    }
    const rows = await query.where(
      and(
        ...rangeConditions(
          schema.subscriptions.startDate,
          filters.dateFrom,
          filters.dateTo,
        ),
        streakStartExpr,
        ...scopeConditions,
      ),
    );

    // Distinct persons per bucket (una persona con dos rachas en el mismo mes
    // cuenta una vez — espeja el conteo person-based de bajas).
    const seenByBucket = new Map<string, Set<number>>();
    for (const r of rows) {
      const key = String(r.bucket ?? "");
      let seen = seenByBucket.get(key);
      if (seen === undefined) {
        seen = new Set<number>();
        seenByBucket.set(key, seen);
      }
      seen.add(r.userId);
    }
    const out = new Map<string, number>();
    for (const [key, seen] of seenByBucket) out.set(key, seen.size);
    return out;
  }

  /**
   * Bajas por mes: la misma agregación que ChurnService.monthlySeries pero
   * devolviendo el CONTEO de churneados (nominal) por bucket, con el flag
   * provisional cuando la cohorte del mes aún tiene personas en gracia.
   */
  private async bajasSeries(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<Map<string, { bajas: number; provisional: boolean }>> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    const bucket = bucketExpr(schema.subscriptions.endDate, "monthly");

    let query = this.db
      .select({
        bucket,
        matured: maturedExpr(window),
        retained: retainedExpr(window),
      })
      .from(schema.subscriptions)
      .$dynamic();
    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      );
    }
    const rows = await query.where(
      and(
        ...expiryCohortConditions(filters.dateFrom, filters.dateTo),
        lastExpiryPerPersonExpr(filters.dateFrom, filters.dateTo),
        ...scopeConditions,
      ),
    );

    const out = new Map<string, { bajas: number; provisional: boolean }>();
    for (const r of rows) {
      const key = String(r.bucket ?? "");
      let entry = out.get(key);
      if (entry === undefined) {
        entry = { bajas: 0, provisional: false };
        out.set(key, entry);
      }
      const matured = Number(r.matured) === 1;
      const retained = Number(r.retained) === 1;
      if (!matured) {
        entry.provisional = true;
        continue;
      }
      if (!retained) entry.bajas += 1;
    }
    return out;
  }

  /**
   * Detalle de las bajas de `[dateFrom, dateTo)`: una fila por persona
   * churneada (madura y no retenida — las en-gracia NO aparecen, todavía
   * pueden renovar), con el contexto de ficha que pide el staff. La cohorte es
   * la misma del churn/serie de arriba, así la tabla siempre suma lo que el
   * gráfico muestra.
   */
  async getChurnedMembers(
    filters: AnalyticsFilters,
  ): Promise<ChurnedMemberRow[]> {
    const window = filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS;
    const { conditions: scopeConditions } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    // Períodos de membresía que la persona llegó a tener (proxy de "cuántas
    // membresías pagó"). Excluye 'scheduled' (todavía no arrancó). Prefijo
    // literal `subscriptions.` obligatorio: está en .select() (ver module doc).
    const membershipsPaidExpr = sql<number>`(
      SELECT COUNT(*) FROM subscriptions sc
      WHERE sc.user_id = subscriptions.user_id
        AND sc.subscription_status <> 'scheduled'
    )`;

    const rows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        memberSince: schema.users.createdAt,
        branchName: schema.branches.name,
        planName: schema.subscriptionPlans.name,
        pricePaid: schema.subscriptions.pricePaid,
        currency: schema.subscriptions.currency,
        lastEndDate: schema.subscriptions.endDate,
        membershipsPaid: membershipsPaidExpr,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(
        and(
          ...expiryCohortConditions(filters.dateFrom, filters.dateTo),
          lastExpiryPerPersonExpr(filters.dateFrom, filters.dateTo),
          sql`(${maturedExpr(window)})`,
          sql`NOT (${retainedExpr(window)})`,
          ...scopeConditions,
        ),
      )
      .orderBy(sql`subscriptions.end_date DESC`);

    return rows.map((r) => {
      const memberSince =
        r.memberSince instanceof Date
          ? r.memberSince.toISOString().split("T")[0]
          : String(r.memberSince);
      return {
        userId: r.userId,
        firstName: r.firstName ?? "",
        lastName: r.lastName ?? "",
        phone: r.phone ?? null,
        branchName: r.branchName,
        planName: r.planName,
        pricePaid: r.pricePaid,
        currency: r.currency,
        memberSince,
        tenureMonths: monthsBetween(memberSince, String(r.lastEndDate)),
        membershipsPaid: Number(r.membershipsPaid ?? 0),
        lastEndDate: String(r.lastEndDate),
      };
    });
  }
}

/**
 * Whole months between two YYYY-MM-DD dates (floor, never negative). Tenure is
 * measured from the registration date to the churn date — NOT to today — so a
 * baja from months ago keeps the tenure it had when it left.
 */
function monthsBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate + "T00:00:00Z");
  const to = new Date(toDate + "T00:00:00Z");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}
