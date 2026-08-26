/**
 * AudienceService (Phase 180, D-11/D-12) — resolves and counts the 5
 * predefined campaign audience segments.
 *
 * Generalizes `CampaignService.listEligible()` (Phase 119, `service.ts:83-158`),
 * which now delegates here for the 'freemium_elegibles' branch — byte-for-byte
 * the same criteria as before this plan (see `freemiumElegiblesConditions`
 * below for the moved docblock).
 *
 * T-180-14 (Tampering — SQL injection via the segment name): `segment` is
 * NEVER interpolated into a `sql` template. It is only ever used as a KEY
 * into `SEGMENT_BUILDERS`, a closed `Record<CampaignSegment, ...>` — an
 * unknown value throws `BadRequestError` before any query runs.
 *
 * T-180-15/16 (Information Disclosure — cross-tenant leak / suppression
 * evaded across tenants): `tenantWhere(u, ctx)` goes INLINE in the final
 * `and(...)` of every query built here, NEVER inside the `conditions` array
 * (the tenancy lint judges by STATEMENT, not by array membership). The
 * `campaign_unsubscribes` `NOT EXISTS` carries its own `tenantId` filter
 * (mina M3): it correlates by `email`, which is NOT globally unique since
 * migration 0196 (`UNIQUE (tenant_id, email)`) — without the extra filter, an
 * opt-out in gym A would suppress gym B's audience for the same email.
 *
 * T-180-17 (DoS — bringing thousands of rows home to return a count):
 * `countAudience` runs `COUNT(*)` in SQL over the same `where` as
 * `resolveAudience`; it never derives the count from `.length`.
 */
import type { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { EligibleUser } from "./types";
import { type CampaignSegment } from "./types";

const u = schema.users;
const s = schema.subscriptions;
const b = schema.bookings;
const unsub = schema.campaignUnsubscribes;
const br = schema.branches;
const mp = schema.memberProfiles;
const rf = schema.referrals;

/**
 * D-15 invariantes globales, compuestas UNA VEZ y aplicadas a los 5
 * segmentos: el usuario tiene email cargado y NO está en la lista de
 * supresión DE ESTE TENANT.
 *
 * Mina M3 (ya resuelta en el tren, no regresionar): el `NOT EXISTS` de
 * `campaign_unsubscribes` correlaciona por `email` — no es única global desde
 * la mig 0196 (`UNIQUE (tenant_id, email)`) — así que lleva su PROPIO
 * `AND unsub.tenant_id = ctx.tenantId`.
 *
 * `subscriptions`/`bookings`/`member_profiles`/`referrals` correlacionan por
 * `${u.id}` (PK global, único de verdad) y por eso NO llevan filtro de
 * tenant propio: ya están acotados por el `tenantWhere(u, ctx)` externo sobre
 * `users`. Regla derivada para toda rama nueva de segmento: por cada subquery
 * nueva, preguntarse ¿correlaciona por una columna única GLOBAL o no? Si no
 * lo es (email, código, dni) → filtro de tenant propio.
 */
function globalInvariants(ctx: TenantContext): SQL[] {
  /* tenant-safe: sql correlacionado que referencia users.email como valor y
     campaign_unsubscribes con su PROPIO filtro de tenantId (mina M3) — ninguno
     hace FROM users; el .where(and(tenantWhere(u, ctx), ...)) real vive en
     resolveAudience/countAudience, que combinan este array (D-02) */
  return [
    sql`${u.email} IS NOT NULL`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${unsub}
      WHERE ${unsub.email} = ${u.email} AND ${unsub.tenantId} = ${ctx.tenantId}
    )`,
  ];
}

/**
 * D-10: regla de frescura — solo altas con más de 3 días. Aplica a
 * `freemium_elegibles` (igual que antes de este plan) y a
 * `referidos_pendientes` (altas recientes); los otros tres segmentos son por
 * definición usuarios viejos (bajas, pruebas vencidas, socios con historial),
 * así que NO la usan.
 */
/* tenant-safe: fragmento de condicion sobre users.created_at, NO ejecuta
   query propia — siempre se agrega al array de condiciones de
   freemiumElegiblesConditions/referidosPendientesConditions y viaja ANDed con
   el tenantWhere(u, ctx) inline de resolveAudience/countAudience. El lint
   juzga por statement y esta constante no ve ese AND en su propio texto
   (mismo patron que goal-plans/routes.ts:488) */
const FRESHNESS: SQL = sql`${u.createdAt} < (NOW() - INTERVAL 3 DAY)`;

/**
 * Segmento 'freemium_elegibles' (D-08/09/10) — MOVIDO tal cual desde
 * `CampaignService.listEligible()` (Phase 119, `service.ts:64-82`), sin
 * cambiar un solo criterio:
 *   - status='freemium'
 *   - registrado hace más de 3 días (D-10)
 *   - SIN suscripción activa/pausada/agendada
 *   - SIN booking `is_trial` no cancelado (ya usó o tiene pendiente una prueba)
 *
 * Ghosts / inactivos quedan incluidos a propósito — no hay filtro de
 * actividad (D-09).
 */
function freemiumElegiblesConditions(): SQL[] {
  /* tenant-safe: sql correlacionado que solo referencia users.id como valor
     contra subscriptions/bookings, ninguno hace FROM users — el
     .where(and(tenantWhere(u, ctx), ...)) real vive en
     resolveAudience/countAudience, que combinan este array (D-02) */
  return [
    eq(u.status, "freemium"),
    FRESHNESS,
    sql`NOT EXISTS (
      SELECT 1 FROM ${s}
      WHERE ${s.userId} = ${u.id}
        AND ${s.status} IN ('active', 'paused', 'scheduled')
    )`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${b}
      WHERE ${b.memberId} = ${u.id}
        AND ${b.isTrial} = TRUE
        AND ${b.status} <> 'cancelado'
    )`,
  ];
}

