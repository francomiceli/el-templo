/**
 * Block Validation
 *
 * Validates individual block coherence per system specs P26.
 * Checks exercise count, budget adherence, contraction mix, and format compatibility.
 */

import type { BlockPlan, BlockRole } from "../types";

/** Validation result for a single block */
export interface BlockValidationResult {
  readonly valid: boolean;
  readonly blockId: string;
  readonly role: BlockRole;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

/** Block roles that allow certain formats (based on actual DB formats) */
const FORMAT_COMPATIBILITY: Record<BlockRole, readonly string[]> = {
  INITIUM: ["EMOM", "Couplet", "Buy-in", "Straight Sets"], // Warmup formats
  NUCLEUS: [
    "Straight Sets",
    "Clusters",
    "Pyramid",
    "Wave Loading",
    "Rest-Pause",
    "EMOM",
  ],
  DEUTEROS_1: ["Straight Sets", "Supersets", "Giant Sets", "Drop Sets", "EMOM"],
  DEUTEROS_2: ["Straight Sets", "Supersets", "Giant Sets", "Drop Sets", "EMOM"],
  // ATHLOS: Time-based dominant (per spec: Time-based > Hybrid > Volume-based)
  ATHLOS: ["AMRAP", "EMOM", "Tabata", "For Time", "Chipper"],
  // EPIKOS: Hybrid dominant (per spec: Hybrid > Structure-based > Time-based)
  EPIKOS: [
    "AMRAP",
    "EMOM",
    "Tabata",
    "For Time",
    "Chipper",
    "Complex",
    "Combos",
    "I Go You Go",
  ],
  // ROM blocks use fixed For Quality format
  ROM_LOWER: ["For Quality"],
  ROM_CORE: ["For Quality"],
  ROM_UPPER: ["For Quality"],
};

/** Budget tolerance percentage (10% overage allowed) */
const BUDGET_TOLERANCE = 0.1;

/**
 * Validate a block's coherence
 *
 * Checks:
 * - Block has at least 1 exercise
 * - Total prescribed reps doesn't exceed repsBudget by >10%
 * - All exercises have non-zero reps or seconds
 * - Format is compatible with block role
 *
 * @param block - The block plan to validate
 * @returns Validation result with warnings and errors
 */
export function validateBlock(block: BlockPlan): BlockValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check 1: At least 1 exercise
  if (block.exercises.length === 0) {
    errors.push("Block has no exercises");
  }

  // Check 2: Total reps within budget (+10% tolerance)
  // Skip for INITIUM - per spec line 506, INITIUM doesn't use reps_budget (warmup/skill prep)
  if (block.role !== "INITIUM") {
    const totalReps = block.exercises.reduce((sum, ex) => sum + ex.reps, 0);
    const maxAllowed = block.repsBudget * (1 + BUDGET_TOLERANCE);

    if (totalReps > maxAllowed) {
      warnings.push(
        `Total reps (${totalReps}) exceeds budget (${block.repsBudget}) by more than 10%`,
      );
    } else if (totalReps > block.repsBudget) {
      warnings.push(
        `Total reps (${totalReps}) slightly exceeds budget (${block.repsBudget})`,
      );
    }
  }

  // Check 3: All exercises have non-zero prescription
  for (const ex of block.exercises) {
    if (ex.reps === 0 && ex.seconds === 0) {
      warnings.push(
        `Exercise "${ex.name}" has no prescription (0 reps and 0 seconds)`,
      );
    }
  }

  // Check 4: Format compatible with block role
  const allowedFormats = FORMAT_COMPATIBILITY[block.role] ?? [];
  const formatCompatible = allowedFormats.some(
    (f) =>
      block.format.name.toLowerCase().includes(f.toLowerCase()) ||
      f.toLowerCase().includes(block.format.name.toLowerCase()),
  );

  // Use lenient matching - just warn if format name doesn't match known patterns
  if (!formatCompatible && allowedFormats.length > 0) {
    warnings.push(
      `Format "${block.format.name}" may not be optimal for ${block.role} block`,
    );
  }

  // Check 5: Reps budget is reasonable (skip for INITIUM which uses 0)
  if (block.role !== "INITIUM" && block.repsBudget <= 0) {
    errors.push(`Invalid reps budget: ${block.repsBudget}`);
  }

  // Check 6: Intensity is in valid range
  if (block.intensity < 0 || block.intensity > 100) {
    errors.push(`Intensity ${block.intensity} out of range [0, 100]`);
  }

  return {
    valid: errors.length === 0,
    blockId: block.blockId,
    role: block.role,
    warnings,
    errors,
  };
}
