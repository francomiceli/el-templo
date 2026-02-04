/**
 * Coach Example Parser
 *
 * Parses coach-built CSV examples from docs/session-logic/examples/
 * into structured CoachExampleBlock objects for validation.
 *
 * CSV Format (row 29+ is the data section):
 * Nivel Real,Bloque,Nivel,Ruta,Patron,Categoria,Categoria Secundaria,Dificultad,Esfuerzo,Ejercicio,...,Formato,...
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import type { CoachExampleBlock } from './types';

const EXAMPLES_DIR = path.resolve(__dirname, '../../../../../docs/session-logic/examples');

/** CSV row structure from coach examples */
interface CsvRow {
  'Nivel Real': string;
  Bloque: string;
  Nivel: string;
  Ruta: string;
  'Patrón': string;
  'Categoría': string;
  'Categoría Secundaria': string;
  Dificultad: string;
  Esfuerzo: string;
  Ejercicio: string;
  'Esfuerzo Manual': string;
  Carga: string;
  'Rep. Min': string;
  'Rep. Max': string;
  Escalera: string;
  'Duración': string;
  Descanso: string;
  Formato: string;
  'Formato Vueltas': string;
  'Formato Duración': string;
  Observaciones: string;
  'Promedio Dificultad': string;
}

/**
 * Parse all coach examples for a range of weeks
 */
export async function parseCoachExamples(
  weekStart: number = 3,
  weekEnd: number = 21
): Promise<CoachExampleBlock[]> {
  const blocks: CoachExampleBlock[] = [];

  // List all files in examples directory
  const allFiles = fs.readdirSync(EXAMPLES_DIR);

  for (let week = weekStart; week <= weekEnd; week++) {
    // Find day files for this week (exclude Semana.csv and Planificacion Final.csv)
    const weekFiles = allFiles.filter(f =>
      f.includes(`Semana ${week} `) &&
      !f.includes('Planificación Final') &&
      !f.includes('Semana.csv') &&
      f.endsWith('.csv')
    );

    for (const file of weekFiles) {
      const day = extractDayFromFilename(file);
      if (day === 'Unknown') continue;

      const filePath = path.join(EXAMPLES_DIR, file);
      try {
        const dayBlocks = parseCoachDayFile(filePath, week, day);
        blocks.push(...dayBlocks);
      } catch (error) {
        console.error(`Error parsing ${file}:`, error);
      }
    }
  }

  return blocks;
}

/**
 * Extract day name from filename
 * e.g., "[Planificaciones] - Semana 10 - 20251020 - Lunes.csv" -> "Lunes"
 */
function extractDayFromFilename(filename: string): string {
  const match = filename.match(/- (Lunes|Martes|Miercoles|Jueves|Viernes|Sabado)\.csv$/i);
  return match ? match[1] : 'Unknown';
}

/**
 * Parse a single day's CSV file
 */
export function parseCoachDayFile(
  filePath: string,
  week: number,
  day: string
): CoachExampleBlock[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Parse route assignments from summary section (row ~10)
  // Format: ,Semana,Dia,Nucleus,Deuteros 1,Deuteros 2,Athlos/Epikos,,... (repeated for each level group)
  const routeMap = parseRoutesFromSummary(lines);

  // Find the header row (starts with "Nivel Real,Bloque,...")
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Nivel Real,Bloque,')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    console.warn(`No exercise data header found in ${filePath}`);
    return [];
  }

  // Fix duplicate column names in header
  // The CSV has a reference table on the right with duplicate "Bloque", "Nivel" columns
  // Rename them to avoid csv-parse overwriting the main data columns
  const headerLine = lines[headerIndex];
  const fixedHeaderLine = fixDuplicateHeaders(headerLine);
  lines[headerIndex] = fixedHeaderLine;

  // Extract data section (from header row to end)
  const dataSection = lines.slice(headerIndex).join('\n');

  // Parse CSV
  const records = parse(dataSection, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as CsvRow[];

  return groupRowsIntoBlocks(records, week, day, routeMap);
}

/**
 * Route assignment map: levelGroup -> role -> route
 */
type RouteMap = Map<string, Map<string, string>>;

/**
 * Parse route assignments from the summary section
 *
 * CSV structure (around row 9-10):
 * ,Alfa y Delta,,,,,,,Sigma,,,,,,,Omega,...
 * ,Semana,Dia,Nucleus,Deuteros 1,Deuteros 2,Athlos/Epikos,,Semana,Dia,Nucleus,Deuteros 1,Deuteros 2,Athlos/Epikos,,...
 * ,10,Lunes,PHS,HT,SU,FLR,,10,Lunes,NC,PHS,OAPU,SU,,10,Lunes,NC,SS,HT,HT,...
 */
