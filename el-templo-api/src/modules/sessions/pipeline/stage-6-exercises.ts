/**
 * Stage 6: Exercise Selection
 *
 * Selects exercises for the block based on route, contraction type,
 * linear difficulty (1-12), and level. Uses fallback ladder when exact matches not found.
 * Uses deterministic ordering by id ASC.
 *
 * Input: BlockContextWithFormat (has route, contractionMix, difficultyBucket, levelGroup)
 * Output: BlockContextWithExercises (adds exercises array)
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../../db/schema";
import type {
  BlockContextWithFormat,
  BlockContextWithExercises,
} from "./context";
import type { Contraction, SelectedExercise } from "../types";
import { createTraceEvent, appendTrace } from "./context";
import {
  selectExercisesWithFallback,
  queryCrossRouteExercises,
  type ExerciseCandidate,
} from "../fallback/exercise-fallback";
import type { FallbackAction } from "../fallback/types";
import {
  getAllowedLevels,
  toContentLevel,
  LEVEL_LINEAR_BASE,
  LEVEL_LINEAR_MIN,
  LEVEL_PROGRESSION,
  type ExerciseLevel,
  type ContentLevel,
} from "./utils/level-mapping";
import {
  isKairos,
  KAIROS_INHERITED_LEVEL,
  KAIROS_DIFICULTAD_LINEAL,
} from "./utils/kairos";

/** Pattern for detecting unilateral exercises from name or position */
const UNILATERAL_PATTERN = /\b(O\.?[AL]|ONE\s*(ARM|LEG))\b/i;

/** Check if an exercise is unilateral based on name and position */
function checkUnilateral(candidate: ExerciseCandidate): boolean {
  if (UNILATERAL_PATTERN.test(candidate.name)) return true;
  if (candidate.position && UNILATERAL_PATTERN.test(candidate.position))
    return true;
  return false;
}

/**
 * Calculate linear difficulty target based on member level, intensity, and difficulty bucket
 *
 * Maps the old bucket system (1-3, "Nivel Superior") to the linear scale (1-12):
 * - Bucket 1/2/3 at member level -> level's linear difficulty range
 * - "Nivel Superior" or intensity >= 85% -> next level's first difficulty
 *
 * @returns { maxDificultadLineal, targetLevel } for exercise selection
 */
function getLinearDifficultyTarget(
  memberLevel: ExerciseLevel,
  intensity: number,
  difficultyBucket: string,
): {
  minDificultadLineal: number;
  maxDificultadLineal: number;
  targetLevel: ContentLevel;
} {
  // Phase 129 (D-03): resolve the member level to its content level (kairos ->
  // alfa) before any content lookup. From here down `level` is a ContentLevel.
  const level = toContentLevel(memberLevel);
  const isNivelSuperior =
    difficultyBucket === "Nivel Superior" ||
    difficultyBucket === "Nivel Superior 1";
  const currentIndex = LEVEL_PROGRESSION.indexOf(level);

  // Nivel Superior (at intensity >= 85%): shift to next level's first difficulty
  if (isNivelSuperior && intensity >= 85) {
    if (currentIndex < LEVEL_PROGRESSION.length - 1) {
      const nextLevel = LEVEL_PROGRESSION[currentIndex + 1];
      return {
        minDificultadLineal: LEVEL_LINEAR_MIN[nextLevel],
        maxDificultadLineal: LEVEL_LINEAR_BASE[nextLevel] + 1,
        targetLevel: nextLevel,
      };
    }
    // Spartan stays at spartan, max difficulty
    return {
      minDificultadLineal: LEVEL_LINEAR_MIN.spartan,
      maxDificultadLineal: LEVEL_LINEAR_BASE.spartan + 2, // 12
      targetLevel: "spartan",
    };
  }

  // High intensity (>= 90%) without explicit Nivel Superior bucket: also shift up
  if (intensity >= 90) {
    if (currentIndex < LEVEL_PROGRESSION.length - 1) {
      const nextLevel = LEVEL_PROGRESSION[currentIndex + 1];
      return {
        minDificultadLineal: LEVEL_LINEAR_MIN[nextLevel],
        maxDificultadLineal: LEVEL_LINEAR_BASE[nextLevel] + 1,
        targetLevel: nextLevel,
      };
    }
  }

  // Normal case: use bucket within current level's range
  const bucket = parseInt(difficultyBucket, 10);
  const effectiveBucket = isNaN(bucket) ? 3 : bucket;

  return {
    minDificultadLineal: LEVEL_LINEAR_MIN[level],
    maxDificultadLineal: LEVEL_LINEAR_BASE[level] + effectiveBucket,
    targetLevel: level,
  };
}

