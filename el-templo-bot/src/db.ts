/**
 * Database Connection
 *
 * Drizzle ORM connection to the shared MySQL database.
 * Uses the same schema as el-templo-api.
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../el-templo-api/src/db/schema/index.js";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "eltemplo",
});

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
export { pool };
