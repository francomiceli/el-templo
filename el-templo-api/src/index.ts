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
    startAutoApproveJob(app.db);
    startAutoResumePausesJob(app.db);
    startExpireLostLeadsJob(app.db);
    startReassignMultibranchJob(app.db);
    await startMarkNoShowsJob(app.db);
    await startNotificationJobs(app.db);
  } catch (err: unknown) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