/**
 * Convert fallback action to trace event description
 */
function actionToTraceDescription(action: FallbackAction): string {
  switch (action.type) {
    case "DIFFICULTY_RELAXED":
      return `Relaxed difficulty from ${action.from} to ${action.to}`;
    case "EFFORT_RELAXED":
      return `Included exercises with empty effort for ${action.contraction}`;
    case "SCOPE_WIDENED":
      return `Widened scope from ${action.from} to ${action.to}`;
    case "LEVEL_WIDENED":
      return `Widened levels from [${action.from.join(",")}] to [${action.to.join(",")}]`;
    case "CONTRACTION_SUBSTITUTED":
      return `Substituted contraction from ${action.needed} to ${action.used}`;
    case "CATEGORY_MATCHED":
      return `Matched category "${action.category}" across routes (original route: ${action.originalRoute})`;
    case "ROUTE_DROPPED":
      return `Dropped route constraint (original: ${action.originalRoute}), searching all routes`;
  }
}

/**
 * Select exercises for each contraction type in the mix
 *
 * Uses fallback ladder for graceful degradation when exact matches unavailable.
 * If a contraction type completely fails, emit WARNING but continue with what's available.
 * Deduplicates exercises by name across contraction types to prevent repeats.
 *
 * @param ctx - Context with format selected
 * @param db - Database connection for exercise lookup
 * @returns Context enriched with selected exercises
 */
