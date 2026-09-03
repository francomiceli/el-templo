/**
 * Reglas de notificaciones propias — job diario de push (10:00 AR).
 *
 * Pedido de Franco (2026-09-03): el admin crea plantillas `kind: 'custom'`
 * con una condición recetada (catálogo cerrado, ver
 * `modules/notifications/rules.ts`), un alcance opcional y una cadencia.
 * Este job las evalúa TODOS LOS DÍAS: por cada regla activa, resuelve quién
 * cumple la condición hoy, filtra por alcance, descarta a quien ya la
 * recibió dentro del cooldown, y encola el push vía
 * `NotificationService.queueNotification` (preferencias/género/device
 * token quedan a cargo de ese método, sin duplicar lógica acá).
 *
 * Barrido multi-tenant obligatorio vía `forEachActiveTenant` (Fase 169):
 * corre una vez por gimnasio activo y aísla errores por iteración — mismo
 * patrón que `tenure-milestones.ts`.
 */
import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import { forEachActiveTenant } from "../modules/shared/tenant";
import { todayInTz } from "../modules/shared/date-utils";
import { NotificationService } from "../modules/notifications/service";
import {
  evaluateCustomRulesForTenant,
  type EvaluateCustomRulesResult,
} from "../modules/notifications/rules";

const log = pino({ name: "notification-rules" });

const AR_TZ = "America/Argentina/Buenos_Aires";

export interface NotificationRulesResult {
  tenantsProcessed: number;
  rulesEvaluated: number;
  queued: number;
  skippedCooldown: number;
}

/**
 * Lógica pura y testeable. `now` inyectable para pinnear el reloj en tests
 * (mismo criterio que `runTenureMilestones`).
 */
export async function runNotificationRules(
  db: MySql2Database<typeof schema>,
  opts: { now?: Date } = {},
): Promise<NotificationRulesResult> {
  const today = todayInTz(AR_TZ, opts.now ?? new Date());
  const result: NotificationRulesResult = {
    tenantsProcessed: 0,
    rulesEvaluated: 0,
    queued: 0,
    skippedCooldown: 0,
  };

  await forEachActiveTenant(db, log, "notification-rules", async (ctx) => {
    const service = new NotificationService(db, log);
    const r: EvaluateCustomRulesResult = await evaluateCustomRulesForTenant(
      db,
      service,
      ctx,
      today,
      log,
    );
    result.tenantsProcessed++;
    result.rulesEvaluated += r.rulesEvaluated;
    result.queued += r.queued;
    result.skippedCooldown += r.skippedCooldown;
  });

  return result;
}

export function startNotificationRulesJob(
  db: MySql2Database<typeof schema>,
): void {
  // Diario a las 10:00 AR: horario razonable para un push (después del de
  // vencimiento de plan de las 03:00 y el de aniversarios de las 09:00).
  cron.schedule(
    "0 10 * * *",
    async () => {
      log.info("Running notification-rules job");
      try {
        const res = await runNotificationRules(db);
        log.info(res, "Notification-rules job done");
      } catch (err: unknown) {
        log.error({ err }, "Notification-rules job failed");
      }
    },
    { timezone: AR_TZ },
  );

  log.info(
    "Notification-rules cron scheduled daily at 10:00 (Argentina timezone)",
  );
}
