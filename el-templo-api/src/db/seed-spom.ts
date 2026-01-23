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

// ============================================================
// Reference Table Seeders (Task 2)
// ============================================================

/**
 * Seed routes table with unique route codes from SPOM and Rotator files
 * Returns a Map<code, id> for FK lookups
 */
async function seedRoutes(db: DB): Promise<Map<string, number>> {
  console.log('Seeding routes...');

  // All known route codes (combined from SPOM.csv and Rotador Semanal)
  const routeCodes = [
    'BL', 'DS', 'FL', 'FLR', 'HD/ID', 'HR', 'HS', 'HSPU', 'HT', 'L',
    'MN/RP', 'MU', 'NC', 'OAP', 'OAPU', 'OAR', 'PHS', 'PL', 'PLPU',
    'PS', 'QC', 'SS', 'SU', 'TTB'
  ];

  const routeData = routeCodes.map(code => ({ code }));
  await db.insert(schema.routes).values(routeData);

  // Build lookup map
  const inserted = await db.select().from(schema.routes);
  const routeMap = new Map<string, number>();
  for (const route of inserted) {
    routeMap.set(route.code, route.id);
  }

  const hash = computeHash(routeData);
  console.log(`  Inserted ${routeCodes.length} routes (hash: ${hash})\n`);

  return routeMap;
}

/**
 * Seed intensity_rules from Intensidad.csv
 * Maps intensity percentage to reps budget, difficulty, and exercise counts
 */
async function seedIntensityRules(db: DB): Promise<void> {
  console.log('Seeding intensity rules...');

  const filePath = path.join(DOCS_DIR, '[Planificaciones] - Base de Datos - SPOM - Intensidad.csv');
  const rows = await parseCSV<{
    '% Intensidad': string;
    'Repeticiones por Bloque': string;
    'Dificultad': string;
    'Ejercicios por Bloque': string;
  }>(filePath);

  const intensityData = rows.map(row => {
    // Parse "4 a 5" into min=4, max=5
    const exerciseRange = row['Ejercicios por Bloque'].split(' a ');
    return {
      intensity: parseInt(row['% Intensidad'], 10),
      repsBudget: parseInt(row['Repeticiones por Bloque'], 10),
      difficulty: row['Dificultad'],
      exerciseCountMin: parseInt(exerciseRange[0], 10),
      exerciseCountMax: parseInt(exerciseRange[1] || exerciseRange[0], 10),
    };
  });

  await db.insert(schema.intensityRules).values(intensityData);

  const hash = computeHash(intensityData);
  console.log(`  Inserted ${intensityData.length} intensity rules (hash: ${hash})\n`);
}

/**
 * Seed contraction_rules from Contraccion.txt (JSON format)
 * Defines CON/EXC/ISO distribution per intensity and exercise count
 */
async function seedContractionRules(db: DB): Promise<void> {
  console.log('Seeding contraction rules...');

  const filePath = path.join(DOCS_DIR, '[Planificaciones] - Base de Datos - Contracción.txt');
  const jsonContent = fs.readFileSync(filePath, 'utf-8');
  const rows = JSON.parse(jsonContent) as Array<{
    intensidad: number;
    totalEjercicios: number;
    concentrico: number;
    excentrico: number;
    isometrico: number;
  }>;

  const contractionData = rows.map(row => ({
    intensity: row.intensidad,
    totalExercises: row.totalEjercicios,
    concentrico: row.concentrico,
    excentrico: row.excentrico,
    isometrico: row.isometrico,
  }));

  await db.insert(schema.contractionRules).values(contractionData);

  const hash = computeHash(contractionData);
  console.log(`  Inserted ${contractionData.length} contraction rules (hash: ${hash})\n`);
}

// Seeder functions (to be implemented in Task 3)

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
    const routeMap = await seedRoutes(db);
    await seedIntensityRules(db);
    await seedContractionRules(db);

    // Task 3: Dependent tables (TODO)

    console.log('\nSeed complete.');

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