/**
 * Segmento 'bajas' (D-12) — socios dados de baja (`status='inactivo'`) que
 * pagaron alguna vez de verdad: existe al menos una suscripción con
 * `price_type_applied <> 'zero'` (D-22). Excluye a quien SOLO tuvo
 * suscripciones bonificadas/staff (`price_type_applied='zero'`) y a quien
 * nunca tuvo ninguna suscripción — no son "bajas" reales de un plan pago.
 */
function bajasConditions(): SQL[] {
  /* tenant-safe: sql correlacionado que solo referencia users.id como valor
     contra subscriptions, no hace FROM users — el
     .where(and(tenantWhere(u, ctx), ...)) real vive en
     resolveAudience/countAudience, que combinan este array (D-02) */
  return [
    eq(u.status, "inactivo"),
    sql`EXISTS (
      SELECT 1 FROM ${s}
      WHERE ${s.userId} = ${u.id}
        AND ${s.priceTypeApplied} <> 'zero'
    )`,
  ];
}

/**
 * Segmento 'prueba_no_convertida' (D-12) — usó una sesión de prueba
 * (`is_trial=TRUE` con status en un estado NO cancelado: confirmado,
 * qr_escaneado o no_show) y jamás compró ningún plan (ninguna fila en
 * `subscriptions`, sin importar su status).
 */
