/**
 * Marketing / Google Cron Job (fase 195, plan 09)
 *
 * Dos tareas por gimnasio activo con el módulo `templo-marketing`:
 *   - Search Console, semanal (lunes 07:00 de Argentina): trae consultas, clics,
 *     impresiones, CTR y posición por página a `search_console_stats` (D-21.2).
 *   - Google Business Profile, diario (05:30 de Argentina): sincroniza horarios,
 *     teléfono, dirección y web de cada ficha desde `branches`, detrás de
 *     `GBP_SYNC_MODE` (off por defecto, dry-run valida sin aplicar) (D-21.3).
 *
 * Sin credenciales las dos tareas son un no-op con log y la API arranca igual.
 * Staging NUNCA debe tener credenciales de Google: GBP escribe en fichas
 * públicas reales.
 *
 * Patrón: lógica exportada (`runSearchConsoleSync`, `runGbpSync`) para tests +
 * scheduler (`startMarketingGoogleJob`), como marketing-meta.ts.
 */

import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import {
  resolveGbpConfig,
  resolveSearchConsoleConfig,
} from "../modules/marketing/google/config";
import { GbpSyncService } from "../modules/marketing/google/gbp";
import { SearchConsoleService } from "../modules/marketing/google/search-console";
import { isModuleEnabled } from "../modules/shared/module-flags";
import { forEachActiveTenant } from "../modules/shared/tenant";

const log = pino({ name: "marketing-google" });

type Db = MySql2Database<typeof schema>;

const TIMEZONE = "America/Argentina/Buenos_Aires";

/** Search Console por gimnasio activo. Sin config no llama a nada. */
export async function runSearchConsoleSync(
  db: Db,
  today: Date = new Date(),
): Promise<void> {
  const { config, reason } = resolveSearchConsoleConfig();
  if (!config) {
    log.info({ reason }, "Search Console sin configurar — sync omitido");
    return;
  }
  const service = new SearchConsoleService(db, log);

  await forEachActiveTenant(db, log, "marketing-google", async (ctx) => {
    if (!(await isModuleEnabled(ctx.tenantId, "templo-marketing", db))) return;
    const summary = await service.syncPeriod(ctx, config, today);
    log.info(
      { tenantId: ctx.tenantId, ...summary },
      "Sync de Search Console completado para un gimnasio",
    );
  });
}

/** Sync de fichas de GBP por gimnasio activo. Sin config (o en off) no llama a nada. */
export async function runGbpSync(db: Db): Promise<void> {
  const { config, reason } = resolveGbpConfig();
  if (!config) {
    log.info({ reason }, "GBP sin configurar — sync omitido");
    return;
  }
  const service = new GbpSyncService(db, log);

  await forEachActiveTenant(db, log, "marketing-google", async (ctx) => {
    if (!(await isModuleEnabled(ctx.tenantId, "templo-marketing", db))) return;
    const summary = await service.sync(ctx, config);
    log.info(
      { tenantId: ctx.tenantId, ...summary },
      "Sync de GBP completado para un gimnasio",
    );
  });
}

export function startMarketingGoogleJob(db: Db): void {
  const searchConsole = resolveSearchConsoleConfig();
  const gbp = resolveGbpConfig();

  if (!searchConsole.config && !gbp.config) {
    log.info(
      { searchConsole: searchConsole.reason, gbp: gbp.reason },
      "Google sin configurar — Search Console y GBP apagados",
    );
    return;
  }

  if (searchConsole.config) {
    cron.schedule(
      "0 7 * * 1",
      async () => {
        try {
          await runSearchConsoleSync(db);
        } catch (err: unknown) {
          log.error({ err }, "Sync de Search Console falló");
        }
      },
      { timezone: TIMEZONE },
    );
  }

  if (gbp.config) {
    cron.schedule(
      "30 5 * * *",
      async () => {
        try {
          await runGbpSync(db);
        } catch (err: unknown) {
          log.error({ err }, "Sync de GBP falló");
        }
      },
      { timezone: TIMEZONE },
    );
  }

  log.info(
    {
      searchConsole: searchConsole.config !== null,
      gbp: gbp.config?.mode ?? "off",
    },
    "Marketing Google job scheduled",
  );
}
