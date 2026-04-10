/**
 * Session Validation
 *
 * Validates complete session coherence per system specs P37-P38.
 * Checks block count, block validity, deduplication, intensity progression.
 */

import type { DaySession, BlockRole } from "../types";
import { validateBlock, BlockValidationResult } from "./block-validator";

/** Validation result for a complete session */
export interface SessionValidationResult {
  readonly valid: boolean;
  readonly dayId: string;
  readonly blockResults: readonly BlockValidationResult[];
  readonly sessionWarnings: readonly string[];
  readonly sessionErrors: readonly string[];
}

/** Expected block count range */
const MIN_BLOCKS = 4;
const MAX_BLOCKS = 5;

/** Expected intensity ranges per block role (approximate) */
const INTENSITY_RANGES: Record<BlockRole, { min: number; max: number }> = {
  INITIUM: { min: 10, max: 40 },
  NUCLEUS: { min: 60, max: 95 },
  DEUTEROS_1: { min: 50, max: 85 },
  DEUTEROS_2: { min: 50, max: 85 },
  ATHLOS: { min: 30, max: 70 },
  EPIKOS: { min: 30, max: 70 },
  // ROM blocks use fixed moderate intensity
  ROM_LOWER: { min: 30, max: 70 },
  ROM_CORE: { min: 30, max: 70 },
  ROM_UPPER: { min: 30, max: 70 },
};

/**
 * Validate a complete session's coherence
 *
 * Checks:
 * - Session has 4-5 blocks
 * - All blocks pass block validation
 * - No duplicate exercises across blocks
 * - Intensity progression makes sense
 * - Route diversity (not all blocks on same route)
 *
 * @param session - The day session to validate
 * @returns Validation result with block results and session-level issues
 */
export function validateSession(session: DaySession): SessionValidationResult {
  const sessionWarnings: string[] = [];
  const sessionErrors: string[] = [];
  const blockResults: BlockValidationResult[] = [];

  // Detect ROM session (3 body-zone blocks, different structure from regular)
  const isRomSession =
    session.sessionMode === "rom" ||
    session.blocks.some((b) => b.role.startsWith("ROM_"));

  // Check 1: Block count (ROM = 4: INITIUM + 3 zones, regular = 4-5)
  if (isRomSession) {
    if (session.blocks.length !== 4) {
      sessionErrors.push(
        `ROM session has ${session.blocks.length} blocks (expected: 4)`,
      );
    }
  } else if (session.blocks.length < MIN_BLOCKS) {
    sessionErrors.push(
      `Session has only ${session.blocks.length} blocks (minimum: ${MIN_BLOCKS})`,
    );
  } else if (session.blocks.length > MAX_BLOCKS) {
    sessionWarnings.push(
      `Session has ${session.blocks.length} blocks (expected: ${MIN_BLOCKS}-${MAX_BLOCKS})`,
    );
  }

  // Check 2: Validate each block
  for (const block of session.blocks) {
    const result = validateBlock(block);
    blockResults.push(result);
  }

  // Check 3: No duplicate exercises across blocks
  const allExerciseIds = new Set<number>();
  const duplicates: string[] = [];

  for (const block of session.blocks) {
    for (const ex of block.exercises) {
      if (allExerciseIds.has(ex.exerciseId)) {
        duplicates.push(`${ex.name} (id: ${ex.exerciseId})`);
      } else {
        allExerciseIds.add(ex.exerciseId);
      }
    }
  }

  if (duplicates.length > 0) {
    sessionWarnings.push(
      `Duplicate exercises across blocks: ${duplicates.join(", ")}`,
    );
  }

  // Check 4: Intensity progression
  for (const block of session.blocks) {
    const expected = INTENSITY_RANGES[block.role];
    if (expected) {
      if (block.intensity < expected.min) {
        sessionWarnings.push(
          `${block.role} intensity (${block.intensity}) below expected range (${expected.min}-${expected.max})`,
        );
      } else if (block.intensity > expected.max) {
        sessionWarnings.push(
          `${block.role} intensity (${block.intensity}) above expected range (${expected.min}-${expected.max})`,
        );
      }
    }
  }

  // Check 5: Route diversity
  const routes = new Set(session.blocks.map((b) => b.route));
  if (routes.size === 1 && session.blocks.length > 1) {
    sessionWarnings.push(`All blocks use the same route: ${[...routes][0]}`);
  }

  // Check 6: INITIUM should be first (both regular and ROM sessions)
  if (session.blocks.length > 0 && session.blocks[0].role !== "INITIUM") {
    sessionWarnings.push(
      `First block is ${session.blocks[0].role}, expected INITIUM`,
    );
  }

  // Check 7: Final block should be ATHLOS or EPIKOS (regular sessions only)
  const lastBlock = session.blocks[session.blocks.length - 1];
  if (
    !isRomSession &&
    lastBlock &&
    lastBlock.role !== "ATHLOS" &&
    lastBlock.role !== "EPIKOS"
  ) {
    sessionWarnings.push(
      `Last block is ${lastBlock.role}, expected ATHLOS or EPIKOS`,
    );
  }

  // Aggregate errors from blocks
  const blockErrors = blockResults.filter((r) => !r.valid);
  if (blockErrors.length > 0) {
    sessionErrors.push(`${blockErrors.length} block(s) failed validation`);
  }

  const valid = sessionErrors.length === 0 && blockErrors.length === 0;

  return {
    valid,
    dayId: session.dayId,
    blockResults,
    sessionWarnings,
    sessionErrors,
  };
}

/**
 * Validate session and return trace-friendly summary
 *
 * @param session - The session to validate
 * @returns Object suitable for trace event decision field
 */
export function validateSessionForTrace(session: DaySession): {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  errors: string[];
  warnings: string[];
} {
  const result = validateSession(session);

  const allErrors = [
    ...result.sessionErrors,
    ...result.blockResults.flatMap((b) => b.errors),
  ];

  const allWarnings = [
    ...result.sessionWarnings,
    ...result.blockResults.flatMap((b) => b.warnings),
  ];

  return {
    valid: result.valid,
    errorCount: allErrors.length,
    warningCount: allWarnings.length,
    errors: allErrors,
    warnings: allWarnings,
  };
}
