/**
 * Temas automáticos de Oficina — job cada 30 minutos (Fase 205, plan 03).
 *
 * Por gimnasio activo: despierta los temas dormidos vencidos (D-09) y abre /
 * cierra los temas del sistema para seis señales que antes se perdían:
 * webhooks de Wellhub con error, jornadas de staff sin cerrar de días
 * anteriores, clases de mañana sin profe, arqueos con diferencia, clases de
 * Wellhub sin publicar y leads del Tablero sin cargar (D-11, D-12, D-13, D-23,
 * D-24, D-25). La lógica vive en `modules/office/auto-topics.ts`; acá solo
 * está el barrido y el cron.
 *
 * Idempotente: cada tema del sistema lleva un `source_key` único por gimnasio,
 * así que correr dos veces no duplica y un tema cerrado a mano no se reabre.
 *
 * Barrido multi-tenant obligatorio vía forEachActiveTenant (Fase 169): corre una
 * vez por gimnasio activo y aísla errores por iteración.
 */
import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import { forEachActiveTenant } from "../modules/shared/tenant";
import { OfficeService } from "../modules/office/service";
import { runOfficeAutoTopicsForTenant } from "../modules/office/auto-topics";

const log = pino({ name: "office-auto-topics" });

const AR_TZ = "America/Argentina/Buenos_Aires";

/** Lógica pura y testeable. `now` inyectable para pinnear el reloj en tests. */
export async function runOfficeAutoTopics(
  db: MySql2Database<typeof schema>,
  now: Date = new Date(),
): Promise<void> {
  await forEachActiveTenant(db, log, "office-auto-topics", async (ctx) => {
    const service = new OfficeService(db, log);
    const result = await runOfficeAutoTopicsForTenant(
      db,
      service,
      ctx,
      now,
      log,
    );
    log.info({ tenantId: ctx.tenantId, ...result }, "office auto-topics");
  });
}

export function startOfficeAutoTopicsJob(
  db: MySql2Database<typeof schema>,
): void {
  cron.schedule(
    "*/30 * * * *",
    async () => {
      log.info("Running office-auto-topics job");
      try {
        await runOfficeAutoTopics(db);
      } catch (err: unknown) {
        log.error({ err }, "Office-auto-topics job failed");
      }
    },
    { timezone: AR_TZ },
  );

  log.info("Office-auto-topics cron scheduled every 30 minutes");
}
