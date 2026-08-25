/**
 * Canonical "active member" predicate (Phase 117 D-01 / D-02).
 *
 * SOURCE OF TRUTH: the EXISTS sub-query inside
 * `subscriptions/service.ts::recomputeUserStatus` (the CASE branch that sets
 * `users.status = 'activo'`). This helper copies that predicate VERBATIM so
 * analytics computes "activo" LIVE from subscriptions instead of trusting the
 * denormalized `users.status` column.
 *
 * Why: `users.status` drifts when a subscription expires without a status
 * recompute running for that user (the ~48 "fantasmas" found in prod
 * 2026-05-26 — `status='activo'` but no in-effect subscription). Reading the
 * column over-counts active members (749 vs the real 692). Every analytics
 * "active member" count MUST go through this predicate, never `users.status`.
 *
 * A member is "active" iff they have at least one subscription that:
 *   - is in status 'active' or 'paused',
 *   - has already started (start_date <= CURDATE()), and
 *   - has not ended (end_date IS NULL OR end_date >= CURDATE()).
 *
 * Returns a Drizzle `SQL` fragment — NOT a class, NOT an entity. Parameterized
 * by the user-id column to embed in any WHERE/SELECT (e.g.
 * `activeMemberExists(schema.users.id, ctx)`).
 *
 * TENANT-SAFETY DE LOS 4 FRAGMENTOS DE ESTE ARCHIVO (174.1-05b, ctx real 175-04)
 * ---------------------------------------------------------------
 * Las 4 funciones de abajo devuelven un `EXISTS(SELECT ... FROM subscriptions
 * / subscription_plans ...)` que NUNCA se ejecuta como query propia: viaja
 * AND-eado dentro de una query EXTERNA que el caller ya arma con
 * `tenantWhere(schema.users, ctx)` o `tenantWhere(schema.subscriptions, ctx)`
 * (verificado por grep sobre los 10 call sites, 174.1-05b — todos dentro de
 * un `tenantWhere` real). La correlación es por `user_id`, globalmente único
 * desde la fase 166: las filas de `subscriptions`/`subscription_plans` que
 * matchean son del MISMO tenant que el socio externo por FK, sin importar si
 * ese socio llegó como `users.id` o como `subscriptions.userId` de una fila
 * ya tenant-scoped. Por eso el runtime NUNCA filtró cross-tenant aunque el
 * texto de este archivo no llevara `tenant_id`.
 *
 * Fase 175-04: `ctx` OPCIONAL al final (mismo Pattern D que `deriveCoveredUntil`,
 * subscriptions/service.ts:202). Con `ctx` real el EXISTS suma
 * `AND s.tenant_id = ?` (cinturón-y-tirantes explícito, no solo la correlación
 * implícita) — los 10 call sites de analytics/members/reports YA tenían `ctx`
 * en su método contenedor y pasan a threadearlo real. Sin `ctx`, el fragmento
 * queda exactamente como antes (exención `tenant-safe` como comentario TS
 * pegado al `return`, canal del LINT — D-17: el lint y el sentinel son DOS
 * canales de exención distintos por diseño, no hace falta que la anotación
 * viaje embebida en el SQL para el lint).
 */
import { sql, type SQL, type AnyColumn } from "drizzle-orm";
import type { TenantContext } from "./tenant";

export function activeMemberExists(
  userIdColumn: AnyColumn,
  ctx?: TenantContext,
): SQL {
  /* tenant-safe: fragmento correlacionado por user_id (globalmente único,
     ver docblock de cabecera) — viaja ANDed dentro de una query externa ya
     tenantWhere-scoped (sobre users o sobre subscriptions). Con `ctx` real
     (fase 175-04) suma además su propio `tenant_id` explícito. */
  return ctx
    ? sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND s.tenant_id = ${ctx.tenantId}
  )`
    : sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
  )`;
}

/**
 * D-11 (fase 161 — Actividades con Aura): variante de `activeMemberExists` que
 * EXCLUYE los planes `plan_category='especial'` (el "pase"). Un externo cuya
 * ÚNICA sub vigente es el pase NO es "miembro activo" a los fines de las
 * MÉTRICAS DE MEMBRESÍA (miembros activos, altas). La plata del pase igual
 * cuenta en caja/cobros/advanced-finance — este predicado es SOLO para analytics
 * de membresía y NO reemplaza a `activeMemberExists` en members/reports/
 * advanced-finance (que siguen contando cualquier sub vigente, sin tocar).
 *
 * Un socio con presencial + pase SÍ cuenta: su sub presencial satisface el
 * EXISTS. Solo cae quien tiene ÚNICAMENTE subs especiales vigentes.
 */
