/**
 * ExerciseSwapService - Exercise Replacement & Pool Logic
 *
 * Handles exercise pool queries, exercise swaps with re-prescription,
 * mobility pool queries, and mobility exercise swaps.
 * Extracted from AdminEditService to isolate swap-specific logic.
 *
 * All mutations:
 * 1. Auto-revert approved sessions to pending_review
 * 2. Log to session_edit_logs for audit trail
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, or, like, lte, asc, notInArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { PrescribeService } from "./prescribe-service";
import { ROUTE_TO_MOBILITY_ROUTES } from "../sessions/pipeline/utils/mobility-routes";
import { revertToPendingIfApproved, logEdit } from "./session-edit-helpers";
import type {
  ExercisePoolParams,
  ExercisePoolItem,
  SwapExerciseParams,
} from "./edit-types";

export class ExerciseSwapService {
  private prescribeService: PrescribeService;

  constructor(private db: MySql2Database<typeof schema>) {
    this.prescribeService = new PrescribeService();
  }

  // =========================================================================
  // getExercisePool - Query exercises for swap candidates
  // =========================================================================

  async getExercisePool(
    params: ExercisePoolParams,
  ): Promise<ExercisePoolItem[]> {
    const {
      contraction,
      route,
      pattern,
      pattern2,
      blockRole,
      excludeExerciseIds,
      targetDifficulty,
    } = params;

    // INITIUM uses FLOW pattern / Movilidad category instead of route-based lookup
    // (route='INITIUM' is a marker, not a real route in the exercises table)
    const isInitium = blockRole === "INITIUM";

    const primaryConditions = isInitium
      ? [
          or(
            like(schema.exercises.pattern, "%FLOW%"),
            eq(schema.exercises.category, "Movilidad"),
          )!,
        ]
      : [eq(schema.exercises.route, route)];

    if (contraction) {
      primaryConditions.push(
        eq(schema.exercises.effort, contraction.toUpperCase()),
      );
    }
    // INITIUM is level-independent — skip difficulty cap
    if (!isInitium && params.maxDifficulty !== undefined) {
      primaryConditions.push(
        lte(schema.exercises.dificultadLineal, params.maxDifficulty),
      );
    }

    // Get primary exercises
    const primaryExercises = await this.db
      .select({
        id: schema.exercises.id,
        exercise: schema.exercises.exercise,
        effort: schema.exercises.effort,
        dificultadLineal: schema.exercises.dificultadLineal,
        pattern: schema.exercises.pattern,
        category: schema.exercises.category,
        route: schema.exercises.route,
        videoUrl: schema.exercises.videoUrl,
      })
      .from(schema.exercises)
      .where(and(...primaryConditions));

    // Label primary exercises
    let pool: ExercisePoolItem[] = primaryExercises.map((ex) => ({
      ...ex,
      patternSource: "pattern_1" as const,
    }));

    // Cross-route logic for non-INITIUM blocks:
    // Include pattern_2 exercises from a different route (per 13-08)
    if (!isInitium && pattern2) {
      const crossConditions = [eq(schema.exercises.pattern, pattern2)];
      if (contraction) {
        crossConditions.push(
          eq(schema.exercises.effort, contraction.toUpperCase()),
        );
      }
      if (params.maxDifficulty !== undefined) {
        crossConditions.push(
          lte(schema.exercises.dificultadLineal, params.maxDifficulty),
        );
      }

      const crossExercises = await this.db
        .select({
          id: schema.exercises.id,
          exercise: schema.exercises.exercise,
          effort: schema.exercises.effort,
          dificultadLineal: schema.exercises.dificultadLineal,
          pattern: schema.exercises.pattern,
          category: schema.exercises.category,
          route: schema.exercises.route,
          videoUrl: schema.exercises.videoUrl,
        })
        .from(schema.exercises)
        .where(and(...crossConditions));

      pool = pool.concat(
        crossExercises
          .filter((ex) => ex.route !== route) // Only include if actually cross-route
          .map((ex) => ({
            ...ex,
            patternSource: "pattern_2" as const,
          })),
      );
    }

    // Exclude exercises already in the block
    if (excludeExerciseIds.length > 0) {
      pool = pool.filter((ex) => !excludeExerciseIds.includes(ex.id));
    }

    // Sort by closest linear difficulty to target
    if (targetDifficulty !== undefined) {
      pool.sort(
        (a, b) =>
          Math.abs(a.dificultadLineal - targetDifficulty) -
          Math.abs(b.dificultadLineal - targetDifficulty),
      );
    } else {
      // Default: sort by linear difficulty ascending
      pool.sort((a, b) => a.dificultadLineal - b.dificultadLineal);
    }

    return pool;
  }

  // =========================================================================
  // searchExercises - Search all exercises by name
  // =========================================================================

  async searchExercises(params: {
    query: string;
    contraction?: string;
    excludeExerciseIds?: number[];
    limit: number;
  }): Promise<ExercisePoolItem[]> {
    const { query, contraction, excludeExerciseIds = [], limit } = params;

    const conditions = [like(schema.exercises.exercise, `%${query}%`)];

    if (contraction) {
      conditions.push(eq(schema.exercises.effort, contraction.toUpperCase()));
    }

    if (excludeExerciseIds.length > 0) {
      conditions.push(notInArray(schema.exercises.id, excludeExerciseIds));
    }

    const results = await this.db
      .select({
        id: schema.exercises.id,
        exercise: schema.exercises.exercise,
        effort: schema.exercises.effort,
        dificultadLineal: schema.exercises.dificultadLineal,
        pattern: schema.exercises.pattern,
        category: schema.exercises.category,
        route: schema.exercises.route,
        videoUrl: schema.exercises.videoUrl,
      })
      .from(schema.exercises)
      .where(and(...conditions))
      .orderBy(asc(schema.exercises.exercise))
      .limit(limit);

    return results.map((ex) => ({
      ...ex,
      patternSource: "pattern_1" as const,
    }));
  }

  // =========================================================================
  // swapExercise - Replace one exercise with another
  // =========================================================================

  async swapExercise(params: SwapExerciseParams) {
    const { sessionId, blockId, oldPrescriptionId, newExerciseId, userId } =
      params;

    // Look up the new exercise
    const [newExercise] = await this.db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.id, newExerciseId));

    if (!newExercise) {
      throw new Error("Ejercicio no encontrado");
    }

    // Get the old prescription to preserve sortOrder
    const [oldPrescription] = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.id, oldPrescriptionId));

    if (!oldPrescription) {
      throw new Error("Prescripcion no encontrada");
    }

    // Get block context for re-prescription
    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.id, blockId));

    if (!block) {
      throw new Error("Bloque no encontrado");
    }

    // Get all exercises currently in the block (replace old with new for prescription context)
    const currentPrescriptions = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    const existingExercises = currentPrescriptions.map((p) => ({
      id: p.id === oldPrescriptionId ? newExercise.id : p.exerciseId,
      name: p.id === oldPrescriptionId ? newExercise.exercise : p.exerciseName,
      contraction:
        p.id === oldPrescriptionId ? newExercise.effort : p.contraction,
      difficulty:
        p.id === oldPrescriptionId
          ? newExercise.dificultadLineal
          : (p.difficulty ?? 1),
    }));

    // Re-prescribe the swapped exercise using algorithm
    const prescription = this.prescribeService.prescribeExerciseInBlock({
      exercise: {
        id: newExercise.id,
        name: newExercise.exercise,
        contraction: newExercise.effort,
        difficulty: newExercise.dificultadLineal,
      },
      blockFormatName: block.formatName,
      blockRepsBudget: block.repsBudget,
      blockIntensity: block.intensity,
      existingExercises,
    });

    // Update the prescription row
    await this.db
      .update(schema.sessionPrescriptions)
      .set({
        exerciseId: newExercise.id,
        exerciseName: newExercise.exercise,
        contraction: newExercise.effort,
        reps: prescription.reps,
        seconds: prescription.seconds,
        rest: prescription.rest,
        notes: prescription.notes,
        difficulty: newExercise.dificultadLineal,
      })
      .where(eq(schema.sessionPrescriptions.id, oldPrescriptionId));

    // Auto-revert and log
    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "exercise_swap");

    // Return updated prescription data
    return {
      id: oldPrescriptionId,
      exerciseId: newExercise.id,
      exerciseName: newExercise.exercise,
      contraction: newExercise.effort,
      reps: prescription.reps,
      seconds: prescription.seconds,
      rest: prescription.rest,
      notes: prescription.notes,
      difficulty: newExercise.dificultadLineal,
      sortOrder: oldPrescription.sortOrder,
    };
  }

  // =========================================================================
  // getMobilityPool - Query MOVILIDAD exercises for mobility swap
  // =========================================================================

  async getMobilityPool(blockRoute: string): Promise<ExercisePoolItem[]> {
    // Query all MOVILIDAD pattern exercises
    const allMobility = await this.db
      .select({
        id: schema.exercises.id,
        exercise: schema.exercises.exercise,
        effort: schema.exercises.effort,
        dificultadLineal: schema.exercises.dificultadLineal,
        pattern: schema.exercises.pattern,
        category: schema.exercises.category,
        route: schema.exercises.route,
        mobilityRelated: schema.exercises.mobilityRelated,
        videoUrl: schema.exercises.videoUrl,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.pattern, "MOVILIDAD"));

    // Split into route-relevant and other
    const relatedRoutes = ROUTE_TO_MOBILITY_ROUTES[blockRoute] || [];
    const relevant: ExercisePoolItem[] = [];
    const other: ExercisePoolItem[] = [];

    for (const ex of allMobility) {
      const isRelevant =
        relatedRoutes.length > 0 &&
        ex.mobilityRelated !== null &&
        relatedRoutes.some((r) => ex.mobilityRelated!.includes(r));

      const item: ExercisePoolItem = {
        id: ex.id,
        exercise: ex.exercise,
        effort: ex.effort,
        dificultadLineal: ex.dificultadLineal,
        pattern: ex.pattern,
        category: ex.category,
        route: ex.route,
        patternSource: isRelevant ? "pattern_1" : "pattern_2",
        videoUrl: ex.videoUrl,
      };

      if (isRelevant) {
        relevant.push(item);
      } else {
        other.push(item);
      }
    }

    // Route-relevant first, then all others — sorted by difficulty ascending within each group
    relevant.sort((a, b) => a.dificultadLineal - b.dificultadLineal);
    other.sort((a, b) => a.dificultadLineal - b.dificultadLineal);
    return [...relevant, ...other];
  }

  // =========================================================================
  // swapMobilityExercise - Replace mobility exercise in a block
  // =========================================================================

  async swapMobilityExercise(params: {
    sessionId: number;
    blockId: number;
    newExerciseId: number;
    userId: number;
  }) {
    const { sessionId, blockId, newExerciseId, userId } = params;

    // Find current mobility prescription in block
    const [currentMobility] = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(
        and(
          eq(schema.sessionPrescriptions.blockId, blockId),
          eq(schema.sessionPrescriptions.exerciseType, "mobility"),
        ),
      );

    if (!currentMobility) {
      throw new Error("No hay ejercicio de movilidad en este bloque");
    }

    // Look up new exercise
    const [newExercise] = await this.db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.id, newExerciseId));

    if (!newExercise) {
      throw new Error("Ejercicio no encontrado");
    }

    // Mobility prescription defaults (per user decision: ISO=seconds, CON=reps)
    const isISO = newExercise.effort?.toUpperCase() === "ISO";
    const reps = isISO ? 0 : 10;
    const seconds = isISO ? 20 : 0;

    // Update the prescription
    await this.db
      .update(schema.sessionPrescriptions)
      .set({
        exerciseId: newExercise.id,
        exerciseName: newExercise.exercise,
        contraction: newExercise.effort,
        reps,
        seconds,
        rest: 0,
        notes: null,
        difficulty: null,
        // Keep exerciseType='mobility' and sortOrder=999
      })
      .where(eq(schema.sessionPrescriptions.id, currentMobility.id));

    // Auto-revert and log
    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "mobility_swap");

    return {
      id: currentMobility.id,
      exerciseId: newExercise.id,
      exerciseName: newExercise.exercise,
      contraction: newExercise.effort,
      reps,
      seconds,
      rest: 0,
      notes: null,
      difficulty: null,
      sortOrder: currentMobility.sortOrder,
      exerciseType: "mobility",
    };
  }
}
