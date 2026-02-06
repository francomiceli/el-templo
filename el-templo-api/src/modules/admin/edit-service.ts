/**
 * AdminEditService - Session Editing Business Logic
 *
 * Provides all exercise-level CRUD operations for admin session editing:
 * - Exercise pool query (swap candidates)
 * - Exercise swap with re-prescription
 * - Prescription field updates
 * - Block format change with automatic re-prescription
 * - Add/remove exercises
 * - Reset to algorithm snapshot
 * - Compatible formats query
 *
 * All mutations:
 * 1. Auto-revert approved sessions to pending_review
 * 2. Log to session_edit_logs for audit trail
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, inArray, gt, asc, desc, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { PrescribeService } from './prescribe-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExercisePoolParams {
  /** Block DB id to get context from */
  blockId: number;
  /** Optional contraction type filter (CON/EXC/ISO) */
  contraction?: string;
  /** Route to filter exercises by */
  route: string;
  /** Block's pattern field (primary pattern) */
  pattern: string;
  /** Block's secondary pattern for cross-route (if applicable) */
  pattern2?: string | null;
  /** Block role (INITIUM has no cross-route) */
  blockRole: string;
  /** Exercise IDs already in the block (to exclude) */
  excludeExerciseIds: number[];
  /** Target difficulty to sort by proximity */
  targetDifficulty?: number;
}

export interface ExercisePoolItem {
  id: number;
  exercise: string;
  effort: string;
  dificultadLineal: number;
  pattern: string;
  route: string;
  /** Indicates if exercise comes from primary or cross-route pattern */
  patternSource: 'pattern_1' | 'pattern_2';
}

export interface SwapExerciseParams {
  sessionId: number;
  blockId: number;
  oldPrescriptionId: number;
  newExerciseId: number;
  userId: number;
}

export interface UpdatePrescriptionParams {
  sessionId: number;
  blockId: number;
  prescriptionId: number;
  userId: number;
  fields: {
    reps?: number;
    seconds?: number;
    rest?: number;
    notes?: string | null;
  };
}

export interface ChangeBlockFormatParams {
  sessionId: number;
  blockId: number;
  newFormatId: number;
  newFormatName: string;
  userId: number;
}

export interface AddExerciseParams {
  sessionId: number;
  blockId: number;
  exerciseId: number;
  userId: number;
}

export interface RemoveExerciseParams {
  sessionId: number;
  blockId: number;
  prescriptionId: number;
  userId: number;
}

export interface ResetToAlgorithmParams {
  sessionId: number;
  userId: number;
}

export interface CompatibleFormatsParams {
  blockRole: string;
  level: string;
  intensity: number;
}

export interface CompatibleFormat {
  formatId: number;
  formatName: string;
  compatibility: number;
}

// Snapshot types matching the structure stored in sessions.algorithmSnapshot
interface SnapshotBlock {
  blockId: string;
  role: string;
  route: string;
  pattern: string;
  intensity: number;
  repsBudget: number;
  formatId: number;
  formatName: string;
  exerciseCount: number;
  sortOrder: number;
  exercises: SnapshotExercise[];
}

interface SnapshotExercise {
  exerciseId: number;
  exerciseName: string;
  contraction: string;
  reps: number;
  seconds: number;
  rest: number;
  notes: string | null;
  difficulty: number | null;
  sortOrder: number;
}

