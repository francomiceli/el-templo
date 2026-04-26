import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../db/schema";

declare module "fastify" {
  interface FastifyInstance {
    db: MySql2Database<typeof schema>;
    dbPool: mysql.Pool;
  }
}

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  // Read config inside async function (after dotenv has loaded)
  // NOT at module import time - tsx watch doesn't handle dotenv auto-injection correctly
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "eltemplo",
    waitForConnections: true,
    connectionLimit: 10,
    idleTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // Enable multi-statement queries only in tests so cleanAllTestData can
    // batch its ~50 DELETEs into a single round-trip via pool.query() (NOT
    // db.execute(), which uses prepared statements that don't support
    // multi-statement). Disabled in dev/prod for defense-in-depth.
    multipleStatements: process.env.NODE_ENV === "test",
  });

  const db = drizzle(pool, { schema, mode: "default" });

  fastify.decorate("db", db);
  fastify.decorate("dbPool", pool);

  fastify.addHook("onClose", async () => {
    await pool.end();
  });

  fastify.log.info("Database connected");
};

export default fp(databasePlugin, { name: "database" });
