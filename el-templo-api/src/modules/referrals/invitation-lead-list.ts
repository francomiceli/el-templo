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
// LISTA DE SEGUIMIENTO (igual que Renovaciones): además de la etapa, cada fila trae
// el `followStatus` (qué hay que hacer con el invitado), el motivo y la fecha de fin
// de los accesos, el seguimiento manual (`renewal_followups` de la sub de accesos de
// la invitación: mensajes 0-4, motivo, nota) y la última nota del invitado. El
// `followStatus` también se calcula en SQL (`invitationFollowStatusSql`, espejo de
// `deriveFollowStatus`) para poder filtrar, ordenar y contar con paginación exacta.
// Los invitados NO entran a Renovaciones: ahí nunca se listan subs `is_trial`.
//
// ORDEN: primero `para_contactar`, después `con_accesos`, después el resto; dentro de
// cada grupo, por `COALESCE(endedOn, access_expires_on)` descendente y `id` descendente.
//
// AISLAMIENTO: `tenantWhere` en TODAS las tablas del statement (invitaciones,
// invitado, sede, sub de accesos, seguimiento y motivo) y en las queries auxiliares.
// `tenant_id` sale del `ctx` del servidor, jamás del querystring.
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { DEFAULT_TENANT_TIMEZONE, todayInTz } from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { CountryCode } from "../shared/country-scope";
import { fetchLastNotes } from "../renewals/last-notes";
import type { RenewalLastNote, RenewalManualStatus } from "../renewals/types";
import {
  accessesUsed,
  type InvitationEndReason,
  type InvitationFollowStatus,
  type LeadStage,
} from "./invitation-states";
import { paidSinceActivationSql } from "./invitation-purchase";
import { loadTrainedBranches } from "./invitation-trained-branches";
import { getInvitationSettings } from "./invitation-settings";

type DbInstance = MySql2Database<typeof schema>;

const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface InvitationLeadFilters {
  /** Etapa derivada (filtra en SQL). */
  stage?: LeadStage;
  /** Estado de seguimiento derivado (filtra en SQL). */
  followStatus?: InvitationFollowStatus;
  /** Una sola invitación (la fila actualizada que devuelve el PATCH del seguimiento). */
  invitationId?: number;
  /** Sede donde se activó la invitación (`invitations.branch_id`). */
  branchId?: number;
  /** Rango de activación, 'YYYY-MM-DD' inclusive. */
  from?: string;
  to?: string;
  /** Restringe a invitaciones de sedes de ese país (rol de alcance por país). */
  country?: CountryCode;
  /**
   * Restringe a invitaciones activadas en ESTAS sedes (`admin_sede`: alcance forzado por
   * sede, `enforcedBranchIds`). Un array vacío = no ve nada.
   */
  branchIds?: number[];
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
  /** Qué hay que hacer con el invitado (lista de seguimiento). Ver `deriveFollowStatus`. */
  followStatus: InvitationFollowStatus;
  /** `null` mientras tiene accesos; `agotados` (sin accesos) o `plazo` (venció con accesos sin usar). */
  endReason: InvitationEndReason | null;
  /**
   * Día ('YYYY-MM-DD') en que terminaron los accesos: `plazo` -> `access_expires_on`;
   * `agotados` -> su última asistencia dentro de la invitación (o `access_expires_on` si no hay).
   */
  endedOn: string | null;
  /** Seguimiento manual de la sub de accesos (`renewal_followups`); ceros/nulos si no hay fila. */
  followup: InvitationFollowupInfo;
  /** Última nota del invitado (`member_notes`), la misma forma que la "Observación" de Renovaciones. */
  lastNote: RenewalLastNote | null;
  /** `users.lead_status` del invitado (editable con `PATCH /api/admin/leads/:userId`). */
  leadStatus: "en_seguimiento" | "ganado" | "perdido" | null;
  channel: "self_service" | "assisted";
}

/** Seguimiento manual de una invitación (la fila de `renewal_followups` de su sub de accesos). */
export interface InvitationFollowupInfo {
  /** `invitations.subscription_id` (sub de accesos); `null` = no se puede hacer seguimiento (409 al escribir). */
  subscriptionId: number | null;
  /** Lo persistido (`en_proceso` si nunca se gestionó). */
  manualStatus: RenewalManualStatus;
  /** Avance de contacto manual, 0-4. */
  messageCount: number;
  lastMessageAt: string | null;
  reasonId: number | null;
  reasonLabel: string | null;
  reasonNote: string | null;
}

