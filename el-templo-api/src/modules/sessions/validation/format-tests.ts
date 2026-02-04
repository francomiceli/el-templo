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

// =============================================================================
// MEDIUM Priority Formats (13-07)
// =============================================================================

console.log('=== MEDIUM Priority Format Tests ===\n');

// Test For Time
console.log('--- For Time ---');
const forTime = prescribeByFormat('For Time', ctx);
if (forTime) {
  forTime.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps, rest=${p.rest}s ${p.notes || ''}`
    )
  );
  const allNoRest = forTime.every((p) => p.rest === 0);
  console.log(`  All exercises have no rest: ${allNoRest ? 'yes (correct)' : 'no'}`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Tabata
console.log('--- Tabata ---');
const tabata = prescribeByFormat('Tabata', ctx);
if (tabata) {
  tabata.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.seconds}s work, ${p.rest}s rest ${p.notes || ''}`
    )
  );
  const allHave20sWork = tabata.every((p) => p.seconds === 20);
  const allHave10sRest = tabata.every((p) => p.rest === 10);
  console.log(`  All have 20s work: ${allHave20sWork ? 'yes (correct)' : 'no'}`);
  console.log(`  All have 10s rest: ${allHave10sRest ? 'yes (correct)' : 'no'}`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Interval Training
console.log('--- Interval Training ---');
const interval = prescribeByFormat('Interval Training', ctx);
if (interval) {
  interval.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.seconds}s work, ${p.rest}s rest ${p.notes || ''}`
    )
  );
  // At 70% intensity: 40s work, 20s rest
  const first = interval[0];
  console.log(`  Work seconds at 70%: ${first.seconds} (expect 40)`);
  console.log(`  Rest seconds at 70%: ${first.rest} (expect 20)`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Time Cap
console.log('--- Time Cap ---');
const timeCap = prescribeByFormat('Time Cap', ctx);
if (timeCap) {
  timeCap.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps ${p.notes || ''}`
    )
  );
  const hasTimeCapNote = timeCap[0]?.notes?.includes('Time Cap');
  console.log(`  First exercise has Time Cap note: ${hasTimeCapNote ? 'yes (correct)' : 'no'}`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Cluster
console.log('--- Cluster ---');
const cluster = prescribeByFormat('Cluster', ctx);
if (cluster) {
  cluster.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps, rest=${p.rest}s ${p.notes || ''}`
    )
  );
  const hasClusterNote = cluster[0]?.notes?.includes('Cluster');
  console.log(`  First exercise has Cluster note: ${hasClusterNote ? 'yes (correct)' : 'no'}`);
  const allHave15sRest = cluster.every((p) => p.rest === 15);
  console.log(`  All have 15s rest (cluster rest): ${allHave15sRest ? 'yes (correct)' : 'no'}`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Unbroken Reps
console.log('--- Unbroken Reps ---');
const unbroken = prescribeByFormat('Unbroken Reps', ctx);
if (unbroken) {
  unbroken.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps ${p.notes || ''}`
    )
  );
  // Unbroken should have 70% of normal reps
  const totalReps = unbroken.filter((p) => p.contraction !== 'ISO').reduce((s, p) => s + p.reps, 0);
  console.log(`  Total reps (non-ISO): ${totalReps} (expect ~70, which is 70% of 100)`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test For Max Reps
console.log('--- For Max Reps ---');
const forMax = prescribeByFormat('For Max (Reps)', ctx);
if (forMax) {
  forMax.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps, ${p.seconds}s ${p.notes || ''}`
    )
  );
  const allZeroReps = forMax.every((p) => p.reps === 0);
  console.log(`  All have 0 reps (max effort): ${allZeroReps ? 'yes (correct)' : 'no'}`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Couplet (with 2 exercises)
console.log('--- Couplet (2 exercises) ---');
const coupletCtx = { ...ctx, exercises: testExercises.slice(0, 2) };
const couplet = prescribeByFormat('Couplet', coupletCtx);
if (couplet) {
  couplet.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps, rest=${p.rest}s ${p.notes || ''}`
    )
  );
  console.log(`  Prescription count: ${couplet.length} (expect 2)`);
  const allNoRest = couplet.every((p) => p.rest === 0);
  console.log(`  All have no rest (alternating): ${allNoRest ? 'yes (correct)' : 'no'}`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Triplet (with 3 exercises)
console.log('--- Triplet (3 exercises) ---');
const triplet = prescribeByFormat('Triplet', ctx);
if (triplet) {
  triplet.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps, rest=${p.rest}s ${p.notes || ''}`
    )
  );
  console.log(`  Prescription count: ${triplet.length} (expect 3)`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Ladder (ascending at low intensity)
console.log('--- Ladder (ascending at 60% intensity) ---');
const ladderLowCtx = { ...ctx, intensity: 60 };
const ladderAsc = prescribeByFormat('Ladder', ladderLowCtx);
if (ladderAsc) {
  ladderAsc.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps ${p.notes || ''}`
    )
  );
  const hasAscNote = ladderAsc[0]?.notes?.includes('ascending');
  console.log(`  Ascending ladder (intensity < 75): ${hasAscNote ? 'yes (correct)' : 'no'}`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Ladder (descending at high intensity)
console.log('--- Ladder (descending at 80% intensity) ---');
const ladderHighCtx = { ...ctx, intensity: 80 };
const ladderDesc = prescribeByFormat('Ladder', ladderHighCtx);
if (ladderDesc) {
  ladderDesc.forEach((p) =>
    console.log(
      `  ${p.name}: ${p.reps} reps ${p.notes || ''}`
    )
  );
  const hasDescNote = ladderDesc[0]?.notes?.includes('descending');
  console.log(`  Descending ladder (intensity >= 75): ${hasDescNote ? 'yes (correct)' : 'no'}`);
} else {
  console.log('  ERROR: null returned');
}
console.log();

// Test Ladder variants
console.log('--- Ladder Block (alias) ---');
const ladderBlock = prescribeByFormat('Ladder Block', ctx);
console.log(
  `  Result: ${ladderBlock !== null ? 'prescription returned (correct)' : 'null (error)'}`
);

console.log('--- Ladder Corta (alias) ---');
const ladderCorta = prescribeByFormat('Ladder Corta', ctx);
console.log(
  `  Result: ${ladderCorta !== null ? 'prescription returned (correct)' : 'null (error)'}`
);
console.log();

console.log('=== All Format Prescription Tests Complete ===');
console.log('\n=== Summary ===');
console.log('HIGH Priority Formats (5): Buy-in/Cash-out, Complex, AMRAP, EMOM, Chipper');
console.log('MEDIUM Priority Formats (10): For Time, Tabata, Interval Training, Time Cap,');
console.log('  Cluster, Unbroken Reps, For Max Reps, Couplet, Triplet, Ladder');
console.log('Total formats with specific logic: 15');
