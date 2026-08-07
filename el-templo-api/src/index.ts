import dotenv from "dotenv";
import path from "path";

// Load env BEFORE Sentry so SENTRY_DSN is available at init
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Fallback to .env if specific file doesn't exist
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import "./instrument";
import { buildApp } from "./app";
import { startAutoApproveJob } from "./jobs/auto-approve";
import { startAutoResumePausesJob } from "./jobs/auto-resume-pauses";
import { startMarkNoShowsJob } from "./jobs/mark-no-shows";
import { startExpireLostLeadsJob } from "./jobs/expire-lost-leads";
import { startNotificationJobs } from "./jobs/notification-cron";
import { startReassignMultibranchJob } from "./jobs/reassign-multibranch";
import { startWellhubSyncJob } from "./jobs/wellhub-sync";
import { startTenureMilestonesJob } from "./jobs/tenure-milestones";

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      port: Number(process.env.PORT) || 3000,
      host: "0.0.0.0", // Listen on all interfaces for mobile emulator access
    });
    app.log.info(
      `Server listening on http://0.0.0.0:${process.env.PORT || 3000}`,
    );

    // Start cron jobs after server is ready. Mark-no-shows and notifications
    // discover branch timezones at boot, so they're async.
    //
    // Fase 169 (CON-04, D-01) — DÓNDE SE RESUELVE LA LISTA DE GIMNASIOS
    // Los 7 jobs barren UNA VEZ POR GIMNASIO ACTIVO, pero esa lista NO se
    // resuelve acá: cada job la pide en CADA CORRIDA vía forEachActiveTenant
    // (src/modules/shared/tenant.ts). Es deliberado — activar o suspender un
    // gimnasio aplica en el tick siguiente, sin reiniciar el proceso, mismo
    // espíritu que "el tenant no viaja en el JWT" (country-scope.ts:30-31).
    // Por eso el arranque de abajo NO cambió con la fase 169: las 7 firmas
    // startXJob(app.db) son las mismas y sólo dos siguen siendo async, por el
    // descubrimiento de timezones que ya hacían antes.
    startAutoApproveJob(app.db);
    startAutoResumePausesJob(app.db);
    startExpireLostLeadsJob(app.db);
    startReassignMultibranchJob(app.db);
    startWellhubSyncJob(app.db);
    startTenureMilestonesJob(app.db);
    await startMarkNoShowsJob(app.db);
    await startNotificationJobs(app.db);
  } catch (err: unknown) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
