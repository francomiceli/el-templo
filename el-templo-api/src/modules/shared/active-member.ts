/**
 * Canonical "active member" predicate (Phase 117 D-01 / D-02, Fase 194 D-03).
 *
 * SOURCE OF TRUTH: `shared/membership.ts::membershipInEffectSql`, the same
 * predicate `subscriptions/service.ts::recomputeUserStatus` uses in the CASE
 * branch that sets `users.status = 'activo'`. Analytics computes "activo" LIVE
 * from subscriptions instead of trusting the denormalized `users.status`
 * column.
 *
 * Why: `users.status` drifts when a subscription expires without a status
 * recompute running for that user (the ~48 "fantasmas" found in prod
 * 2026-05-26 — `status='activo'` but no in-effect subscription). Reading the
 * column over-counts active members (749 vs the real 692). Every analytics
 * "active member" count MUST go through this predicate, never `users.status`.
 *
 * A member is "active" iff they have at least one subscription that:
 *   - is in status 'active' or 'paused',
 *   - has already started (start_date on or before today),
 *   - has not ended (end_date IS NULL OR end_date >= CURDATE()), and
 *   - belongs to a plan that is NOT `is_trial` (Fase 194 D-03: un plan
 *     `is_trial` da ACCESO, nunca MEMBRESÍA — un invitado o una prueba de
 *     Yoga sola no es "miembro activo" ni entra al export SEPA).
 *
 * Fase 194 D-03: el predicado de vigencia YA NO se copia acá: vive en UN solo
 * lugar, `shared/membership.ts::membershipInEffectSql`, y los 5 helpers de
 * este archivo se arman sobre él (antes eran ~10 copias del mismo EXISTS).
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
import { membershipInEffectSql } from "./membership";
import type { TenantContext } from "./tenant";

/**
 * Esqueleto ÚNICO de los 5 helpers: `EXISTS` de una membresía vigente del
 * socio (`membershipInEffectSql`, excluye is_trial) + un filtro extra propio de
 * cada helper (`extra`, vacío para `activeMemberExists`) + el `tenant_id`
 * explícito cuando hay `ctx` real (fase 175-04).
 */
function activeMembershipExists(
  userIdColumn: AnyColumn,
  extra: SQL,
  ctx?: TenantContext,
): SQL {
  /* tenant-safe: fragmento correlacionado por user_id (globalmente único,
     ver docblock de cabecera) — viaja ANDed dentro de una query externa ya
     tenantWhere-scoped (sobre users o sobre subscriptions). Con `ctx` real
     (fase 175-04) suma además su propio `tenant_id` explícito. */
  return sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND ${membershipInEffectSql("s")}
      ${extra}
      ${ctx ? sql`AND s.tenant_id = ${ctx.tenantId}` : sql``}
  )`;
}

/** Filtro extra: el plan NO es el pase `especial` (D-11 fase 161). */
/* tenant-safe: subquery por PK de plan (ids globalmente únicos), viaja dentro
   del EXISTS de `activeMembershipExists` ANDed en una query ya scopeada. */
const NOT_ESPECIAL_PLAN = sql`AND s.plan_id NOT IN (
        SELECT id FROM subscription_plans WHERE plan_category = 'especial'
      )`;

/** Etiqueta de membresía efectiva: override manual del socio o la de la sub. */
/* tenant-safe: subquery correlacionada por `uo.id = s.user_id` (PK de users),
   viaja dentro del EXISTS de `activeMembershipExists` en una query ya scopeada. */
const EFFECTIVE_KIND = sql`COALESCE(
        (SELECT uo.membership_kind_override FROM users AS uo WHERE uo.id = s.user_id),
        s.membership_kind
      )`;

export function activeMemberExists(
  userIdColumn: AnyColumn,
  ctx?: TenantContext,
): SQL {
  return activeMembershipExists(userIdColumn, sql``, ctx);
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
  return activeMembershipExists(userIdColumn, NOT_ESPECIAL_PLAN, ctx);
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
  return activeMembershipExists(
    userIdColumn,
    sql`AND ${EFFECTIVE_KIND} = 'paga' ${NOT_ESPECIAL_PLAN}`,
    ctx,
  );
}

/**
 * ¿El miembro tiene al menos una sub VIGENTE de un `membership_kind` dado?
 * (mismo criterio de vigencia que `activeMemberExists`: active/paused, ya
 * arrancada, no vencida, no is_trial). Se usa para DESGLOSAR el conteo de
 * activos en el KPI (cuántos de los "vigentes" quedan fuera de la métrica por
 * ser staff / bonificada) y para el filtro `membershipKind` del listado de
 * Miembros. NO es un predicado de métrica: no excluye 'especial'.
 */
export function activeSubOfKindExists(
  userIdColumn: AnyColumn,
  kind: "paga" | "bonificada" | "staff",
  ctx?: TenantContext,
): SQL {
  return activeMembershipExists(
    userIdColumn,
    sql`AND ${EFFECTIVE_KIND} = ${kind}`,
    ctx,
  );
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
  return activeMembershipExists(
    userIdColumn,
    sql`AND ${EFFECTIVE_KIND} = 'paga'`,
    ctx,
  );
}
