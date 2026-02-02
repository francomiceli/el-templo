import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';
import { dbConfig, poolConfig } from './config';

/**
 * Create a database connection pool with Drizzle ORM
 * Used by the main application
 */
export async function createDbConnection() {
  const pool = mysql.createPool(poolConfig);

  return {
    db: drizzle(pool, { schema, mode: 'default' }),
    pool,
  };
}

/**
 * Create a single database connection (for scripts/seeds)
 * Lighter weight than a pool for one-off operations
 */
export async function createSingleConnection() {
  const connection = await mysql.createConnection(dbConfig);

  return {
    db: drizzle(connection),
    connection,
  };
}

export * from './schema';
