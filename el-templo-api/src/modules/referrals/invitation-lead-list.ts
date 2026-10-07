// Módulo: referrals — bandeja operativa de leads de invitación (Fase 194-20, D-18)
//
// El listado de Sesiones de Prueba es UNA FILA POR RESERVA SP y los invitados no
// tienen reservas SP, así que sin esta bandeja los leads de invitación serían
// invisibles para gestión. Una fila por invitación `active` (las anuladas no se
// listan), con el invitado y su teléfono (para WhatsApp), el invitador (id para el
// link a la ficha), la activación, accesos x/N, vencimiento, sedes donde entrenó,
// etapa derivada, `lead_status` y canal.
//
// ETAPA EN SQL (paginación exacta): la etapa se calcula en una expresión `CASE`
// (`invitationLeadStageSql`) y el filtro `stage` va en el WHERE, así que el total
// (`COUNT(*) OVER ()`), `LIMIT` y `OFFSET` corren sobre el resultado YA filtrado: sin
// cap ni filtrado posterior en memoria. La expresión espeja `deriveLeadStage`
// (`invitation-states.ts`, la fuente de verdad) con el mismo orden: `convertido`
// -> `vencido` -> `entrenando` -> `invitado`. Un test cruza las dos.
//
// "HOY" POR SEDE: la expresión recibe el `hoy` como fragmento SQL. El listado
// arma uno por zona horaria de las sedes del gimnasio (un `CASE branches.timezone`
// de constantes `YYYY-MM-DD`), así una invitación de España y una de Argentina
// cambian de etapa en SU medianoche, sin depender de que el servidor MySQL tenga
// cargadas las tablas de zonas horarias (`CONVERT_TZ`).
//
// AISLAMIENTO: `tenantWhere` en TODAS las tablas del statement (invitaciones,
// invitado, sede, sub de accesos) y en las queries auxiliares. `tenant_id` sale del
// `ctx` del servidor, jamás del querystring.
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { DEFAULT_TENANT_TIMEZONE, todayInTz } from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { CountryCode } from "../shared/country-scope";
import { accessesUsed, type LeadStage } from "./invitation-states";
import { loadTrainedBranches } from "./invitation-trained-branches";

type DbInstance = MySql2Database<typeof schema>;

const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface InvitationLeadFilters {
  /** Etapa derivada (filtra en SQL). */
  stage?: LeadStage;
  /** Sede donde se activó la invitación (`invitations.branch_id`). */
  branchId?: number;
  /** Rango de activación, 'YYYY-MM-DD' inclusive. */
  from?: string;
  to?: string;
  /** Restringe a invitaciones de sedes de ese país (rol de alcance por país). */
  country?: CountryCode;
  page?: number;
  pageSize?: number;
}