function parseRoutesFromSummary(lines: string[]): RouteMap {
  const routeMap: RouteMap = new Map();

  // Find the row with "Semana,Dia,Nucleus" pattern
  let summaryHeaderIndex = -1;
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    if (lines[i].includes('Semana') && lines[i].includes('Nucleus') && lines[i].includes('Deuteros')) {
      summaryHeaderIndex = i;
      break;
    }
  }

  if (summaryHeaderIndex === -1 || summaryHeaderIndex + 1 >= lines.length) {
    return routeMap;
  }

  // Data row is right after header
  const dataRow = lines[summaryHeaderIndex + 1];
  const values = dataRow.split(',');

  // Parse Alfa y Delta (columns 3-6)
  // Column layout: ,Semana,Dia,Nucleus,Deuteros 1,Deuteros 2,Athlos/Epikos,,
  //                0  1     2   3       4          5          6            7
  if (values.length > 6) {
    const alfaDeltaRoutes = new Map<string, string>();
    if (values[3]?.trim()) alfaDeltaRoutes.set('NUCLEUS', values[3].trim());
    if (values[4]?.trim()) alfaDeltaRoutes.set('DEUTEROS_1', values[4].trim());
    if (values[5]?.trim()) alfaDeltaRoutes.set('DEUTEROS_2', values[5].trim());
    if (values[6]?.trim()) alfaDeltaRoutes.set('ATHLOS', values[6].trim());
    if (values[6]?.trim()) alfaDeltaRoutes.set('EPIKOS', values[6].trim()); // Same as Athlos
    routeMap.set('alfa_delta', alfaDeltaRoutes);
  }

  // Parse Sigma (columns 10-13, after the first ,, gap)
  // Layout: ...,Semana,Dia,Nucleus,Deuteros 1,Deuteros 2,Athlos/Epikos,,
  //              8     9   10      11         12         13           14
  if (values.length > 13) {
    const sigmaRoutes = new Map<string, string>();
    if (values[10]?.trim()) sigmaRoutes.set('NUCLEUS', values[10].trim());
    if (values[11]?.trim()) sigmaRoutes.set('DEUTEROS_1', values[11].trim());
    if (values[12]?.trim()) sigmaRoutes.set('DEUTEROS_2', values[12].trim());
    if (values[13]?.trim()) sigmaRoutes.set('ATHLOS', values[13].trim());
    if (values[13]?.trim()) sigmaRoutes.set('EPIKOS', values[13].trim());
    routeMap.set('sigma', sigmaRoutes);
  }

  // Parse Omega (columns 17-20)
  // Layout: ...,Semana,Dia,Nucleus,Deuteros 1,Deuteros 2,Athlos/Epikos,,
  //              15    16  17      18         19         20
  if (values.length > 20) {
    const omegaRoutes = new Map<string, string>();
    if (values[17]?.trim()) omegaRoutes.set('NUCLEUS', values[17].trim());
    if (values[18]?.trim()) omegaRoutes.set('DEUTEROS_1', values[18].trim());
    if (values[19]?.trim()) omegaRoutes.set('DEUTEROS_2', values[19].trim());
    if (values[20]?.trim()) omegaRoutes.set('ATHLOS', values[20].trim());
    if (values[20]?.trim()) omegaRoutes.set('EPIKOS', values[20].trim());
    routeMap.set('omega', omegaRoutes);
  }

  return routeMap;
}

/**
 * Fix duplicate column names by renaming columns after "Promedio Dificultad"
 * These are reference table columns that we don't need
 */
function fixDuplicateHeaders(headerLine: string): string {
  const headers = headerLine.split(',');
  const mainColumnsEnd = headers.indexOf('Promedio Dificultad');

  if (mainColumnsEnd === -1) return headerLine;

  // Rename all columns after "Promedio Dificultad" with _ref suffix
  for (let i = mainColumnsEnd + 1; i < headers.length; i++) {
    if (headers[i].trim()) {
      headers[i] = headers[i] + '_ref';
    }
  }

  return headers.join(',');
}

/**
 * Group CSV rows into CoachExampleBlock structures
 */
