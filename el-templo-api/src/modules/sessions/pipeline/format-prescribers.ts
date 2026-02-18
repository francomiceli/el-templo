/**
 * Format-Specific Prescription Logic
 *
 * Each format produces different prescription structures:
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

import type { SelectedExercise, ExercisePrescription } from "../types";
import {
  roundToNearest5,
  calculateInverseDifficultyWeights,
  allocateRepsRounded,
} from "./utils/reps-calculator";
import {
  REST_TIMES,
  REPS,
  ISO_SECONDS,
  INTENSITY_THRESHOLDS,
  EMOM_REPS,
  INTERVAL_SECONDS,
} from "./utils/constants";

export interface PrescriptionContext {
  readonly exercises: readonly SelectedExercise[];
  readonly repsBudget: number;
  readonly intensity: number;
  readonly restTime: number;
}

type Prescriber = (ctx: PrescriptionContext) => ExercisePrescription[] | null;

// Registry and prescribeByFormat are defined at the bottom of the file
// (after all prescriber functions) to avoid ReferenceError with const initialization.

// =============================================================================
// Helper Functions
// =============================================================================

/** Optional overrides for format-specific prescription fields */
interface PrescriptionOverrides {
  repsMax?: number;
  secondsMax?: number;
  increment?: number;
}

/**
 * Create a prescription object from exercise and parameters.
 * Automatically handles ISO exercises (uses seconds instead of reps).
 */
function createPrescription(
  exercise: SelectedExercise,
  reps: number,
  rest: number,
  notes?: string,
  seconds?: number,
  overrides?: PrescriptionOverrides,
): ExercisePrescription {
  const isISO = exercise.contraction === "ISO";
  return {
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    contraction: exercise.contraction,
    reps: isISO ? 0 : reps,
    seconds: seconds ?? (isISO ? ISO_SECONDS.DEFAULT : 0),
    rest,
    notes,
    dificultadLineal: exercise.difficulty,
    ...overrides,
  };
}

// =============================================================================
// HIGH Priority Formats (Plan 13-06)
// =============================================================================

/**
 * Buy-in / Cash-out: First exercise repeats at end (bookend pattern)
 * Structure: A -> B -> C -> A
 * Budget split: A gets 40% (20% + 20%), others split remaining 60%
 */
function prescribeBuyInCashOut(
  ctx: PrescriptionContext,
): ExercisePrescription[] | null {
  const { exercises, repsBudget, restTime } = ctx;
  if (exercises.length < 3) return null;

  const bookendExercise = exercises[0];
  const middleExercises = exercises.slice(1, 3); // Cap at 2 middle exercises → 4 total prescriptions

  // Bookend gets 40% total (20% at start, 20% at end), rounded to 5
  const bookendTotal = roundToNearest5(repsBudget * 0.4);
  const bookendReps = roundToNearest5(bookendTotal / 2);

  // Remaining budget split among middle exercises
  const middleBudget = repsBudget - bookendTotal;
  const middleRepsEach = roundToNearest5(middleBudget / middleExercises.length);

  const prescriptions: ExercisePrescription[] = [];

  // Opening bookend
  prescriptions.push(
    createPrescription(bookendExercise, bookendReps, restTime, "Buy-in"),
  );

  // Middle exercises
  for (const ex of middleExercises) {
    prescriptions.push(createPrescription(ex, middleRepsEach, restTime));
  }

  // Closing bookend (same exercise as first)
  prescriptions.push(
    createPrescription(bookendExercise, bookendReps, restTime, "Cash-out"),
  );

  return prescriptions;
}

/**
 * Complex: All exercises done back-to-back, equal reps
 * Structure: A + B + C (no rest between, same load)
 * Budget split: Equal across all exercises
 */
function prescribeComplex(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget, restTime } = ctx;

  // Equal distribution for complex, rounded to 5
  const repsPerExercise = roundToNearest5(repsBudget / exercises.length);

  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      repsPerExercise,
      i === exercises.length - 1 ? restTime : 0, // Only rest after last exercise
      i === 0 ? "Complex - no rest between exercises" : undefined,
    ),
  );
}

/**
 * AMRAP: Reps per round, athletes do as many rounds as possible
 * Structure: Rounds of (A + B + C), total time-capped
 * Budget represents reps PER ROUND, not total
 * Sets repsMax/secondsMax for ranges (e.g., "10-15 reps") typical of AMRAP
 */
