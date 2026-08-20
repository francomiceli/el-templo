/**
 * D-11 (fase 161 — Actividades con Aura): filtro que EXCLUYE las suscripciones
 * de planes `planCategory='especial'` (el "pase" de actividades) de las
 * MÉTRICAS DE MEMBRESÍA — miembros activos, altas/bajas, churn/no-renovación,
 * renovación, LTV, ticket promedio, retención y frecuencia.
 *
 * La plata del pase SÍ es ingreso real: NO se toca en caja/cobros/
 * advanced-finance. Este filtro vive ÚNICAMENTE en los consumidores de
 * membresía de analytics.
 *
 * Se implementa como subquery NO correlacionada sobre `plan_id` para que aplique
 * por igual a las queries que joinean `subscription_plans` y a las que NO
 * (altas/bajas, churn, renovación, retención) sin forzar un join extra. Los
 * planes especiales son 2 filas AR, así que el `NOT IN` es trivial para el
 * planner de MySQL.
 *
 * El prefijo literal `subscriptions.plan_id` es OBLIGATORIO: todas las queries
 * de membresía tienen `subscriptions` como tabla base (alias por defecto), y
 * Drizzle des-califica columnas dentro de fragmentos `sql`` crudos (mismo gotcha
 * documentado en expiry-cohort.ts / member-flows-service.ts). Un `plan_id`
 * sin calificar resolvería mal dentro de subqueries correlacionadas.
 *
 * Para las queries user-based (miembros activos KPI) que no tienen `subscriptions`
 * como tabla base, usar `activeNonEspecialMemberExists` (shared/active-member.ts).
 *
 * Fase 174.1-03 (D-02): `excludeEspecialSubs` hace su propio `FROM
 * subscription_plans` (tabla del boundary) — recibe `ctx` PRIMERO (regla
 * 169-06) y lo filtra explícito por `tenant_id`, threadeado desde cada
 * caller (churn/renewal/retention/member-flows, todos con ctx real de
 * request admin).
 */
import { sql, type SQL } from "drizzle-orm";
import type { TenantContext } from "../shared/tenant";

export function excludeEspecialSubs(ctx: TenantContext): SQL {
  return sql`subscriptions.plan_id NOT IN (
    SELECT id FROM subscription_plans
    WHERE plan_category = 'especial' AND tenant_id = ${ctx.tenantId}
  )`;
}

/**
 * Membresías internas (2026-08-07): excluye subs `membership_kind` distinto de
 * 'paga' — 'bonificada' (regaladas 100%: canje, sorteo, cortesía) y 'staff'
 * (cuentas de entrenamiento del equipo, que son role='member' y por eso
 * invisibles a filtros por rol). Mismo contrato que `excludeEspecialSubs`:
 * SOLO métricas de membresía de analytics — listados, cobros, vencidos y
 * recategorización NO lo usan. Prefijo literal `subscriptions.` obligatorio
 * por el mismo gotcha de des-calificación de Drizzle documentado arriba.
 */
export function excludeInternalSubs(): SQL {
  return sql`subscriptions.membership_kind = 'paga'`;
}
