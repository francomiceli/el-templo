/**
 * Shared database configuration
 * Single source of truth for all database connections
 */

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface PoolConfig extends DbConfig {
  waitForConnections: boolean;
  connectionLimit: number;
  idleTimeout: number;
  enableKeepAlive: boolean;
  keepAliveInitialDelay: number;
}

/**
 * Base database configuration from environment variables
 */
export const dbConfig: DbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'eltemplo',
};

/**
 * Pool configuration with connection management settings
 * Used by the main application for persistent connections
 */
export const poolConfig: PoolConfig = {
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
};
