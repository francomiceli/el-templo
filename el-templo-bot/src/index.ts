/**
 * El Templo WhatsApp Bot — Entry Point
 *
 * Starts the Fastify webhook server, connects to MySQL,
 * and sets up graceful shutdown.
 */

import "dotenv/config";
import Fastify from "fastify";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../el-templo-api/src/db/schema/index.js";
import { db, pool } from "./db.js";
import { disconnectRedis } from "./redis.js";
import { webhookRoutes } from "./webhook/routes.js";
import { startClassReminderScheduler } from "./schedulers/class-reminder.js";
import { startTrialFollowupScheduler } from "./schedulers/trial-followup.js";

// Augment Fastify instance with the Drizzle DB type
declare module "fastify" {
  interface FastifyInstance {
    db: MySql2Database<typeof schema>;
  }
}

const PORT = parseInt(process.env.PORT || "3001", 10);

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  // Decorate Fastify instance with the Drizzle DB for route access
  app.decorate("db", db);

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok" };
  });

  // Webhook routes (GET /webhook verification + POST /webhook messages)
  await app.register(webhookRoutes);

  // Start listening
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`El Templo Bot listening on port ${PORT}`);

  // Start proactive schedulers
  startClassReminderScheduler(db);
  startTrialFollowupScheduler(db);
  app.log.info("Proactive schedulers started");

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Received shutdown signal, closing...");
    try {
      await app.close();
      await pool.end();
      await disconnectRedis();
      app.log.info("Graceful shutdown complete");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ error: message }, "Error during shutdown");
      process.exit(1);
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

const fatalLog = pino({ name: "el-templo-bot" });

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  fatalLog.fatal({ error: message }, "Fatal error starting bot");
  process.exit(1);
});
