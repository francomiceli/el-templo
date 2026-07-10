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
 *   - BAJA CONFIRMADA (mes M): persona cuyo ÚLTIMO vencimiento cayó en M
 *     (D-04) y que NO renovó dentro de la ventana (D-05), contada solo si su
 *     ventana de gracia ya venció (D-08).
 *   - BAJA EN GRACIA (mes M): último vencimiento en M, todavía dentro de la
 *     ventana y sin renovar — puede volver. Va aparte (`bajasEnGracia`, no
 *     suma a `bajas`) y el mes queda marcado provisional.
 *   - ALTA (mes M): unión person-based de dos fuentes:
 *       (a) inicio de racha de cobertura en M — `startDate` cae en M y NO
 *           existe otra sub previa de la persona cuyo `endDate` llegue hasta
 *           `startDate - ventana` días. Una renovación encadenada NUNCA cuenta
 *           como alta; un reingreso post-churn SÍ. Solo considera subs creadas
 *           DESPUÉS de la importación legacy (ver LEGACY_IMPORT_CUTOFF).
 *       (b) personas importadas del sistema anterior: alta en el mes de su
 *           registro (`users.createdAt`), la única fecha de inicio real que
 *           sobrevivió a la importación.
 *
 * LEGACY_IMPORT_CUTOFF: la base nace con la importación del 2026-03-16 (~5.2k
 * subs, verificado en prod 2026-07-10 — la primera sub de la base es de ese
 * día). Esa importación trajo UNA sub por persona (su último período) y a los
 * ya-inactivos les puso `startDate` = día de importación (4.214 subs con
 * `endDate < startDate`). Por eso los `startDate` importados NO sirven como
 * altas: sobrecuentan renovadores (la racha previa no existe en la base) y
 * concentran un pico falso en 2026-03. Los `endDate` importados sí son reales
 * → las bajas usan toda la historia sin filtro. Si algún día se re-importa la
 * historia completa de períodos, la fuente (b) se elimina.
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

/**
 * Primer instante posterior a la importación legacy del 2026-03-16. Subs con
 * `createdAt` anterior son filas importadas (startDate no confiable, ver doc
 * del módulo). Cortar por día calendario es seguro: un alta real cargada el
 * mismo 16 quedaría igualmente contada en 2026-03 vía su mes de registro.
 */
export const LEGACY_IMPORT_CUTOFF = "2026-03-17";

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
        bajasEnGracia: bajasByBucket.get(bucket)?.enGracia ?? 0,
        bajasProvisional: bajasByBucket.get(bucket)?.provisional ?? false,
      }));

    return { windowDays: window, series };
  }

  /**
   * Altas por mes: personas distintas por bucket, unión de las dos fuentes de
   * la definición (rachas post-importación + registros de importados). El
   * dedupe persona-mes entre fuentes lo hace el Set por bucket.
   */
  private async altasSeries(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<Map<string, number>> {
    const [streakRows, legacyRows] = await Promise.all([
      this.streakAltasRows(filters, window),
      this.legacyAltasRows(filters),
    ]);

    // Distinct persons per bucket (una persona con dos rachas en el mismo mes
    // cuenta una vez — espeja el conteo person-based de bajas).
    const seenByBucket = new Map<string, Set<number>>();
    for (const r of [...streakRows, ...legacyRows]) {
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
   * Fuente (a): inicios de racha de cobertura. El NOT EXISTS excluye subs
   * encadenadas a una cobertura previa (renovaciones, cambios de plan) — solo
   * sobrevive la PRIMERA sub de cada racha. Sin filtro de status: una sub
   * luego cancelada/expirada igualmente fue un alta cuando arrancó. Las subs
   * importadas quedan fuera como CANDIDATAS (startDate no confiable) pero el
   * NOT EXISTS sí las ve: la renovación post-importación de un importado
   * activo encadena con su sub importada y no cuenta como alta.
   */
  private async streakAltasRows(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<Array<{ bucket: string; userId: number }>> {
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
    return query.where(
      and(
        ...rangeConditions(
          schema.subscriptions.startDate,
          filters.dateFrom,
          filters.dateTo,
        ),
        sql`${schema.subscriptions.createdAt} >= ${LEGACY_IMPORT_CUTOFF}`,
        streakStartExpr,
        ...scopeConditions,
      ),
    );
  }

  /**
   * Fuente (b): personas importadas (tienen al menos una sub pre-cutoff) →
   * alta en el mes de registro (`users.createdAt`), la única fecha de inicio
   * real que la importación preservó. El límite conocido: reingresos DENTRO
   * del sistema viejo no son reconstruibles — cada importado cuenta una sola
   * alta, la de su primer registro. El scope de sede/país se aplica por la
   * branch de la sub importada (consistente con el resto del motor).
   */
  private async legacyAltasRows(
    filters: AnalyticsFilters,
  ): Promise<Array<{ bucket: string; userId: number }>> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    const bucket = bucketExpr(schema.users.createdAt, "monthly");

    let query = this.db
      .select({
        bucket,
        userId: schema.users.id,
      })
      .from(schema.users)
      .innerJoin(
        schema.subscriptions,
        and(
          eq(schema.subscriptions.userId, schema.users.id),
          sql`${schema.subscriptions.createdAt} < ${LEGACY_IMPORT_CUTOFF}`,
        ),
      )
      .$dynamic();
    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      );
    }
    return query.where(
      and(
        ...rangeConditions(
          schema.users.createdAt,
          filters.dateFrom,
          filters.dateTo,
        ),
        ...scopeConditions,
      ),
    );
  }

  /**
   * Bajas por mes: la misma agregación que ChurnService.monthlySeries pero
   * devolviendo el CONTEO de churneados (nominal) por bucket, dividido en
   * confirmadas (`bajas`, cohorte madura sin renovar) y en gracia
   * (`enGracia`, vencidos hace menos de `window` días que aún no renovaron),
   * con el flag provisional cuando la cohorte del mes todavía no maduró.
   */
  private async bajasSeries(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<
    Map<string, { bajas: number; enGracia: number; provisional: boolean }>
  > {
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

    const out = new Map<
      string,
      { bajas: number; enGracia: number; provisional: boolean }
    >();
    for (const r of rows) {
      const key = String(r.bucket ?? "");
      let entry = out.get(key);
      if (entry === undefined) {
        entry = { bajas: 0, enGracia: 0, provisional: false };
        out.set(key, entry);
      }
      const matured = Number(r.matured) === 1;
      const retained = Number(r.retained) === 1;
      if (!matured) {
        entry.provisional = true;
        // En gracia: venció hace menos de `window` días y todavía no renovó.
        // Si ya renovó (retained) no es baja de ningún tipo.
        if (!retained) entry.enGracia += 1;
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