/** Contadores del aviso rojo de la bandeja. */
export interface InvitationPendingCount {
  /** Invitaciones en `para_contactar`. */
  open: number;
  /** Las de `open` sin ningún mensaje registrado. */
  uncontacted: number;
  /**
   * Invitados que se activaron SOLOS desde la app (`self_service`) hace al menos
   * `followupNoBookingHours` horas (setting, default 48), todavía tienen accesos
   * (`con_accesos`), no reservaron ninguna clase desde la activación (reserva no
   * cancelada) y nadie les escribió (0 mensajes). Sin este contador ventas recién se
   * enteraba cuando los accesos ya habían terminado (caso real 2026-11-20: activó, nunca
   * reservó, vencido sin usar). El que reserva solo no necesita seguimiento: deja de
   * contar apenas reserva. Las asistidas no cuentan: las carga el staff, que ya está en
   * contacto.
   */
  selfActivatedWithoutBooking: number;
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

/**
 * "Compró una membresía paga no-trial desde la activación" (definición única de
 * `paidSinceActivationSql`) correlacionado a `invitations`. Subquery con FROM propio: el
 * gimnasio va INLINE y la referencia externa como literal `invitations.*` (trampa Drizzle
 * de columnas sin calificar).
 */
export function invitationPurchasedSql(ctx: TenantContext): SQL {
  /* tenant-safe: subquery con su propio FROM subscriptions s acotada por
     s.tenant_id inline; correlaciona con invitations del statement externo. */
  return sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.tenant_id = ${ctx.tenantId}
      AND s.user_id = invitations.invited_user_id
      AND ${paidSinceActivationSql("s", sql`invitations.activated_at`)}
  )`;
}

/**
 * Estado de seguimiento en SQL. Mismas reglas y mismo orden que `deriveFollowStatus`:
 * `compro` (converted_at) -> `compro_tarde` (compró fuera de la ventana de compra tardía)
 * -> `no_sigue` (seguimiento manual `no_renovo`) -> `para_contactar` (accesos terminados:
 * `access_expires_on < hoy` o `classes_remaining = 0`) -> `con_accesos`.
 *
 * Requiere `renewal_followups` joineada por la sub de accesos (un LEFT JOIN: sin fila el
 * `manual_status` es NULL y no dispara `no_sigue`). `todayExpr` va en `CAST(... AS DATE)`.
 */
export function invitationFollowStatusSql(
  todayExpr: SQL,
  purchasedExpr: SQL,
): SQL {
  /* tenant-safe: fragmento de expresión sobre columnas de invitations, subscriptions
     (sub de accesos) y renewal_followups; solo viaja dentro de las queries de este
     archivo, que acotan las tres tablas con tenantWhere. */
  return sql`(CASE
    WHEN ${schema.invitations.convertedAt} IS NOT NULL THEN 'compro'
    WHEN ${purchasedExpr} THEN 'compro_tarde'
    WHEN ${schema.renewalFollowups.manualStatus} = 'no_renovo' THEN 'no_sigue'
    WHEN ${schema.invitations.accessExpiresOn} < CAST(${todayExpr} AS DATE)
      OR ${schema.subscriptions.classesRemaining} = 0 THEN 'para_contactar'
    ELSE 'con_accesos'
  END)`;
}

/** Motivo del fin de accesos en SQL (espejo de `deriveEndReason`): `agotados` -> `plazo` -> NULL. */
export function invitationEndReasonSql(todayExpr: SQL): SQL {
  /* tenant-safe: fragmento de expresión sobre columnas de invitations y de
     subscriptions (sub de accesos); solo viaja dentro de las queries de este archivo. */
  return sql`(CASE
    WHEN ${schema.subscriptions.classesRemaining} = 0 THEN 'agotados'
    WHEN ${schema.invitations.accessExpiresOn} < CAST(${todayExpr} AS DATE) THEN 'plazo'
    ELSE NULL
  END)`;
}

/**
 * Día en que terminaron los accesos (DATE o NULL). `agotados`: la última asistencia del
 * invitado DENTRO de la invitación (mismo criterio que `loadTrainedBranches`: entre
 * `access_starts_on` y `access_expires_on`, así queda topeada en `access_expires_on`; la
 * columna `session_date` ya es el día calendario de la sede), o `access_expires_on` si no
 * hay asistencia registrada (los no-shows también descuentan accesos). `plazo`:
 * `access_expires_on`. Vigente: NULL.
 */
function invitationEndedOnSql(ctx: TenantContext, todayExpr: SQL): SQL {
  /* tenant-safe: subquery con su propio FROM attendance a acotada por a.tenant_id
     inline; el resto son columnas de invitations/subscriptions del statement externo. */
  return sql`(CASE
    WHEN ${schema.subscriptions.classesRemaining} = 0 THEN COALESCE(
      (SELECT MAX(a.session_date) FROM attendance a
        WHERE a.tenant_id = ${ctx.tenantId}
          AND a.member_id = invitations.invited_user_id
          AND a.session_date >= invitations.access_starts_on
          AND a.session_date <= invitations.access_expires_on),
      ${schema.invitations.accessExpiresOn})
    WHEN ${schema.invitations.accessExpiresOn} < CAST(${todayExpr} AS DATE) THEN ${schema.invitations.accessExpiresOn}
    ELSE NULL
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

/** Valor del `CASE` de orden: `para_contactar` y `con_accesos` primero, el resto después. */
function followStatusRankSql(followStatusExpr: SQL): SQL {
  return sql`(CASE ${followStatusExpr}
    WHEN 'para_contactar' THEN 0
    WHEN 'con_accesos' THEN 1
    ELSE 2
  END)`;
}

/** Fila cruda de la query de la bandeja. */
type LeadDbRow = Awaited<ReturnType<InvitationLeadList["fetchPage"]>>[number];

/**
 * Reserva NO cancelada del invitado desde el inicio de sus accesos (cualquier estado
 * menos `cancelado`: reservó, vino, faltó o quedó en lista de espera = ya se movió solo).
 * Referencias a `invitations` como literal calificado: dentro de `.select()` Drizzle
 * renderiza las columnas sin calificar y la correlación se rompería en silencio.
 */
function invitationBookingSinceActivationSql(ctx: TenantContext): SQL {
  /* tenant-safe: subquery con su propio FROM bookings b acotada por b.tenant_id
     inline; el resto son columnas de invitations del statement externo. */
  return sql`SELECT 1 FROM bookings b
    WHERE b.tenant_id = ${ctx.tenantId}
      AND b.member_id = invitations.invited_user_id
      AND b.booking_date >= invitations.access_starts_on
      AND b.booking_status <> 'cancelado'`;
}

export class InvitationLeadList {
  constructor(private readonly db: DbInstance) {}

  /** Bandeja paginada de leads de invitación (D-18) con su seguimiento. */
  async list(
    ctx: TenantContext,
    filters: InvitationLeadFilters = {},
  ): Promise<InvitationLeadPage> {
    const page = Math.max(1, Math.trunc(filters.page ?? 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.trunc(filters.pageSize ?? DEFAULT_PAGE_SIZE)),
    );
    // Alcance forzado por sede sin ninguna sede asignada: no ve nada (fail-closed).
    if (filters.branchIds?.length === 0) {
      return { rows: [], total: 0, page, pageSize };
    }

    const exprs = await this.buildExprs(ctx);

    let dbRows = await this.fetchPage(ctx, filters, exprs, page, pageSize);
    let total = Number(dbRows[0]?.total ?? 0);
    if (dbRows.length === 0 && page > 1) {
      // Página más allá del final: la ventana no devuelve filas y por lo tanto
      // tampoco el total. Se lo pide a la primera página (misma query).
      const first = await this.fetchPage(ctx, filters, exprs, 1, 1);
      total = Number(first[0]?.total ?? 0);
      dbRows = [];
    }
    return { rows: await this.buildRows(ctx, dbRows), total, page, pageSize };
  }

  /**
   * UNA invitación con la misma forma que la bandeja (la respuesta del PATCH del
   * seguimiento). `null` si no existe, no está activa, no es del gimnasio o queda fuera
   * del alcance (`country` / `branchIds`) de `filters`.
   */
  async getRow(
    ctx: TenantContext,
    invitationId: number,
    filters: Pick<InvitationLeadFilters, "country" | "branchIds"> = {},
  ): Promise<InvitationLeadRow | null> {
    if (filters.branchIds?.length === 0) return null;
    const exprs = await this.buildExprs(ctx);
    const dbRows = await this.fetchPage(
      ctx,
      { ...filters, invitationId },
      exprs,
      1,
      1,
    );
    const [row] = await this.buildRows(ctx, dbRows);
    return row ?? null;
  }

  /**
   * Contadores del aviso rojo: `open` = invitaciones en `para_contactar`, `uncontacted` =
   * las de `open` sin ningún mensaje registrado (`message_count = 0` o sin fila de
   * seguimiento) y `selfActivatedWithoutBooking` = autogestionadas `con_accesos`
   * activadas hace al menos `followupNoBookingHours`, sin reservas desde la activación y
   * sin ningún mensaje. UNA query, con los mismos joins y
   * el mismo alcance que la bandeja.
   */
  async countPending(
    ctx: TenantContext,
    log: FastifyBaseLogger,
    scope: Pick<InvitationLeadFilters, "country" | "branchIds"> = {},
  ): Promise<InvitationPendingCount> {
    if (scope.branchIds?.length === 0) {
      return { open: 0, uncontacted: 0, selfActivatedWithoutBooking: 0 };
    }
    const { followStatusExpr } = await this.buildExprs(ctx);
    const { followupNoBookingHours } = await getInvitationSettings(
      this.db,
      ctx,
      log,
    );
    // Mismos joins que `fetchPage` que influyen en el estado y el alcance (sede, sub de accesos
    // y seguimiento): el invitado y el motivo no cambian ninguno de los dos contadores.
    const [row] = await this.db
      .select({
        open: sql<
          number | string | null
        >`SUM(CASE WHEN ${followStatusExpr} = 'para_contactar' THEN 1 ELSE 0 END)`,
        uncontacted: sql<
          number | string | null
        >`SUM(CASE WHEN ${followStatusExpr} = 'para_contactar' AND COALESCE(${schema.renewalFollowups.messageCount}, 0) = 0 THEN 1 ELSE 0 END)`,
        selfActivatedWithoutBooking: sql<
          number | string | null
        >`SUM(CASE WHEN ${followStatusExpr} = 'con_accesos' AND invitations.channel = 'self_service' AND COALESCE(${schema.renewalFollowups.messageCount}, 0) = 0 AND invitations.activated_at <= NOW() - INTERVAL ${followupNoBookingHours} HOUR AND NOT EXISTS (${invitationBookingSinceActivationSql(ctx)}) THEN 1 ELSE 0 END)`,
      })
      .from(schema.invitations)
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
      .leftJoin(
        schema.renewalFollowups,
        and(
          tenantWhere(schema.renewalFollowups, ctx),
          eq(
            schema.renewalFollowups.subscriptionId,
            schema.invitations.subscriptionId,
          ),
        ),
      )
      .where(this.whereClause(ctx, scope, followStatusExpr));
    // SUM() sobre cero filas es NULL; sobre DECIMAL llega como string.
    return {
      open: Number(row?.open ?? 0),
      uncontacted: Number(row?.uncontacted ?? 0),
      selfActivatedWithoutBooking: Number(row?.selfActivatedWithoutBooking ?? 0),
    };
  }

  /** Expresiones SQL derivadas, con el `hoy` por zona horaria de las sedes del gimnasio. */
  private async buildExprs(ctx: TenantContext): Promise<{
    todayExpr: SQL;
    stageExpr: SQL;
    followStatusExpr: SQL;
  }> {
    const timezones = await loadTenantTimezones(this.db, ctx);
    const todayExpr = todayByBranchTimezoneSql(timezones);
    return {
      todayExpr,
      stageExpr: invitationLeadStageSql(todayExpr),
      followStatusExpr: invitationFollowStatusSql(
        todayExpr,
        invitationPurchasedSql(ctx),
      ),
    };
  }

  /** WHERE de la bandeja y de los contadores (los filtros de etapa/estado/fechas solo aplican a la bandeja). */
  private whereClause(
    ctx: TenantContext,
    filters: InvitationLeadFilters,
    followStatusExpr: SQL,
    stageExpr?: SQL,
  ): SQL | undefined {
    return and(
      tenantWhere(schema.invitations, ctx),
      eq(schema.invitations.status, "active"),
      filters.invitationId !== undefined
        ? eq(schema.invitations.id, filters.invitationId)
        : undefined,
      filters.stage && stageExpr
        ? sql`${stageExpr} = ${filters.stage}`
        : undefined,
      filters.followStatus
        ? sql`${followStatusExpr} = ${filters.followStatus}`
        : undefined,
      filters.branchId !== undefined
        ? eq(schema.invitations.branchId, filters.branchId)
        : undefined,
      filters.branchIds
        ? inArray(schema.invitations.branchId, filters.branchIds)
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
    );
  }

  /**
   * UNA sola query: la página y el total exacto del conjunto YA filtrado
   * (`COUNT(*) OVER ()` se evalúa antes del LIMIT/OFFSET, así los filtros del
   * WHERE alcanzan al total). Un solo statement: los filtros de página y de
   * conteo no pueden divergir.
   */
  private async fetchPage(
    ctx: TenantContext,
    filters: InvitationLeadFilters,
    exprs: { todayExpr: SQL; stageExpr: SQL; followStatusExpr: SQL },
    page: number,
    pageSize: number,
  ) {
    const { todayExpr, stageExpr, followStatusExpr } = exprs;
    const endedOnExpr = invitationEndedOnSql(ctx, todayExpr);
    return (
      this.db
        .select({
          id: schema.invitations.id,
          inviterId: schema.invitations.inviterId,
          invitedUserId: schema.invitations.invitedUserId,
          channel: schema.invitations.channel,
          activatedAt: schema.invitations.activatedAt,
          accessExpiresOn: schema.invitations.accessExpiresOn,
          branchId: schema.invitations.branchId,
          invitationSubscriptionId: schema.invitations.subscriptionId,
          branchName: schema.branches.name,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          phone: schema.users.phone,
          leadStatus: schema.users.leadStatus,
          classesBudget: schema.subscriptions.classesBudget,
          classesRemaining: schema.subscriptions.classesRemaining,
          stage: sql<LeadStage>`${stageExpr}`,
          followStatus: sql<InvitationFollowStatus>`${followStatusExpr}`,
          endReason: sql<InvitationEndReason | null>`${invitationEndReasonSql(todayExpr)}`,
          // DATE_FORMAT: el driver devolvería un `Date` (zona del proceso) para un DATE crudo.
          endedOn: sql<string | null>`DATE_FORMAT(${endedOnExpr}, '%Y-%m-%d')`,
          followupManualStatus: schema.renewalFollowups.manualStatus,
          followupMessageCount: schema.renewalFollowups.messageCount,
          followupLastMessageAt: schema.renewalFollowups.lastMessageAt,
          followupReasonId: schema.renewalFollowups.reasonId,
          followupReasonLabel: schema.renewalReasons.label,
          followupReasonNote: schema.renewalFollowups.reasonNote,
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
        // El seguimiento se busca por la sub de accesos de la invitación (única por tenant + sub).
        .leftJoin(
          schema.renewalFollowups,
          and(
            tenantWhere(schema.renewalFollowups, ctx),
            eq(
              schema.renewalFollowups.subscriptionId,
              schema.invitations.subscriptionId,
            ),
          ),
        )
        .leftJoin(
          schema.renewalReasons,
          and(
            tenantWhere(schema.renewalReasons, ctx),
            eq(schema.renewalReasons.id, schema.renewalFollowups.reasonId),
          ),
        )
        .where(this.whereClause(ctx, filters, followStatusExpr, stageExpr))
        .orderBy(
          followStatusRankSql(followStatusExpr),
          desc(
            sql`COALESCE(${endedOnExpr}, ${schema.invitations.accessExpiresOn})`,
          ),
          desc(schema.invitations.id),
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize)
    );
  }

  /** Arma las filas de la página; las cargas auxiliares van en lote (sin N+1). */
  private async buildRows(
    ctx: TenantContext,
    dbRows: LeadDbRow[],
  ): Promise<InvitationLeadRow[]> {
    if (dbRows.length === 0) return [];

    const [trained, inviterNames, lastNotes] = await Promise.all([
      loadTrainedBranches(
        this.db,
        ctx,
        dbRows.map((row) => row.id),
      ),
      this.loadInviterNames(
        ctx,
        dbRows.map((row) => row.inviterId),
      ),
      fetchLastNotes(
        this.db,
        ctx,
        dbRows.map((row) => row.invitedUserId),
      ),
    ]);

    return dbRows.map(
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
        followStatus: row.followStatus,
        endReason: row.endReason,
        endedOn: row.endedOn,
        followup: {
          subscriptionId: row.invitationSubscriptionId,
          manualStatus: row.followupManualStatus ?? "en_proceso",
          messageCount: row.followupMessageCount ?? 0,
          lastMessageAt: row.followupLastMessageAt?.toISOString() ?? null,
          reasonId: row.followupReasonId,
          reasonLabel: row.followupReasonLabel,
          reasonNote: row.followupReasonNote,
        },
        lastNote: lastNotes.get(row.invitedUserId) ?? null,
        leadStatus: row.leadStatus,
        channel: row.channel,
      }),
    );
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
