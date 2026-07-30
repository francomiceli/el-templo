import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../db/schema";
import { installSentinel, type SentinelHandle } from "../db/sentinel/install";

declare module "fastify" {
  interface FastifyInstance {
    db: MySql2Database<typeof schema>;
    dbPool: mysql.Pool;
    /**
     * Handle del sentinel de tenancy (CON-05, fase 170). Lo consumen los tests
     * del guard de cableado (`test/tenancy/con-05-sentinel.test.ts`) y el
     * volcado del inventario de D-04.
     */
    dbSentinel: SentinelHandle;
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
  });

  // ── Sentinel de tenancy (CON-05, fase 170) ─────────────────────────────────
  //
  // VA ACÁ Y NO EN OTRO LADO: entre la creación del pool y la llamada a
  // Drizzle de abajo, o sea POR DEBAJO del ORM. El sentinel tiene que ver el
  // SQL FINAL —el del query builder, el de un `sql` crudo y el de cualquier
  // join— y eso solo pasa a la altura del driver. Envolver el objeto `db` que
  // devuelve el ORM dejaría afuera exactamente el SQL crudo, que es lo que la
  // capa 3 del doc 03 vino a vigilar. Hay un guard que lee este archivo y
  // compara las dos posiciones (`test/tenancy/con-05-sentinel.test.ts`); por
  // eso el texto de este comentario evita nombrar la llamada al ORM tal cual.
  //
  // Muta la instancia del pool a propósito (monkeypatch de propiedades propias,
  // NO un `Proxy`): `dbPool` de acá abajo, el `pool.end()` del `onClose` y 18
  // sitios de test operan sobre ESTA misma instancia, y un `Proxy` devolvería
  // otro objeto. El detalle está en el docblock de `db/sentinel/install.ts`.
  //
  // `fastify.log` satisface estructuralmente el `TenantLogger` que el sentinel
  // pide — sin adaptadores.
  const sentinel = installSentinel(pool, { log: fastify.log });

  const db = drizzle(pool, { schema, mode: "default" });

  fastify.decorate("db", db);
  fastify.decorate("dbPool", pool);
  fastify.decorate("dbSentinel", sentinel);

  fastify.addHook("onClose", async () => {
    // ANTES de `pool.end()`: el resumen periódico del sentinel es el primer
    // `setInterval` del repo y, si sobrevive al cierre de la app, se acumula
    // app tras app en una suite que crea y destruye instancias.
    sentinel.stop();
    await pool.end();
  });

  fastify.log.info("Database connected");
};

export default fp(databasePlugin, { name: "database" });