function prescribeAMRAP(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget } = ctx;

  // For AMRAP, budget is per round - distribute using inverse difficulty
  const repsPerRound = roundToNearest5(Math.min(repsBudget, REPS.AMRAP_CAP));
  const weights = calculateInverseDifficultyWeights(exercises);
  const repsAllocation = allocateRepsRounded(exercises, repsPerRound, weights);

  return exercises.map((ex, i) => {
    const isISO = ex.contraction === "ISO";
    const baseReps = isISO ? 0 : Math.max(repsAllocation[i], REPS.MIN_AMRAP);
    const baseSeconds = isISO ? ISO_SECONDS.AMRAP : 0;

    return createPrescription(
      ex,
      baseReps,
      0, // No rest in AMRAP rounds
      i === 0 ? "AMRAP - complete max rounds" : undefined,
      baseSeconds,
      // Range: +5 reps or +10 seconds for flexibility
      isISO
        ? { secondsMax: baseSeconds + REPS.AMRAP_RANGE_SECONDS }
        : { repsMax: baseReps + REPS.AMRAP_RANGE_REPS },
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
  let baseReps: number;
  if (intensity >= INTENSITY_THRESHOLDS.HIGH) {
    baseReps = EMOM_REPS.HIGH_INTENSITY;
  } else if (intensity >= INTENSITY_THRESHOLDS.MEDIUM) {
    baseReps = EMOM_REPS.MEDIUM_INTENSITY;
  } else {
    baseReps = EMOM_REPS.LOW_INTENSITY;
  }

  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      ex.contraction === "ISO" ? 0 : baseReps,
      0, // Rest is built into the minute
      i === 0 ? "EMOM - rotate each minute" : undefined,
      ex.contraction === "ISO" ? ISO_SECONDS.DEFAULT : 0,
    ),
  );
}

/**
 * Chipper: Sequential high-rep work, done once through
 * Structure: Complete A, then B, then C (no rounds)
 * Higher reps per exercise than other formats
 */
