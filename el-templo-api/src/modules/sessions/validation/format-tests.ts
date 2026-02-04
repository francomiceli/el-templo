/**
 * Format-Specific Prescription Tests
 *
 * Validates that each HIGH priority format produces the correct
 * prescription structure according to format rules.
 */

import { prescribeByFormat } from '../pipeline/format-prescribers';
import type { SelectedExercise } from '../types';

const testExercises: SelectedExercise[] = [
  { exerciseId: 1, name: 'Exercise A', contraction: 'CON', difficulty: 4 },
  { exerciseId: 2, name: 'Exercise B', contraction: 'EXC', difficulty: 5 },
  { exerciseId: 3, name: 'Exercise C', contraction: 'ISO', difficulty: 6 },
];

const ctx = {
  exercises: testExercises,
  repsBudget: 100,
  intensity: 70,
  restTime: 60,
};

console.log('=== Format Prescription Tests ===\n');

// Test Buy-in / Cash-out
console.log('--- Buy-in / Cash-out ---');
const buyIn = prescribeByFormat('Buy-in / Cash-out', ctx);
if (buyIn) {
  buyIn.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps${p.seconds ? `, ${p.seconds}s` : ''} ${p.notes || ''}`
    )
  );
  console.log(`  Total prescriptions: ${buyIn.length} (expect 4 for bookend)`);
  console.log(
    `  Total reps (non-ISO): ${buyIn.filter((p) => p.contraction !== 'ISO').reduce((s, p) => s + p.reps, 0)}`
  );
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Complex
console.log('--- Complex ---');
const complex = prescribeByFormat('Complex', ctx);
if (complex) {
  complex.forEach((p) =>
    console.log(`  ${p.name}: ${p.reps} reps, rest=${p.rest}s`)
  );
  const noRestCount = complex.filter((p) => p.rest === 0).length;
  console.log(
    `  Exercises with no rest: ${noRestCount} (expect ${complex.length - 1})`
  );
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test AMRAP
console.log('--- AMRAP ---');
const amrap = prescribeByFormat('AMRAP', ctx);
if (amrap) {
  amrap.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps${p.seconds ? ` or ${p.seconds}s` : ''}`
    )
  );
  const totalReps = amrap.reduce((s, p) => s + p.reps, 0);
  console.log(
    `  Total per-round reps: ${totalReps} (expect <= 30 for capped AMRAP)`
  );
  const allNoRest = amrap.every((p) => p.rest === 0);
  console.log(`  All exercises have no rest: ${allNoRest ? 'yes' : 'no'}`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test EMOM
console.log('--- EMOM ---');
const emom = prescribeByFormat('EMOM', ctx);
if (emom) {
  emom.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps per minute${p.seconds ? ` (or ${p.seconds}s)` : ''}`
    )
  );
  // At 70% intensity, should be 10 reps
  const conExercise = emom.find((p) => p.contraction === 'CON');
  console.log(
    `  CON exercise reps at 70%: ${conExercise?.reps} (expect 10 for intensity 70%)`
  );
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Chipper
console.log('--- Chipper ---');
const chipper = prescribeByFormat('Chipper', ctx);
if (chipper) {
  chipper.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps${p.seconds ? ` or ${p.seconds}s` : ''}`
    )
  );
  const totalReps = chipper
    .filter((p) => p.contraction !== 'ISO')
    .reduce((s, p) => s + p.reps, 0);
  console.log(`  Total chipper reps (non-ISO): ${totalReps} (expect ~100)`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test unknown format (should return null)
console.log('--- Unknown format ---');
const unknown = prescribeByFormat('Some Random Format', ctx);
console.log(
  `  Result: ${unknown === null ? 'null (correct - triggers fallback)' : 'unexpected value'}`
);
console.log();

// Test AMRAP Series (alias)
console.log('--- AMRAP Series (alias) ---');
const amrapSeries = prescribeByFormat('AMRAP Series', ctx);
console.log(
  `  Result: ${amrapSeries !== null ? 'prescription returned (correct)' : 'null (error)'}`
);
console.log();

// Test EMOM + For Time (alias)
console.log('--- EMOM + For Time (alias) ---');
const emomForTime = prescribeByFormat('EMOM + For Time', ctx);
console.log(
  `  Result: ${emomForTime !== null ? 'prescription returned (correct)' : 'null (error)'}`
);
console.log();

console.log('=== Format Prescription Tests Complete ===');