/** Una fila de la bandeja. El teléfono es dato de contacto: la ruta es solo staff. */
export interface InvitationLeadRow {
  invitationId: number;
  invitee: {
    userId: number;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
  inviter: { userId: number; name: string };
  /** ISO 8601. */
  activatedAt: string;
  accessesUsed: number | null;
  accessesBudget: number | null;
  accessExpiresOn: string;
  /** Sede donde se activó la invitación. */
  branchId: number;
  branchName: string;
  /** Sedes donde entrenó (asistencias entre la activación y el vencimiento). */
  branchesTrained: string[];
  stage: LeadStage;
  /** `users.lead_status` del invitado (editable con `PATCH /api/admin/leads/:userId`). */
  leadStatus: "en_seguimiento" | "ganado" | "perdido" | null;
  channel: "self_service" | "assisted";
}

export interface InvitationLeadPage {
  rows: InvitationLeadRow[];
  /** Total de invitaciones que cumplen los filtros (exacto, no solo de la página). */
  total: number;
  page: number;
  pageSize: number;
}

/**
 * `hoy` por sede: `CASE branches.timezone WHEN '<tz>' THEN '<YYYY-MM-DD>' ... END`.
 * Solo constantes: ningún dato del cliente entra al fragmento.
 */
export function todayByBranchTimezoneSql(
  timezones: string[],
  now: Date = new Date(),
): SQL {
  // Sin sedes no hay invitaciones; igual el SQL tiene que ser válido (`CASE x ELSE`
  // no lo es), así que se cae a la constante de respaldo.
  if (timezones.length === 0)
    return sql`${todayInTz(DEFAULT_TENANT_TIMEZONE, now)}`;
  const whens = timezones.map(
    (tz) => sql`WHEN ${tz} THEN ${todayInTz(tz, now)}`,
  );
  /* tenant-safe: fragmento de expresión sobre branches.timezone; solo viaja dentro
     de la query de `fetchPage`, que acota branches con tenantWhere. */
  return sql`(CASE ${schema.branches.timezone} ${sql.join(whens, sql` `)} ELSE ${todayInTz(DEFAULT_TENANT_TIMEZONE, now)} END)`;
}

/**
 * Etapa del lead de invitación en SQL. Mismas reglas y mismo orden que
 * `deriveLeadStage`: `convertido` si `converted_at` no es nulo -> `vencido` si
 * `access_expires_on < hoy` o `classes_remaining = 0` -> `entrenando` si
 * `classes_budget - classes_remaining > 0` -> `invitado`. Un `NULL` en el cupo
 * nunca dispara `vencido`/`entrenando` (igual que la función pura).
 *
 * `todayExpr` va envuelto en `CAST(... AS DATE)`: comparar una columna DATE con un
 * string NO constante lo compara como número y da resultados silenciosamente mal.
 */
export function invitationLeadStageSql(todayExpr: SQL): SQL {
  /* tenant-safe: fragmento de expresión sobre columnas de invitations y de
     subscriptions (sub de accesos); solo viaja dentro de las queries de este
     archivo, que acotan ambas tablas con tenantWhere. */
  return sql`(CASE
    WHEN ${schema.invitations.convertedAt} IS NOT NULL THEN 'convertido'
    WHEN ${schema.invitations.accessExpiresOn} < CAST(${todayExpr} AS DATE)
      OR ${schema.subscriptions.classesRemaining} = 0 THEN 'vencido'
    WHEN ${schema.subscriptions.classesBudget} - ${schema.subscriptions.classesRemaining} > 0 THEN 'entrenando'
    ELSE 'invitado'
  END)`;
}

/** Zonas horarias distintas de las sedes del gimnasio (para armar el `hoy` por sede). */
async function loadTenantTimezones(
  db: DbInstance,
  ctx: TenantContext,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(tenantWhere(schema.branches, ctx));
  return rows.map((row) => row.timezone);
}

export class InvitationLeadList {
  constructor(private readonly db: DbInstance) {}