function prescribeChipper(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget, restTime } = ctx;

  // Chipper uses full budget, distributed by inverse difficulty with rounding
  const weights = calculateInverseDifficultyWeights(exercises);
  const repsAllocation = allocateRepsRounded(exercises, repsBudget, weights);

  return exercises.map((ex, i) => {
    return createPrescription(
      ex,
      ex.contraction === "ISO" ? 0 : repsAllocation[i],
      restTime,
      i === 0 ? "Chipper - complete each exercise before moving on" : undefined,
      ex.contraction === "ISO" ? ISO_SECONDS.CHIPPER : 0,
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
  const repsAllocation = allocateRepsRounded(exercises, repsBudget, weights);

  return exercises.map((ex, i) => {
    return createPrescription(
      ex,
      ex.contraction === "ISO" ? 0 : repsAllocation[i],
      0, // No prescribed rest - athlete moves continuously
      i === 0 ? "For Time - complete ASAP" : undefined,
      ex.contraction === "ISO" ? ISO_SECONDS.DEFAULT : 0,
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
      REST_TIMES.TABATA, // 10s rest between rounds
      i === 0 ? "Tabata: 20s work / 10s rest x 8 rounds" : undefined,
      ISO_SECONDS.TABATA_WORK, // 20 seconds work
    ),
  );
}

/**
 * Interval Training: Structured work/rest periods
 * Structure: Work period followed by rest period, multiple rounds
 */
function prescribeIntervalTraining(
  ctx: PrescriptionContext,
): ExercisePrescription[] {
  const { exercises, intensity } = ctx;

  // Work duration based on intensity
  let workSeconds: number;
  let intervalRest: number;
  if (intensity >= INTENSITY_THRESHOLDS.HIGH) {
    workSeconds = INTERVAL_SECONDS.HIGH_WORK;
    intervalRest = INTERVAL_SECONDS.HIGH_REST;
  } else if (intensity >= INTENSITY_THRESHOLDS.MEDIUM) {
    workSeconds = INTERVAL_SECONDS.MEDIUM_WORK;
    intervalRest = INTERVAL_SECONDS.MEDIUM_REST;
  } else {
    workSeconds = INTERVAL_SECONDS.LOW_WORK;
    intervalRest = INTERVAL_SECONDS.LOW_REST;
  }

  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      0, // Time-based, not rep-based
      intervalRest,
      i === 0
        ? `Interval: ${workSeconds}s work / ${intervalRest}s rest`
        : undefined,
      workSeconds,
    ),
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
      notes: "Time Cap - complete within limit",
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
  const repsAllocation = allocateRepsRounded(exercises, repsBudget, weights);

  // Cluster uses smaller rep chunks with notation
  return exercises.map((ex, i) => {
    const totalReps = repsAllocation[i];
    const clusterSize = REPS.CLUSTER_SIZE;
    const clusters = Math.ceil(totalReps / clusterSize);

    return createPrescription(
      ex,
      ex.contraction === "ISO" ? 0 : totalReps,
      REST_TIMES.CLUSTER,
      i === 0
        ? `Cluster: ${clusters}x${clusterSize} reps, ${REST_TIMES.CLUSTER}s between clusters`
        : undefined,
      ex.contraction === "ISO" ? ISO_SECONDS.DEFAULT : 0,
    );
  });
}

/**
 * Unbroken Reps: Complete all reps without stopping
 * Structure: Standard reps but must be unbroken
 */
function prescribeUnbrokenReps(
  ctx: PrescriptionContext,
): ExercisePrescription[] {
  const { exercises, restTime } = ctx;
  // Lower rep counts for unbroken requirement
  const adjustedBudget = roundToNearest5(ctx.repsBudget * REPS.UNBROKEN_FACTOR);
  const weights = calculateInverseDifficultyWeights(exercises);
  const repsAllocation = allocateRepsRounded(
    exercises,
    adjustedBudget,
    weights,
  );

  return exercises.map((ex, i) => {
    return createPrescription(
      ex,
      ex.contraction === "ISO" ? 0 : repsAllocation[i],
      restTime,
      i === 0 ? "Unbroken - no rest during set" : undefined,
      ex.contraction === "ISO" ? ISO_SECONDS.DEFAULT : 0,
    );
  });
}

/**
 * For Max (Reps): Maximum reps in given time/sets
 * Structure: Target reps as minimum, athlete pushes for more
 * Uses standard inverse difficulty distribution as baseline targets
 */
function prescribeForMaxReps(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget, restTime } = ctx;
  const weights = calculateInverseDifficultyWeights(exercises);
  const repsAllocation = allocateRepsRounded(exercises, repsBudget, weights);

  return exercises.map((ex, i) => {
    return createPrescription(
      ex,
      ex.contraction === "ISO" ? 0 : repsAllocation[i],
      restTime,
      i === 0 ? "For Max Reps - max effort" : undefined,
      ex.contraction === "ISO" ? ISO_SECONDS.MAX_EFFORT : 0,
    );
  });
}

// =============================================================================
// MEDIUM Priority - Structure Formats (Plan 13-07)
// =============================================================================

/**
 * Couplet: Exactly 2 exercises alternating
 * Returns null if not exactly 2 exercises to trigger standard fallback.
 */
function prescribeCouplet(
  ctx: PrescriptionContext,
): ExercisePrescription[] | null {
  const { exercises, repsBudget } = ctx;

  // Couplet requires exactly 2 exercises - return null to use standard fallback
  if (exercises.length !== 2) {
    return null;
  }

  const repsPerExercise = roundToNearest5(repsBudget / 2);

  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      ex.contraction === "ISO" ? 0 : repsPerExercise,
      0, // Alternate without rest
      i === 0 ? "Couplet - alternate between exercises" : undefined,
      ex.contraction === "ISO" ? ISO_SECONDS.DEFAULT : 0,
    ),
  );
}

/**
 * Triplet: Exactly 3 exercises in rotation
 * Returns null if not exactly 3 exercises to trigger standard fallback.
 */
function prescribeTriplet(
  ctx: PrescriptionContext,
): ExercisePrescription[] | null {
  const { exercises, repsBudget } = ctx;

  // Triplet requires exactly 3 exercises - return null to use standard fallback
  if (exercises.length !== 3) {
    return null;
  }

  const repsPerExercise = roundToNearest5(repsBudget / 3);

  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      ex.contraction === "ISO" ? 0 : repsPerExercise,
      0,
      i === 0 ? "Triplet - rotate through 3 exercises" : undefined,
      ex.contraction === "ISO" ? ISO_SECONDS.DEFAULT : 0,
    ),
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

  // Calculate ladder steps based on budget, rounded to 5
  const baseStep = roundToNearest5(repsBudget / exercises.length);
  const stepVariation = 5; // Clean 5-rep variation between steps

  return exercises.map((ex, i) => {
    let reps: number;
    if (descending) {
      reps = baseStep + stepVariation * (exercises.length - 1 - i);
    } else {
      reps = baseStep - stepVariation * (exercises.length - 1 - i);
    }
    reps = Math.max(reps, REPS.LADDER_MIN);

    return createPrescription(
      ex,
      ex.contraction === "ISO" ? 0 : reps,
      restTime,
      i === 0
        ? `Ladder - ${descending ? "descending" : "ascending"} reps`
        : undefined,
      ex.contraction === "ISO" ? ISO_SECONDS.DEFAULT : 0,
    );
  });
}

