import 'dotenv/config';
import { parse } from 'csv-parse';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

// Type for db instance
type DB = MySql2Database<typeof schema>;

// Batch insert helper
async function batchInsert<T extends Record<string, unknown>>(
  db: DB,
  table: Parameters<DB['insert']>[0],
  data: T[],
  batchSize = 1000
): Promise<void> {
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await db.insert(table).values(batch as any);
    console.log(`  Inserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} rows`);
  }
}

// Compute hash fingerprint for data validation
function computeHash(data: unknown[]): string {
  const content = JSON.stringify(data);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// Parse CSV file into array of objects
async function parseCSV<T>(filePath: string, options: { skipLines?: number } = {}): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = [];
    let lineCount = 0;
    const skipLines = options.skipLines || 0;

    const parser = fs.createReadStream(filePath)
      .pipe(parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }));

    parser.on('data', (row: T) => {
      lineCount++;
      if (lineCount > skipLines) {
        results.push(row);
      }
    });

    parser.on('end', () => resolve(results));
    parser.on('error', reject);
  });
}

// Path to docs directory
const DOCS_DIR = path.resolve(__dirname, '../../../docs');

// Seeder functions (to be implemented in Task 2 and 3)

export async function seedSPOM(): Promise<void> {
  console.log('Starting SPOM seed...\n');

  // Create database connection
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'eltemplo',
  });

  const db = drizzle(connection, { schema, mode: 'default' });

  try {
    // Clear existing SPOM data (in reverse FK order)
    console.log('Clearing existing SPOM data...');
    await db.delete(schema.spomConfig);
    await db.delete(schema.formatCompatibility);
    await db.delete(schema.exercises);
    await db.delete(schema.weeklyRotator);
    await db.delete(schema.spomRules);
    await db.delete(schema.formats);
    await db.delete(schema.contractionRules);
    await db.delete(schema.intensityRules);
    await db.delete(schema.routes);
    console.log('Cleared existing data.\n');

    // Seed in FK dependency order
    // Task 2: Reference tables
    // Task 3: Dependent tables

    console.log('\nSeed complete. No seeder functions implemented yet.');

  } finally {
    await connection.end();
  }
}

// Self-executing main block
if (require.main === module) {
  seedSPOM()
    .then(() => {
      console.log('\nSPOM seed finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
