/**
 * Format-Specific Prescription Logic
 *
 * Different workout formats require different prescription structures:
 * - Buy-in/Cash-out: Bookend pattern (first exercise repeats at end)
 * - AMRAP: Reps per round, not total reps
 * - EMOM: Reps per minute with exercise rotation
 * - Complex: Equal distribution, no inter-exercise rest
 * - Chipper: Sequential high-rep format
 * - For Time: Complete work ASAP
 * - Tabata: 20s work / 10s rest
 * - Interval Training: Configurable work/rest periods
 * - Cluster: Mini-sets with short intra-set rest
 * - Ladder: Progressive ascending/descending rep scheme
 * - Couplet/Triplet: 2/3 exercise structures
 *
 * Returns null if format should use standard prescription logic.
 */

import type { SelectedExercise, ExercisePrescription } from '../types';

export interface PrescriptionContext {
  readonly exercises: readonly SelectedExercise[];
  readonly repsBudget: number;
  readonly intensity: number;
  readonly restTime: number;
}

/**
 * Route to format-specific prescriber based on format name.
 * Returns null for unhandled formats (use standard prescription).
 */
export function prescribeByFormat(
  format: string,
  ctx: PrescriptionContext
): ExercisePrescription[] | null {
  const normalizedFormat = format.toLowerCase().trim();

  switch (normalizedFormat) {
    // HIGH priority formats (13-06)
    case 'buy-in / cash-out':
    case 'buy-in/cash-out':
      return prescribeBuyInCashOut(ctx);
    case 'complex':
      return prescribeComplex(ctx);
    case 'amrap':
    case 'amrap series':
      return prescribeAMRAP(ctx);
    case 'emom':
    case 'emom + for time':
      return prescribeEMOM(ctx);
    case 'chipper':
      return prescribeChipper(ctx);

    // MEDIUM priority - Time-based formats (13-07)
    case 'for time':
      return prescribeForTime(ctx);
    case 'tabata':
      return prescribeTabata(ctx);
    case 'interval training':
    case 'interval':
      return prescribeIntervalTraining(ctx);
    case 'time cap':
      return prescribeTimeCap(ctx);

    // MEDIUM priority - Rep-based formats (13-07)
    case 'cluster':
      return prescribeCluster(ctx);
    case 'unbroken reps':
    case 'unbroken':
      return prescribeUnbrokenReps(ctx);
    case 'for max (reps)':
    case 'for max reps':
    case 'max reps':
      return prescribeForMaxReps(ctx);

    // MEDIUM priority - Structure formats (13-07)
    case 'couplet':
      return prescribeCouplet(ctx);
    case 'triplet':
      return prescribeTriplet(ctx);
    case 'ladder':
    case 'ladder block':
    case 'ladder corta':
      return prescribeLadder(ctx);

    default:
      return null; // Signals to use standard prescription
  }
}

// =============================================================================
// HIGH Priority Formats (Plan 13-06)
// =============================================================================

/**
 * Buy-in / Cash-out: First exercise repeats at end (bookend pattern)
 * Structure: A -> B -> C -> A
 * Budget split: A gets 40% (20% + 20%), others split remaining 60%
 */
function prescribeBuyInCashOut(ctx: PrescriptionContext): ExercisePrescription[] | null {
  const { exercises, repsBudget, restTime } = ctx;
  if (exercises.length < 2) return null;

  const bookendExercise = exercises[0];
  const middleExercises = exercises.slice(1);

  // Bookend gets 40% total (20% at start, 20% at end)
  const bookendTotal = Math.round(repsBudget * 0.4);
  const bookendReps = Math.round(bookendTotal / 2);

  // Remaining 60% split among middle exercises
  const middleBudget = repsBudget - bookendTotal;
  const middleRepsEach = Math.round(middleBudget / middleExercises.length);

  const prescriptions: ExercisePrescription[] = [];

  // Opening bookend
  prescriptions.push(createPrescription(bookendExercise, bookendReps, restTime, 'Buy-in'));

  // Middle exercises
  for (const ex of middleExercises) {
    prescriptions.push(createPrescription(ex, middleRepsEach, restTime));
  }

  // Closing bookend (same exercise as first)
  prescriptions.push(createPrescription(bookendExercise, bookendReps, restTime, 'Cash-out'));

  return prescriptions;
}

/**
 * Complex: All exercises done back-to-back, equal reps
 * Structure: A + B + C (no rest between, same load)
 * Budget split: Equal across all exercises
 */
function prescribeComplex(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget, restTime } = ctx;

  // Equal distribution for complex
  const repsPerExercise = Math.round(repsBudget / exercises.length);

  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      repsPerExercise,
      i === exercises.length - 1 ? restTime : 0, // Only rest after last exercise
      i === 0 ? 'Complex - no rest between exercises' : undefined
    )
  );
}

/**
 * AMRAP: Reps per round, athletes do as many rounds as possible
 * Structure: Rounds of (A + B + C), total time-capped
 * Budget represents reps PER ROUND, not total
 */