interface AlgorithmSnapshot {
  blocks: SnapshotBlock[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AdminEditService {
  private prescribeService: PrescribeService;

  constructor(private db: MySql2Database<typeof schema>) {
    this.prescribeService = new PrescribeService();
  }

  // =========================================================================
  // 1. getExercisePool - Query exercises for swap candidates
  // =========================================================================

  async getExercisePool(params: ExercisePoolParams): Promise<ExercisePoolItem[]> {
    const {
      contraction,
      route,
      pattern,
      pattern2,
      blockRole,
      excludeExerciseIds,
      targetDifficulty,
    } = params;

    // Build primary route query conditions
    const primaryConditions = [
      eq(schema.exercises.route, route),
    ];
    if (contraction) {
      primaryConditions.push(eq(schema.exercises.effort, contraction.toUpperCase()));
    }

    // Get primary route exercises
    let primaryExercises = await this.db
      .select({
        id: schema.exercises.id,
        exercise: schema.exercises.exercise,
        effort: schema.exercises.effort,
        dificultadLineal: schema.exercises.dificultadLineal,
        pattern: schema.exercises.pattern,
        route: schema.exercises.route,
      })
      .from(schema.exercises)
      .where(and(...primaryConditions));

    // Label primary exercises
    let pool: ExercisePoolItem[] = primaryExercises.map(ex => ({
      ...ex,
      patternSource: 'pattern_1' as const,
    }));

    // Cross-route logic for non-INITIUM blocks:
    // Include pattern_2 exercises from a different route (per 13-08)
    if (blockRole !== 'INITIUM' && pattern2) {
      const crossConditions = [
        eq(schema.exercises.pattern, pattern2),
      ];
      if (contraction) {
        crossConditions.push(eq(schema.exercises.effort, contraction.toUpperCase()));
      }

      const crossExercises = await this.db
        .select({
          id: schema.exercises.id,
          exercise: schema.exercises.exercise,
          effort: schema.exercises.effort,
          dificultadLineal: schema.exercises.dificultadLineal,
          pattern: schema.exercises.pattern,
          route: schema.exercises.route,
        })
        .from(schema.exercises)
        .where(and(...crossConditions));

      pool = pool.concat(
        crossExercises
          .filter(ex => ex.route !== route) // Only include if actually cross-route
          .map(ex => ({
            ...ex,
            patternSource: 'pattern_2' as const,
          }))
      );
    }

    // Exclude exercises already in the block
    if (excludeExerciseIds.length > 0) {
      pool = pool.filter(ex => !excludeExerciseIds.includes(ex.id));
    }

    // Sort by closest linear difficulty to target
    if (targetDifficulty !== undefined) {
      pool.sort((a, b) =>
        Math.abs(a.dificultadLineal - targetDifficulty) -
        Math.abs(b.dificultadLineal - targetDifficulty)
      );
    } else {
      // Default: sort by linear difficulty ascending
      pool.sort((a, b) => a.dificultadLineal - b.dificultadLineal);
    }

    return pool;
  }

  // =========================================================================
  // 2. swapExercise - Replace one exercise with another
  // =========================================================================

  async swapExercise(params: SwapExerciseParams) {
    const { sessionId, blockId, oldPrescriptionId, newExerciseId, userId } = params;

    // Look up the new exercise
    const [newExercise] = await this.db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.id, newExerciseId));

    if (!newExercise) {
      throw new Error('Ejercicio no encontrado');
    }

    // Get the old prescription to preserve sortOrder
    const [oldPrescription] = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.id, oldPrescriptionId));

    if (!oldPrescription) {
      throw new Error('Prescripcion no encontrada');
    }

    // Get block context for re-prescription
    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.id, blockId));

    if (!block) {
      throw new Error('Bloque no encontrado');
    }

    // Get all exercises currently in the block (replace old with new for prescription context)
    const currentPrescriptions = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    const existingExercises = currentPrescriptions.map(p => ({
      id: p.id === oldPrescriptionId ? newExercise.id : p.exerciseId,
      name: p.id === oldPrescriptionId ? newExercise.exercise : p.exerciseName,
      contraction: p.id === oldPrescriptionId ? newExercise.effort : p.contraction,
      difficulty: p.id === oldPrescriptionId ? newExercise.dificultadLineal : (p.difficulty ?? 1),
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
    await this.revertToPendingIfApproved(sessionId);
    await this.logEdit(sessionId, userId, 'exercise_swap');

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
  // 3. updatePrescription - Update prescription fields
  // =========================================================================

  async updatePrescription(params: UpdatePrescriptionParams) {
    const { sessionId, prescriptionId, userId, fields } = params;

    // Build update set from provided fields
    const updateSet: Record<string, unknown> = {};
    if (fields.reps !== undefined) updateSet.reps = fields.reps;
    if (fields.seconds !== undefined) updateSet.seconds = fields.seconds;
    if (fields.rest !== undefined) updateSet.rest = fields.rest;
    if (fields.notes !== undefined) updateSet.notes = fields.notes;

    if (Object.keys(updateSet).length === 0) {
      throw new Error('No hay campos para actualizar');
    }

    await this.db
      .update(schema.sessionPrescriptions)
      .set(updateSet)
      .where(eq(schema.sessionPrescriptions.id, prescriptionId));

    // Auto-revert and log
    await this.revertToPendingIfApproved(sessionId);
    await this.logEdit(sessionId, userId, 'prescription_edit');

    // Return updated prescription
    const [updated] = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.id, prescriptionId));

    return updated;
  }

  // =========================================================================
  // 4. changeBlockFormat - Change format and re-prescribe all exercises
  // =========================================================================

  async changeBlockFormat(params: ChangeBlockFormatParams) {
    const { sessionId, blockId, newFormatId, newFormatName, userId } = params;

    // Get block
    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.id, blockId));

    if (!block) {
      throw new Error('Bloque no encontrado');
    }

    // Get current prescriptions
    const currentPrescriptions = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    // Build exercise list for re-prescription
    const exercises = currentPrescriptions.map(p => ({
      id: p.exerciseId,
      name: p.exerciseName,
      contraction: p.contraction,
      difficulty: p.difficulty ?? 1,
    }));

    // Re-prescribe all exercises with new format
    const newPrescriptions = this.prescribeService.prescribeBlock({
      exercises,
      formatName: newFormatName,
      repsBudget: block.repsBudget,
      intensity: block.intensity,
    });

    // Update block format
    await this.db
      .update(schema.sessionBlocks)
      .set({
        formatId: newFormatId,
        formatName: newFormatName,
      })
      .where(eq(schema.sessionBlocks.id, blockId));

    // Update each prescription with new values
    // Match by exercise ID from the new prescriptions array
    for (let i = 0; i < currentPrescriptions.length; i++) {
      const current = currentPrescriptions[i];
      // Find matching prescription by exerciseId (format prescribers may reorder)
      const newP = newPrescriptions.find(p => p.exerciseId === current.exerciseId);

      if (newP) {
        await this.db
          .update(schema.sessionPrescriptions)
          .set({
            reps: newP.reps,
            seconds: newP.seconds,
            rest: newP.rest,
            notes: newP.notes,
          })
          .where(eq(schema.sessionPrescriptions.id, current.id));
      }
    }

    // Auto-revert and log
    await this.revertToPendingIfApproved(sessionId);
    await this.logEdit(sessionId, userId, 'format_change');

    // Return updated block with exercises
    return this.getBlockWithExercises(blockId);
  }

  // =========================================================================
  // 5. addExercise - Add a new exercise to a block
  // =========================================================================

  async addExercise(params: AddExerciseParams) {
    const { sessionId, blockId, exerciseId, userId } = params;

    // Look up exercise
    const [exercise] = await this.db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId));

    if (!exercise) {
      throw new Error('Ejercicio no encontrado');
    }

    // Get current max sortOrder in block
    const existingPrescriptions = await this.db
      .select({ sortOrder: schema.sessionPrescriptions.sortOrder })
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(desc(schema.sessionPrescriptions.sortOrder));

    const maxSortOrder = existingPrescriptions.length > 0
      ? existingPrescriptions[0].sortOrder
      : -1;

    // Insert new prescription with blank values (coach fills in manually)
    const [insertResult] = await this.db
      .insert(schema.sessionPrescriptions)
      .values({
        blockId,
        exerciseId: exercise.id,
        exerciseName: exercise.exercise,
        contraction: exercise.effort,
        reps: 0,
        seconds: 0,
        rest: 0,
        notes: null,
        difficulty: exercise.dificultadLineal,
        sortOrder: maxSortOrder + 1,
      });

    // Update block exercise count
    await this.db
      .update(schema.sessionBlocks)
      .set({
        exerciseCount: sql`${schema.sessionBlocks.exerciseCount} + 1`,
      })
      .where(eq(schema.sessionBlocks.id, blockId));

    // Auto-revert and log
    await this.revertToPendingIfApproved(sessionId);
    await this.logEdit(sessionId, userId, 'exercise_add');

    return {
      id: insertResult.insertId,
      exerciseId: exercise.id,
      exerciseName: exercise.exercise,
      contraction: exercise.effort,
      reps: 0,
      seconds: 0,
      rest: 0,
      notes: null,
      difficulty: exercise.dificultadLineal,
      sortOrder: maxSortOrder + 1,
    };
  }

  // =========================================================================
  // 6. removeExercise - Remove an exercise from a block
  // =========================================================================

  async removeExercise(params: RemoveExerciseParams) {
    const { sessionId, blockId, prescriptionId, userId } = params;

    // Get the prescription to know its sortOrder
    const [prescription] = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.id, prescriptionId));

    if (!prescription) {
      throw new Error('Prescripcion no encontrada');
    }

    // Delete the prescription
    await this.db
      .delete(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.id, prescriptionId));

    // Reorder remaining prescriptions to be sequential
    const remaining = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].sortOrder !== i) {
        await this.db
          .update(schema.sessionPrescriptions)
          .set({ sortOrder: i })
          .where(eq(schema.sessionPrescriptions.id, remaining[i].id));
      }
    }

    // Update block exercise count
    await this.db
      .update(schema.sessionBlocks)
      .set({
        exerciseCount: sql`${schema.sessionBlocks.exerciseCount} - 1`,
      })
      .where(eq(schema.sessionBlocks.id, blockId));

    // Auto-revert and log
    await this.revertToPendingIfApproved(sessionId);
    await this.logEdit(sessionId, userId, 'exercise_remove');
  }

  // =========================================================================
  // 7. resetToAlgorithm - Restore session from snapshot
  // =========================================================================

  async resetToAlgorithm(params: ResetToAlgorithmParams) {
    const { sessionId, userId } = params;

    // Get session with snapshot
    const [session] = await this.db
      .select({
        id: schema.sessions.id,
        algorithmSnapshot: schema.sessions.algorithmSnapshot,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    if (!session) {
      throw new Error('Sesion no encontrada');
    }

    if (!session.algorithmSnapshot) {
      throw new Error('No hay snapshot del algoritmo disponible para esta sesion');
    }

    const snapshot = session.algorithmSnapshot as AlgorithmSnapshot;

    // Delete all existing blocks for this session (cascade handles prescriptions)
    await this.db
      .delete(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.sessionId, sessionId));

    // Re-insert blocks and prescriptions from snapshot
    for (const snapshotBlock of snapshot.blocks) {
      const [blockInsert] = await this.db
        .insert(schema.sessionBlocks)
        .values({
          sessionId,
          blockId: snapshotBlock.blockId,
          role: snapshotBlock.role,
          route: snapshotBlock.route,
          pattern: snapshotBlock.pattern,
          intensity: snapshotBlock.intensity,
          repsBudget: snapshotBlock.repsBudget,
          formatId: snapshotBlock.formatId,
          formatName: snapshotBlock.formatName,
          exerciseCount: snapshotBlock.exerciseCount,
          sortOrder: snapshotBlock.sortOrder,
        });

      const newBlockId = blockInsert.insertId;

      // Insert prescriptions for this block
      if (snapshotBlock.exercises.length > 0) {
        await this.db
          .insert(schema.sessionPrescriptions)
          .values(
            snapshotBlock.exercises.map(ex => ({
              blockId: newBlockId,
              exerciseId: ex.exerciseId,
              exerciseName: ex.exerciseName,
              contraction: ex.contraction,
              reps: ex.reps,
              seconds: ex.seconds,
              rest: ex.rest,
              notes: ex.notes,
              difficulty: ex.difficulty,
              sortOrder: ex.sortOrder,
            }))
          );
      }
    }

    // Update session: reset status and block count
    await this.db
      .update(schema.sessions)
      .set({
        status: 'pending_review',
        blockCount: snapshot.blocks.length,
        approvedAt: null,
        approvedBy: null,
        approvedBySystem: false,
      })
      .where(eq(schema.sessions.id, sessionId));

    // Log the reset action
    await this.logEdit(sessionId, userId, 'reset_to_algorithm');
  }

  // =========================================================================
  // 8. getCompatibleFormats - Formats compatible with block characteristics
  // =========================================================================

  async getCompatibleFormats(params: CompatibleFormatsParams): Promise<CompatibleFormat[]> {
    const { blockRole, level, intensity } = params;

    // Map block role to format_compatibility block enum
    const blockMap: Record<string, string> = {
      'INITIUM': 'initium',
      'NUCLEUS': 'nucleus',
      'DEUTEROS_1': 'deuteros',
      'DEUTEROS_2': 'deuteros',
      'ATHLOS': 'athlos',
      'EPIKOS': 'epikos',
    };

    const compatBlock = blockMap[blockRole];
    if (!compatBlock) {
      return [];
    }

    // Map level string to compatibility level enum
    // spartan -> omega per existing convention (decision from 09-02)
    const levelMap: Record<string, string> = {
      'alfa': 'alfa',
      'delta': 'delta',
      'sigma': 'sigma',
      'omega': 'omega',
      'spartan': 'omega',
      // Level groups map to representative level
      'alfa_delta': 'alfa',
    };

    const compatLevel = levelMap[level] || 'omega';

    // Query format_compatibility where compatibility > 0
    const compatibleFormats = await this.db
      .select({
        formatId: schema.formatCompatibility.formatId,
        formatName: schema.formats.name,
        compatibility: schema.formatCompatibility.compatibility,
      })
      .from(schema.formatCompatibility)
      .innerJoin(
        schema.formats,
        eq(schema.formatCompatibility.formatId, schema.formats.id)
      )
      .where(
        and(
          eq(schema.formatCompatibility.block, compatBlock as 'initium' | 'nucleus' | 'deuteros' | 'athlos' | 'epikos'),
          eq(schema.formatCompatibility.level, compatLevel as 'alfa' | 'delta' | 'sigma' | 'omega'),
          eq(schema.formatCompatibility.intensity, intensity),
          gt(schema.formatCompatibility.compatibility, 0)
        )
      )
      .orderBy(desc(schema.formatCompatibility.compatibility));

    return compatibleFormats;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Check session status and revert to pending_review if currently approved.
   * Per user decision: editing an approved session automatically reverts to pending.
   */
  private async revertToPendingIfApproved(sessionId: number): Promise<void> {
    const [session] = await this.db
      .select({ status: schema.sessions.status })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    if (session?.status === 'approved') {
      await this.db
        .update(schema.sessions)
        .set({
          status: 'pending_review',
          approvedAt: null,
          approvedBy: null,
          approvedBySystem: false,
        })
        .where(eq(schema.sessions.id, sessionId));
    }
  }

  /**
   * Log an edit action to session_edit_logs.
   * Per user decision: simple log with action type, no field-level detail.
   */
  private async logEdit(
    sessionId: number,
    userId: number,
    action: string
  ): Promise<void> {
    await this.db
      .insert(schema.sessionEditLogs)
      .values({
        sessionId,
        userId,
        action,
      });
  }

  /**
   * Get a block with its exercises (used for return values).
   */
  private async getBlockWithExercises(blockId: number) {
    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.id, blockId));

    if (!block) {
      throw new Error('Bloque no encontrado');
    }

    const prescriptions = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    return {
      ...block,
      exercises: prescriptions.map(p => ({
        id: p.id,
        exerciseId: p.exerciseId,
        exerciseName: p.exerciseName,
        contraction: p.contraction,
        reps: p.reps,
        seconds: p.seconds,
        rest: p.rest,
        notes: p.notes,
        difficulty: p.difficulty,
        dificultadLineal: p.difficulty,
        sortOrder: p.sortOrder,
      })),
    };
  }
}