export function activeNonEspecialMemberExists(
  userIdColumn: AnyColumn,
  ctx?: TenantContext,
): SQL {
  /* tenant-safe: fragmento correlacionado por user_id (globalmente único,
     ver docblock de cabecera) — viaja ANDed dentro de una query externa ya
     tenantWhere-scoped. Con `ctx` real (fase 175-04) suma su propio
     `tenant_id` explícito. */
  return ctx
    ? sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND s.plan_id NOT IN (
        SELECT id FROM subscription_plans WHERE plan_category = 'especial'
      )
      AND s.tenant_id = ${ctx.tenantId}
  )`
    : sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND s.plan_id NOT IN (
        SELECT id FROM subscription_plans WHERE plan_category = 'especial'
      )
  )`;
}

/**
 * Membresías internas (2026-08-07): variante de `activeNonEspecialMemberExists`
 * que además exige `membership_kind='paga'`. Un staff o bonificado 100% cuya
 * única sub vigente es regalada NO cuenta como "miembro activo" en las
 * MÉTRICAS DE MEMBRESÍA (KPIs de miembros activos, compromiso). No reemplaza
 * a `activeMemberExists` en members/reports (siguen mostrando a todos).
 */
export function activePayingNonEspecialMemberExists(
  userIdColumn: AnyColumn,
  ctx?: TenantContext,
): SQL {
  /* tenant-safe: fragmento correlacionado por user_id (globalmente único,
     ver docblock de cabecera) — viaja ANDed dentro de una query externa ya
     tenantWhere-scoped. Con `ctx` real (fase 175-04) suma su propio
     `tenant_id` explícito. */
  return ctx
    ? sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND COALESCE(
        (SELECT uo.membership_kind_override FROM users AS uo WHERE uo.id = s.user_id),
        s.membership_kind
      ) = 'paga'
      AND s.plan_id NOT IN (
        SELECT id FROM subscription_plans WHERE plan_category = 'especial'
      )
      AND s.tenant_id = ${ctx.tenantId}
  )`
    : sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND COALESCE(
        (SELECT uo.membership_kind_override FROM users AS uo WHERE uo.id = s.user_id),
        s.membership_kind
      ) = 'paga'
      AND s.plan_id NOT IN (
        SELECT id FROM subscription_plans WHERE plan_category = 'especial'
      )
  )`;
}

/**
 * ¿El miembro tiene al menos una sub VIGENTE de un `membership_kind` dado?
 * (mismo criterio de vigencia que `activeMemberExists`: active/paused, ya
 * arrancada, no vencida). Se usa para DESGLOSAR el conteo de activos en el KPI
 * (cuántos de los "vigentes" quedan fuera de la métrica por ser staff /
 * bonificada) y para el filtro `membershipKind` del listado de Miembros. NO
 * es un predicado de métrica: no excluye 'especial'.
 */
export function activeSubOfKindExists(
  userIdColumn: AnyColumn,
  kind: "paga" | "bonificada" | "staff",
  ctx?: TenantContext,
): SQL {
  /* tenant-safe: fragmento correlacionado por user_id (globalmente único,
     ver docblock de cabecera) — viaja ANDed dentro de una query externa ya
     tenantWhere-scoped. Con `ctx` real suma su propio `tenant_id` explícito. */
  return ctx
    ? sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND COALESCE(
        (SELECT uo.membership_kind_override FROM users AS uo WHERE uo.id = s.user_id),
        s.membership_kind
      ) = ${kind}
      AND s.tenant_id = ${ctx.tenantId}
  )`
    : sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND COALESCE(
        (SELECT uo.membership_kind_override FROM users AS uo WHERE uo.id = s.user_id),
        s.membership_kind
      ) = ${kind}
  )`;
}

/**
 * Variante para el denominador del ARPU (advanced-finance): excluye membresías
 * internas pero NO los pases 'especial' — la plata del pase sí es ingreso real
 * y su comprador cuenta como miembro activo ahí (D-11).
 */
export function activePayingMemberExists(
  userIdColumn: AnyColumn,
  ctx?: TenantContext,
): SQL {
  /* tenant-safe: fragmento correlacionado por user_id (globalmente único,
     ver docblock de cabecera) — viaja ANDed dentro de una query externa ya
     tenantWhere-scoped. Con `ctx` real (fase 175-04) suma su propio
     `tenant_id` explícito. */
  return ctx
    ? sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND COALESCE(
        (SELECT uo.membership_kind_override FROM users AS uo WHERE uo.id = s.user_id),
        s.membership_kind
      ) = 'paga'
      AND s.tenant_id = ${ctx.tenantId}
  )`
    : sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND COALESCE(
        (SELECT uo.membership_kind_override FROM users AS uo WHERE uo.id = s.user_id),
        s.membership_kind
      ) = 'paga'
  )`;
}
