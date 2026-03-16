/**
 * El Templo WhatsApp Bot — Entry Point
 *
 * Starts the webhook server, connects to Redis and MySQL,
 * and initializes schedulers.
 *
 * TODO: Implement startup sequence:
 * 1. Load environment variables
 * 2. Connect to MySQL (shared with el-templo-api)
 * 3. Connect to Redis
 * 4. Start Fastify server for WhatsApp webhook
 * 5. Start schedulers (class reminders, trial follow-ups)
 * 6. Log startup complete
 */

import "dotenv/config";

const PORT = parseInt(process.env.PORT || "3001", 10);

async function main(): Promise<void> {
  // TODO: Initialize database connection (Drizzle + mysql2)
  // TODO: Initialize Redis connection (ioredis)
  // TODO: Initialize AI provider (OpenAI or Anthropic based on AI_PROVIDER env)
  // TODO: Start Fastify webhook server
  // TODO: Register webhook routes (GET /webhook for verification, POST /webhook for messages)
  // TODO: Start schedulers

  console.log(`El Templo Bot starting on port ${PORT}...`);
  console.log("TODO: Implement bot startup");
}

main().catch((err) => {
  console.error("Fatal error starting bot:", err);
  process.exit(1);
});
