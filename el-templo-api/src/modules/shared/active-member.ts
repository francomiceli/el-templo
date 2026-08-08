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
 * `activeMemberExists(schema.users.id)`).
 */
import { sql, type SQL, type AnyColumn } from "drizzle-orm";

export function activeMemberExists(userIdColumn: AnyColumn): SQL {
  return sql`EXISTS (
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
export function activeNonEspecialMemberExists(userIdColumn: AnyColumn): SQL {
  return sql`EXISTS (
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
): SQL {
  return sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND s.membership_kind = 'paga'
      AND s.plan_id NOT IN (
        SELECT id FROM subscription_plans WHERE plan_category = 'especial'
      )
  )`;
}

/**
 * Variante para el denominador del ARPU (advanced-finance): excluye membresías
 * internas pero NO los pases 'especial' — la plata del pase sí es ingreso real
 * y su comprador cuenta como miembro activo ahí (D-11).
 */
export function activePayingMemberExists(userIdColumn: AnyColumn): SQL {
  return sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      AND s.membership_kind = 'paga'
  )`;
}