export async function selectExercises(
  ctx: BlockContextWithFormat,
  db: MySql2Database<typeof schema>,
): Promise<BlockContextWithExercises> {
  const selectedExercises: SelectedExercise[] = [];
  let updatedCtx = ctx;
  let anyFailed = false;

  // Track already-selected exercise names to prevent duplicates across contractions
  const excludedNames: Set<string> = new Set();

  // Resolve allowed levels + linear difficulty target.
  //
  // Kairos (D-03): inherit Alfa content at the lowest linear rung. Restrict
  // candidates to level='alfa' and force dificultadLineal min=max=1, bypassing
  // the Nivel Superior / high-intensity shift entirely. dificultadLineal=1 (not
  // the 1-3 `difficulty` bucket) is the column the candidate query filters on.
  // This is a pure additive branch: the non-kairos path below is unchanged (D-07).
  let allowedLevels: ContentLevel[];
  let minDificultadLineal: number;
  let maxDificultadLineal: number;
  let targetLevel: ContentLevel;

  if (isKairos(ctx.memberLevel)) {
    allowedLevels = [KAIROS_INHERITED_LEVEL];
    minDificultadLineal = KAIROS_DIFICULTAD_LINEAL;
    maxDificultadLineal = KAIROS_DIFICULTAD_LINEAL;
    targetLevel = KAIROS_INHERITED_LEVEL;

    const kairosInheritTrace = createTraceEvent(
      updatedCtx,
      "KAIROS_INHERIT_ALFA",
      "INFO",
      {
        allowedLevels,
        minDificultadLineal,
        maxDificultadLineal,
        targetLevel,
        reason:
          "Kairos inherits Alfa exercises at dificultadLineal=1 (D-03), bypassing the intensity shift",
      },
    );
    updatedCtx = appendTrace(updatedCtx, kairosInheritTrace);
  } else {
    allowedLevels = getAllowedLevels(ctx.levelGroup);
    // Calculate linear difficulty target (handles Nivel Superior and high-intensity shifts)
    const target = getLinearDifficultyTarget(
      ctx.memberLevel,
      ctx.intensity,
      ctx.difficultyBucket,
    );
    minDificultadLineal = target.minDificultadLineal;
    maxDificultadLineal = target.maxDificultadLineal;
    targetLevel = target.targetLevel;
  }

  // Add trace if level was shifted. Compare against the resolved content level
  // so the kairos -> alfa content resolution (Phase 129, D-03) is NOT mistaken
  // for an intensity-driven shift.
  if (targetLevel !== toContentLevel(ctx.memberLevel)) {
    const shiftTrace = createTraceEvent(
      updatedCtx,
      "HIGH_INTENSITY_LEVEL_SHIFT",
      "INFO",
      {
        fromLevel: ctx.memberLevel,
        toLevel: targetLevel,
        intensity: ctx.intensity,
        maxDificultadLineal,
        difficultyBucket: ctx.difficultyBucket,
        reason: ctx.difficultyBucket.includes("Nivel Superior")
          ? `Nivel Superior at ${ctx.intensity}% maps to ${targetLevel} level`
          : `Intensity ${ctx.intensity}% >= 90% triggers level shift`,
      },
    );
    updatedCtx = appendTrace(updatedCtx, shiftTrace);
  }

  // Cross-route exercise selection (2+1 split) for non-INITIUM blocks with 3 exercises
  const totalExercises =
    ctx.contractionMix.CON + ctx.contractionMix.EXC + ctx.contractionMix.ISO;
  const adjustedMix = { ...ctx.contractionMix };

  if (ctx.role !== "INITIUM" && totalExercises === 3 && ctx.pattern2) {
    // Find the last contraction type with count > 0 (order: CON, EXC, ISO)
    const contractionOrder: Contraction[] = ["CON", "EXC", "ISO"];
    let crossContraction: Contraction | null = null;
    for (let i = contractionOrder.length - 1; i >= 0; i--) {
      if (adjustedMix[contractionOrder[i]] > 0) {
        crossContraction = contractionOrder[i];
        break;
      }
    }

    if (crossContraction) {
      const crossPool = await queryCrossRouteExercises(
        db,
        ctx.pattern2,
        ctx.route,
        crossContraction,
        minDificultadLineal,
        maxDificultadLineal,
        allowedLevels,
        excludedNames,
      );

      if (crossPool.length > 0) {
        // Pick first exercise deterministically (sorted by id ASC)
        const sorted = [...crossPool].sort((a, b) => a.id - b.id);
        const picked = sorted[0];

        selectedExercises.push({
          exerciseId: picked.id,
          name: picked.name,
          contraction: picked.contraction,
          difficulty: picked.dificultadLineal,
          crossRoute: true,
          isUnilateral: checkUnilateral(picked),
        });
        excludedNames.add(picked.name);

        // Decrement the contraction count so main loop selects 2 from block route
        adjustedMix[crossContraction] -= 1;

        const crossTrace = createTraceEvent(
          updatedCtx,
          "CROSS_ROUTE_EXERCISE_SELECTED",
          "INFO",
          {
            pattern2: ctx.pattern2,
            crossContraction,
            exercise: { id: picked.id, name: picked.name },
            sourceRoute: ctx.route,
          },
        );
        updatedCtx = appendTrace(updatedCtx, crossTrace);
      } else {
        // pattern2 is route-specific or no cross-route candidates available
        const emptyTrace = createTraceEvent(
          updatedCtx,
          "CROSS_ROUTE_POOL_EMPTY",
          "INFO",
          {
            pattern2: ctx.pattern2,
            route: ctx.route,
            reason:
              "No cross-route exercises found for pattern2; all 3 from block route",
          },
        );
        updatedCtx = appendTrace(updatedCtx, emptyTrace);
      }
    }
  }

  // Process each contraction type (using adjusted mix after cross-route selection)
  for (const contraction of ["CON", "EXC", "ISO"] as const) {
    const requiredCount = adjustedMix[contraction];

    if (requiredCount === 0) {
      continue; // Skip if no exercises needed for this type
    }

    // Use fallback ladder for exercise selection, excluding already-selected names
    const baseRequirements = {
      route: ctx.route,
      contraction,
      minDificultadLineal, // Linear difficulty scale (1-12) lower bound
      maxDificultadLineal, // Linear difficulty scale (1-12) upper bound
      allowedLevels, // For Tier 2+ fallback
      count: requiredCount,
      levelGroup: ctx.levelGroup,
      memberLevel: targetLevel, // For Tier 0 exact match (may be shifted up)
      category: ctx.category, // SPOM category for Tier 5 category-based fallback
      excludeNames: excludedNames, // Prevent duplicate exercise names
    };

    // Kairos: los ejercicios deben ser dificultadLineal=1, con fallback a =2 SÓLO si
    // la ruta no tiene candidato dl=1 — nunca el blowout del Tier-2 del ladder genérico
    // (que ensancha la dificultad a 1..999 y metería un ejercicio difícil en un bloque
    // de principiante). Una política TIGHT (exacto + misma categoría, sin ensanchar
    // dificultad/nivel/ruta) lo mantiene en contenido alfa: prueba dl=1, después dl=2.
    // El path no-kairos queda igual (D-07).
    let result;
    if (isKairos(ctx.memberLevel)) {
      const KAIROS_TIGHT_POLICY = {
        maxTier: 1,
        relaxationOrder: ["category"],
      } as const;
      result = await selectExercisesWithFallback(
        { ...baseRequirements, minDificultadLineal: 1, maxDificultadLineal: 1 },
        db,
        KAIROS_TIGHT_POLICY,
      );
      if (result.status === "failed") {
        result = await selectExercisesWithFallback(
          {
            ...baseRequirements,
            minDificultadLineal: 2,
            maxDificultadLineal: 2,
          },
          db,
          KAIROS_TIGHT_POLICY,
        );
      }
    } else {
      result = await selectExercisesWithFallback(baseRequirements, db);
    }

    // Handle fallback result
    if (result.status === "failed") {
      anyFailed = true;

      // Emit warning trace for failed contraction type
      const warningTrace = createTraceEvent(
        updatedCtx,
        "EXERCISE_SELECTION_FAILED",
        "WARNING",
        {
          contraction,
          required: requiredCount,
          found: 0,
          route: ctx.route,
          fallbackTier: result.tier,
          actions: result.actions.map(actionToTraceDescription),
        },
      );
      updatedCtx = appendTrace(updatedCtx, warningTrace);
      continue; // Continue with other contraction types
    }

    // Add fallback traces if any relaxation was applied
    if (result.status === "fallback") {
      for (const action of result.actions) {
        const fallbackTrace = createTraceEvent(
          updatedCtx,
          "EXERCISE_FALLBACK",
          "WARNING",
          {
            contraction,
            tier: action.tier,
            action: action.type,
            description: actionToTraceDescription(action),
          },
        );
        updatedCtx = appendTrace(updatedCtx, fallbackTrace);
      }
    }

    // Add selected exercises to results and track names for deduplication
    for (const ex of result.data) {
      selectedExercises.push({
        exerciseId: ex.id,
        name: ex.name,
        contraction: ex.contraction,
        difficulty: ex.dificultadLineal, // Use linear difficulty
        isUnilateral: checkUnilateral(ex),
      });
      // Add to excluded names for subsequent contraction queries
      excludedNames.add(ex.name);
    }

    // Emit success trace for this contraction type
    const traceEvent = createTraceEvent(
      updatedCtx,
      "EXERCISES_SELECTED",
      "INFO",
      {
        contraction,
        required: requiredCount,
        selected: result.data.length,
        fallbackTier: result.tier,
        usedFallback: result.status === "fallback",
        exercises: result.data.map((e) => ({ id: e.id, name: e.name })),
      },
    );
    updatedCtx = appendTrace(updatedCtx, traceEvent);
  }

  // If no exercises at all, throw error
  if (selectedExercises.length === 0) {
    const errorTrace = createTraceEvent(
      updatedCtx,
      "EXERCISE_SELECTION_TOTAL_FAILURE",
      "ERROR",
      {
        route: ctx.route,
        contractionMix: ctx.contractionMix,
      },
    );
    updatedCtx = appendTrace(updatedCtx, errorTrace);
    throw new Error(
      `No exercises found for any contraction type: route=${ctx.route}, mix=${JSON.stringify(ctx.contractionMix)}`,
    );
  }

  // Emit summary trace if partial failure
  if (anyFailed) {
    const summaryTrace = createTraceEvent(
      updatedCtx,
      "EXERCISE_SELECTION_PARTIAL",
      "WARNING",
      {
        totalRequired:
          ctx.contractionMix.CON +
          ctx.contractionMix.EXC +
          ctx.contractionMix.ISO,
        totalSelected: selectedExercises.length,
      },
    );
    updatedCtx = appendTrace(updatedCtx, summaryTrace);
  }

  // Check for all-ISO block when mix expected non-ISO exercises
  const expectedNonISO = ctx.contractionMix.CON + ctx.contractionMix.EXC;
  const actualNonISO = selectedExercises.filter(
    (e) => e.contraction !== "ISO",
  ).length;
  const allISO = actualNonISO === 0 && selectedExercises.length > 0;

  if (allISO && expectedNonISO > 0) {
    // All exercises are ISO when we expected some non-ISO
    // This can happen when CON/EXC fallbacks substitute to ISO
    const isoWarningTrace = createTraceEvent(
      updatedCtx,
      "CONTRACTION_MIX_ALL_ISO",
      "WARNING",
      {
        expected: ctx.contractionMix,
        actualCounts: {
          CON: selectedExercises.filter((e) => e.contraction === "CON").length,
          EXC: selectedExercises.filter((e) => e.contraction === "EXC").length,
          ISO: selectedExercises.filter((e) => e.contraction === "ISO").length,
        },
        message: "All exercises are isometric; mix expected non-ISO exercises",
      },
    );
    updatedCtx = appendTrace(updatedCtx, isoWarningTrace);
  }

  return {
    ...updatedCtx,
    exercises: selectedExercises,
  };
}
