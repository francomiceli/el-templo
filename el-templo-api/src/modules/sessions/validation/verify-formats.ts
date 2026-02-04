/**
 * End-to-End Format Verification
 *
 * Generates actual sessions and verifies format-specific prescription logic.
 * This validates the integration of format-prescribers into the full pipeline.
 */

import 'dotenv/config';
import type { BlockPlan, ExercisePrescription } from '../types.js';

interface FormatVerification {
  format: string;
  passed: boolean;
  issues: string[];
  blockInfo?: {
    week: number;
    day: string;
    role: string;
    exerciseCount: number;
    prescriptionCount: number;
  };
}

async function verifyFormats(): Promise<void> {
  console.log('=== End-to-End Format Verification ===\n');

  // Connect to database
  console.log('Connecting to database...');
  const { createDbConnection } = await import('../../../db/index.js');
  const { db, pool } = await createDbConnection();

  // Create session service
  const { SessionGeneratorService } = await import('../service.js');
  const sessionService = new SessionGeneratorService(db);

  const results: FormatVerification[] = [];

  // Generate sessions for a range of weeks and check format-specific logic
  const testCases = [
    { week: 3, day: 'lunes', levelGroup: 'alfa_delta' as const, memberLevel: 'alfa' as const },
    { week: 5, day: 'martes', levelGroup: 'sigma' as const, memberLevel: 'sigma' as const },
    { week: 10, day: 'miercoles', levelGroup: 'omega' as const, memberLevel: 'omega' as const },
  ];

  for (const testCase of testCases) {
    console.log(`\nGenerating session: Week ${testCase.week}, ${testCase.day}, ${testCase.levelGroup}...`);

    try {
      const session = await sessionService.generateDailySession(testCase);

      if (!session?.blocks) {
        console.log('  No session generated');
        continue;
      }

      // Verify each block's format-specific logic
      for (const block of session.blocks) {
        const verification = verifyBlockFormat(block);
        results.push(verification);

        const status = verification.passed ? 'PASS' : 'FAIL';
        console.log(`  ${block.role}: ${block.format?.name || 'Unknown'} - ${status}`);

        if (!verification.passed) {
          for (const issue of verification.issues) {
            console.log(`    - ${issue}`);
          }
        }
      }
    } catch (error) {
      console.error(`  Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`Passed: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%)`);

  // Group by format
  const byFormat = new Map<string, FormatVerification[]>();
  for (const r of results) {
    const format = r.format || 'Unknown';
    if (!byFormat.has(format)) byFormat.set(format, []);
    byFormat.get(format)!.push(r);
  }

  console.log('\nBy format:');
  for (const [format, verifications] of byFormat) {
    const formatPassed = verifications.filter((v) => v.passed).length;
    console.log(`  ${format}: ${formatPassed}/${verifications.length}`);
  }

  await pool.end();
  console.log('\n=== Format Verification Complete ===');
}

/**
 * Verify a single block's format-specific prescription logic
 */
function verifyBlockFormat(block: BlockPlan): FormatVerification {
  const formatName = block.format?.name?.toLowerCase().trim() || '';
  const exercises = block.exercises;
  const issues: string[] = [];

  const verification: FormatVerification = {
    format: block.format?.name || 'Unknown',
    passed: true,
    issues,
    blockInfo: {
      week: 0, // Not available from block
      day: '',
      role: block.role,
      exerciseCount: exercises.length,
      prescriptionCount: exercises.length,
    },
  };

  // INITIUM uses specialized pipeline (initium-pipeline.ts) that bypasses
  // stage-7-prescription and format-prescribers entirely. Skip format validation.
  if (block.role === 'INITIUM') {
    return verification; // Always passes - uses warmup-specific logic
  }

  // Format-specific validations
  switch (formatName) {
    case 'buy-in / cash-out':
      verifyBuyInCashOut(exercises, issues);
      break;
    case 'complex':
      verifyComplex(exercises, issues);
      break;
    case 'amrap':
    case 'amrap series':
      verifyAMRAP(exercises, issues);
      break;
    case 'emom':
    case 'emom + for time':
      verifyEMOM(exercises, issues);
      break;
    case 'chipper':
      verifyChipper(exercises, issues);
      break;
    // Other formats use standard prescription - no specific validation
  }

  verification.passed = issues.length === 0;
  return verification;
}

function verifyBuyInCashOut(
  exercises: readonly ExercisePrescription[],
  issues: string[]
): void {
  if (exercises.length < 4) {
    issues.push(`Buy-in/Cash-out should have at least 4 prescriptions (bookend), got ${exercises.length}`);
    return;
  }

  // First and last should be same exercise
  const first = exercises[0];
  const last = exercises[exercises.length - 1];

  if (first.exerciseId !== last.exerciseId) {
    issues.push(`Buy-in/Cash-out bookend mismatch: first=${first.name}, last=${last.name}`);
  }

  // Check notes
  if (first.notes !== 'Buy-in') {
    issues.push(`First exercise should have notes='Buy-in', got '${first.notes}'`);
  }
  if (last.notes !== 'Cash-out') {
    issues.push(`Last exercise should have notes='Cash-out', got '${last.notes}'`);
  }
}

function verifyComplex(
  exercises: readonly ExercisePrescription[],
  issues: string[]
): void {
  // All exercises except last should have rest=0
  const nonLastExercises = exercises.slice(0, -1);
  const withRest = nonLastExercises.filter((e) => e.rest > 0);

  if (withRest.length > 0) {
    issues.push(`Complex: ${withRest.length} exercises have rest>0 (should be 0 except last)`);
  }

  // First should have notes about no rest
  if (exercises[0] && !exercises[0].notes?.toLowerCase().includes('no rest')) {
    issues.push(`Complex: first exercise should mention 'no rest' in notes`);
  }
}

function verifyAMRAP(
  exercises: readonly ExercisePrescription[],
  issues: string[]
): void {
  // All exercises should have rest=0
  const withRest = exercises.filter((e) => e.rest > 0);
  if (withRest.length > 0) {
    issues.push(`AMRAP: ${withRest.length} exercises have rest>0 (should be 0)`);
  }

  // Check for capped reps
  const totalReps = exercises
    .filter((e) => e.contraction !== 'ISO')
    .reduce((sum, e) => sum + e.reps, 0);

  if (totalReps > 30) {
    issues.push(`AMRAP: total per-round reps ${totalReps} exceeds 30 cap`);
  }

  // First should mention AMRAP
  if (exercises[0] && !exercises[0].notes?.toLowerCase().includes('amrap')) {
    issues.push(`AMRAP: first exercise should mention 'AMRAP' in notes`);
  }
}

function verifyEMOM(
  exercises: readonly ExercisePrescription[],
  issues: string[]
): void {
  // All exercises should have rest=0 (rest is in the minute)
  const withRest = exercises.filter((e) => e.rest > 0);
  if (withRest.length > 0) {
    issues.push(`EMOM: ${withRest.length} exercises have rest>0 (should be 0)`);
  }

  // First should mention EMOM
  if (exercises[0] && !exercises[0].notes?.toLowerCase().includes('emom')) {
    issues.push(`EMOM: first exercise should mention 'EMOM' in notes`);
  }
}

function verifyChipper(
  exercises: readonly ExercisePrescription[],
  issues: string[]
): void {
  // First should mention Chipper
  if (exercises[0] && !exercises[0].notes?.toLowerCase().includes('chipper')) {
    issues.push(`Chipper: first exercise should mention 'Chipper' in notes`);
  }
}

// CLI runner
verifyFormats().catch((error) => {
  console.error('Verification failed:', error);
  process.exit(1);
});