// =============================================================================
// Death By & I Go, You Go Formats
// =============================================================================

/**
 * Death By: Start at X reps in minute 1, add increment each round until failure
 * Structure: Min 1 → 2 reps, Min 2 → 3 reps, Min 3 → 4 reps, ...
 * Uses `increment` field per exercise. Low starting reps, progressive overload.
 * Higher intensity → increment of 2 instead of 1.
 */
function prescribeDeathBy(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, intensity } = ctx;

  const startReps = REPS.DEATH_BY_START;
  const increment =
    intensity >= INTENSITY_THRESHOLDS.HIGH
      ? REPS.DEATH_BY_INCREMENT_HIGH
      : REPS.DEATH_BY_INCREMENT;

  return exercises.map((ex, i) => {
    const isISO = ex.contraction === "ISO";

    return createPrescription(
      ex,
      isISO ? 0 : startReps,
      0, // No rest - each round is time-bounded (1 minute)
      i === 0
        ? `Death By - start at ${startReps}, +${increment} each round`
        : undefined,
      isISO ? ISO_SECONDS.DEFAULT : 0,
      isISO ? undefined : { increment },
    );
  });
}

/**
 * I Go, You Go: Partner alternating format
 * Structure: Partner A does exercise, Partner B rests, then swap.
 * Each partner does half the total rounds, but reps per turn stay the same.
 * No explicit rest (partner's work time is your rest).
 * Uses standard rep distribution but with no programmed rest.
 */
function prescribeIGoYouGo(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget } = ctx;

  // Standard rep distribution - each partner does these reps on their turn
  const weights = calculateInverseDifficultyWeights(exercises);
  const repsAllocation = allocateRepsRounded(exercises, repsBudget, weights);

  return exercises.map((ex, i) => {
    return createPrescription(
      ex,
      ex.contraction === "ISO" ? 0 : repsAllocation[i],
      0, // No rest - partner's work is your rest
      i === 0 ? "I Go, You Go - alternate with partner" : undefined,
      ex.contraction === "ISO" ? ISO_SECONDS.DEFAULT : 0,
    );
  });
}

// =============================================================================
// Registry & Router (must be after all prescriber function definitions)
// =============================================================================

/**
 * Registry mapping format names to their prescriber functions.
 * Multiple names can map to the same prescriber for format aliases.
 */
const PRESCRIBER_REGISTRY: Record<string, Prescriber> = {
  // HIGH priority formats (13-06)
  "buy-in / cash-out": prescribeBuyInCashOut,
  "buy-in/cash-out": prescribeBuyInCashOut,
  complex: prescribeComplex,
  amrap: prescribeAMRAP,
  "amrap series": prescribeAMRAP,
  emom: prescribeEMOM,
  "emom + for time": prescribeEMOM,
  chipper: prescribeChipper,

  // MEDIUM priority - Time-based formats (13-07)
  "for time": prescribeForTime,
  tabata: prescribeTabata,
  "interval training": prescribeIntervalTraining,
  interval: prescribeIntervalTraining,
  "time cap": prescribeTimeCap,

  // Death By and I Go, You Go formats
  "death by": prescribeDeathBy,
  "i go, you go": prescribeIGoYouGo,
  "i go you go": prescribeIGoYouGo,

  // MEDIUM priority - Rep-based formats (13-07)
  cluster: prescribeCluster,
  "unbroken reps": prescribeUnbrokenReps,
  unbroken: prescribeUnbrokenReps,
  "for max (reps)": prescribeForMaxReps,
  "for max reps": prescribeForMaxReps,
  "max reps": prescribeForMaxReps,

  // MEDIUM priority - Structure formats (13-07)
  couplet: prescribeCouplet,
  triplet: prescribeTriplet,
  ladder: prescribeLadder,
  "ladder block": prescribeLadder,
  "ladder corta": prescribeLadder,
};

/**
 * Route to format-specific prescriber based on format name.
 * Returns null for unhandled formats (use standard prescription).
 */
export function prescribeByFormat(
  format: string,
  ctx: PrescriptionContext,
): ExercisePrescription[] | null {
  const normalizedFormat = format.toLowerCase().trim();
  const prescriber = PRESCRIBER_REGISTRY[normalizedFormat];
  return prescriber ? prescriber(ctx) : null;
}