function prescribeAMRAP(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget } = ctx;

  // For AMRAP, budget is per round - distribute using inverse difficulty
  // but with lower total since it's per round
  const repsPerRound = Math.min(repsBudget, 30); // Cap at 30 reps/round for AMRAPs
  const weights = calculateInverseDifficultyWeights(exercises);

  return exercises.map((ex, i) => {
    const reps = Math.round(repsPerRound * weights[i]);
    return createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : Math.max(reps, 5), // Min 5 reps for AMRAP
      0, // No rest in AMRAP rounds
      i === 0 ? 'AMRAP - complete max rounds' : undefined,
      ex.contraction === 'ISO' ? 20 : 0 // 20s for ISO in AMRAP
    );
  });
}

/**
 * EMOM: Every Minute On the Minute
 * Structure: Exercise rotation each minute
 * Reps should be completable in ~40 seconds
 */
function prescribeEMOM(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, intensity } = ctx;

  // EMOM reps based on intensity (higher intensity = fewer reps per minute)
  const baseReps = intensity >= 80 ? 8 : intensity >= 70 ? 10 : 12;

  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : baseReps,
      0, // Rest is built into the minute
      i === 0 ? 'EMOM - rotate each minute' : undefined,
      ex.contraction === 'ISO' ? 30 : 0 // 30s hold for ISO
    )
  );
}

/**
 * Chipper: Sequential high-rep work, done once through
 * Structure: Complete A, then B, then C (no rounds)
 * Higher reps per exercise than other formats
 */
function prescribeChipper(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget, restTime } = ctx;

  // Chipper uses full budget, distributed by inverse difficulty
  const weights = calculateInverseDifficultyWeights(exercises);

  return exercises.map((ex, i) => {
    const reps = Math.round(repsBudget * weights[i]);
    return createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : reps,
      restTime,
      i === 0 ? 'Chipper - complete each exercise before moving on' : undefined,
      ex.contraction === 'ISO' ? 45 : 0 // Longer hold for chipper
    );
  });
}

// =============================================================================
// MEDIUM Priority - Time-Based Formats (Plan 13-07)
// =============================================================================

/**
 * For Time: Complete prescribed work as fast as possible
 * Structure: Fixed reps, athlete times completion
 * Similar to standard but with "for time" note
 */
function prescribeForTime(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget } = ctx;
  const weights = calculateInverseDifficultyWeights(exercises);

  return exercises.map((ex, i) => {
    const reps = Math.round(repsBudget * weights[i]);
    return createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : reps,
      0, // No prescribed rest - athlete moves continuously
      i === 0 ? 'For Time - complete ASAP' : undefined,
      ex.contraction === 'ISO' ? 30 : 0
    );
  });
}

/**
 * Tabata: 20 seconds work / 10 seconds rest, 8 rounds
 * Structure: Max effort during work periods
 * Reps are "max reps" indicators, not fixed targets
 */
function prescribeTabata(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises } = ctx;

  // Tabata is 8 rounds of 20s work / 10s rest
  // For multi-exercise Tabata, rotate exercises across rounds
  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      0, // Tabata uses time, not fixed reps
      10, // 10s rest between rounds
      i === 0 ? 'Tabata: 20s work / 10s rest x 8 rounds' : undefined,
      20 // 20 seconds work
    )
  );
}

/**
 * Interval Training: Structured work/rest periods
 * Structure: Work period followed by rest period, multiple rounds
 */
function prescribeIntervalTraining(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, intensity } = ctx;

  // Work duration based on intensity
  const workSeconds = intensity >= 80 ? 30 : intensity >= 70 ? 40 : 45;
  const intervalRest = intensity >= 80 ? 30 : intensity >= 70 ? 20 : 15;

  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      0, // Time-based, not rep-based
      intervalRest,
      i === 0 ? `Interval: ${workSeconds}s work / ${intervalRest}s rest` : undefined,
      workSeconds
    )
  );
}

/**
 * Time Cap: Complete work within time limit
 * Structure: Like For Time but with explicit cap
 */
function prescribeTimeCap(ctx: PrescriptionContext): ExercisePrescription[] {
  // Similar to For Time
  const prescriptions = prescribeForTime(ctx);
  if (prescriptions && prescriptions.length > 0) {
    // Replace first prescription's notes
    const first = prescriptions[0];
    prescriptions[0] = {
      ...first,
      notes: 'Time Cap - complete within limit',
    };
  }
  return prescriptions;
}

// =============================================================================
// MEDIUM Priority - Rep-Based Formats (Plan 13-07)
// =============================================================================

/**
 * Cluster: Mini-sets with short intra-set rest
 * Structure: Break total reps into clusters (e.g., 5+5+5 instead of 15)
 * Short rest (10-15s) between clusters
 */
