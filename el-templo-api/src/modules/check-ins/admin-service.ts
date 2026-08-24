/**
 * Vista admin del Registro del día (check-ins diarios del socio).
 *
 * Separado de CheckInService (flujo del socio: submit + estado de hoy) porque
 * no comparten nada más que la tabla: acá todo es lectura agregada y con scope
 * de país, allá es escritura de una respuesta propia por día.
 *
 * Dos vistas sobre el mismo filtro:
 *  1. summary — distribución por tipo/valor + zonas del cuerpo más reportadas.
 *  2. rows — detalle paginado, agrupado por (socio, día): una fila = todo lo
 *     que esa persona registró ese día, que es como se lee en la UI.
 *
 * check_in_responses no tiene branch_id: la sucursal sale de users.branch_id
 * (la sede actual del socio), así que un cambio de sede reescribe el histórico
 * de ese socio. Es aceptable para "cómo viene la gente de esta sede" y evita
 * desnormalizar; si alguna vez importa la sede al momento del check-in, hay
 * que agregar la columna.
 *
 * Fase 173 (D-02, plan 173-07): los 4 joins a `users` (fetchSummary,
 * fetchBodyAreas, countDays, fetchDayRows) llevan `tenantWhere` inline —
 * `check_in_responses` y `branches` no son tablas del módulo `members` y no
 * se tocan acá (D-02, fase 174/175).
 */

