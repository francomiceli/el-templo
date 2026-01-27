/**
 * Timer format parsing utilities
 *
 * Maps block format strings to protocol types and extracts timer parameters.
 * Used by timer composables to determine which timer protocol to use.
 */

import type { Block } from '../types/session';

/**
 * Protocol types for different timer modes
 */
export type ProtocolType = 'EMOM' | 'AMRAP' | 'FOR_TIME' | 'STRAIGHT_SETS';

/**
 * Timer protocol parameters extracted from block data
 */
export interface ProtocolParams {
  /** Which timer protocol to use */
  type: ProtocolType;
  /** Duration in minutes (for AMRAP) */
  durationMinutes: number | null;
  /** Number of rounds (for EMOM) */
  rounds: number | null;
  /** Interval in seconds (for EMOM) */
  intervalSeconds: number;
}

/**
 * Format name to protocol type mapping
 */
const FORMAT_TO_PROTOCOL: Record<string, ProtocolType> = {
  // EMOM formats
  'emom': 'EMOM',
  'emom + for time': 'EMOM',
  'every x seconds': 'EMOM',
  'on the 2:00 / 3:00': 'EMOM',
  'death by': 'EMOM',
  'death by unbroken': 'EMOM',

  // AMRAP formats
  'amrap': 'AMRAP',
  'amrap series': 'AMRAP',

  // FOR_TIME formats
  'for time': 'FOR_TIME',
  'rounds for time': 'FOR_TIME',
  'chipper': 'FOR_TIME',
  'couplet': 'FOR_TIME',
  'triplet': 'FOR_TIME',
  'singlet': 'FOR_TIME',
  'hero wod': 'FOR_TIME',
  'benchmark wod': 'FOR_TIME',
  'benchmark': 'FOR_TIME',
  'open style': 'FOR_TIME',
  'time cap': 'FOR_TIME',
  'task priority': 'FOR_TIME',
  'task priority vs time priority': 'FOR_TIME',

  // All other formats default to STRAIGHT_SETS
  // Including: Tabata, HIIT, Interval Training, Complex, Cluster,
  // Accumulate X, Flow Guiado, For Quality, For Tech, For Max variants,
  // Ladder variants, Pyramid, Wave Loading, Drop Set, Rest-Pause,
  // Tempo Sets, Unbroken Reps, Buy-in / Cash-out, Circuito cooperativo, I Go
};

/**
 * Parse a block format string into a protocol type
 *
 * @param format - Format name from Block.format (e.g., "EMOM", "AMRAP", "For Time")
 * @returns Protocol type enum value
 *
 * @example
 * parseProtocolType("EMOM") // => "EMOM"
 * parseProtocolType("Tabata") // => "STRAIGHT_SETS"
 * parseProtocolType("Unknown Format") // => "STRAIGHT_SETS"
 */
export function parseProtocolType(format: string): ProtocolType {
  const normalized = format.toLowerCase().trim();
  return FORMAT_TO_PROTOCOL[normalized] || 'STRAIGHT_SETS';
}

/**
 * Extract timer protocol parameters from a block
 *
 * Derives timer settings based on protocol type and block data:
 * - EMOM: rounds = exercise count (or 10 default), intervalSeconds = 60
 * - AMRAP: durationMinutes = 10 (default)
 * - FOR_TIME: no preset duration or rounds (user-controlled)
 * - STRAIGHT_SETS: no timer params needed
 *
 * @param block - Block data containing format and exercises
 * @returns Protocol parameters for timer configuration
 *
 * @example
 * const block = { format: "EMOM", exercises: [{...}, {...}, {...}] };
 * getProtocolParams(block)
 * // => { type: "EMOM", rounds: 3, intervalSeconds: 60, durationMinutes: null }
 */
export function getProtocolParams(block: Block): ProtocolParams {
  const type = parseProtocolType(block.format);

  // Default values
  const params: ProtocolParams = {
    type,
    durationMinutes: null,
    rounds: null,
    intervalSeconds: 60,
  };

  // Protocol-specific parameter extraction
  switch (type) {
    case 'EMOM':
      // Rounds = number of exercises (or default 10 if no exercises)
      params.rounds = block.exercises.length > 0 ? block.exercises.length : 10;
      params.intervalSeconds = 60; // Standard EMOM interval
      break;

    case 'AMRAP':
      // Default 10 minutes for AMRAP
      params.durationMinutes = 10;
      break;

    case 'FOR_TIME':
      // User-controlled, no preset duration or rounds
      break;

    case 'STRAIGHT_SETS':
      // No timer parameters needed
      break;
  }

  return params;
}