export function groupRowsIntoBlocks(
  rows: CsvRow[],
  week: number,
  day: string,
  routeMap?: RouteMap
): CoachExampleBlock[] {
  // Group rows by (memberLevel, block role)
  const blockMap = new Map<string, CsvRow[]>();

  for (const row of rows) {
    const nivelReal = row['Nivel Real']?.trim().toLowerCase();
    const bloque = row['Bloque']?.trim();
    const ejercicio = row['Ejercicio']?.trim();

    // Skip empty rows or rows without exercise
    if (!nivelReal || !bloque || !ejercicio) continue;

    // Skip "all" level for Initium (warmup is same for everyone)
    if (nivelReal === 'all') continue;

    // Skip invalid member levels (like "_ref" from malformed rows)
    const validLevels = ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
    if (!validLevels.includes(nivelReal)) continue;

    const key = `${nivelReal}-${bloque}`;
    if (!blockMap.has(key)) {
      blockMap.set(key, []);
    }
    blockMap.get(key)!.push(row);
  }

  // Convert grouped rows to CoachExampleBlock structures
  const blocks: CoachExampleBlock[] = [];

  for (const [key, blockRows] of blockMap) {
    const firstRow = blockRows[0];
    const memberLevel = firstRow['Nivel Real'].trim().toLowerCase() as CoachExampleBlock['memberLevel'];

    // Map memberLevel to levelGroup
    const levelGroup = mapLevelToGroup(memberLevel);

    // Parse exercises
    // Note: Contraction is in "Esfuerzo Manual" column, not "Esfuerzo"
    const exercises = blockRows
      .filter(row => row['Ejercicio']?.trim())
      .map(row => ({
        name: row['Ejercicio'].trim(),
        contraction: parseContraction(row['Esfuerzo Manual'] || row['Esfuerzo']),
        difficulty: parseDifficulty(row['Dificultad'], memberLevel),
      }));

    // Skip blocks with no exercises
    if (exercises.length === 0) continue;

    // Normalize block role
    const role = normalizeBlockRole(firstRow['Bloque'].trim());

    // Get route from summary section lookup, fall back to row data if available
    let route = firstRow['Ruta']?.trim() || '';
    if (!route && routeMap) {
      const levelRoutes = routeMap.get(levelGroup);
      if (levelRoutes) {
        route = levelRoutes.get(role) || '';
      }
    }

    // Get format from first row that has it
    const formatRow = blockRows.find(r => r['Formato']?.trim());
    const format = formatRow?.['Formato']?.trim() || 'Straight Sets';

    blocks.push({
      week,
      day,
      levelGroup,
      memberLevel,
      role,
      route,
      intensity: 0, // Will be resolved from SPOM during comparison
      format,
      exercises,
    });
  }

  return blocks;
}

/**
 * Map member level to level group
 */
function mapLevelToGroup(level: string): 'alfa_delta' | 'sigma' | 'omega' {
  switch (level) {
    case 'alfa':
    case 'delta':
      return 'alfa_delta';
    case 'sigma':
      return 'sigma';
    case 'omega':
    case 'spartan':
      return 'omega';
    default:
      return 'alfa_delta';
  }
}

/**
 * Parse contraction type from Esfuerzo column
 * Input: "CON.", "EXC.", "ISO." or empty
 */
function parseContraction(esfuerzo: string): 'CON' | 'EXC' | 'ISO' {
  const cleaned = (esfuerzo || '').trim().toUpperCase().replace('.', '');
  if (cleaned === 'CON') return 'CON';
  if (cleaned === 'EXC') return 'EXC';
  if (cleaned === 'ISO') return 'ISO';
  return 'CON'; // Default to CON if missing
}

/**
 * Parse difficulty and convert to linear 1-12 scale
 *
 * Input is relative difficulty (1-3), output is linear based on level:
 * - Alfa: 1-3
 * - Delta: 4-6
 * - Sigma: 7-8 (only 2 values)
 * - Omega: 9-10 (only 2 values)
 * - Spartan: 11-12 (only 2 values)
 */
function parseDifficulty(diffStr: string, memberLevel: string): number {
  const relativeDiff = parseInt(diffStr, 10) || 1;

  const levelBase: Record<string, number> = {
    alfa: 0,      // 1-3 -> 1,2,3
    delta: 3,     // 1-3 -> 4,5,6
    sigma: 6,     // 1-2 -> 7,8
    omega: 8,     // 1-2 -> 9,10
    spartan: 10,  // 1-2 -> 11,12
  };

  const base = levelBase[memberLevel] || 0;
  return base + relativeDiff;
}

/**
 * Normalize block role names
 * e.g., "Deuteros 1" -> "DEUTEROS_1", "Nucleus" -> "NUCLEUS"
 */
function normalizeBlockRole(role: string): string {
  const normalized = role
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace('ATHLOS/EPIKOS', 'ATHLOS'); // Treat combined as ATHLOS

  // Map variations
  const roleMap: Record<string, string> = {
    'INITIUM': 'INITIUM',
    'NUCLEUS': 'NUCLEUS',
    'DEUTEROS_1': 'DEUTEROS_1',
    'DEUTEROS_2': 'DEUTEROS_2',
    'ATHLOS': 'ATHLOS',
    'EPIKOS': 'EPIKOS',
  };

  return roleMap[normalized] || normalized;
}

// Re-export for testing
export { extractDayFromFilename, parseContraction, parseDifficulty, normalizeBlockRole };
