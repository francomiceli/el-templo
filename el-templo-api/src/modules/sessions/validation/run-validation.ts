/**
 * Validation Suite Runner
 *
 * Parses coach examples and compares against algorithm output.
 * Can run in two modes:
 * 1. Parse-only: Just parse and analyze coach examples (no DB required)
 * 2. Full validation: Generate sessions via algorithm and compare (requires DB)
 *
 * Usage:
 *   npx tsx src/modules/sessions/validation/run-validation.ts [--parse-only] [--week-start N] [--week-end N]
 */

import 'dotenv/config';
import { parseCoachExamples } from './parse-coach-examples.js';
import { compareBlockToExample } from './compare-algorithm.js';
import type { ValidationReport, BlockComparison, CoachExampleBlock } from './types.js';
import type { BlockPlan, ExercisePrescription } from '../types.js';

/**
 * Run full validation comparing algorithm output to coach examples
 *
 * @param weekStart - Starting week (default 3)
 * @param weekEnd - Ending week (default 21)
 * @returns Validation report with comparisons
 */
export async function runValidation(
  weekStart: number = 3,
  weekEnd: number = 21
): Promise<ValidationReport> {
  console.log(`Parsing coach examples for weeks ${weekStart}-${weekEnd}...`);
  const coachExamples = await parseCoachExamples(weekStart, weekEnd);
  console.log(`Parsed ${coachExamples.length} blocks from coach examples\n`);

  // Connect to database
  console.log('Connecting to database...');
  const { createDbConnection } = await import('../../../db/index.js');
  const { db, pool } = await createDbConnection();

  // Create session service
  const { SessionGeneratorService } = await import('../service.js');
  const sessionService = new SessionGeneratorService(db);

  const comparisons: BlockComparison[] = [];

  // Group examples by (week, day, levelGroup) for efficient generation
  const groupedExamples = groupExamples(coachExamples);
  const totalGroups = groupedExamples.size;
  let processedGroups = 0;

  for (const [key, blocks] of groupedExamples) {
    const { week, day, levelGroup, memberLevel } = parseKey(key, blocks[0]);
    processedGroups++;

    if (processedGroups % 10 === 0) {
      console.log(`Processing ${processedGroups}/${totalGroups} sessions...`);
    }

    // Generate algorithm output for this session
    let generatedSession = null;
    try {
      generatedSession = await sessionService.generateDailySession({
        week,
        day: day.toLowerCase(),
        levelGroup,
        memberLevel,
      });
    } catch (error) {
      console.error(`Failed to generate session for ${key}:`, error instanceof Error ? error.message : error);
    }

    // Compare each coach block to corresponding generated block
    for (const coachBlock of blocks) {
      // Find corresponding generated block by role
      const generatedBlock = generatedSession?.blocks.find(
        (b: BlockPlan) => normalizeRole(b.role) === normalizeRole(coachBlock.role)
      );

      // Extract comparable data from generated block
      const actualBlock = generatedBlock ? {
        route: generatedBlock.route,
        intensity: generatedBlock.intensity,
        format: generatedBlock.format?.name ?? 'Straight Sets',
        exercises: generatedBlock.exercises.map((p: ExercisePrescription) => ({
          name: p.name,
          contraction: p.contraction,
          dificultadLineal: p.dificultadLineal,
        })),
      } : null;

      const comparison = compareBlockToExample(coachBlock, actualBlock);
      comparisons.push(comparison);
    }
  }

  // Close database connection
  await pool.end();

  return compileReport(comparisons);
}

/**
 * Run parse-only validation - analyze coach examples without DB
 *
 * Useful for understanding the data structure and patterns
 * before running full algorithm comparison.
 */
export async function runParseOnlyValidation(
  weekStart: number = 3,
  weekEnd: number = 21
): Promise<{
  totalBlocks: number;
  blocksByWeek: Record<number, number>;
  blocksByRole: Record<string, number>;
  blocksByLevelGroup: Record<string, number>;
  formatDistribution: Record<string, number>;
  avgExercisesPerBlock: number;
  routeDistribution: Record<string, number>;
}> {
  console.log(`Parsing coach examples for weeks ${weekStart}-${weekEnd}...`);
  const coachExamples = await parseCoachExamples(weekStart, weekEnd);

  const blocksByWeek: Record<number, number> = {};
  const blocksByRole: Record<string, number> = {};
  const blocksByLevelGroup: Record<string, number> = {};
  const formatDistribution: Record<string, number> = {};
  const routeDistribution: Record<string, number> = {};
  let totalExercises = 0;

  for (const block of coachExamples) {
    // By week
    blocksByWeek[block.week] = (blocksByWeek[block.week] || 0) + 1;

    // By role
    blocksByRole[block.role] = (blocksByRole[block.role] || 0) + 1;

    // By level group
    blocksByLevelGroup[block.levelGroup] = (blocksByLevelGroup[block.levelGroup] || 0) + 1;

    // By format
    const format = block.format || 'Unknown';
    formatDistribution[format] = (formatDistribution[format] || 0) + 1;

    // By route
    const route = block.route || 'No Route';
    routeDistribution[route] = (routeDistribution[route] || 0) + 1;

    // Exercise count
    totalExercises += block.exercises.length;
  }

  return {
    totalBlocks: coachExamples.length,
    blocksByWeek,
    blocksByRole,
    blocksByLevelGroup,
    formatDistribution,
    avgExercisesPerBlock: Number((totalExercises / coachExamples.length).toFixed(2)),
    routeDistribution,
  };
}

