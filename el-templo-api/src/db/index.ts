import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";
import { dbConfig, poolConfig } from "./config";

/**
 * Create a database connection pool with Drizzle ORM.
 *
 * ⚠ NO LA USA NADIE, Y NO ES EL POOL DE LA APLICACIÓN (el comentario anterior,
 * "Used by the main application", era falso: tiene CERO consumidores en `src/`,
 * verificado por grep y congelado por un guard en
 * `test/tenancy/con-05-sentinel.test.ts`).
 *
 * El ÚNICO pool de la aplicación es el de `src/plugins/database.ts`, y es el
 * único sobre el que se instala el sentinel de tenancy (CON-05, fase 170).
 * Llamar a esta función crearía un SEGUNDO pool **sin vigilancia**: todo el SQL
 * que pasara por ahí quedaría fuera del sentinel, en silencio.
 *
 * Si algún día hace falta un pool propio de verdad: instalarle el sentinel con
 * `installSentinel(pool, { log })` ANTES de pasarlo a `drizzle()`, igual que
 * hace el plugin.
 */
export async function createDbConnection() {
  const pool = mysql.createPool(poolConfig);

  return {
    db: drizzle(pool, { schema, mode: "default" }),
    pool,
  };
}

/**
 * Create a single database connection (for scripts/seeds)
 * Lighter weight than a pool for one-off operations
 *
 * ALCANCE FRENTE AL SENTINEL: devuelve una `Connection`, no un `Pool`, así que
 * queda **fuera del alcance del sentinel a propósito** — el sentinel envuelve
 * `query`/`execute`/`getConnection` de un pool. La usan ~8 scripts CLI, y esos
 * caminos los cubre la regla `--tenant` de `src/db/scripts/require-tenant.ts`
 * (fase 169) con sus exenciones escritas, no el sentinel.
 */
export async function createSingleConnection() {
  const connection = await mysql.createConnection(dbConfig);

  return {
    db: drizzle(connection),
    connection,
  };
}

export * from "./schema";
