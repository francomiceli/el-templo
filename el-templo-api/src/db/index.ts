import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";
import { dbConfig, poolConfig } from "./config";

/**
 * Create a database connection pool with Drizzle ORM.
 *
 * ⚠ NO ES EL POOL DE LA APLICACIÓN. El comentario anterior decía "Used by the
 * main application" y era FALSO: el servidor no la llama nunca. Sus únicos
 * consumidores son los 6 scripts de desarrollo de
 * `src/modules/sessions/validation/` (generadores y validadores del algoritmo de
 * sesiones, con `console.log` y `process.exit`, que nadie importa desde el
 * runtime). Ese inventario está congelado por un guard en
 * `test/tenancy/con-05-sentinel.test.ts`: un consumidor nuevo fuera de esa
 * carpeta pone la suite en rojo.
 *
 * El ÚNICO pool de la aplicación es el de `src/plugins/database.ts`, y es el
 * único sobre el que se instala el sentinel de tenancy (CON-05, fase 170). Cada
 * llamada a esta función crea un SEGUNDO pool **sin vigilancia**: todo el SQL
 * que pasa por ahí queda fuera del sentinel, en silencio. Para los scripts de
 * validación eso es tolerable (son herramientas de desarrollo que no corren en
 * el server), pero en código de la aplicación no lo es.
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
 * `query`/`execute`/`getConnection` de un pool. La usan más de una docena de
 * scripts CLI (imports, seeds y backfills), y esos caminos los cubre la regla
 * `--tenant` de `src/db/scripts/require-tenant.ts` (fase 169) con sus
 * exenciones escritas, no el sentinel.
 */
export async function createSingleConnection() {
  const connection = await mysql.createConnection(dbConfig);

  return {
    db: drizzle(connection),
    connection,
  };
}

export * from "./schema";
