/**
 * Pipeline Constants
 *
 * Named constants for magic numbers used across prescriber functions.
 * Centralizes configuration for intensity thresholds, rest times,
 * rep constraints, and ISO durations.
 */

/** Intensity thresholds for exercise difficulty calculations */
export const INTENSITY_THRESHOLDS = {
  HIGH: 80,
  MEDIUM: 70,
  NIVEL_SUPERIOR: 85,
  LEVEL_SHIFT: 90,
} as const;

/** Rest times in seconds */
export const REST_TIMES = {
  WARMUP: 30,
  SHORT: 45,
  MEDIUM: 60,
  LONG: 75,
  MAX: 90,
  CLUSTER: 15,
  TABATA: 10,
} as const;

/** Reps constraints */
export const REPS = {
  MIN_PER_EXERCISE: 10,
  MIN_AMRAP: 5,
  AMRAP_CAP: 30,
  AMRAP_RANGE_REPS: 5, // +5 reps for AMRAP repsMax range
  AMRAP_RANGE_SECONDS: 10, // +10 seconds for AMRAP secondsMax range
  UNBROKEN_FACTOR: 0.7,
  LADDER_MIN: 10,
  CLUSTER_SIZE: 5,
  DEATH_BY_START: 2, // Starting reps for Death By format
  DEATH_BY_INCREMENT: 1, // Rep increment per round (low intensity)
  DEATH_BY_INCREMENT_HIGH: 2, // Rep increment per round (high intensity)
} as const;

/** ISO durations in seconds */
export const ISO_SECONDS = {
  DEFAULT: 30,
  AMRAP: 20,
  CHIPPER: 45,
  MAX_EFFORT: 60,
  TABATA_WORK: 20,
} as const;

/** EMOM base reps by intensity */
export const EMOM_REPS = {
  HIGH_INTENSITY: 10, // intensity >= 80
  MEDIUM_INTENSITY: 10, // intensity >= 70
  LOW_INTENSITY: 15, // intensity < 70
} as const;

/** Interval training durations by intensity */
export const INTERVAL_SECONDS = {
  HIGH_WORK: 30,
  MEDIUM_WORK: 40,
  LOW_WORK: 45,
  HIGH_REST: 30,
  MEDIUM_REST: 20,
  LOW_REST: 15,
} as const;
