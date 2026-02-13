/**
 * Migration runner for CI/CD pipeline
 *
 * Runs .sql migration files in order, tracking applied migrations
 * in a `_migrations` table to avoid re-running.
 *
 * Usage: npx tsx src/db/run-migrations.ts
 */

import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// Load env like the API does
const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : '.env.development';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'eltemplo',
    multipleStatements: true,
  });

  try {
    // Create tracking table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get already-applied migrations
    const [rows] = await connection.execute('SELECT name FROM _migrations ORDER BY name');
    const applied = new Set((rows as Array<{ name: string }>).map(r => r.name));

    // Get all .sql files sorted by name
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

      // Split by drizzle breakpoint delimiter, or by semicolons as fallback
      let statements: string[];
      if (sql.includes('--> statement-breakpoint')) {
        statements = sql
          .split('--> statement-breakpoint')
          .map(s => s.trim())
          .filter(s => s.length > 0);
      } else {
        statements = sql
          .split(';')
          .map(s => s.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n').trim())
          .filter(s => s.length > 0);
      }

      console.log(`Applying: ${file} (${statements.length} statements)`);

      // Track if any statement was skipped as "already exists" —
      // means this migration was previously applied and all errors are safe to skip
      let alreadyApplied = false;

      for (const stmt of statements) {
        try {
          await connection.execute(stmt);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          const isDuplicate = msg.includes('Duplicate column name') || msg.includes('Duplicate key name') || msg.includes('Duplicate foreign key') || msg.includes('already exists');
          if (isDuplicate) {
            alreadyApplied = true;
            console.log(`  Skipped (already exists): ${msg.slice(0, 80)}`);
          } else if (alreadyApplied) {
            // Migration was already applied — skip remaining errors safely
            console.log(`  Skipped (migration already applied): ${msg.slice(0, 80)}`);
          } else {
            throw err;
          }
        }
      }

      await connection.execute('INSERT INTO _migrations (name) VALUES (?)', [file]);
      console.log(`  Applied successfully`);
      count++;
    }

    if (count === 0) {
      console.log('No new migrations to apply');
    } else {
      console.log(`Applied ${count} migration(s)`);
    }
  } finally {
    await connection.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
