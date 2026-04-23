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
import { eq, and, gt, asc, desc, inArray, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { PrescribeService } from "./prescribe-service";
import { getDefaultFormatParams } from "./format-params";
import { revertToPendingIfApproved, logEdit } from "./session-edit-helpers";
import { ExerciseSwapService } from "./exercise-swap-service";
import { SessionMutationService } from "./session-mutation-service";
import { parseDayId, LEVEL_DIFFICULTY_MAP } from "../shared/training-constants";
import { BadRequestError, NotFoundError } from "../shared/errors";
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
  UpdateCustomTitleParams,
  UpdateBlockRouteParams,
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
  UpdateCustomTitleParams,
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

  // === Route-level business logic (extracted from routes — L13) ===

  /**
   * Get exercise pool for a block, handling block lookup, exclusion,
   * SPOM pattern2 resolution, and difficulty cap.
   */
  async getExercisePoolForBlock(params: {
    blockId: number;
    route: string;
    contraction?: string;
    pattern?: string;
  }): Promise<ExercisePoolItem[]> {
    const { blockId, route, contraction, pattern: queryPattern } = params;

    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.id, blockId));
    if (!block) throw new Error("Bloque no encontrado");

    // Get existing exercise IDs (unless format allows duplicates)
    const allowDuplicates = /buy[\s-]?in/i.test(block.formatName);
    let excludeExerciseIds: number[] = [];
    if (!allowDuplicates) {
      const prescriptions = await this.db
        .select({ exerciseId: schema.sessionPrescriptions.exerciseId })
        .from(schema.sessionPrescriptions)
        .where(eq(schema.sessionPrescriptions.blockId, blockId));
      excludeExerciseIds = prescriptions.map((p) => p.exerciseId);
    }

    // Resolve pattern2 from SPOM rules and difficulty cap from member level
    let pattern2: string | null = null;
    let maxDifficulty: number | undefined;
    const [session] = await this.db
      .select({ week: schema.sessions.week, dayId: schema.sessions.dayId })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, block.sessionId));

    if (session) {
      const { level: memberLevel } = parseDayId(session.dayId);
      maxDifficulty = LEVEL_DIFFICULTY_MAP[memberLevel];

      const [routeRow] = await this.db
        .select({ id: schema.routes.id })
        .from(schema.routes)
        .where(eq(schema.routes.code, route));

      if (routeRow) {
        const [spomRule] = await this.db
          .select({ pattern2: schema.spomRules.pattern2 })
          .from(schema.spomRules)
          .where(
            and(
              eq(schema.spomRules.week, session.week),
              eq(schema.spomRules.routeId, routeRow.id),
            ),
          );
        if (spomRule) {
          pattern2 = spomRule.pattern2 ?? null;
        }
      }
    }

    return this.swapService.getExercisePool({
      blockId,
      contraction,
      route,
      pattern: queryPattern || block.pattern,
      pattern2,
      blockRole: block.role,
      excludeExerciseIds,
      maxDifficulty,
    });
  }

  /**
   * Search exercises by name, handling format-based duplicate exclusion.
   */
  async searchExercisesForBlock(params: {
    query: string;
    contraction?: string;
    blockId?: number;
    limit: number;
  }): Promise<ExercisePoolItem[]> {
    const { query, contraction, blockId, limit } = params;

    let excludeExerciseIds: number[] = [];
    if (blockId) {
      const [block] = await this.db
        .select({ formatName: schema.sessionBlocks.formatName })
        .from(schema.sessionBlocks)
        .where(eq(schema.sessionBlocks.id, blockId));
      const allowDuplicates = block?.formatName
        ? /buy[\s-]?in/i.test(block.formatName)
        : false;
      if (!allowDuplicates) {
        const prescriptions = await this.db
          .select({ exerciseId: schema.sessionPrescriptions.exerciseId })
          .from(schema.sessionPrescriptions)
          .where(eq(schema.sessionPrescriptions.blockId, blockId));
        excludeExerciseIds = prescriptions.map((p) => p.exerciseId);
      }
    }

    return this.swapService.searchExercises({
      query,
      contraction,
      excludeExerciseIds,
      limit,
    });
  }

  // === Directly handled ===

  async updatePrescription(params: UpdatePrescriptionParams) {
    const { sessionId, blockId, prescriptionId, userId, fields } = params;

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

    const updateSet: Record<string, unknown> = {};
    if (fields.reps !== undefined) updateSet.reps = fields.reps;
    if (fields.repsMax !== undefined) updateSet.repsMax = fields.repsMax;
    if (fields.seconds !== undefined) updateSet.seconds = fields.seconds;
    if (fields.secondsMax !== undefined)
      updateSet.secondsMax = fields.secondsMax;
    if (fields.increment !== undefined) updateSet.increment = fields.increment;
    if (fields.rest !== undefined) updateSet.rest = fields.rest;
    if (fields.notes !== undefined) updateSet.notes = fields.notes;
    if (fields.contraction !== undefined)
      updateSet.contraction = fields.contraction;
    if (fields.weighted !== undefined) updateSet.weighted = fields.weighted;

    if (Object.keys(updateSet).length === 0) {
      throw new Error("No hay campos para actualizar");
    }

    // When contraction changes, find or create the exercise variant in the exercises table
    if (fields.contraction !== undefined) {
      const exerciseVariant = await this.findOrCreateEffortVariant(
        prescriptionId,
        blockId,
        fields.contraction,
      );
      if (exerciseVariant) {
        updateSet.exerciseId = exerciseVariant.id;
      }
    }

    // Compound WHERE validates prescription belongs to the block
    const [result] = await this.db
      .update(schema.sessionPrescriptions)
      .set(updateSet)
      .where(
        and(
          eq(schema.sessionPrescriptions.id, prescriptionId),
          eq(schema.sessionPrescriptions.blockId, blockId),
        ),
      );

    if (result.affectedRows === 0) {
      throw new Error("Prescripcion no encontrada en este bloque");
    }

    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "prescription_edit");

    const [updated] = await this.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.id, prescriptionId));

    return updated;
  }

  /**
   * Find or create an exercise variant with the target effort type.
   * When a coach changes contraction (CON→ISO, etc.), we need a matching
   * exercise row in the exercises table. If it doesn't exist, create it
   * using the same logic as the admin "create with 3 contractions" feature.
   *
   * Difficulty offsets: CON = base, EXC = base - 1, ISO = base - 2
   */
  private async findOrCreateEffortVariant(
    prescriptionId: number,
    blockId: number,
    newEffort: string,
  ): Promise<{ id: number } | null> {
    // Get current prescription to find the source exercise
    const [prescription] = await this.db
      .select({
        exerciseId: schema.sessionPrescriptions.exerciseId,
      })
      .from(schema.sessionPrescriptions)
      .where(
        and(
          eq(schema.sessionPrescriptions.id, prescriptionId),
          eq(schema.sessionPrescriptions.blockId, blockId),
        ),
      );
    if (!prescription) return null;

    // Get the source exercise
    const [sourceExercise] = await this.db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.id, prescription.exerciseId));
    if (!sourceExercise) return null;

    // If already the same effort, just return the current exercise
    if (sourceExercise.effort === newEffort) return { id: sourceExercise.id };

    // Look for an existing sibling with the target effort + same route + same base name
    const [existing] = await this.db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(
        and(
          eq(schema.exercises.exercise, sourceExercise.exercise),
          eq(schema.exercises.route, sourceExercise.route),
          eq(schema.exercises.effort, newEffort),
        ),
      );
    if (existing) return { id: existing.id };

    // No existing variant — create one with adjusted difficulty
    // CON = base difficulty, EXC = base - 1, ISO = base - 2
    const EFFORT_OFFSETS: Record<string, number> = {
      CON: 0,
      EXC: -1,
      ISO: -2,
    };
    const sourceOffset = EFFORT_OFFSETS[sourceExercise.effort] ?? 0;
    const targetOffset = EFFORT_OFFSETS[newEffort] ?? 0;
    const difficultyDelta = targetOffset - sourceOffset;
    const newDifficulty = Math.max(
      1,
      sourceExercise.dificultadLineal + difficultyDelta,
    );

    // Determine level from difficulty
    const levelForDifficulty = (d: number): string | null => {
      if (d >= 1 && d <= 3) return "alfa";
      if (d >= 4 && d <= 6) return "delta";
      if (d >= 7 && d <= 8) return "sigma";
      if (d >= 9 && d <= 10) return "omega";
      if (d >= 11 && d <= 12) return "spartan";
      return null;
    };

    const newLevel = levelForDifficulty(newDifficulty) as
      | "alfa"
      | "delta"
      | "sigma"
      | "omega"
      | "spartan"
      | null;

    const insertResult = await this.db.insert(schema.exercises).values({
      exercise: sourceExercise.exercise,
      category: sourceExercise.category,
      categorySecondary: sourceExercise.categorySecondary,
      pattern: sourceExercise.pattern,
      position: sourceExercise.position,
      route: sourceExercise.route,
      effort: newEffort,
      level: newLevel,
      difficulty: newDifficulty,
      dificultadLineal: newDifficulty,
      mobilityRelated: sourceExercise.mobilityRelated,
    });

    const newId = Number(insertResult[0].insertId);
    return { id: newId };
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

    const updates = currentPrescriptions.flatMap((current) => {
      const newP = newPrescriptions.find(
        (p) => p.exerciseId === current.exerciseId,
      );
      return newP ? [{ id: current.id, newP }] : [];
    });

    if (updates.length > 0) {
      const buildCase = (
        pick: (
          newP: (typeof updates)[number]["newP"],
        ) => number | string | null,
      ) =>
        sql.join(
          [
            sql`(CASE ${schema.sessionPrescriptions.id}`,
            ...updates.map((u) => sql`WHEN ${u.id} THEN ${pick(u.newP)}`),
            sql`END)`,
          ],
          sql` `,
        );

      await this.db
        .update(schema.sessionPrescriptions)
        .set({
          reps: buildCase((p) => p.reps),
          seconds: buildCase((p) => p.seconds),
          rest: buildCase((p) => p.rest),
          notes: buildCase((p) => p.notes),
          // Reset format-specific fields so stale data doesn't carry over
          repsMax: null,
          secondsMax: null,
          increment: null,
        })
        .where(
          inArray(
            schema.sessionPrescriptions.id,
            updates.map((u) => u.id),
          ),
        );
    }

    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "format_change");
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
    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "format_params_update");
    return { formatParams };
  }

  async updateCustomTitle(params: UpdateCustomTitleParams) {
    const { sessionId, blockId, customTitle, userId } = params;

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

    // Normalize empty string → null (null = "unset" per SPEC Requirement 2)
    const normalized =
      customTitle && customTitle.length > 0 ? customTitle : null;

    await this.db
      .update(schema.sessionBlocks)
      .set({ customTitle: normalized })
      .where(eq(schema.sessionBlocks.id, blockId));

    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "custom_title_update");
    return { customTitle: normalized };
  }

  async updateBlockRoute(params: UpdateBlockRouteParams) {
    const { sessionId, blockId, route, userId } = params;

    const [block] = await this.db
      .select()
      .from(schema.sessionBlocks)
      .where(
        and(
          eq(schema.sessionBlocks.id, blockId),
          eq(schema.sessionBlocks.sessionId, sessionId),
        ),
      );

    if (!block) throw new NotFoundError("Bloque no encontrado en esta sesion");

    if (block.role === "INITIUM") {
      throw new BadRequestError(
        "No se puede cambiar la ruta de un bloque INITIUM",
      );
    }

    // Validate route code exists in the routes catalog
    const [routeRow] = await this.db
      .select({ code: schema.routes.code })
      .from(schema.routes)
      .where(eq(schema.routes.code, route));

    if (!routeRow) {
      throw new BadRequestError("Ruta no valida");
    }

    await this.db
      .update(schema.sessionBlocks)
      .set({ route })
      .where(eq(schema.sessionBlocks.id, blockId));

    await revertToPendingIfApproved(this.db, sessionId);
    await logEdit(this.db, sessionId, userId, "route_update");
    return { route };
  }

  async listRoutes() {
    const rows = await this.db
      .select({
        id: schema.routes.id,
        code: schema.routes.code,
        displayName: schema.routes.displayName,
      })
      .from(schema.routes)
      .orderBy(asc(schema.routes.code));
    return { routes: rows };
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

    // Fetch compatible formats (if block role maps)
    let compatibleRows: CompatibleFormat[] = [];
    if (compatBlock) {
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
          compatBlock as
            | "initium"
            | "nucleus"
            | "deuteros"
            | "athlos"
            | "epikos",
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
        compatibleRows = [...bestByFormat.values()];
      } else {
        compatibleRows = rows;
      }
    }

    // Sort compatible formats by compatibility score (best first)
    compatibleRows.sort((a, b) => a.compatibility - b.compatibility);
    const compatibleIds = new Set(compatibleRows.map((r) => r.formatId));

    // Fetch ALL formats and append non-compatible ones with compatibility=99
    const allFormats = await this.db
      .select({ id: schema.formats.id, name: schema.formats.name })
      .from(schema.formats)
      .orderBy(asc(schema.formats.name));

    const nonCompatible: CompatibleFormat[] = allFormats
      .filter((f) => !compatibleIds.has(f.id))
      .map((f) => ({
        formatId: f.id,
        formatName: f.name,
        compatibility: 99,
      }));

    return [...compatibleRows, ...nonCompatible];
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