function prescribeCluster(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget } = ctx;
  const weights = calculateInverseDifficultyWeights(exercises);

  // Cluster uses smaller rep chunks with notation
  return exercises.map((ex, i) => {
    const totalReps = Math.round(repsBudget * weights[i]);
    const clusterSize = Math.min(5, Math.ceil(totalReps / 3)); // 3 clusters of ~5 reps
    const clusters = Math.ceil(totalReps / clusterSize);

    return createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : totalReps,
      15, // Short cluster rest
      i === 0 ? `Cluster: ${clusters}x${clusterSize} reps, 15s between clusters` : undefined,
      ex.contraction === 'ISO' ? 30 : 0
    );
  });
}

/**
 * Unbroken Reps: Complete all reps without stopping
 * Structure: Standard reps but must be unbroken
 */
function prescribeUnbrokenReps(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget, restTime } = ctx;
  const weights = calculateInverseDifficultyWeights(exercises);

  // Lower rep counts for unbroken requirement
  const unbrokenMultiplier = 0.7; // 70% of normal for unbroken

  return exercises.map((ex, i) => {
    const reps = Math.round(repsBudget * weights[i] * unbrokenMultiplier);
    return createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : Math.max(reps, 5),
      restTime,
      i === 0 ? 'Unbroken - no rest during set' : undefined,
      ex.contraction === 'ISO' ? 30 : 0
    );
  });
}

/**
 * For Max (Reps): Maximum reps in given time/sets
 * Structure: Indicator reps, athlete goes for max
 */
function prescribeForMaxReps(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, restTime } = ctx;

  // For Max doesn't have fixed targets - use indicators
  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      0, // Max effort, no fixed target
      restTime,
      i === 0 ? 'For Max Reps - max effort' : undefined,
      ex.contraction === 'ISO' ? 60 : 0 // Longer hold for max
    )
  );
}

// =============================================================================
// MEDIUM Priority - Structure Formats (Plan 13-07)
// =============================================================================

/**
 * Couplet: Exactly 2 exercises alternating
 * Validates exercise count, returns null if not 2
 */
function prescribeCouplet(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget } = ctx;

  // Couplet requires exactly 2 exercises
  if (exercises.length !== 2) {
    // Log warning but continue with available exercises
    console.warn(`Couplet expects 2 exercises, got ${exercises.length}`);
  }

  const repsPerExercise = Math.round(repsBudget / 2);

  return exercises.slice(0, 2).map((ex, i) =>
    createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : repsPerExercise,
      0, // Alternate without rest
      i === 0 ? 'Couplet - alternate between exercises' : undefined,
      ex.contraction === 'ISO' ? 30 : 0
    )
  );
}

/**
 * Triplet: Exactly 3 exercises in rotation
 */
function prescribeTriplet(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget } = ctx;

  if (exercises.length !== 3) {
    console.warn(`Triplet expects 3 exercises, got ${exercises.length}`);
  }

  const repsPerExercise = Math.round(repsBudget / 3);

  return exercises.slice(0, 3).map((ex, i) =>
    createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : repsPerExercise,
      0,
      i === 0 ? 'Triplet - rotate through 3 exercises' : undefined,
      ex.contraction === 'ISO' ? 30 : 0
    )
  );
}

/**
 * Ladder: Progressive rep scheme (ascending or descending)
 * Structure: 1-2-3-4-5 or 10-8-6-4-2
 */
function prescribeLadder(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget, intensity, restTime } = ctx;

  // High intensity = descending ladder, low = ascending
  const descending = intensity >= 75;

  // Calculate ladder steps based on budget
  // e.g., budget 60 with 3 exercises: 15+20+25 or 25+20+15
  const baseStep = Math.round(repsBudget / exercises.length);
  const stepVariation = Math.round(baseStep * 0.2); // 20% variation

  return exercises.map((ex, i) => {
    let reps: number;
    if (descending) {
      reps = baseStep + stepVariation * (exercises.length - 1 - i);
    } else {
      reps = baseStep - stepVariation * (exercises.length - 1 - i);
    }
    reps = Math.max(reps, 5); // Minimum 5 reps

    return createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : Math.round(reps),
      restTime,
      i === 0 ? `Ladder - ${descending ? 'descending' : 'ascending'} reps` : undefined,
      ex.contraction === 'ISO' ? 30 : 0
    );
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a prescription object from exercise and parameters
 */
function createPrescription(
  exercise: SelectedExercise,
  reps: number,
  rest: number,
  notes?: string,
  seconds?: number
): ExercisePrescription {
  return {
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    contraction: exercise.contraction,
    reps: exercise.contraction === 'ISO' ? 0 : reps,
    seconds: seconds ?? (exercise.contraction === 'ISO' ? 30 : 0),
    rest,
    notes,
    dificultadLineal: exercise.difficulty,
  };
}

/**
 * Calculate inverse difficulty weights for rep distribution.
 * Easier exercises (lower difficulty) get more reps.
 */
function calculateInverseDifficultyWeights(exercises: readonly SelectedExercise[]): number[] {
  const inverseWeights = exercises.map(e => 1 / Math.max(e.difficulty, 1));
  const totalWeight = inverseWeights.reduce((sum, w) => sum + w, 0);
  return inverseWeights.map(w => w / totalWeight);
}
