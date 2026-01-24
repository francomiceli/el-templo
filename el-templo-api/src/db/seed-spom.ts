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

// ============================================================
// Dependent Table Seeders (Task 3)
// ============================================================

/**
 * Seed spom_rules from SPOM.csv
 * Contains periodization rules with week, route, intensity, wave, pattern
 */
async function seedSpomRules(db: DB, routeMap: Map<string, number>): Promise<void> {
  console.log('Seeding SPOM rules...');

  const filePath = path.join(DOCS_DIR, '[Planificaciones] - Base de Datos - SPOM.csv');
  const rows = await parseCSV<{
    'Semana': string;
    'Mes': string;
    'Ruta': string;
    'Intensidad': string;
    'Onda': string;
    'Patron Activo': string;
    'Patron Activo 2': string;
    'Categoría': string;
  }>(filePath);

  const spomData = rows.map(row => {
    const routeId = routeMap.get(row['Ruta']);
    if (!routeId) {
      throw new Error(`Unknown route code: ${row['Ruta']}`);
    }
    return {
      week: parseInt(row['Semana'], 10),
      routeId,
      intensity: parseInt(row['Intensidad'], 10),
      wave: row['Onda'],
      pattern: row['Patron Activo'],
      pattern2: row['Patron Activo 2'] || null,
      category: row['Categoría'],
    };
  });

  await batchInsert(db, schema.spomRules, spomData);

  const hash = computeHash(spomData);
  console.log(`  Total: ${spomData.length} SPOM rules (hash: ${hash})\n`);
}

/**
 * Seed weekly_rotator from Rotador Semanal.csv
 * Complex CSV with 3 level groups side-by-side
 */
