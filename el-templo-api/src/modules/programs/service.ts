// Module: programs
import { eq, and, sql, desc, count } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import {
  microPrograms,
  microProgramContentBlocks,
  programEnrollments,
  exercises,
} from "../../db/schema";
import { NotFoundError, ConflictError } from "../shared/errors";
import type {
  CreateProgramInput,
  UpdateProgramInput,
  ContentBlockInput,
  MicroProgram,
  MicroProgramDetail,
  ContentBlockDetail,
  EnrollMemberInput,
  ProgramEnrollment,
  MemberProgramCatalogItem,
  MemberEnrollmentProgress,
  ProgramAnalytics,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

export class ProgramsService {
  constructor(
    private readonly db: DbInstance,
    private readonly log?: FastifyBaseLogger,
  ) {}

  // =========================================================================
  // Program CRUD
  // =========================================================================

  /**
   * Create a new micro-program with content blocks.
   * Uses a transaction to ensure atomicity.
   */
  async createProgram(input: CreateProgramInput): Promise<number> {
    return await this.db.transaction(async (tx) => {
      const [result] = await tx.insert(microPrograms).values({
        name: input.name,
        description: input.description,
        price: input.price,
        durationWeeks: input.durationWeeks,
        sessionsPerWeekToAdvance: input.sessionsPerWeekToAdvance,
        auraWeeklyBonus: input.auraWeeklyBonus,
        auraCompletionBonus: input.auraCompletionBonus,
      });

      const programId = result.insertId;

      if (input.contentBlocks.length > 0) {
        await tx.insert(microProgramContentBlocks).values(
          input.contentBlocks.map((block) => ({
            programId,
            weekNumber: block.weekNumber,
            sortOrder: block.sortOrder,
            blockType: block.blockType,
            title: block.title,
            content: block.content,
            videoUrl: block.videoUrl,
            exerciseId: block.exerciseId,
          })),
        );
      }

      this.log?.info({ programId, name: input.name }, "Program created");
      return programId;
    });
  }

  /**
   * List all programs (active and inactive) ordered by creation date DESC.
   * Admin sees all.
   */
  async listPrograms(): Promise<MicroProgram[]> {
    const rows = await this.db
      .select({
        id: microPrograms.id,
        name: microPrograms.name,
        description: microPrograms.description,
        price: microPrograms.price,
        durationWeeks: microPrograms.durationWeeks,
        sessionsPerWeekToAdvance: microPrograms.sessionsPerWeekToAdvance,
        auraWeeklyBonus: microPrograms.auraWeeklyBonus,
        auraCompletionBonus: microPrograms.auraCompletionBonus,
        isActive: microPrograms.isActive,
        createdAt: microPrograms.createdAt,
      })
      .from(microPrograms)
      .orderBy(desc(microPrograms.createdAt));

    return rows.map((r) => ({
      ...r,
      auraWeeklyBonus: r.auraWeeklyBonus ?? 15,
      auraCompletionBonus: r.auraCompletionBonus ?? 100,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Get program detail with content blocks and active enrollment count.
   * For exercise-type blocks, joins exercises table to get name and video URL.
   */
  async getProgramDetail(
    programId: number,
  ): Promise<MicroProgramDetail | null> {
    // Fetch the program
    const programRows = await this.db
      .select({
        id: microPrograms.id,
        name: microPrograms.name,
        description: microPrograms.description,
        price: microPrograms.price,
        durationWeeks: microPrograms.durationWeeks,
        sessionsPerWeekToAdvance: microPrograms.sessionsPerWeekToAdvance,
        auraWeeklyBonus: microPrograms.auraWeeklyBonus,
        auraCompletionBonus: microPrograms.auraCompletionBonus,
        isActive: microPrograms.isActive,
        createdAt: microPrograms.createdAt,
      })
      .from(microPrograms)
      .where(eq(microPrograms.id, programId));

    if (programRows.length === 0) return null;

    const program = programRows[0];

    // Fetch content blocks with exercise join
    const blockRows = await this.db
      .select({
        id: microProgramContentBlocks.id,
        weekNumber: microProgramContentBlocks.weekNumber,
        sortOrder: microProgramContentBlocks.sortOrder,
        blockType: microProgramContentBlocks.blockType,
        title: microProgramContentBlocks.title,
        content: microProgramContentBlocks.content,
        videoUrl: microProgramContentBlocks.videoUrl,
        exerciseId: microProgramContentBlocks.exerciseId,
        exerciseName: exercises.exercise,
        exerciseVideoUrl: exercises.videoUrl,
      })
      .from(microProgramContentBlocks)
      .leftJoin(
        exercises,
        eq(microProgramContentBlocks.exerciseId, exercises.id),
      )
      .where(eq(microProgramContentBlocks.programId, programId))
      .orderBy(
        microProgramContentBlocks.weekNumber,
        microProgramContentBlocks.sortOrder,
      );

    // Count active enrollments
    const enrollmentCountRows = await this.db
      .select({ count: count() })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.programId, programId),
          eq(programEnrollments.status, "active"),
        ),
      );

    const contentBlocks: ContentBlockDetail[] = blockRows.map((b) => ({
      id: b.id,
      weekNumber: b.weekNumber,
      sortOrder: b.sortOrder,
      blockType: b.blockType,
      title: b.title,
      content: b.content,
      videoUrl: b.videoUrl,
      exerciseId: b.exerciseId,
      exerciseName: b.exerciseName ?? null,
      exerciseVideoUrl: b.exerciseVideoUrl ?? null,
    }));

    return {
      id: program.id,
      name: program.name,
      description: program.description,
      price: program.price,
      durationWeeks: program.durationWeeks,
      sessionsPerWeekToAdvance: program.sessionsPerWeekToAdvance,
      auraWeeklyBonus: program.auraWeeklyBonus ?? 15,
      auraCompletionBonus: program.auraCompletionBonus ?? 100,
      isActive: program.isActive,
      createdAt: program.createdAt.toISOString(),
      contentBlocks,
      activeEnrollmentCount: enrollmentCountRows[0]?.count ?? 0,
    };
  }

  /**
   * Update program fields (name, description, price, AURA bonuses).
   * durationWeeks is NOT editable per D-41.
   */
  async updateProgram(
    programId: number,
    input: UpdateProgramInput,
  ): Promise<void> {
    const updateFields: Record<string, unknown> = {};

    if (input.name !== undefined) updateFields.name = input.name;
    if (input.description !== undefined)
      updateFields.description = input.description;
    if (input.price !== undefined) updateFields.price = input.price;
    if (input.auraWeeklyBonus !== undefined)
      updateFields.auraWeeklyBonus = input.auraWeeklyBonus;
    if (input.auraCompletionBonus !== undefined)
      updateFields.auraCompletionBonus = input.auraCompletionBonus;

    if (Object.keys(updateFields).length === 0) return;

    const result = await this.db
      .update(microPrograms)
      .set(updateFields)
      .where(eq(microPrograms.id, programId));

    if (result[0].affectedRows === 0) {
      throw new NotFoundError("Programa no encontrado");
    }

    this.log?.info({ programId, fields: Object.keys(updateFields) }, "Program updated");
  }

  /**
   * Add content blocks to a program (per D-41: admin can add content to future weeks).
   */
  async addContentBlocks(
    programId: number,
    blocks: ContentBlockInput[],
  ): Promise<void> {
    if (blocks.length === 0) return;

    // Verify program exists
    const programRows = await this.db
      .select({ id: microPrograms.id })
      .from(microPrograms)
      .where(eq(microPrograms.id, programId));

    if (programRows.length === 0) {
      throw new NotFoundError("Programa no encontrado");
    }

    await this.db.insert(microProgramContentBlocks).values(
      blocks.map((block) => ({
        programId,
        weekNumber: block.weekNumber,
        sortOrder: block.sortOrder,
        blockType: block.blockType,
        title: block.title,
        content: block.content,
        videoUrl: block.videoUrl,
        exerciseId: block.exerciseId,
      })),
    );

    this.log?.info(
      { programId, blockCount: blocks.length },
      "Content blocks added",
    );
  }

  /**
   * Deactivate a program. Per D-43: existing active enrollments run to completion.
   */
  async deactivateProgram(programId: number): Promise<void> {
    const result = await this.db
      .update(microPrograms)
      .set({ isActive: false })
      .where(eq(microPrograms.id, programId));

    if (result[0].affectedRows === 0) {
      throw new NotFoundError("Programa no encontrado");
    }

    this.log?.info({ programId }, "Program deactivated");
  }

  // =========================================================================
  // Enrollment Methods
  // =========================================================================

  /**
   * Enroll a member in a program.
   * Per D-06: one active enrollment per member enforced.
   */
  async enrollMember(input: EnrollMemberInput): Promise<number> {
    // Check for existing active enrollment
    const existing = await this.db
      .select({ id: programEnrollments.id })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, input.userId),
          eq(programEnrollments.status, "active"),
        ),
      );

    if (existing.length > 0) {
      throw new ConflictError(
        "El miembro ya tiene un programa activo. Debe completar, cancelar o esperar que expire antes de inscribirse en otro.",
      );
    }

    // Verify program exists and is active
    const programRows = await this.db
      .select({ id: microPrograms.id, isActive: microPrograms.isActive })
      .from(microPrograms)
      .where(eq(microPrograms.id, input.programId));

    if (programRows.length === 0) {
      throw new NotFoundError("Programa no encontrado");
    }

    if (!programRows[0].isActive) {
      throw new ConflictError("El programa esta desactivado y no acepta nuevas inscripciones");
    }

    const [result] = await this.db.insert(programEnrollments).values({
      userId: input.userId,
      programId: input.programId,
      status: "active",
      currentWeek: 1,
      sessionsCompletedThisWeek: 0,
      paymentAmount: input.paymentAmount,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
    });

    const enrollmentId = result.insertId;

    this.log?.info(
      { enrollmentId, userId: input.userId, programId: input.programId },
      "Member enrolled in program",
    );

    return enrollmentId;
  }

  /**
   * Cancel an enrollment. Per D-29: admin-only action.
   * Only active enrollments can be cancelled.
   */
  async cancelEnrollment(enrollmentId: number): Promise<void> {
    const rows = await this.db
      .select({ status: programEnrollments.status })
      .from(programEnrollments)
      .where(eq(programEnrollments.id, enrollmentId));

    if (rows.length === 0) {
      throw new NotFoundError("Inscripcion no encontrada");
    }

    if (rows[0].status !== "active") {
      throw new ConflictError(
        "Solo se pueden cancelar inscripciones activas",
      );
    }

    await this.db
      .update(programEnrollments)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
      })
      .where(eq(programEnrollments.id, enrollmentId));

    this.log?.info({ enrollmentId }, "Enrollment cancelled");
  }

  /**
   * Advance an enrollment to the next week. Per D-42: manual admin override.
   * Resets sessionsCompletedThisWeek to 0 and sets weekUnlockedAt.
   * If new week exceeds durationWeeks, marks enrollment as completed.
   */
  async advanceWeek(enrollmentId: number): Promise<void> {
    const enrollmentRows = await this.db
      .select({
        id: programEnrollments.id,
        status: programEnrollments.status,
        currentWeek: programEnrollments.currentWeek,
        programId: programEnrollments.programId,
      })
      .from(programEnrollments)
      .where(eq(programEnrollments.id, enrollmentId));

    if (enrollmentRows.length === 0) {
      throw new NotFoundError("Inscripcion no encontrada");
    }

    const enrollment = enrollmentRows[0];

    if (enrollment.status !== "active") {
      throw new ConflictError("Solo se pueden avanzar inscripciones activas");
    }

    // Get program duration
    const programRows = await this.db
      .select({ durationWeeks: microPrograms.durationWeeks })
      .from(microPrograms)
      .where(eq(microPrograms.id, enrollment.programId));

    if (programRows.length === 0) {
      throw new NotFoundError("Programa no encontrado");
    }

    const durationWeeks = programRows[0].durationWeeks;
    const newWeek = enrollment.currentWeek + 1;

    if (newWeek > durationWeeks) {
      // Program complete
      await this.db
        .update(programEnrollments)
        .set({
          status: "completed",
          completedAt: new Date(),
          currentWeek: enrollment.currentWeek, // stays at last week
          sessionsCompletedThisWeek: 0,
          weekUnlockedAt: new Date(),
        })
        .where(eq(programEnrollments.id, enrollmentId));

      this.log?.info(
        { enrollmentId, week: enrollment.currentWeek },
        "Enrollment completed via advance",
      );
    } else {
      // Advance to next week
      await this.db
        .update(programEnrollments)
        .set({
          currentWeek: newWeek,
          sessionsCompletedThisWeek: 0,
          weekUnlockedAt: new Date(),
        })
        .where(eq(programEnrollments.id, enrollmentId));

      this.log?.info(
        { enrollmentId, newWeek },
        "Enrollment advanced to next week",
      );
    }
  }

  /**
   * Get all enrollments for a user, joined with program info.
   * Active enrollments first, then by enrolledAt DESC.
   */
  async getEnrollmentsByUser(userId: number): Promise<ProgramEnrollment[]> {
    const rows = await this.db
      .select({
        id: programEnrollments.id,
        userId: programEnrollments.userId,
        programId: programEnrollments.programId,
        programName: microPrograms.name,
        status: programEnrollments.status,
        currentWeek: programEnrollments.currentWeek,
        sessionsCompletedThisWeek:
          programEnrollments.sessionsCompletedThisWeek,
        durationWeeks: microPrograms.durationWeeks,
        sessionsPerWeekToAdvance: microPrograms.sessionsPerWeekToAdvance,
        enrolledAt: programEnrollments.enrolledAt,
        completedAt: programEnrollments.completedAt,
        expiredAt: programEnrollments.expiredAt,
        cancelledAt: programEnrollments.cancelledAt,
        paymentAmount: programEnrollments.paymentAmount,
        paymentMethod: programEnrollments.paymentMethod,
      })
      .from(programEnrollments)
      .innerJoin(
        microPrograms,
        eq(programEnrollments.programId, microPrograms.id),
      )
      .where(eq(programEnrollments.userId, userId))
      .orderBy(
        sql`CASE WHEN ${programEnrollments.status} = 'active' THEN 0 ELSE 1 END`,
        desc(programEnrollments.enrolledAt),
      );

    return rows.map((r) => ({
      ...r,
      enrolledAt: r.enrolledAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      expiredAt: r.expiredAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
    }));
  }

  /**
   * Get the single active enrollment for a user, or null.
   */
  async getActiveEnrollment(
    userId: number,
  ): Promise<ProgramEnrollment | null> {
    const rows = await this.db
      .select({
        id: programEnrollments.id,
        userId: programEnrollments.userId,
        programId: programEnrollments.programId,
        programName: microPrograms.name,
        status: programEnrollments.status,
        currentWeek: programEnrollments.currentWeek,
        sessionsCompletedThisWeek:
          programEnrollments.sessionsCompletedThisWeek,
        durationWeeks: microPrograms.durationWeeks,
        sessionsPerWeekToAdvance: microPrograms.sessionsPerWeekToAdvance,
        enrolledAt: programEnrollments.enrolledAt,
        completedAt: programEnrollments.completedAt,
        expiredAt: programEnrollments.expiredAt,
        cancelledAt: programEnrollments.cancelledAt,
        paymentAmount: programEnrollments.paymentAmount,
        paymentMethod: programEnrollments.paymentMethod,
      })
      .from(programEnrollments)
      .innerJoin(
        microPrograms,
        eq(programEnrollments.programId, microPrograms.id),
      )
      .where(
        and(
          eq(programEnrollments.userId, userId),
          eq(programEnrollments.status, "active"),
        ),
      );

    if (rows.length === 0) return null;

    const r = rows[0];
    return {
      ...r,
      enrolledAt: r.enrolledAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      expiredAt: r.expiredAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
    };
  }

  // =========================================================================
  // Member-facing Methods
  // =========================================================================

  /**
   * Get the active program catalog for members.
   * Per D-46: programs with no content show "Proximamente" (hasContent=false).
   */
  async getCatalog(): Promise<MemberProgramCatalogItem[]> {
    const rows = await this.db
      .select({
        id: microPrograms.id,
        name: microPrograms.name,
        description: microPrograms.description,
        price: microPrograms.price,
        durationWeeks: microPrograms.durationWeeks,
        hasContent: sql<boolean>`EXISTS (
          SELECT 1 FROM micro_program_content_blocks
          WHERE micro_program_content_blocks.program_id = ${microPrograms.id}
        )`.as("has_content"),
      })
      .from(microPrograms)
      .where(eq(microPrograms.isActive, true))
      .orderBy(desc(microPrograms.createdAt));

    return rows.map((r) => ({
      ...r,
      hasContent: Boolean(r.hasContent),
    }));
  }

  /**
   * Get member's active enrollment progress including current week's content blocks.
   * Returns null if no active enrollment exists.
   * IMPORTANT: includes programId for PlanesPage enrollment check per D-47.
   */
  async getMemberProgress(
    userId: number,
  ): Promise<MemberEnrollmentProgress | null> {
    // Get active enrollment with program fields
    const enrollmentRows = await this.db
      .select({
        enrollmentId: programEnrollments.id,
        programId: programEnrollments.programId,
        programName: microPrograms.name,
        currentWeek: programEnrollments.currentWeek,
        durationWeeks: microPrograms.durationWeeks,
        sessionsCompletedThisWeek:
          programEnrollments.sessionsCompletedThisWeek,
        sessionsPerWeekToAdvance: microPrograms.sessionsPerWeekToAdvance,
        enrolledAt: programEnrollments.enrolledAt,
      })
      .from(programEnrollments)
      .innerJoin(
        microPrograms,
        eq(programEnrollments.programId, microPrograms.id),
      )
      .where(
        and(
          eq(programEnrollments.userId, userId),
          eq(programEnrollments.status, "active"),
        ),
      );

    if (enrollmentRows.length === 0) return null;

    const enrollment = enrollmentRows[0];

    // Fetch content blocks for current week only, with exercise join
    const blockRows = await this.db
      .select({
        id: microProgramContentBlocks.id,
        weekNumber: microProgramContentBlocks.weekNumber,
        sortOrder: microProgramContentBlocks.sortOrder,
        blockType: microProgramContentBlocks.blockType,
        title: microProgramContentBlocks.title,
        content: microProgramContentBlocks.content,
        videoUrl: microProgramContentBlocks.videoUrl,
        exerciseId: microProgramContentBlocks.exerciseId,
        exerciseName: exercises.exercise,
        exerciseVideoUrl: exercises.videoUrl,
      })
      .from(microProgramContentBlocks)
      .leftJoin(
        exercises,
        eq(microProgramContentBlocks.exerciseId, exercises.id),
      )
      .where(
        and(
          eq(microProgramContentBlocks.programId, enrollment.programId),
          eq(
            microProgramContentBlocks.weekNumber,
            enrollment.currentWeek,
          ),
        ),
      )
      .orderBy(microProgramContentBlocks.sortOrder);

    const contentBlocks: ContentBlockDetail[] = blockRows.map((b) => ({
      id: b.id,
      weekNumber: b.weekNumber,
      sortOrder: b.sortOrder,
      blockType: b.blockType,
      title: b.title,
      content: b.content,
      videoUrl: b.videoUrl,
      exerciseId: b.exerciseId,
      exerciseName: b.exerciseName ?? null,
      exerciseVideoUrl: b.exerciseVideoUrl ?? null,
    }));

    // Calculate derived fields
    const isWeekComplete =
      enrollment.sessionsCompletedThisWeek >=
      enrollment.sessionsPerWeekToAdvance;

    // Calculate daysUntilExpiry: enrolledAt + (durationWeeks * 7 days) - now
    const enrolledAtMs = enrollment.enrolledAt.getTime();
    const expiryMs =
      enrolledAtMs + enrollment.durationWeeks * 7 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const daysUntilExpiry = Math.ceil((expiryMs - nowMs) / (24 * 60 * 60 * 1000));

    return {
      enrollmentId: enrollment.enrollmentId,
      programId: enrollment.programId,
      programName: enrollment.programName,
      currentWeek: enrollment.currentWeek,
      durationWeeks: enrollment.durationWeeks,
      sessionsCompletedThisWeek: enrollment.sessionsCompletedThisWeek,
      sessionsPerWeekToAdvance: enrollment.sessionsPerWeekToAdvance,
      isWeekComplete,
      daysUntilExpiry: daysUntilExpiry > 0 ? daysUntilExpiry : 0,
      contentBlocks,
    };
  }

  // =========================================================================
  // Analytics
  // =========================================================================

  /**
   * Get program analytics. Per D-40: total, active, and completed enrollment counts.
   */
  async getAnalytics(): Promise<ProgramAnalytics> {
    const [totalRows, activeRows, completedRows] = await Promise.all([
      this.db.select({ count: count() }).from(programEnrollments),
      this.db
        .select({ count: count() })
        .from(programEnrollments)
        .where(eq(programEnrollments.status, "active")),
      this.db
        .select({ count: count() })
        .from(programEnrollments)
        .where(eq(programEnrollments.status, "completed")),
    ]);

    return {
      totalEnrollments: totalRows[0]?.count ?? 0,
      activeEnrollments: activeRows[0]?.count ?? 0,
      completedCount: completedRows[0]?.count ?? 0,
    };
  }
}
