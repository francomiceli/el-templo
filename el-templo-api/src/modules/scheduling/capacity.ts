/**
 * Effective per-slot capacity resolution (Phase 155, D-06/D-07, HOR-03).
 *
 * Single source of truth for "the cap of a slot = activity cap ?? branch cap".
 * Previously this rule was duplicated across BookingService (reserve/waitlist),
 * SchedulingService.getSlotDetail and getWeeklyGrid (WR-02) — a drift risk if
 * the rule ever changes (e.g. min(activity, branch) or an aggregate ceiling,
 * both listed as future phases). Callers now share this helper:
 *
 * - `resolveEffectiveCapacity(activityCap, branchCap)` — pure resolution, used
 *   by batched paths (weekly grid) that already have both caps in hand.
 * - `getEffectiveCapacity(db, branchId, activityId)` — query + resolve, used by
 *   single-slot paths (booking checks, slot detail).
 *
 * The check stays PER SLOT: each simultaneous class has its own cap; the branch
 * cap is a per-class default, not a building ceiling.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, ne, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { ConflictError } from "../shared/errors";

/**
 * Final defensive fallback when neither the activity nor the branch yields a
 * cap. `branches.maxCapacity` is NOT NULL (default 22), so this only guards
 * against a missing branch row.
 */
export const DEFAULT_SLOT_CAPACITY = 22;

/** Pure resolution: activity cap wins, else branch cap, else the default. */
export function resolveEffectiveCapacity(
  activityCapacity: number | null | undefined,
  branchCapacity: number | null | undefined,
): number {
  return activityCapacity ?? branchCapacity ?? DEFAULT_SLOT_CAPACITY;
}

/**
 * Query the effective per-slot capacity for a (branch, activity) pair.
 * NULL on the activity inherits the branch cap.
 */
export async function getEffectiveCapacity(
  db: MySql2Database<typeof schema>,
  branchId: number,
  activityId: number,
): Promise<number> {
  const [row] = await db
    .select({
      branchCapacity: schema.branches.maxCapacity,
      activityCapacity: schema.activities.maxCapacity,
    })
    .from(schema.branches)
    .leftJoin(schema.activities, eq(schema.activities.id, activityId))
    .where(eq(schema.branches.id, branchId));

  return resolveEffectiveCapacity(row?.activityCapacity, row?.branchCapacity);
}

/**
 * Cupo ESPECIAL de Sesiones de Prueba por turno (`scheduleId` + fecha), SEPARADO
 * del cupo general de la clase. Las SP no consumen ni miran el cupo general
 * (`booking-service.countActiveBookings` filtra `is_trial=false`, D-102); este
 * es su propio tope: máx 3 SP por turno.
 */
export const MAX_TRIALS_PER_SLOT = 3;

/**
 * Cuenta las SP ACTIVAS (`is_trial=true`, status ocupante) de un turno concreto
 * (`scheduleId` + `bookingDate`), scopeado por tenant. `excludeMemberId` saca la
 * reserva del propio alumno que reserva/reactiva, para que un re-book idempotente
 * (o una reprogramación al mismo turno) no se cuente contra el tope. Espeja el
 * filtro de estados de `countActiveBookings` / `getWeeklyGrid`.
 */
export async function countActiveTrialsForSlot(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  scheduleId: number,
  bookingDate: string,
  excludeMemberId?: number,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.bookings)
    .where(
      and(
        tenantWhere(schema.bookings, ctx),
        eq(schema.bookings.scheduleId, scheduleId),
        eq(schema.bookings.bookingDate, bookingDate),
        eq(schema.bookings.isTrial, true),
        sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
        ...(excludeMemberId != null
          ? [ne(schema.bookings.memberId, excludeMemberId)]
          : []),
      ),
    );
  return Number(row?.count ?? 0);
}

/**
 * Tope duro de SP por turno: tira 409 (ConflictError) si el turno ya llegó a
 * `MAX_TRIALS_PER_SLOT` SP activas. Se llama antes de crear/reactivar CUALQUIER
 * reserva de prueba — app self-service Y panel de admin (reserve/book/reschedule).
 */
export async function assertTrialSlotCapacity(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  scheduleId: number,
  bookingDate: string,
  excludeMemberId?: number,
): Promise<void> {
  const count = await countActiveTrialsForSlot(
    db,
    ctx,
    scheduleId,
    bookingDate,
    excludeMemberId,
  );
  if (count >= MAX_TRIALS_PER_SLOT) {
    throw new ConflictError(
      "Este turno ya no tiene cupos de prueba disponibles",
    );
  }
}