  /** Bandeja paginada de leads de invitación (D-18). */
  async list(
    ctx: TenantContext,
    filters: InvitationLeadFilters = {},
  ): Promise<InvitationLeadPage> {
    const page = Math.max(1, Math.trunc(filters.page ?? 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.trunc(filters.pageSize ?? DEFAULT_PAGE_SIZE)),
    );

    const timezones = await loadTenantTimezones(this.db, ctx);
    const stageExpr = invitationLeadStageSql(
      todayByBranchTimezoneSql(timezones),
    );

    let dbRows = await this.fetchPage(ctx, filters, stageExpr, page, pageSize);
    let total = Number(dbRows[0]?.total ?? 0);
    if (dbRows.length === 0 && page > 1) {
      // Página más allá del final: la ventana no devuelve filas y por lo tanto
      // tampoco el total. Se lo pide a la primera página (misma query).
      const first = await this.fetchPage(ctx, filters, stageExpr, 1, 1);
      total = Number(first[0]?.total ?? 0);
      dbRows = [];
    }
    if (dbRows.length === 0) return { rows: [], total, page, pageSize };

    const trained = await loadTrainedBranches(
      this.db,
      ctx,
      dbRows.map((row) => row.id),
    );
    const inviterNames = await this.loadInviterNames(
      ctx,
      dbRows.map((row) => row.inviterId),
    );

    const rows = dbRows.map(
      (row): InvitationLeadRow => ({
        invitationId: row.id,
        invitee: {
          userId: row.invitedUserId,
          firstName: row.firstName ?? "",
          lastName: row.lastName ?? "",
          phone: row.phone,
        },
        inviter: {
          userId: row.inviterId,
          name: inviterNames.get(row.inviterId) ?? "",
        },
        activatedAt: row.activatedAt.toISOString(),
        accessesUsed: accessesUsed(row.classesBudget, row.classesRemaining),
        accessesBudget: row.classesBudget,
        accessExpiresOn: row.accessExpiresOn,
        branchId: row.branchId,
        branchName: row.branchName,
        branchesTrained: trained.get(row.id) ?? [],
        stage: row.stage,
        leadStatus: row.leadStatus,
        channel: row.channel,
      }),
    );
    return { rows, total, page, pageSize };
  }

  /**
   * UNA sola query: la página y el total exacto del conjunto YA filtrado
   * (`COUNT(*) OVER ()` se evalúa antes del LIMIT/OFFSET, así el filtro de etapa
   * del WHERE alcanza al total). Un solo statement: los filtros de página y de
   * conteo no pueden divergir.
   */
  private async fetchPage(
    ctx: TenantContext,
    filters: InvitationLeadFilters,
    stageExpr: SQL,
    page: number,
    pageSize: number,
  ) {
    return this.db
      .select({
        id: schema.invitations.id,
        inviterId: schema.invitations.inviterId,
        invitedUserId: schema.invitations.invitedUserId,
        channel: schema.invitations.channel,
        activatedAt: schema.invitations.activatedAt,
        accessExpiresOn: schema.invitations.accessExpiresOn,
        branchId: schema.invitations.branchId,
        branchName: schema.branches.name,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        leadStatus: schema.users.leadStatus,
        classesBudget: schema.subscriptions.classesBudget,
        classesRemaining: schema.subscriptions.classesRemaining,
        stage: sql<LeadStage>`${stageExpr}`,
        total: sql<number>`COUNT(*) OVER ()`,
      })
      .from(schema.invitations)
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.invitations.invitedUserId),
        ),
      )
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.invitations.branchId),
        ),
      )
      .leftJoin(
        schema.subscriptions,
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.id, schema.invitations.subscriptionId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.invitations, ctx),
          eq(schema.invitations.status, "active"),
          filters.stage ? sql`${stageExpr} = ${filters.stage}` : undefined,
          filters.branchId !== undefined
            ? eq(schema.invitations.branchId, filters.branchId)
            : undefined,
          filters.country
            ? eq(schema.branches.country, filters.country)
            : undefined,
          // Fecha de activación (día calendario del servidor de base de datos).
          filters.from
            ? sql`DATE(${schema.invitations.activatedAt}) >= ${filters.from}`
            : undefined,
          filters.to
            ? sql`DATE(${schema.invitations.activatedAt}) <= ${filters.to}`
            : undefined,
        ),
      )
      .orderBy(
        desc(schema.invitations.activatedAt),
        desc(schema.invitations.id),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize);
  }

  /** `inviterId -> nombre completo` en UNA query para toda la página. */
  private async loadInviterNames(
    ctx: TenantContext,
    inviterIds: number[],
  ): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    const ids = [...new Set(inviterIds)];
    if (ids.length === 0) return result;
    const rows = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx), inArray(schema.users.id, ids)),
      );
    for (const row of rows) {
      result.set(
        row.id,
        [row.firstName, row.lastName].filter(Boolean).join(" ").trim(),
      );
    }
    return result;
  }
}
