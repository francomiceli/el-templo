/**
 * Marketing / Meta Cron Job (fase 195, plan 08)
 *
 * Tres tareas por gimnasio activo con el módulo `templo-marketing`:
 *   - CAPI cada 10 minutos: deriva eventos (registro, prueba, primer pago),
 *     los manda a Meta y purga la IP/user agent ya usados (D-19).
 *   - Gasto una vez por día (06:15 de Argentina): trae el gasto por campaña de
 *     la Marketing API de los últimos 7 días (D-20).
 *   - Purga de IP/user agent cada hora, SIEMPRE activa: la retención de ese
 *     dato personal no depende de que Meta esté configurado (T-195-30).
 *
 * Sin credenciales (o sin `META_CAPI_START_AT`) CAPI y gasto son un no-op con
 * log y la API arranca igual. Staging nunca debe tener credenciales de Meta.
 *
 * Patrón: lógica pura exportada (`runCapiSweep`, `runSpendSync`, `runPiiPurge`)
 * para tests + scheduler (`startMarketingMetaJob`), como wellhub-sync.ts.
 */

import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import {
  getMetaCapiConfig,
  getMetaSpendConfig,
} from "../modules/marketing/meta/config";
import { MetaCapiService } from "../modules/marketing/meta/capi-service";
import { MetaSpendService } from "../modules/marketing/meta/spend-service";
import { isModuleEnabled } from "../modules/shared/module-flags";
import { forEachActiveTenant } from "../modules/shared/tenant";

const log = pino({ name: "marketing-meta" });

type Db = MySql2Database<typeof schema>;

/** Día calendario de Argentina (`YYYY-MM-DD`), el huso del cron de gasto. */
function todayInArgentina(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(now);
}

/**
 * Barrido de CAPI por gimnasio activo. Sin config no llama a nada (ni siquiera
 * consulta `tenants`). Un gimnasio sin el módulo `templo-marketing` se saltea.
 */
export async function runCapiSweep(
  db: Db,
  now: Date = new Date(),
): Promise<void> {
  const config = getMetaCapiConfig();
  if (!config) {
    log.info("Meta CAPI sin configurar — barrido omitido");
    return;
  }
  const service = new MetaCapiService(db, log);

  await forEachActiveTenant(db, log, "marketing-meta", async (ctx) => {
    if (!(await isModuleEnabled(ctx.tenantId, "templo-marketing", db))) return;
    const derived = await service.deriveCandidates(ctx, config, now);
    const sent = await service.sendPending(ctx, config, now);
    const purged = await service.purgeClientContext(ctx, now);
    log.info(
      { tenantId: ctx.tenantId, ...derived, ...sent, purged },
      "Barrido de Meta CAPI completado para un gimnasio",
    );
  });
}

/** Sync del gasto por gimnasio activo. Sin config es un no-op. */
export async function runSpendSync(
  db: Db,
  today: Date = new Date(),
): Promise<void> {
  const config = getMetaSpendConfig();
  if (!config) {
    log.info("Gasto de Meta sin configurar — sync omitido");
    return;
  }
  const service = new MetaSpendService(db, log);
  const day = todayInArgentina(today);

  await forEachActiveTenant(db, log, "marketing-meta", async (ctx) => {
    if (!(await isModuleEnabled(ctx.tenantId, "templo-marketing", db))) return;
    const summary = await service.syncSpend(ctx, config, day);
    log.info(
      { tenantId: ctx.tenantId, ...summary },
      "Sync de gasto de Meta completado para un gimnasio",
    );
  });
}

/**
 * Purga de IP y user agent por gimnasio activo. NO depende de la config de
 * Meta: son datos personales que se guardan desde el registro y no pueden
 * quedar para siempre solo porque CAPI no se activó.
 */
export async function runPiiPurge(
  db: Db,
  now: Date = new Date(),
): Promise<void> {
  const service = new MetaCapiService(db, log);
  await forEachActiveTenant(db, log, "marketing-meta", async (ctx) => {
    if (!(await isModuleEnabled(ctx.tenantId, "templo-marketing", db))) return;
    const purged = await service.purgeClientContext(ctx, now);
    if (purged > 0) {
      log.info({ tenantId: ctx.tenantId, purged }, "IP y user agent purgados");
    }
  });
}

export function startMarketingMetaJob(db: Db): void {
  const capi = getMetaCapiConfig();
  const spend = getMetaSpendConfig();
  if (!capi && !spend) {
    log.info(
      "Meta sin configurar — CAPI y gasto apagados (la purga de IP y user agent sigue activa)",
    );
  }

  if (capi) {
    cron.schedule("*/10 * * * *", async () => {
      try {
        await runCapiSweep(db);
      } catch (err: unknown) {
        log.error({ err }, "Barrido de Meta CAPI falló");
      }
    });
  }

  if (spend) {
    cron.schedule(
      "15 6 * * *",
      async () => {
        try {
          await runSpendSync(db);
        } catch (err: unknown) {
          log.error({ err }, "Sync de gasto de Meta falló");
        }
      },
      { timezone: "America/Argentina/Buenos_Aires" },
    );
  }

  // Siempre: la retención de la IP no depende de Meta.
  cron.schedule("5 * * * *", async () => {
    try {
      await runPiiPurge(db);
    } catch (err: unknown) {
      log.error({ err }, "Purga de IP y user agent falló");
    }
  });

  log.info(
    { capi: capi !== null, gasto: spend !== null },
    "Marketing Meta job scheduled",
  );
}
