/**
 * Algorithm Comparison Logic
 *
 * Compares algorithm-generated blocks against coach-built examples.
 * Identifies discrepancies with severity levels.
 */

import type { CoachExampleBlock, BlockComparison, ValidationIssue } from './types';

/** Tolerance for average difficulty comparison (DIFF-05) */
const DIFFICULTY_TOLERANCE = 0.5;

/**
 * Compare a coach example block to algorithm-generated block
 *
 * @param expected - Coach example block (ground truth)
 * @param actual - Algorithm-generated block (may be null if generation failed)
 * @returns BlockComparison with issues and pass/fail status
 */
export function compareBlockToExample(
  expected: CoachExampleBlock,
  actual: {
    route: string;
    intensity: number;
    format: string;
    exercises: { name: string; contraction: string; dificultadLineal?: number }[];
  } | null
): BlockComparison {
  const issues: ValidationIssue[] = [];

  if (!actual) {
    return {
      ...baseComparison(expected),
      actual: null,
      issues: [{ field: 'generation', expected: 'success', actual: 'failed', severity: 'error' }],
      passed: false,
    };
  }

  // Compare route (ALGO-02)
  if (expected.route && expected.route !== actual.route) {
    issues.push({
      field: 'route',
      expected: expected.route,
      actual: actual.route,
      severity: 'error',
    });
  }

  // Compare intensity (ALGO-03)
  if (expected.intensity && expected.intensity !== actual.intensity) {
    issues.push({
      field: 'intensity',
      expected: expected.intensity,
      actual: actual.intensity,
      severity: 'error',
    });
  }

  // Compare exercise count (BLOCK-06)
  const expectedCount = expected.exercises.length;
  const actualCount = actual.exercises.length;
  if (expectedCount !== actualCount) {
    issues.push({
      field: 'exerciseCount',
      expected: expectedCount,
      actual: actualCount,
      severity: 'warning',
    });
  }

  // Compare average difficulty (DIFF-05)
  const expectedAvg = calculateAvgDifficulty(expected.exercises);
  const actualAvg = calculateAvgDifficultyFromActual(actual.exercises);
  if (Math.abs(expectedAvg - actualAvg) > DIFFICULTY_TOLERANCE) {
    issues.push({
      field: 'avgDifficulty',
      expected: expectedAvg,
      actual: actualAvg,
      tolerance: DIFFICULTY_TOLERANCE,
      severity: 'warning',
    });
  }

  // Compare contraction distribution (ALGO-04)
  const expectedMix = getContractionMix(expected.exercises);
  const actualMix = getContractionMixFromActual(actual.exercises);
  if (!contractionMixesMatch(expectedMix, actualMix)) {
    issues.push({
      field: 'contractionMix',
      expected: expectedMix,
      actual: actualMix,
      severity: 'error',
    });
  }

  // Compare format (FORM-01, FORM-02)
  if (normalizeFormat(expected.format) !== normalizeFormat(actual.format)) {
    issues.push({
      field: 'format',
      expected: expected.format,
      actual: actual.format,
      severity: 'warning', // Warning because format variations may be acceptable
    });
  }

  return {
    week: expected.week,
    day: expected.day,
    levelGroup: expected.levelGroup,
    role: expected.role,
    expected: {
      route: expected.route,
      intensity: expected.intensity,
      exerciseCount: expectedCount,
      avgDifficulty: expectedAvg,
      contractionMix: expectedMix,
      format: expected.format,
    },
    actual: {
      route: actual.route,
      intensity: actual.intensity,
      exerciseCount: actualCount,
      avgDifficulty: actualAvg,
      contractionMix: actualMix,
      format: actual.format,
    },
    issues,
    passed: issues.filter(i => i.severity === 'error').length === 0,
  };
}

/**
 * Create base comparison structure from expected block
 */
function baseComparison(expected: CoachExampleBlock): Omit<BlockComparison, 'actual' | 'issues' | 'passed'> {
  return {
    week: expected.week,
    day: expected.day,
    levelGroup: expected.levelGroup,
    role: expected.role,
    expected: {
      route: expected.route,
      intensity: expected.intensity,
      exerciseCount: expected.exercises.length,
      avgDifficulty: calculateAvgDifficulty(expected.exercises),
      contractionMix: getContractionMix(expected.exercises),
      format: expected.format,
    },
  };
}

/**
 * Calculate average difficulty from coach exercises
 */
function calculateAvgDifficulty(exercises: { difficulty: number }[]): number {
  if (exercises.length === 0) return 0;
  const sum = exercises.reduce((acc, e) => acc + e.difficulty, 0);
  return Number((sum / exercises.length).toFixed(2));
}

/**
 * Calculate average difficulty from algorithm exercises
 */
function calculateAvgDifficultyFromActual(exercises: { dificultadLineal?: number }[]): number {
  if (exercises.length === 0) return 0;
  const sum = exercises.reduce((acc, e) => acc + (e.dificultadLineal ?? 0), 0);
  return Number((sum / exercises.length).toFixed(2));
}

/**
 * Get contraction distribution from coach exercises
 */
function getContractionMix(exercises: { contraction: string }[]): { CON: number; EXC: number; ISO: number } {
  return {
    CON: exercises.filter(e => e.contraction === 'CON').length,
    EXC: exercises.filter(e => e.contraction === 'EXC').length,
    ISO: exercises.filter(e => e.contraction === 'ISO').length,
  };
}

/**
 * Get contraction distribution from algorithm exercises
 */
function getContractionMixFromActual(exercises: { contraction: string }[]): { CON: number; EXC: number; ISO: number } {
  return {
    CON: exercises.filter(e => e.contraction === 'CON').length,
    EXC: exercises.filter(e => e.contraction === 'EXC').length,
    ISO: exercises.filter(e => e.contraction === 'ISO').length,
  };
}

/**
 * Check if two contraction mixes match
 */
function contractionMixesMatch(
  a: { CON: number; EXC: number; ISO: number },
  b: { CON: number; EXC: number; ISO: number }
): boolean {
  return a.CON === b.CON && a.EXC === b.EXC && a.ISO === b.ISO;
}

/**
 * Normalize format name for comparison
 * Handles variations like "Straight Sets" vs "straight sets"
 */
function normalizeFormat(format: string): string {
  return format.toLowerCase().trim().replace(/\s+/g, ' ');
}

export { calculateAvgDifficulty, getContractionMix, normalizeFormat };
