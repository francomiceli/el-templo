import type { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";

/**
 * Fase 180 (D-20/D-24): template key del recordatorio ~24h antes de la
 * sesión de prueba reservada. Ver TEMPLATE_SEEDS en notifications/types.ts.
 */
export const TRIAL_REMINDER_TEMPLATE_KEY = "trial_session_reminder";

/**
 * Borra las filas `pending` de `trial_session_reminder` del usuario. Fuente
 * única para cancelación/reprogramación de una SP (trials-service) y para la
 * SP que se resuelve al cargarle la primera membresía (subscriptions,
 * trial-bookings-on-assign). Lanza ante error: cada caller decide si un fallo
 * de limpieza corta o no su flujo.
 */
export async function deletePendingTrialReminders(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  userId: number,
): Promise<void> {
  const [template] = await db
    .select({ id: schema.notificationTemplates.id })
    .from(schema.notificationTemplates)
    .where(
      and(
        tenantWhere(schema.notificationTemplates, ctx),
        eq(
          schema.notificationTemplates.templateKey,
          TRIAL_REMINDER_TEMPLATE_KEY,
        ),
      ),
    )
    .limit(1);
  if (!template) return; // no seedeado para este tenant — nada que borrar

  await db
    .delete(schema.pendingNotifications)
    .where(
      and(
        tenantWhere(schema.pendingNotifications, ctx),
        eq(schema.pendingNotifications.userId, userId),
        eq(schema.pendingNotifications.templateId, template.id),
        eq(schema.pendingNotifications.status, "pending"),
      ),
    );
}