function pruebaNoConvertidaConditions(): SQL[] {
  /* tenant-safe: sql correlacionado que solo referencia users.id como valor
     contra bookings/subscriptions, ninguno hace FROM users — el
     .where(and(tenantWhere(u, ctx), ...)) real vive en
     resolveAudience/countAudience, que combinan este array (D-02) */
  return [
    sql`EXISTS (
      SELECT 1 FROM ${b}
      WHERE ${b.memberId} = ${u.id}
        AND ${b.isTrial} = TRUE
        AND ${b.status} IN ('confirmado', 'qr_escaneado', 'no_show')
    )`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${s}
      WHERE ${s.userId} = ${u.id}
    )`,
  ];
}

/**
 * Segmento 'alerta_ausente' (D-12) — `member_profiles.segment IN ('alerta',
 * 'ausente')`. `segment` NULL (perfil sin computar aún) queda afuera, es
 * esperado: no hay señal de riesgo todavía.
 */
function alertaAusenteConditions(): SQL[] {
  /* tenant-safe: sql correlacionado que solo referencia users.id como valor
     contra member_profiles, no hace FROM users — el
     .where(and(tenantWhere(u, ctx), ...)) real vive en
     resolveAudience/countAudience, que combinan este array (D-02) */
  return [
    sql`EXISTS (
      SELECT 1 FROM ${mp}
      WHERE ${mp.userId} = ${u.id}
        AND ${mp.segment} IN ('alerta', 'ausente')
    )`,
  ];
}

/**
 * Segmento 'referidos_pendientes' (D-12) — el usuario fue referido
 * (`referrals.referred_id = users.id`) y el vínculo sigue `status='pending'`
 * (todavía sin primer pago que lo califique). Lleva la regla de frescura
 * (D-10): son altas recientes que conviene empujar a convertir.
 */
function referidosPendientesConditions(): SQL[] {
  /* tenant-safe: sql correlacionado que solo referencia users.id como valor
     contra referrals, no hace FROM users — el
     .where(and(tenantWhere(u, ctx), ...)) real vive en
     resolveAudience/countAudience, que combinan este array (D-02) */
  return [
    FRESHNESS,
    sql`EXISTS (
      SELECT 1 FROM ${rf}
      WHERE ${rf.referredId} = ${u.id}
        AND ${rf.status} = 'pending'
    )`,
  ];
}

/**
 * Dispatcher CERRADO segmento → condiciones de negocio (T-180-14). El
 * `segment` que llega de `resolveAudience`/`countAudience` solo se usa como
 * clave de este `Record` — nunca se interpola en un `sql` template.
 */
const SEGMENT_BUILDERS: Record<CampaignSegment, () => SQL[]> = {
  freemium_elegibles: freemiumElegiblesConditions,
  bajas: bajasConditions,
  prueba_no_convertida: pruebaNoConvertidaConditions,
  alerta_ausente: alertaAusenteConditions,
  referidos_pendientes: referidosPendientesConditions,
};

export class AudienceService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Compone SOLO el array de condiciones de negocio de un segmento (sus
   * condiciones propias + las invariantes D-15 + el filtro opcional de
   * país). A propósito NO arma el `and(tenantWhere(u, ctx), ...)` final —
   * eso queda INLINE en `resolveAudience`/`countAudience` (T-180-15): el
   * lint de tenancy juzga cumplimiento por STATEMENT, así que el `tenantWhere`
   * tiene que aparecer literalmente en el mismo `.where(...)` que hace el
   * `.from(u)`, no detrás de una variable devuelta por otro método.
   */
  private buildConditions(
    ctx: TenantContext,
    segment: CampaignSegment,
    country: "AR" | "ES" | null | undefined,
  ): SQL[] {
    const builder = SEGMENT_BUILDERS[segment];
    if (!builder) {
      throw new BadRequestError(
        `Segmento de audiencia desconocido: ${String(segment)}`,
      );
    }

    const conditions = [...builder(), ...globalInvariants(ctx)];
    if (country === "AR" || country === "ES") {
      conditions.push(eq(br.country, country));
    }
    return conditions;
  }

  /**
   * Resuelve la lista de usuarios elegibles de `segment` (D-11/D-12). Con
   * `country='AR'|'ES'` solo entran usuarios cuya sede es de ese país; con
   * `null`/`undefined` entran todos los del tenant.
   */
  async resolveAudience(
    ctx: TenantContext,
    segment: CampaignSegment,
    country?: "AR" | "ES" | null,
  ): Promise<EligibleUser[]> {
    const conditions = this.buildConditions(ctx, segment, country);

    const rows = await this.db
      .select({
        userId: u.id,
        email: u.email,
        branchId: u.branchId,
        country: br.country,
      })
      .from(u)
      .innerJoin(br, eq(br.id, u.branchId))
      .where(and(tenantWhere(u, ctx), ...conditions));

    // email IS NOT NULL se fuerza en SQL (globalInvariants); acá se narrowea
    // la columna nullable del tipo generado por Drizzle.
    return rows
      .filter((r): r is typeof r & { email: string } => r.email !== null)
      .map((r) => ({
        userId: r.userId,
        email: r.email,
        branchId: r.branchId,
        country: r.country,
      }));
  }

  /**
   * Cuenta la audiencia de `segment` con `COUNT(*)` en SQL (T-180-17 /
   * Pitfall 8) — NUNCA `resolveAudience(...).length`, porque "bajas" puede
   * ser miles de filas y el preview no necesita traerlas.
   */
  async countAudience(
    ctx: TenantContext,
    segment: CampaignSegment,
    country?: "AR" | "ES" | null,
  ): Promise<number> {
    const conditions = this.buildConditions(ctx, segment, country);

    const [row] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(u)
      .innerJoin(br, eq(br.id, u.branchId))
      .where(and(tenantWhere(u, ctx), ...conditions));

    return row?.count ?? 0;
  }
}