/**
 * Group coach examples by (week, day, levelGroup, memberLevel)
 */
function groupExamples(examples: CoachExampleBlock[]): Map<string, CoachExampleBlock[]> {
  const grouped = new Map<string, CoachExampleBlock[]>();

  for (const example of examples) {
    const key = `${example.week}-${example.day}-${example.levelGroup}-${example.memberLevel}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(example);
  }

  return grouped;
}

/**
 * Parse group key back into components
 */
function parseKey(key: string, example: CoachExampleBlock): {
  week: number;
  day: string;
  levelGroup: 'alfa_delta' | 'sigma' | 'omega';
  memberLevel: 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';
} {
  const [weekStr, day, levelGroup, memberLevel] = key.split('-');
  return {
    week: parseInt(weekStr, 10),
    day,
    levelGroup: levelGroup as 'alfa_delta' | 'sigma' | 'omega',
    memberLevel: (memberLevel || example.memberLevel) as 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan',
  };
}

/**
 * Normalize role names for matching
 */
function normalizeRole(role: string): string {
  return role.toUpperCase().replace(/\s+/g, '_');
}

/**
 * Compile validation report from comparisons
 */
function compileReport(comparisons: BlockComparison[]): ValidationReport {
  const passedBlocks = comparisons.filter(c => c.passed).length;
  const issuesByType: Record<string, number> = {};

  for (const comp of comparisons) {
    for (const issue of comp.issues) {
      issuesByType[issue.field] = (issuesByType[issue.field] || 0) + 1;
    }
  }

  return {
    totalBlocks: comparisons.length,
    passedBlocks,
    failedBlocks: comparisons.length - passedBlocks,
    issuesByType,
    detailedComparisons: comparisons,
  };
}

/**
 * Print validation report to console
 */
function printReport(report: ValidationReport): void {
  console.log('\n=== VALIDATION REPORT ===\n');
  console.log(`Total blocks: ${report.totalBlocks}`);
  console.log(`Passed: ${report.passedBlocks} (${((report.passedBlocks / report.totalBlocks) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${report.failedBlocks}`);

  console.log('\nIssues by type:');
  const sortedIssues = Object.entries(report.issuesByType).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedIssues) {
    console.log(`  ${type}: ${count}`);
  }

  // Output sample failures
  const failures = report.detailedComparisons.filter(c => !c.passed);
  if (failures.length > 0) {
    console.log('\n=== SAMPLE FAILURES (first 10) ===\n');
    for (const failure of failures.slice(0, 10)) {
      console.log(`Week ${failure.week}, ${failure.day}, ${failure.levelGroup}, ${failure.role}:`);
      for (const issue of failure.issues) {
        console.log(`  - ${issue.field}: expected ${JSON.stringify(issue.expected)}, got ${JSON.stringify(issue.actual)}`);
      }
    }
  }
}

/**
 * Print parse-only analysis to console
 */
function printParseAnalysis(analysis: Awaited<ReturnType<typeof runParseOnlyValidation>>): void {
  console.log('\n=== COACH EXAMPLES ANALYSIS ===\n');
  console.log(`Total blocks: ${analysis.totalBlocks}`);
  console.log(`Average exercises per block: ${analysis.avgExercisesPerBlock}`);

  console.log('\nBlocks by week:');
  const sortedWeeks = Object.entries(analysis.blocksByWeek).sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [week, count] of sortedWeeks) {
    console.log(`  Week ${week}: ${count}`);
  }

  console.log('\nBlocks by role:');
  const sortedRoles = Object.entries(analysis.blocksByRole).sort((a, b) => b[1] - a[1]);
  for (const [role, count] of sortedRoles) {
    console.log(`  ${role}: ${count}`);
  }

  console.log('\nBlocks by level group:');
  for (const [lg, count] of Object.entries(analysis.blocksByLevelGroup)) {
    console.log(`  ${lg}: ${count}`);
  }

  console.log('\nFormat distribution:');
  const sortedFormats = Object.entries(analysis.formatDistribution).sort((a, b) => b[1] - a[1]);
  for (const [format, count] of sortedFormats) {
    console.log(`  ${format}: ${count}`);
  }

  console.log('\nRoute distribution (top 10):');
  const sortedRoutes = Object.entries(analysis.routeDistribution).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [route, count] of sortedRoutes) {
    console.log(`  ${route}: ${count}`);
  }
}

// CLI runner
if (require.main === module) {
  const args = process.argv.slice(2);
  const parseOnly = args.includes('--parse-only');
  const weekStartIdx = args.indexOf('--week-start');
  const weekEndIdx = args.indexOf('--week-end');

  const weekStart = weekStartIdx !== -1 ? parseInt(args[weekStartIdx + 1], 10) : 3;
  const weekEnd = weekEndIdx !== -1 ? parseInt(args[weekEndIdx + 1], 10) : 21;

  console.log(`Running validation suite (weeks ${weekStart}-${weekEnd})...`);
  console.log(`Mode: ${parseOnly ? 'parse-only' : 'full validation'}\n`);

  if (parseOnly) {
    runParseOnlyValidation(weekStart, weekEnd)
      .then(analysis => {
        printParseAnalysis(analysis);
        process.exit(0);
      })
      .catch(error => {
        console.error('Parse-only validation failed:', error);
        process.exit(1);
      });
  } else {
    runValidation(weekStart, weekEnd)
      .then(report => {
        printReport(report);
        process.exit(report.failedBlocks > 0 ? 1 : 0);
      })
      .catch(error => {
        console.error('Validation failed:', error);
        process.exit(1);
      });
  }
}
