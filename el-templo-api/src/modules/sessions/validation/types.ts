/**
 * Validation Suite Types
 *
 * Types for comparing algorithm output against coach-built examples.
 */

/** Coach example block parsed from CSV */
export interface CoachExampleBlock {
  week: number;
  day: string; // Lunes, Martes, etc.
  levelGroup: 'alfa_delta' | 'sigma' | 'omega';
  memberLevel: 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';
  role: string; // Nucleus, Deuteros 1, etc.
  route: string;
  intensity: number; // Resolved from SPOM
  format: string; // Tabata, EMOM, Complex, etc.
  exercises: {
    name: string;
    contraction: 'CON' | 'EXC' | 'ISO';
    difficulty: number; // Linear 1-12
  }[];
}

/** Block comparison result */
export interface BlockComparison {
  week: number;
  day: string;
  levelGroup: 'alfa_delta' | 'sigma' | 'omega';
  role: string;

  expected: {
    route: string;
    intensity: number;
    exerciseCount: number;
    avgDifficulty: number;
    contractionMix: { CON: number; EXC: number; ISO: number };
    format: string;
  };

  actual: {
    route: string;
    intensity: number;
    exerciseCount: number;
    avgDifficulty: number;
    contractionMix: { CON: number; EXC: number; ISO: number };
    format: string;
  } | null; // null if generation failed

  issues: ValidationIssue[];
  passed: boolean;
}

/** Individual validation issue */
export interface ValidationIssue {
  field: string;
  expected: unknown;
  actual: unknown;
  tolerance?: number;
  severity: 'error' | 'warning';
}

/** Complete validation report */
export interface ValidationReport {
  totalBlocks: number;
  passedBlocks: number;
  failedBlocks: number;
  issuesByType: Record<string, number>;
  detailedComparisons: BlockComparison[];
}