async function seedWeeklyRotator(db: DB, routeMap: Map<string, number>): Promise<void> {
  console.log('Seeding weekly rotator...');

  const filePath = path.join(DOCS_DIR, '[Planificaciones] - Base de Datos - Rotador Semanal.csv');
  const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');

  // Skip first 5 lines (metadata) and header line (line 6)
  const dataLines = lines.slice(6).filter(line => line.trim());

  const dayMap: Record<string, 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado'> = {
    'Lunes': 'lunes',
    'Martes': 'martes',
    'Miércoles': 'miercoles',
    'Miercoles': 'miercoles',
    'Jueves': 'jueves',
    'Viernes': 'viernes',
    'Sábado': 'sabado',
    'Sabado': 'sabado',
  };

  const rotatorData: Array<{
    week: number;
    day: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado';
    levelGroup: 'alfa_delta' | 'sigma' | 'omega';
    nucleusRouteId: number;
    deuteros1RouteId: number;
    deuteros2RouteId: number | null;
    athlosRouteId: number;
  }> = [];

  for (const line of dataLines) {
    const cols = line.split(',');

    // Alfa y Delta: cols 1-6 (B-G): Semana, Dia, Nucleus, Deuteros1, Deuteros2, Athlos
    // Sigma: cols 8-13 (I-N): Semana, Dia, Nucleus, Deuteros1, Deuteros2, Athlos
    // Omega: cols 15-20 (P-U): Semana, Dia, Nucleus, Deuteros1, Deuteros2, Athlos

    const levelConfigs = [
      { levelGroup: 'alfa_delta' as const, weekIdx: 1, dayIdx: 2, nucleusIdx: 3, d1Idx: 4, d2Idx: 5, athlosIdx: 6 },
      { levelGroup: 'sigma' as const, weekIdx: 8, dayIdx: 9, nucleusIdx: 10, d1Idx: 11, d2Idx: 12, athlosIdx: 13 },
      { levelGroup: 'omega' as const, weekIdx: 15, dayIdx: 16, nucleusIdx: 17, d1Idx: 18, d2Idx: 19, athlosIdx: 20 },
    ];

    for (const config of levelConfigs) {
      const weekStr = cols[config.weekIdx]?.trim();
      const dayStr = cols[config.dayIdx]?.trim();
      const nucleus = cols[config.nucleusIdx]?.trim();
      const d1 = cols[config.d1Idx]?.trim();
      const d2 = cols[config.d2Idx]?.trim();
      const athlos = cols[config.athlosIdx]?.trim();

      // Skip if essential data is missing
      if (!weekStr || !dayStr || !nucleus || !d1 || !athlos) {
        continue;
      }

      const week = parseInt(weekStr, 10);
      if (isNaN(week)) continue;

      const day = dayMap[dayStr];
      if (!day) {
        console.warn(`  Unknown day: ${dayStr}`);
        continue;
      }

      const nucleusRouteId = routeMap.get(nucleus);
      const deuteros1RouteId = routeMap.get(d1);
      const deuteros2RouteId = d2 ? routeMap.get(d2) : null;
      const athlosRouteId = routeMap.get(athlos);

      if (!nucleusRouteId || !deuteros1RouteId || !athlosRouteId) {
        console.warn(`  Missing route ID for week ${week}, day ${day}, level ${config.levelGroup}`);
        continue;
      }

      rotatorData.push({
        week,
        day,
        levelGroup: config.levelGroup,
        nucleusRouteId,
        deuteros1RouteId,
        deuteros2RouteId: deuteros2RouteId || null,
        athlosRouteId,
      });
    }
  }

  // Deduplicate by (week, day, levelGroup) - keep first occurrence
  const seen = new Set<string>();
  const uniqueRotatorData = rotatorData.filter(entry => {
    const key = `${entry.week}-${entry.day}-${entry.levelGroup}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  await batchInsert(db, schema.weeklyRotator, uniqueRotatorData);

  const hash = computeHash(uniqueRotatorData);
  console.log(`  Total: ${uniqueRotatorData.length} weekly rotator entries (hash: ${hash})\n`);
}

/**
 * Seed formats table with unique format names
 * Returns Map<name, id> for FK lookups
 */
async function seedFormats(db: DB): Promise<Map<string, number>> {
  console.log('Seeding formats...');

  const filePath = path.join(DOCS_DIR, '[Planificaciones] - Base de Datos - Formatos.csv');
  const rows = await parseCSV<{
    'Formato': string;
    'Tipo': string;
  }>(filePath);

  // Extract unique format names with their type
  const formatMap = new Map<string, string | null>();
  for (const row of rows) {
    const name = row['Formato']?.trim();
    if (name && !formatMap.has(name)) {
      formatMap.set(name, row['Tipo'] || null);
    }
  }

  const formatData = Array.from(formatMap.entries()).map(([name, type]) => ({
    name,
    type: type || null,
  }));

  await db.insert(schema.formats).values(formatData);

  // Build lookup map
  const inserted = await db.select().from(schema.formats);
  const formatIdMap = new Map<string, number>();
  for (const format of inserted) {
    formatIdMap.set(format.name, format.id);
  }

  const hash = computeHash(formatData);
  console.log(`  Inserted ${formatData.length} formats (hash: ${hash})\n`);

  return formatIdMap;
}

/**
 * Seed format_compatibility from Formatos.csv
 * Maps format-block-level-intensity combinations to compatibility scores
 */
async function seedFormatCompatibility(db: DB, formatMap: Map<string, number>): Promise<void> {
  console.log('Seeding format compatibility...');

  const filePath = path.join(DOCS_DIR, '[Planificaciones] - Base de Datos - Formatos.csv');
  const rows = await parseCSV<{
    'Formato': string;
    'Bloque': string;
    'Nivel': string;
    'Compatibilidad': string;
    'Intensidad': string;
  }>(filePath);

  const blockMap: Record<string, 'initium' | 'nucleus' | 'deuteros' | 'athlos' | 'epikos'> = {
    'Initium': 'initium',
    'Nucleus': 'nucleus',
    'Deuteros': 'deuteros',
    'Athlos': 'athlos',
    'Epikos': 'epikos',
  };

  const levelMap: Record<string, 'alfa' | 'delta' | 'sigma' | 'omega'> = {
    'Alfa': 'alfa',
    'Delta': 'delta',
    'Sigma': 'sigma',
    'Omega': 'omega',
  };

  const compatData: Array<{
    formatId: number;
    block: 'initium' | 'nucleus' | 'deuteros' | 'athlos' | 'epikos';
    level: 'alfa' | 'delta' | 'sigma' | 'omega';
    intensity: number;
    compatibility: number;
  }> = [];

  for (const row of rows) {
    const formatName = row['Formato']?.trim();
    const formatId = formatMap.get(formatName);
    if (!formatId) continue;

    const block = blockMap[row['Bloque']?.trim()];
    if (!block) continue;

    const level = levelMap[row['Nivel']?.trim()];
    if (!level) continue;

    const intensity = parseInt(row['Intensidad'], 10);
    if (isNaN(intensity)) continue;

    const compatibility = parseInt(row['Compatibilidad'], 10);
    if (isNaN(compatibility)) continue;

    compatData.push({
      formatId,
      block,
      level,
      intensity,
      compatibility,
    });
  }

  await batchInsert(db, schema.formatCompatibility, compatData);

  const hash = computeHash(compatData);
  console.log(`  Total: ${compatData.length} format compatibility entries (hash: ${hash})\n`);
}

/**
 * Seed exercises from Ejercicios.csv
 * Large table with full exercise metadata
 */
async function seedExercises(db: DB): Promise<void> {
  console.log('Seeding exercises...');

  const filePath = path.join(DOCS_DIR, '[Planificaciones] - Base de Datos - Ejercicios.csv');
  const rows = await parseCSV<{
    'PATRON PRINCIPAL': string;
    'CATEGORIA PRINCIPAL': string;
    'CATEGORIA SECUNDARIA': string;
    'Ejercicio': string;
    'Ejercicio 2': string;
    'Posicion': string;
    'Esfuerzo': string;
    'Nivel': string;
    'Código Numérico': string;
    'Dificultad Relativa': string;
    'Ruta': string;
    'Movilidad Relacionada A': string;
  }>(filePath);

  const levelMap: Record<string, 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan' | null> = {
    'alfa': 'alfa',
    'delta': 'delta',
    'sigma': 'sigma',
    'omega': 'omega',
    'spartan': 'spartan',
    '': null,
  };

  const exerciseData = rows.map(row => ({
    pattern: row['PATRON PRINCIPAL'] || '',
    category: row['CATEGORIA PRINCIPAL'] || '',
    categorySecondary: row['CATEGORIA SECUNDARIA'] || null,
    exercise: row['Ejercicio'] || '',
    exercise2: row['Ejercicio 2'] || null,
    position: row['Posicion'] || null,
    // Strip trailing period from effort (CSV has "ISO.", "CON.", "EXC.")
    effort: (row['Esfuerzo'] || '').replace(/\.$/, ''),
    level: levelMap[row['Nivel']?.toLowerCase()] || null,
    codeNumber: row['Código Numérico'] ? parseInt(row['Código Numérico'], 10) : null,
    difficulty: parseInt(row['Dificultad Relativa'], 10) || 1,
    route: row['Ruta'] || '',
    mobilityRelated: row['Movilidad Relacionada A'] || null,
  }));

  await batchInsert(db, schema.exercises, exerciseData);

  const hash = computeHash(exerciseData);
  console.log(`  Total: ${exerciseData.length} exercises (hash: ${hash})\n`);
}

/**
 * Seed spom_config with initial week
 */
async function seedSpomConfig(db: DB): Promise<void> {
  console.log('Seeding SPOM config...');

  await db.insert(schema.spomConfig).values({
    id: 1,
    currentWeek: 1,
  });

  console.log('  Initialized SPOM config with week 1\n');
}

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

    // Task 3: Dependent tables
    await seedSpomRules(db, routeMap);
    await seedWeeklyRotator(db, routeMap);
    const formatMap = await seedFormats(db);
    await seedFormatCompatibility(db, formatMap);
    await seedExercises(db);
    await seedSpomConfig(db);

    // Final summary
    console.log('='.repeat(50));
    console.log('SEED SUMMARY');
    console.log('='.repeat(50));
    const counts = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.routes),
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.intensityRules),
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.contractionRules),
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.spomRules),
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.weeklyRotator),
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.formats),
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.formatCompatibility),
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.exercises),
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.spomConfig),
    ]);

    const tableNames = [
      'routes', 'intensity_rules', 'contraction_rules', 'spom_rules',
      'weekly_rotator', 'formats', 'format_compatibility', 'exercises', 'spom_config'
    ];

    let total = 0;
    tableNames.forEach((name, i) => {
      const count = counts[i][0].count;
      total += count;
      console.log(`  ${name}: ${count} rows`);
    });
    console.log('='.repeat(50));
    console.log(`  TOTAL: ${total} rows`);
    console.log('='.repeat(50));

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
