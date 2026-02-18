/**
 * SessionMutationService - Block & Exercise Structural Operations
 *
 * Handles add/remove exercises, block role changes, and algorithm reset.
 * Extracted from AdminEditService to isolate structural mutation logic.
 *
 * All mutations:
 * 1. Auto-revert approved sessions to pending_review
 * 2. Log to session_edit_logs for audit trail
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  revertToPendingIfApproved,
  logEdit,
  PENDING_REVIEW_RESET,
} from "./session-edit-helpers";
import type {
  AddExerciseParams,
  RemoveExerciseParams,
  ReorderExerciseParams,
  ResetToAlgorithmParams,
} from "./edit-types";

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
  exerciseType?: string; // 'main' | 'mobility' — may be absent in old snapshots
}

interface AlgorithmSnapshot {
  blocks: SnapshotBlock[];
}

export class SessionMutationService {
  constructor(private db: MySql2Database<typeof schema>) {}

  // =========================================================================
  // addExercise - Add a new exercise to a block
  // =========================================================================

  async addExercise(params: AddExerciseParams) {
    const { sessionId, blockId, exerciseId, userId } = params;

    // Look up exercise
    const [exercise] = await this.db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId));

    if (!exercise) {
      throw new Error("Ejercicio no encontrado");
    }

    // Get current max sortOrder in block
    const existingPrescriptions = await this.db
      .select({ sortOrder: schema.sessionPrescriptions.sortOrder })
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(desc(schema.sessionPrescriptions.sortOrder));

    const maxSortOrder =
      existingPrescriptions.length > 0
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
    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "exercise_add");

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
  // removeExercise - Remove an exercise from a block
  // =========================================================================

  async removeExercise(params: RemoveExerciseParams) {
    const { sessionId, blockId, prescriptionId, userId } = params;

    // Verify block belongs to session
    const [block] = await this.db
      .select({ id: schema.sessionBlocks.id })
      .from(schema.sessionBlocks)
      .where(
        and(
          eq(schema.sessionBlocks.id, blockId),
          eq(schema.sessionBlocks.sessionId, sessionId),
        ),
      );
    if (!block) throw new Error("Bloque no encontrado en esta sesion");

    // Get the prescription, validating it belongs to the block
    const [prescription] = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(
        and(
          eq(schema.sessionPrescriptions.id, prescriptionId),
          eq(schema.sessionPrescriptions.blockId, blockId),
        ),
      );

    if (!prescription) {
      throw new Error("Prescripcion no encontrada en este bloque");
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
    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "exercise_remove");
  }

  // =========================================================================
  // reorderExercise - Move an exercise up or down within a block
  // =========================================================================

  async reorderExercise(params: ReorderExerciseParams) {
    const { sessionId, blockId, prescriptionId, direction, userId } = params;

    // Get all main exercises in sort order
    const exercises = await this.db
      .select({
        id: schema.sessionPrescriptions.id,
        sortOrder: schema.sessionPrescriptions.sortOrder,
      })
      .from(schema.sessionPrescriptions)
      .where(
        and(
          eq(schema.sessionPrescriptions.blockId, blockId),
          eq(schema.sessionPrescriptions.exerciseType, "main"),
        ),
      )
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    const idx = exercises.findIndex((e) => e.id === prescriptionId);
    if (idx === -1) throw new Error("Prescripcion no encontrada");

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= exercises.length) {
      throw new Error("No se puede mover en esa direccion");
    }

    // Swap sortOrder values
    const current = exercises[idx];
    const neighbor = exercises[swapIdx];

    await this.db
      .update(schema.sessionPrescriptions)
      .set({ sortOrder: neighbor.sortOrder })
      .where(eq(schema.sessionPrescriptions.id, current.id));

    await this.db
      .update(schema.sessionPrescriptions)
      .set({ sortOrder: current.sortOrder })
      .where(eq(schema.sessionPrescriptions.id, neighbor.id));

    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "exercise_reorder");
  }

  // =========================================================================
  // updateBlockRole - Switch block role between ATHLOS/EPIKOS
  // =========================================================================

  async updateBlockRole(params: {
    sessionId: number;
    blockId: number;
    role: "ATHLOS" | "EPIKOS";
    userId: number;
  }) {
    const { sessionId, blockId, role, userId } = params;

    // Verify block exists and belongs to session
    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(
        and(
          eq(schema.sessionBlocks.id, blockId),
          eq(schema.sessionBlocks.sessionId, sessionId),
        ),
      );

    if (!block) {
      throw new Error("Bloque no encontrado en esta sesion");
    }

    // Validate current role is ATHLOS or EPIKOS
    if (block.role !== "ATHLOS" && block.role !== "EPIKOS") {
      throw new Error("Solo se puede cambiar el rol entre ATHLOS y EPIKOS");
    }

    // Update role
    await this.db
      .update(schema.sessionBlocks)
      .set({ role })
      .where(eq(schema.sessionBlocks.id, blockId));

    // Auto-revert and log
    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "block_role_change");

    return { blockId, role };
  }

  // =========================================================================
  // resetToAlgorithm - Restore session from snapshot
  // =========================================================================

  async resetToAlgorithm(params: ResetToAlgorithmParams) {
    const { sessionId, userId } = params;

    // Get session with snapshot (outside transaction — read-only validation)
    const [session] = await this.db
      .select({
        id: schema.sessions.id,
        algorithmSnapshot: schema.sessions.algorithmSnapshot,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    if (!session) {
      throw new Error("Sesion no encontrada");
    }

    if (!session.algorithmSnapshot) {
      throw new Error(
        "No hay snapshot del algoritmo disponible para esta sesion",
      );
    }

    const snapshot = session.algorithmSnapshot as AlgorithmSnapshot;

    // Wrap DELETE + INSERT in a transaction to prevent corrupt state on partial failure
    await this.db.transaction(async (tx) => {
      // Delete all existing blocks for this session (cascade handles prescriptions)
      await tx
        .delete(schema.sessionBlocks)
        .where(eq(schema.sessionBlocks.sessionId, sessionId));

      // Re-insert blocks and prescriptions from snapshot
      for (const snapshotBlock of snapshot.blocks) {
        const [blockInsert] = await tx.insert(schema.sessionBlocks).values({
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
          await tx.insert(schema.sessionPrescriptions).values(
            snapshotBlock.exercises.map((ex) => ({
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
              exerciseType: ex.exerciseType || "main", // Backward compat for old snapshots
            })),
          );
        }
      }

      // Update session: reset status and block count
      await tx
        .update(schema.sessions)
        .set({
          ...PENDING_REVIEW_RESET,
          blockCount: snapshot.blocks.length,
        })
        .where(eq(schema.sessions.id, sessionId));

      // Log the reset action
      await tx.insert(schema.sessionEditLogs).values({
        sessionId,
        userId,
        action: "reset_to_algorithm",
      });
    });
  }
}
