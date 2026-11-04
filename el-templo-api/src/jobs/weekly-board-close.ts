/**
 * Cierre semanal del Tablero de gerencia (fase 206-07): job HORARIO, minuto 5,
 * hora de Argentina.
 *
 * Regla en una línea: cada hora, por gimnasio activo, cerrar lo vencido que
 * falte. La foto principal de la semana que terminó se saca desde el lunes
 * 00:05 AR y la tardía (embudo + renovaciones) desde el viernes 00:05 AR, con
 * 4 días de margen (D-08, D-09, D-10). El calendario vive en
 * `modules/weekly-board/week.ts` (`dueClosures`) y la lógica en
 * `WeeklyBoardService.closeDue`; acá solo está el barrido y el cron.
 *
 * Por qué horario y no dos crons (lunes y viernes): se recupera solo. Si un
 * deploy o un reinicio de PM2 cae justo a las 00:05, la corrida de la hora
 * siguiente cierra lo que falte. Las corridas vacías cuestan un SELECT de sedes
 * y uno de fotos por gimnasio; el cálculo pesado ocurre dos veces por semana.
 * PM2 corre `instances: 1`, así que no hay doble ejecución; aun así el cierre es
 * idempotente en el SQL (`WHERE <sello> IS NULL`).
 *
 * Barrido multi-tenant obligatorio vía forEachActiveTenant (Fase 169, CON-04):
 * corre una vez por gimnasio activo y aísla errores por iteración.
 */
import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import { forEachActiveTenant } from "../modules/shared/tenant";
import { WeeklyBoardService } from "../modules/weekly-board/service";

const log = pino({ name: "weekly-board-close" });

/** Lógica pura y testeable. `now` inyectable para pinnear el reloj en tests. */
export async function runWeeklyBoardClose(
  db: MySql2Database<typeof schema>,
  now: Date = new Date(),
): Promise<void> {
  const service = new WeeklyBoardService(db, log);
  await forEachActiveTenant(db, log, "weekly-board-close", async (ctx) => {
    await service.closeDue(ctx, now);
  });
}

export function startWeeklyBoardCloseJob(
  db: MySql2Database<typeof schema>,
): void {
  cron.schedule(
    "5 * * * *",
    async () => {
      try {
        await runWeeklyBoardClose(db);
      } catch (err: unknown) {
        log.error({ err }, "weekly-board-close failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );

  log.info(
    "weekly-board-close programado cada hora al minuto 5 (hora AR): cierre principal desde el lunes, tardío desde el viernes",
  );
}
