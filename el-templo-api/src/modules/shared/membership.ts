/**
 * Fase 194 D-03 — INVARIANTE CON NOMBRE: "un plan `is_trial` da ACCESO, nunca
 * MEMBRESÍA".
 *
 * ÚNICA definición SQL de "membresía vigente". NO escribir otra copia: todo
 * predicado que responda "¿este socio es miembro hoy?" (status `activo`, gate de
 * conversión de lead, KPIs de analytics, export SEPA, estado efectivo de los
 * listados) se arma con `membershipInEffectSql` / `notTrialPlanSql`.
 *
 * Una sub vigente de un plan `is_trial` (la prueba de Yoga, la invitación de la
 * fase 194) le da al socio ACCESO a clases, pero no lo convierte en miembro: no
 * lo pone `activo`, no lo cuenta en métricas de membresía y no entra al archivo
 * del banco. Un socio con membresía real + una sub `is_trial` (caso Yoga de
 * prod) sigue siendo miembro por la membresía real.
 *
 * ACCESO vs MEMBRESÍA (no mezclar):
 *   - ACCESO:    `deriveCoveredUntil` (subscriptions/service.ts), `covered-until.ts`
 *                y el bloqueo de reservas por cobertura. CUENTAN las subs
 *                `is_trial`: un invitado tiene que poder reservar mientras duren
 *                sus accesos, y un `null` ahí significa "nunca bloquea". NO usan
 *                este archivo.
 *   - MEMBRESÍA: todo lo demás. Usa este archivo.
 *
 * TENANT-SAFETY: los fragmentos NUNCA se ejecutan como query propia. Viajan
 * AND-eados dentro de una query externa que el caller ya acota por gimnasio
 * (`tenantWhere` o el `u.tenant_id` inline de `recomputeUserStatus`). La
 * subquery de `subscription_plans` correlaciona por PK de plan (ids globalmente
 * únicos): no puede traer un plan de otro gimnasio para una sub del propio por
 * FK. Misma justificación (y mismo formato de exención) que `active-member.ts`.
 */
import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/**
 * Alias de `subscriptions` admitidos en los fragmentos de abajo. Unión CERRADA:
 * por eso `sql.raw(alias)` es seguro (nunca llega texto del cliente).
 */
export type SubAlias = "s" | "s2" | "subscriptions";

/**
 * La sub NO es de un plan `is_trial` (correlacionado por `plan_id`; misma forma
 * que el `NOT IN (SELECT id FROM subscription_plans ...)` de
 * `activeNonEspecialMemberExists`).
 */
export function notTrialPlanSql(alias: SubAlias): SQL {
  /* tenant-safe: subquery por PK de plan (ids globalmente únicos), viaja
     AND-eada dentro de una query externa ya scopeada por gimnasio (ver
     docblock de cabecera). */
  return sql`${sql.raw(alias)}.plan_id NOT IN (SELECT id FROM subscription_plans WHERE is_trial = 1)`;
}

/**
 * Membresía VIGENTE hoy: sub `active`/`paused`, ya arrancada, no vencida y de un
 * plan que NO es `is_trial`. Es el predicado que `recomputeUserStatus` usa para
 * decidir `status = 'activo'`.
 */
export function membershipInEffectSql(alias: SubAlias): SQL {
  const a = sql.raw(alias);
  return sql`${a}.subscription_status IN ('active','paused')
    AND ${a}.start_date <= CURDATE()
    AND (${a}.end_date IS NULL OR ${a}.end_date >= CURDATE())
    AND ${notTrialPlanSql(alias)}`;
}

/**
 * Variante para query builder (Drizzle) sobre `schema.subscriptions`: solo la
 * condición de plan, para componer con los `eq`/`inArray` de status y fechas de
 * quien consulta.
 */
export function membershipPlanCondition(): SQL {
  /* tenant-safe: misma subquery por PK de plan que notTrialPlanSql, dentro de
     una query sobre subscriptions que el caller ya acota con tenantWhere. */
  return sql`${schema.subscriptions.planId} NOT IN (SELECT id FROM subscription_plans WHERE is_trial = 1)`;
}

/**
 * Fase 194 (D-02/D-14): ids de los planes "Invitacion" = `is_trial=1` Y
 * `plan_category='paquete'`. Espejo SQL de `isInvitationPlan` (subscriptions/types.ts).
 * Distingue la invitacion de la prueba de Yoga (`especial`) y de la Sesion de
 * Prueba comercial (`presencial` is_trial). Se usa como `plan_id IN (${...})`.
 */
export function invitationPlanIdsSql(): SQL {
  /* tenant-safe: misma subquery por PK de plan que notTrialPlanSql, viaja
     AND-eada dentro de una query externa ya scopeada por gimnasio. */
  return sql`SELECT id FROM subscription_plans WHERE is_trial = 1 AND plan_category = 'paquete'`;
}