import { eq, and, gte, lte, inArray, sql, desc, type SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { QUESTION_TYPES, VALID_VALUES } from "./types";
import type {
  AdminCheckInsFilters,
  AdminCheckInsResult,
  AdminCheckInDayRow,
  AdminCheckInEntry,
  CheckInScope,
  CheckInQuestionType,
  CheckInSummary,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

export class CheckInAdminService {
  constructor(private readonly db: DbInstance) {}

  /**
   * Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, se propaga a los 4 helpers
   * privados que joinean `users` (`fetchSummary`, `fetchBodyAreas`,
   * `countDays`, `fetchDayRows`). `check_in_responses` y `branches` no se
   * tocan (D-02 — no son tablas del módulo `members`).
   */
  async getAdminCheckIns(
    ctx: TenantContext,
    scope: CheckInScope,
    filters: AdminCheckInsFilters = {},
  ): Promise<AdminCheckInsResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;
    const emptyResult: AdminCheckInsResult = {
      summary: emptySummary(),
      bodyAreas: [],
      rows: [],
      total: 0,
      page,
      limit,
    };

    const conds = await this.buildConditions(scope, filters);
    if (conds === null) {
      return emptyResult;
    }
    const whereClause = conds.length > 0 ? and(...conds) : undefined;

    const [summary, bodyAreas, total] = await Promise.all([
      this.fetchSummary(ctx, whereClause),
      this.fetchBodyAreas(ctx, whereClause),
      this.countDays(ctx, whereClause),
    ]);

    const rows = await this.fetchDayRows(
      ctx,
      whereClause,
      limit,
      offset,
      filters.questionType,
    );

    return { summary, bodyAreas, rows, total, page, limit };
  }

  /**
   * Condiciones comunes. Devuelve null cuando el scope no habilita ninguna
   * sucursal (staff sin país, o país sin sedes) — resultado vacío sin consultar.
   */
  private async buildConditions(
    scope: CheckInScope,
    filters: AdminCheckInsFilters,
  ): Promise<SQL[] | null> {
    const conds: SQL[] = [];

    if (!scope.isOwner) {
      if (scope.country === null) {
        return null;
      }
      const branchRows = await this.db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.country, scope.country));
      const branchIds = branchRows.map((b) => b.id);
      if (branchIds.length === 0) {
        return null;
      }
      conds.push(inArray(schema.users.branchId, branchIds));
    }

    if (filters.branchId !== undefined) {
      conds.push(eq(schema.users.branchId, filters.branchId));
    }
    // `date` es varchar YYYY-MM-DD: la comparación lexicográfica coincide con
    // la cronológica, así que gte/lte alcanzan sin castear.
    if (filters.dateFrom !== undefined) {
      conds.push(gte(schema.checkInResponses.date, filters.dateFrom));
    }
    if (filters.dateTo !== undefined) {
      conds.push(lte(schema.checkInResponses.date, filters.dateTo));
    }
    if (filters.questionType !== undefined) {
      conds.push(
        eq(schema.checkInResponses.questionType, filters.questionType),
      );
    }

    return conds;
  }

  /**
   * Distribución por tipo de pregunta y valor sobre TODO el filtro (no pagina).
   *
   * Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, filtra el join a `users`.
   */
  private async fetchSummary(
    ctx: TenantContext,
    whereClause: SQL | undefined,
  ): Promise<CheckInSummary> {
    const rows = await this.db
      .select({
        questionType: schema.checkInResponses.questionType,
        value: schema.checkInResponses.value,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.checkInResponses)
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.checkInResponses.userId),
        ),
      )
      .where(whereClause)
      .groupBy(
        schema.checkInResponses.questionType,
        schema.checkInResponses.value,
      );

    // Se parte del esqueleto completo (todos los valores en 0) para que la UI
    // no tenga que distinguir "nadie eligió alto" de "alto no existe".
    const summary = emptySummary();
    for (const row of rows) {
      const bucket = summary[row.questionType as CheckInQuestionType];
      if (bucket && row.value in bucket) {
        bucket[row.value] = Number(row.count);
      }
    }
    return summary;
  }

  /**
   * Zonas del cuerpo más reportadas (solo aplica a soreness).
   *
   * Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, filtra el join a `users`.
   */
  private async fetchBodyAreas(
    ctx: TenantContext,
    whereClause: SQL | undefined,
  ): Promise<Array<{ area: string; count: number }>> {
    const conds: SQL[] = [sql`${schema.checkInResponses.bodyArea} IS NOT NULL`];
    if (whereClause !== undefined) {
      conds.push(whereClause);
    }

    const rows = await this.db
      .select({
        area: schema.checkInResponses.bodyArea,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.checkInResponses)
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.checkInResponses.userId),
        ),
      )
      .where(and(...conds))
      .groupBy(schema.checkInResponses.bodyArea)
      .orderBy(desc(sql`COUNT(*)`));

    return rows
      .filter((r): r is { area: string; count: number } => r.area !== null)
      .map((r) => ({ area: r.area, count: Number(r.count) }));
  }

  /**
   * Total de FILAS del listado = pares (socio, día) distintos, no respuestas:
   * la paginación agrupa, así que contar respuestas prometería más páginas de
   * las que existen.
   */
  // Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, filtra el join a `users`.
  private async countDays(
    ctx: TenantContext,
    whereClause: SQL | undefined,
  ): Promise<number> {
    const [row] = await this.db
      .select({
        count: sql<number>`COUNT(DISTINCT ${schema.checkInResponses.userId}, ${schema.checkInResponses.date})`,
      })
      .from(schema.checkInResponses)
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.checkInResponses.userId),
        ),
      )
      .where(whereClause);
    return Number(row?.count ?? 0);
  }

  /**
   * Listado agrupado. Dos pasos a propósito: primero se pagina sobre los pares
   * (socio, día) y recién después se traen sus respuestas. Paginar sobre las
   * respuestas partiría un mismo día de un mismo socio entre dos páginas.
   */
  // Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, filtra el join a `users`.
  private async fetchDayRows(
    ctx: TenantContext,
    whereClause: SQL | undefined,
    limit: number,
    offset: number,
    questionType?: CheckInQuestionType,
  ): Promise<AdminCheckInDayRow[]> {
    const dayKeys = await this.db
      .select({
        userId: schema.checkInResponses.userId,
        date: schema.checkInResponses.date,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        branchName: schema.branches.name,
      })
      .from(schema.checkInResponses)
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.checkInResponses.userId),
        ),
      )
      .leftJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(whereClause)
      .groupBy(
        schema.checkInResponses.userId,
        schema.checkInResponses.date,
        schema.users.firstName,
        schema.users.lastName,
        schema.branches.name,
      )
      // userId como tiebreaker: sin él, dos socios del mismo día pueden
      // intercambiar posición entre páginas y una fila se ve dos veces.
      .orderBy(
        desc(schema.checkInResponses.date),
        schema.checkInResponses.userId,
      )
      .limit(limit)
      .offset(offset);

    if (dayKeys.length === 0) {
      return [];
    }

    // Se re-consultan las respuestas de los pares ya paginados. El IN por
    // usuario + IN por fecha puede traer combinaciones de más (usuario A en
    // fecha de usuario B), así que el armado de abajo indexa por par exacto y
    // descarta el resto.
    const userIds = [...new Set(dayKeys.map((k) => k.userId))];
    const dates = [...new Set(dayKeys.map((k) => k.date))];

    // El filtro de pregunta se re-aplica acá: sin esto, filtrar por "sueño"
    // elegiría los días en que alguien registró sueño pero mostraría también
    // la energía de ese día, contradiciendo el filtro que se ve en pantalla.
    const answerConds: SQL[] = [
      inArray(schema.checkInResponses.userId, userIds),
      inArray(schema.checkInResponses.date, dates),
    ];
    if (questionType !== undefined) {
      answerConds.push(eq(schema.checkInResponses.questionType, questionType));
    }

    const answers = await this.db
      .select({
        userId: schema.checkInResponses.userId,
        date: schema.checkInResponses.date,
        questionType: schema.checkInResponses.questionType,
        value: schema.checkInResponses.value,
        bodyArea: schema.checkInResponses.bodyArea,
      })
      .from(schema.checkInResponses)
      .where(and(...answerConds));

    const byKey = new Map<string, AdminCheckInEntry[]>();
    for (const a of answers) {
      const key = `${a.userId}|${a.date}`;
      const entry: AdminCheckInEntry = {
        questionType: a.questionType as CheckInQuestionType,
        value: a.value,
        bodyArea: a.bodyArea,
      };
      const list = byKey.get(key);
      if (list) {
        list.push(entry);
      } else {
        byKey.set(key, [entry]);
      }
    }

    return dayKeys.map((k) => ({
      userId: k.userId,
      memberName: [k.firstName, k.lastName].filter(Boolean).join(" ").trim(),
      branchName: k.branchName,
      date: k.date,
      entries: sortEntries(byKey.get(`${k.userId}|${k.date}`) ?? []),
    }));
  }
}

/** Esqueleto con todos los valores posibles en 0. */
function emptySummary(): CheckInSummary {
  const summary = {} as CheckInSummary;
  for (const type of QUESTION_TYPES) {
    const bucket: Record<string, number> = {};
    for (const value of VALID_VALUES[type]) {
      bucket[value] = 0;
    }
    summary[type] = bucket;
  }
  return summary;
}

/** Orden estable de las respuestas de un día: energía → dolor → sueño. */
function sortEntries(entries: AdminCheckInEntry[]): AdminCheckInEntry[] {
  return [...entries].sort(
    (a, b) =>
      QUESTION_TYPES.indexOf(a.questionType) -
      QUESTION_TYPES.indexOf(b.questionType),
  );
}
