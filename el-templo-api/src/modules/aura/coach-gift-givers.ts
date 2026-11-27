// Module: aura — quién puede dar el regalo de profe (2026-11-27)
//
// Antes regalaban solo `coach` y `coach_actividad`. Pedido de Franco: también
// el staff que da clases con otro rol (en Barcelona, un admin y un recepcionista).
//
// - Por su rol: profes (`coach`, `coach_actividad`), `admin_sede` y `admin`.
// - Con el permiso por persona `users.can_give_aura`: `recepcion` y `gestion`.
//   Recepción en general NO da clases, por eso no alcanza con el rol.
// - El dueño (`owner`) NUNCA: ahí viven las cuentas genéricas ("Super Admin",
//   "Test Admin") y el alumno vería "Super Admin te regaló Aura".
// - La cuenta de los televisores (`tv`) tampoco.
//
// La sede se controla aparte con `canAccessBranch` (sedes de `user_branches`
// para profes, recepción y admin de sede, las del país para admin y gestión).
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { ADMIN_SEDE_ROLE, COACH_ACTIVIDAD_ROLE } from "../shared/permissions";
import { tenantWhere, type TenantContext } from "../shared/tenant";

/** Roles que dan el regalo de profe por su rol. */
export const COACH_GIFT_ROLES: readonly string[] = [
  "coach",
  COACH_ACTIVIDAD_ROLE,
  ADMIN_SEDE_ROLE,
  "admin",
];

/** Roles que dan el regalo de profe solo con `users.can_give_aura` activo. */
export const COACH_GIFT_PERMISSION_ROLES: readonly string[] = [
  "recepcion",
  "gestion",
];

/** ¿Este rol, con este permiso por persona, da el regalo de profe? */
export function canGiveCoachGift(role: string, canGiveAura: boolean): boolean {
  if (COACH_GIFT_ROLES.includes(role)) return true;
  return canGiveAura && COACH_GIFT_PERMISSION_ROLES.includes(role);
}

/**
 * Lo mismo leyendo el permiso de la base. Solo consulta `users` cuando el rol
 * depende del permiso.
 */
export async function userCanGiveCoachGift(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  userId: number,
  role: string,
): Promise<boolean> {
  if (COACH_GIFT_ROLES.includes(role)) return true;
  if (!COACH_GIFT_PERMISSION_ROLES.includes(role)) return false;
  const [row] = await db
    .select({ canGiveAura: schema.users.canGiveAura })
    .from(schema.users)
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
    .limit(1);
  return canGiveCoachGift(role, row?.canGiveAura ?? false);
}
