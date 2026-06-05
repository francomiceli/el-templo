/**
 * Fallback System Types
 *
 * Discriminated unions for fallback results. All fallback decisions
 * are traced for auditability in the pipeline.
 */

import type { Contraction, LevelGroup, ContentLevel } from "../types";

// Phase 129 (D-03): the fallback system operates purely on exercise *content*
// levels (queried against exercises.level), never on the kairos member level —
// kairos resolves to Alfa content upstream before fallback runs. So every level
// field here is a ContentLevel (kairos-excluded).
export type { ContentLevel } from "../types";

/**
 * Fallback result discriminated union
 *
 * - exact: Found matches without any relaxation
 * - fallback: Found matches after relaxing requirements
 * - failed: No matches found even after max relaxation
 */
export type FallbackResult<T> =
  | { status: "exact"; data: T[]; tier: 0; actions: [] }
  | { status: "fallback"; data: T[]; tier: number; actions: FallbackAction[] }
  | { status: "failed"; data: []; tier: number; actions: FallbackAction[] };

/**
 * Fallback action discriminated union
 *
 * Records what relaxation was applied at each tier.
 */
export type FallbackAction =
  | { type: "DIFFICULTY_RELAXED"; tier: number; from: number; to: number }
  | { type: "EFFORT_RELAXED"; tier: number; contraction: Contraction }
  | {
      type: "LEVEL_WIDENED";
      tier: number;
      from: readonly ContentLevel[];
      to: readonly ContentLevel[];
    }
  | { type: "SCOPE_WIDENED"; tier: number; from: string; to: string }
  | {
      type: "CONTRACTION_SUBSTITUTED";
      tier: number;
      needed: Contraction;
      used: Contraction;
    }
  | {
      type: "CATEGORY_MATCHED";
      tier: number;
      category: string;
      originalRoute: string;
    }
  | {
      type: "ROUTE_DROPPED";
      tier: number;
      originalRoute: string;
    };

/**
 * Fallback policy configuration
 *
 * Controls how many tiers to attempt and in what order to relax constraints.
 */
export interface FallbackPolicy {
  readonly maxTier: number;
  readonly relaxationOrder: readonly (
    | "difficulty"
    | "level"
    | "scope"
    | "contraction"
    | "category"
    | "route"
  )[];
}

/**
 * Default exercise fallback policy
 *
 * Tier 0: Exact match
 * Tier 1: Relax difficulty
 * Tier 1.5: Include empty effort exercises
 * Tier 2: Widen scope (search parent category — same level)
 * Tier 3: Widen level filter (graduated — nearby levels first)
 * Tier 4: Substitute contraction type
 */
export const DEFAULT_EXERCISE_POLICY: FallbackPolicy = {
  maxTier: 6,
  relaxationOrder: [
    "category",
    "difficulty",
    "scope",
    "level",
    "contraction",
    "route",
  ],
};

/**
 * Default format fallback policy
 *
 * Tier 0: Exact match
 * Tier 1: Relax intensity (+/- 5)
 * Tier 2: Use default format
 */
export const DEFAULT_FORMAT_POLICY: FallbackPolicy = {
  maxTier: 2,
  relaxationOrder: ["difficulty", "level"], // intensity relaxation handled specially
};

/**
 * Exercise requirements for fallback selection
 */
export interface ExerciseRequirements {
  readonly route: string;
  readonly contraction: Contraction;
  /** Linear difficulty scale (1-12) - min allowed difficulty for exercise selection */
  readonly minDificultadLineal: number;
  /** Linear difficulty scale (1-12) - max allowed difficulty for exercise selection */
  readonly maxDificultadLineal: number;
  readonly allowedLevels: readonly ContentLevel[];
  readonly count: number;
  readonly levelGroup: LevelGroup;
  readonly memberLevel: ContentLevel;
  /** SPOM category for category-based fallback (e.g., "Empuje", "Jalón") */
  readonly category?: string;
  /** Exercise names to exclude (for deduplication across contractions) */
  readonly excludeNames?: Set<string>;
}

/**
 * Format requirements for fallback selection
 */
export interface FormatRequirements {
  readonly block: "initium" | "nucleus" | "deuteros" | "athlos" | "epikos";
  readonly level: "alfa" | "delta" | "sigma" | "omega";
  readonly intensity: number;
}
