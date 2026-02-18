/**
 * AdminEditService - Session Editing Facade
 *
 * Orchestrates session editing operations by delegating to domain services:
 * - ExerciseSwapService: exercise pool queries, swaps, mobility
 * - SessionMutationService: add/remove exercises, block role, algorithm reset
 *
 * Directly handles:
 * - Prescription field updates
 * - Block format changes with re-prescription
 * - Format params updates
 * - Compatible formats query
 * - Saved blocks CRUD
 *
 * All mutations:
 * 1. Auto-revert approved sessions to pending_review
 * 2. Log to session_edit_logs for audit trail
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, gt, asc, desc, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { PrescribeService } from "./prescribe-service";
import { getDefaultFormatParams } from "./format-params";
import { ExerciseSwapService } from "./exercise-swap-service";
import { SessionMutationService } from "./session-mutation-service";
import type {
  ExercisePoolParams,
  ExercisePoolItem,
  SwapExerciseParams,
  UpdatePrescriptionParams,
  ChangeBlockFormatParams,
  AddExerciseParams,
  RemoveExerciseParams,
  ReorderExerciseParams,
  UpdateFormatParamsParams,
  ResetToAlgorithmParams,
  CompatibleFormatsParams,
  CompatibleFormat,
  SaveBlockParams,
  SavedBlockData,
  SavedBlockItem,
  DeleteSavedBlockParams,
} from "./edit-types";

// Re-export all types for backward compatibility
export type {
  ExercisePoolParams,
  ExercisePoolItem,
  SwapExerciseParams,
  UpdatePrescriptionParams,
  ChangeBlockFormatParams,
  AddExerciseParams,
  RemoveExerciseParams,
  UpdateFormatParamsParams,
  ResetToAlgorithmParams,
  CompatibleFormatsParams,
  CompatibleFormat,
  SaveBlockParams,
  SavedBlockItem,
  DeleteSavedBlockParams,
} from "./edit-types";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AdminEditService {
  private prescribeService: PrescribeService;
  private swapService: ExerciseSwapService;
  private mutationService: SessionMutationService;

  constructor(private db: MySql2Database<typeof schema>) {
    this.prescribeService = new PrescribeService();
    this.swapService = new ExerciseSwapService(db);
    this.mutationService = new SessionMutationService(db);
  }

  // === Delegated to ExerciseSwapService ===

  async getExercisePool(
    params: ExercisePoolParams,
  ): Promise<ExercisePoolItem[]> {
    return this.swapService.getExercisePool(params);
  }

  async swapExercise(params: SwapExerciseParams) {
    return this.swapService.swapExercise(params);
  }

  async getMobilityPool(blockRoute: string): Promise<ExercisePoolItem[]> {
    return this.swapService.getMobilityPool(blockRoute);
  }

  async searchExercises(params: {
    query: string;
    contraction?: string;
    excludeExerciseIds?: number[];
    limit: number;
  }): Promise<ExercisePoolItem[]> {
    return this.swapService.searchExercises(params);
  }

  async swapMobilityExercise(params: {
    sessionId: number;
    blockId: number;
    newExerciseId: number;
    userId: number;
  }) {
    return this.swapService.swapMobilityExercise(params);
  }

  // === Delegated to SessionMutationService ===

  async addExercise(params: AddExerciseParams) {
    return this.mutationService.addExercise(params);
  }

  async removeExercise(params: RemoveExerciseParams) {
    return this.mutationService.removeExercise(params);
  }

  async reorderExercise(params: ReorderExerciseParams) {
    return this.mutationService.reorderExercise(params);
  }

  async updateBlockRole(params: {
    sessionId: number;
    blockId: number;
    role: "ATHLOS" | "EPIKOS";
    userId: number;
  }) {
    return this.mutationService.updateBlockRole(params);
  }

  async resetToAlgorithm(params: ResetToAlgorithmParams) {
    return this.mutationService.resetToAlgorithm(params);
  }

  // === Directly handled ===

  async updatePrescription(params: UpdatePrescriptionParams) {
    const { sessionId, prescriptionId, userId, fields } = params;

    const updateSet: Record<string, unknown> = {};
    if (fields.reps !== undefined) updateSet.reps = fields.reps;
    if (fields.repsMax !== undefined) updateSet.repsMax = fields.repsMax;
    if (fields.seconds !== undefined) updateSet.seconds = fields.seconds;
    if (fields.secondsMax !== undefined)
      updateSet.secondsMax = fields.secondsMax;
    if (fields.increment !== undefined) updateSet.increment = fields.increment;
    if (fields.rest !== undefined) updateSet.rest = fields.rest;
    if (fields.notes !== undefined) updateSet.notes = fields.notes;

    if (Object.keys(updateSet).length === 0) {
      throw new Error("No hay campos para actualizar");
    }

    await this.db
      .update(schema.sessionPrescriptions)
      .set(updateSet)
      .where(eq(schema.sessionPrescriptions.id, prescriptionId));

    await this.revertToPendingIfApproved(sessionId);
    await this.logEdit(sessionId, userId, "prescription_edit");

    const [updated] = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.id, prescriptionId));

    return updated;
  }

  async changeBlockFormat(params: ChangeBlockFormatParams) {
    const { sessionId, blockId, newFormatId, newFormatName, userId } = params;

    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.id, blockId));

    if (!block) throw new Error("Bloque no encontrado");

    const currentPrescriptions = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    const exercises = currentPrescriptions.map((p) => ({
      id: p.exerciseId,
      name: p.exerciseName,
      contraction: p.contraction,
      difficulty: p.difficulty ?? 1,
    }));

    const newPrescriptions = this.prescribeService.prescribeBlock({
      exercises,
      formatName: newFormatName,
      repsBudget: block.repsBudget,
      intensity: block.intensity,
    });

    const newFormatParams = getDefaultFormatParams(newFormatName, {
      intensity: block.intensity,
      exerciseCount: exercises.length,
    });

    await this.db
      .update(schema.sessionBlocks)
      .set({
        formatId: newFormatId,
        formatName: newFormatName,
        formatParams: newFormatParams,
      })
      .where(eq(schema.sessionBlocks.id, blockId));

    for (const current of currentPrescriptions) {
      const newP = newPrescriptions.find(
        (p) => p.exerciseId === current.exerciseId,
      );
      if (newP) {
        await this.db
          .update(schema.sessionPrescriptions)
          .set({
            reps: newP.reps,
            seconds: newP.seconds,
            rest: newP.rest,
            notes: newP.notes,
            // Reset format-specific fields so stale data doesn't carry over
            repsMax: null,
            secondsMax: null,
            increment: null,
          })
          .where(eq(schema.sessionPrescriptions.id, current.id));
      }
    }

    await this.revertToPendingIfApproved(sessionId);
    await this.logEdit(sessionId, userId, "format_change");
    return this.getBlockWithExercises(blockId);
  }

  async updateFormatParams(params: UpdateFormatParamsParams) {
    const { sessionId, blockId, formatParams, userId } = params;

    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(
        and(
          eq(schema.sessionBlocks.id, blockId),
          eq(schema.sessionBlocks.sessionId, sessionId),
        ),
      );

    if (!block) throw new Error("Bloque no encontrado en esta sesion");

    await this.db
      .update(schema.sessionBlocks)
      .set({ formatParams })
      .where(eq(schema.sessionBlocks.id, blockId));
    await this.revertToPendingIfApproved(sessionId);
    await this.logEdit(sessionId, userId, "format_params_update");
    return { formatParams };
  }

  async getCompatibleFormats(
    params: CompatibleFormatsParams,
  ): Promise<CompatibleFormat[]> {
    const { blockRole, level, intensity } = params;
    const blockMap: Record<string, string> = {
      INITIUM: "initium",
      NUCLEUS: "nucleus",
      DEUTEROS_1: "deuteros",
      DEUTEROS_2: "deuteros",
      ATHLOS: "athlos",
      EPIKOS: "epikos",
    };
    const compatBlock = blockMap[blockRole];
    if (!compatBlock) return [];

    const levelMap: Record<string, string> = {
      alfa: "alfa",
      delta: "delta",
      sigma: "sigma",
      omega: "omega",
      spartan: "omega",
      alfa_delta: "alfa",
    };
    const compatLevel = levelMap[level] || "omega";

    const conditions = [
      eq(
        schema.formatCompatibility.block,
        compatBlock as "initium" | "nucleus" | "deuteros" | "athlos" | "epikos",
      ),
      gt(schema.formatCompatibility.compatibility, 0),
    ];
    if (compatBlock !== "initium") {
      conditions.push(
        eq(
          schema.formatCompatibility.level,
          compatLevel as "alfa" | "delta" | "sigma" | "omega",
        ),
      );
      conditions.push(eq(schema.formatCompatibility.intensity, intensity));
    }

    const rows = await this.db
      .select({
        formatId: schema.formatCompatibility.formatId,
        formatName: schema.formats.name,
        compatibility: schema.formatCompatibility.compatibility,
      })
      .from(schema.formatCompatibility)
      .innerJoin(
        schema.formats,
        eq(schema.formatCompatibility.formatId, schema.formats.id),
      )
      .where(and(...conditions));

    if (compatBlock === "initium") {
      const bestByFormat = new Map<number, CompatibleFormat>();
      for (const row of rows) {
        const existing = bestByFormat.get(row.formatId);
        if (!existing || row.compatibility < existing.compatibility)
          bestByFormat.set(row.formatId, row);
      }
      return [...bestByFormat.values()].sort(
        (a, b) => a.compatibility - b.compatibility,
      );
    }
    return rows.sort((a, b) => a.compatibility - b.compatibility);
  }

  // === Saved Blocks ===

  async saveBlock(params: SaveBlockParams): Promise<SavedBlockItem> {
    const { blockId, name, userId } = params;
    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.id, blockId));
    if (!block) throw new Error("Bloque no encontrado");

    const prescriptions = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    const blockData = {
      role: block.role,
      route: block.route,
      formatName: block.formatName,
      formatParams: block.formatParams,
      intensity: block.intensity,
      repsBudget: block.repsBudget,
      exercises: prescriptions.map((p) => ({
        exerciseId: p.exerciseId,
        exerciseName: p.exerciseName,
        contraction: p.contraction,
        reps: p.reps,
        seconds: p.seconds,
        rest: p.rest,
        notes: p.notes,
        effort: p.contraction,
        dificultadLineal: p.difficulty,
        sortOrder: p.sortOrder,
      })),
    };

    const [insertResult] = await this.db.insert(schema.savedBlocks).values({
      name,
      createdBy: userId,
      sourceBlockId: blockId,
      blockRole: block.role,
      blockRoute: block.route,
      formatName: block.formatName,
      blockData,
    });

    const [savedBlock] = await this.db
      .select()
      .from(schema.savedBlocks)
      .where(eq(schema.savedBlocks.id, insertResult.insertId));
    return {
      id: savedBlock.id,
      name: savedBlock.name,
      blockRole: savedBlock.blockRole,
      blockRoute: savedBlock.blockRoute,
      formatName: savedBlock.formatName,
      createdAt: savedBlock.createdAt,
      exerciseCount: prescriptions.length,
      blockData: savedBlock.blockData,
    };
  }

  async listSavedBlocks(userId: number): Promise<SavedBlockItem[]> {
    const rows = await this.db
      .select()
      .from(schema.savedBlocks)
      .where(eq(schema.savedBlocks.createdBy, userId))
      .orderBy(desc(schema.savedBlocks.createdAt));

    return rows.map((row) => {
      const blockData = row.blockData as SavedBlockData | null;
      return {
        id: row.id,
        name: row.name,
        blockRole: row.blockRole,
        blockRoute: row.blockRoute,
        formatName: row.formatName,
        createdAt: row.createdAt,
        exerciseCount: blockData?.exercises?.length ?? 0,
        blockData: row.blockData,
      };
    });
  }

  async deleteSavedBlock(params: DeleteSavedBlockParams): Promise<boolean> {
    const { savedBlockId, userId } = params;
    const [existing] = await this.db
      .select({ id: schema.savedBlocks.id })
      .from(schema.savedBlocks)
      .where(
        and(
          eq(schema.savedBlocks.id, savedBlockId),
          eq(schema.savedBlocks.createdBy, userId),
        ),
      );
    if (!existing) return false;
    await this.db
      .delete(schema.savedBlocks)
      .where(eq(schema.savedBlocks.id, savedBlockId));
    return true;
  }

  // === Helpers ===

  private async revertToPendingIfApproved(sessionId: number): Promise<void> {
    const [session] = await this.db
      .select({ status: schema.sessions.status })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
    if (session?.status === "approved") {
      await this.db
        .update(schema.sessions)
        .set({
          status: "pending_review",
          approvedAt: null,
          approvedBy: null,
          approvedBySystem: false,
        })
        .where(eq(schema.sessions.id, sessionId));
    }
  }

  private async logEdit(
    sessionId: number,
    userId: number,
    action: string,
  ): Promise<void> {
    await this.db
      .insert(schema.sessionEditLogs)
      .values({ sessionId, userId, action });
  }

  private async getBlockWithExercises(blockId: number) {
    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.id, blockId));
    if (!block) throw new Error("Bloque no encontrado");

    const prescriptions = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));

    return {
      ...block,
      exercises: prescriptions.map((p) => ({
        id: p.id,
        exerciseId: p.exerciseId,
        exerciseName: p.exerciseName,
        contraction: p.contraction,
        reps: p.reps,
        repsMax: p.repsMax,
        seconds: p.seconds,
        secondsMax: p.secondsMax,
        increment: p.increment,
        rest: p.rest,
        notes: p.notes,
        difficulty: p.difficulty,
        dificultadLineal: p.difficulty,
        sortOrder: p.sortOrder,
      })),
    };
  }
}
