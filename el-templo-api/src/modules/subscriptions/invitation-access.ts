// Módulo: subscriptions — accesos de invitación al comprar un plan real (Fase 194 D-07, ME-06)
//
// Cuando un invitado con accesos vigentes compra un plan real, el remanente de los
// accesos se resuelve según CUÁNDO arranca lo comprado:
//
//   - arranca hoy o antes -> se CIERRAN ya como `completed` (`closeInvitationAccess`,
//     en `SubscriptionService`): la membresía real ocupa su lugar.
//   - arranca en el FUTURO ("arranca cuando venga", pre-venta) -> NO se cierran: el
//     invitado sigue entrenando con lo que le quede hasta el día anterior al inicio del
//     plan comprado. Cerrarlos ya lo dejaba días sin accesos ni plan aunque hubiera
//     pagado (ME-06). Esta función recorta `end_date` a ese día.
//
// `LEAST` garantiza que nunca se ALARGA un acceso: si ya terminaba antes del día previo
// al inicio, no se toca. Solo cambia `end_date` (la sub se vence sola por el camino de
// siempre); `classes_remaining` y la fila de `invitations` quedan como estaban (la
// ventana de compra tardía D-13 sale de `invitations.access_expires_on`).
import { and, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { addDays } from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";

/**
 * Recorta el vencimiento de las subs de invitación `active`/`paused` al día anterior
 * a `newPlanStartDate`, dentro de la tx del llamador. Devuelve cuántas filas cambiaron.
 */
export async function trimInvitationAccessEnd(
  ctx: TenantContext,
  userId: number,
  subscriptionIds: number[],
  newPlanStartDate: string,
  tx: MySql2Database<typeof schema>,
): Promise<number> {
  if (subscriptionIds.length === 0) return 0;
  const lastAccessDay = addDays(newPlanStartDate, -1);
  const [result] = await tx
    .update(schema.subscriptions)
    .set({
      endDate: sql`LEAST(${schema.subscriptions.endDate}, CAST(${lastAccessDay} AS DATE))`,
    })
    .where(
      and(
        tenantWhere(schema.subscriptions, ctx),
        eq(schema.subscriptions.userId, userId),
        inArray(schema.subscriptions.id, subscriptionIds),
        inArray(schema.subscriptions.status, ["active", "paused"]),
      ),
    );
  return result.changedRows;
}
