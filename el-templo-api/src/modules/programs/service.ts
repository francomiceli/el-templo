// Module: programs
import { eq, and, or, sql, desc, count } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import {
  programs,
  programContentBlocks,
  programEnrollments,
  exercises,
  subscriptions,
  subscriptionPlans,
  users,
} from "../../db/schema";
import { NotFoundError, ConflictError, ForbiddenError } from "../shared/errors";
import type { AuraService } from "../aura/service";
import type {
  CreateProgramInput,
  UpdateProgramInput,
  ContentBlockInput,
  Program,
  ProgramDetail,
  ContentBlockDetail,
  ProgramEnrollment,
  MemberProgramCatalogItem,
  MemberEnrollmentProgress,
  ProgramAnalytics,
  CurrentProgramResponse,
  EnrollmentsListResponse,
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
      const [result] = await tx.insert(programs).values({
        name: input.name,
        description: input.description,
        durationWeeks: input.durationWeeks,
        sessionsPerWeekToAdvance: input.sessionsPerWeekToAdvance,
        goalPlanType: input.goalPlanType ?? null,
        auraWeeklyBonus: input.auraWeeklyBonus,
        auraCompletionBonus: input.auraCompletionBonus,
      });

      const programId = result.insertId;

      if (input.contentBlocks.length > 0) {
        await tx.insert(programContentBlocks).values(
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
  async listPrograms(): Promise<Program[]> {
    const rows = await this.db
      .select({
        id: programs.id,
        name: programs.name,
        description: programs.description,
        durationWeeks: programs.durationWeeks,
        sessionsPerWeekToAdvance: programs.sessionsPerWeekToAdvance,
        auraWeeklyBonus: programs.auraWeeklyBonus,
        auraCompletionBonus: programs.auraCompletionBonus,
        goalPlanType: programs.goalPlanType,
        isActive: programs.isActive,
        createdAt: programs.createdAt,
      })
      .from(programs)
      .orderBy(desc(programs.createdAt));

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
  async getProgramDetail(programId: number): Promise<ProgramDetail | null> {
    // Fetch the program
    const programRows = await this.db
      .select({
        id: programs.id,
        name: programs.name,
        description: programs.description,
        durationWeeks: programs.durationWeeks,
        sessionsPerWeekToAdvance: programs.sessionsPerWeekToAdvance,
        auraWeeklyBonus: programs.auraWeeklyBonus,
        auraCompletionBonus: programs.auraCompletionBonus,
        goalPlanType: programs.goalPlanType,
        isActive: programs.isActive,
        createdAt: programs.createdAt,
      })
      .from(programs)
      .where(eq(programs.id, programId));

    if (programRows.length === 0) return null;

    const program = programRows[0];

    // Fetch content blocks with exercise join
    const blockRows = await this.db
      .select({
        id: programContentBlocks.id,
        weekNumber: programContentBlocks.weekNumber,
        sortOrder: programContentBlocks.sortOrder,
        blockType: programContentBlocks.blockType,
        title: programContentBlocks.title,
        content: programContentBlocks.content,
        videoUrl: programContentBlocks.videoUrl,
        exerciseId: programContentBlocks.exerciseId,
        exerciseName: exercises.exercise,
        exerciseVideoUrl: exercises.videoUrl,
      })
      .from(programContentBlocks)
      .leftJoin(exercises, eq(programContentBlocks.exerciseId, exercises.id))
      .where(eq(programContentBlocks.programId, programId))
      .orderBy(programContentBlocks.weekNumber, programContentBlocks.sortOrder);

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
      durationWeeks: program.durationWeeks,
      sessionsPerWeekToAdvance: program.sessionsPerWeekToAdvance,
      auraWeeklyBonus: program.auraWeeklyBonus ?? 15,
      auraCompletionBonus: program.auraCompletionBonus ?? 100,
      goalPlanType: program.goalPlanType,
      isActive: program.isActive,
      createdAt: program.createdAt.toISOString(),
      contentBlocks,
      activeEnrollmentCount: enrollmentCountRows[0]?.count ?? 0,
    };
  }

  /**
   * Update program fields (name, description, AURA bonuses).
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
    if (input.goalPlanType !== undefined)
      updateFields.goalPlanType = input.goalPlanType;
    if (input.auraWeeklyBonus !== undefined)
      updateFields.auraWeeklyBonus = input.auraWeeklyBonus;
    if (input.auraCompletionBonus !== undefined)
      updateFields.auraCompletionBonus = input.auraCompletionBonus;

    if (Object.keys(updateFields).length === 0) return;

    const result = await this.db
      .update(programs)
      .set(updateFields)
      .where(eq(programs.id, programId));

    if (result[0].affectedRows === 0) {
      throw new NotFoundError("Programa no encontrado");
    }

    this.log?.info(
      { programId, fields: Object.keys(updateFields) },
      "Program updated",
    );
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
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.id, programId));

    if (programRows.length === 0) {
      throw new NotFoundError("Programa no encontrado");
    }

    await this.db.insert(programContentBlocks).values(
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
      .update(programs)
      .set({ isActive: false })
      .where(eq(programs.id, programId));

    if (result[0].affectedRows === 0) {
      throw new NotFoundError("Programa no encontrado");
    }

    this.log?.info({ programId }, "Program deactivated");
  }

  // =========================================================================
  // Enrollment Methods
  // =========================================================================

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
      throw new ConflictError("Solo se pueden cancelar inscripciones activas");
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
      .select({ durationWeeks: programs.durationWeeks })
      .from(programs)
      .where(eq(programs.id, enrollment.programId));

    if (programRows.length === 0) {
      throw new NotFoundError("Programa no encontrado");
    }

    const durationWeeks = programRows[0].durationWeeks;
    const newWeek = enrollment.currentWeek + 1;

    if (durationWeeks !== null && newWeek > durationWeeks) {
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
        programName: programs.name,
        status: programEnrollments.status,
        currentWeek: programEnrollments.currentWeek,
        sessionsCompletedThisWeek: programEnrollments.sessionsCompletedThisWeek,
        durationWeeks: programs.durationWeeks,
        sessionsPerWeekToAdvance: programs.sessionsPerWeekToAdvance,
        enrolledAt: programEnrollments.enrolledAt,
        completedAt: programEnrollments.completedAt,
        expiredAt: programEnrollments.expiredAt,
        cancelledAt: programEnrollments.cancelledAt,
      })
      .from(programEnrollments)
      .innerJoin(programs, eq(programEnrollments.programId, programs.id))
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
  async getActiveEnrollment(userId: number): Promise<ProgramEnrollment | null> {
    const rows = await this.db
      .select({
        id: programEnrollments.id,
        userId: programEnrollments.userId,
        programId: programEnrollments.programId,
        programName: programs.name,
        status: programEnrollments.status,
        currentWeek: programEnrollments.currentWeek,
        sessionsCompletedThisWeek: programEnrollments.sessionsCompletedThisWeek,
        durationWeeks: programs.durationWeeks,
        sessionsPerWeekToAdvance: programs.sessionsPerWeekToAdvance,
        enrolledAt: programEnrollments.enrolledAt,
        completedAt: programEnrollments.completedAt,
        expiredAt: programEnrollments.expiredAt,
        cancelledAt: programEnrollments.cancelledAt,
      })
      .from(programEnrollments)
      .innerJoin(programs, eq(programEnrollments.programId, programs.id))
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
        id: programs.id,
        name: programs.name,
        description: programs.description,
        durationWeeks: programs.durationWeeks,
        hasContent: sql<boolean>`EXISTS (
          SELECT 1 FROM program_content_blocks
          WHERE program_content_blocks.program_id = ${programs.id}
        )`.as("has_content"),
      })
      .from(programs)
      .where(eq(programs.isActive, true))
      .orderBy(desc(programs.createdAt));

    return rows.map((r) => ({
      ...r,
      hasContent: Boolean(r.hasContent),
    }));
  }

  /**
   * Get member's active enrollment progress including current week's content blocks.
   * Returns null if no active enrollment exists.
   *
   * Bundle members can hold multiple active enrollments at once. Resolution:
   *   1. If users.currentProgramEnrollmentId points at one of the user's
   *      active enrollments, use that one (the home dropdown drives this).
   *   2. Otherwise fall back to the first active enrollment — preserves the
   *      original behavior for single-program members and stale pointers.
   *
   * IMPORTANT: includes programId for PlanesPage enrollment check per D-47.
   */
  async getMemberProgress(
    userId: number,
  ): Promise<MemberEnrollmentProgress | null> {
    const [userRow] = await this.db
      .select({ currentProgramEnrollmentId: users.currentProgramEnrollmentId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const baseSelect = () =>
      this.db
        .select({
          enrollmentId: programEnrollments.id,
          programId: programEnrollments.programId,
          programName: programs.name,
          goalPlanType: programs.goalPlanType,
          currentWeek: programEnrollments.currentWeek,
          durationWeeks: programs.durationWeeks,
          sessionsCompletedThisWeek:
            programEnrollments.sessionsCompletedThisWeek,
          sessionsPerWeekToAdvance: programs.sessionsPerWeekToAdvance,
          enrolledAt: programEnrollments.enrolledAt,
        })
        .from(programEnrollments)
        .innerJoin(programs, eq(programEnrollments.programId, programs.id));

    // Try the pointer first; fall back to the first active enrollment for
    // single-program members and stale pointers.
    let enrollment: Awaited<ReturnType<typeof baseSelect>>[number] | null =
      null;

    if (userRow?.currentProgramEnrollmentId != null) {
      const [pointed] = await baseSelect()
        .where(
          and(
            eq(programEnrollments.id, userRow.currentProgramEnrollmentId),
            eq(programEnrollments.userId, userId),
            eq(programEnrollments.status, "active"),
          ),
        )
        .limit(1);
      if (pointed) enrollment = pointed;
    }

    if (!enrollment) {
      const [first] = await baseSelect()
        .where(
          and(
            eq(programEnrollments.userId, userId),
            eq(programEnrollments.status, "active"),
          ),
        )
        .limit(1);
      if (!first) return null;
      enrollment = first;
    }

    // Fetch content blocks for current week only, with exercise join
    const blockRows = await this.db
      .select({
        id: programContentBlocks.id,
        weekNumber: programContentBlocks.weekNumber,
        sortOrder: programContentBlocks.sortOrder,
        blockType: programContentBlocks.blockType,
        title: programContentBlocks.title,
        content: programContentBlocks.content,
        videoUrl: programContentBlocks.videoUrl,
        exerciseId: programContentBlocks.exerciseId,
        exerciseName: exercises.exercise,
        exerciseVideoUrl: exercises.videoUrl,
      })
      .from(programContentBlocks)
      .leftJoin(exercises, eq(programContentBlocks.exerciseId, exercises.id))
      .where(
        and(
          eq(programContentBlocks.programId, enrollment.programId),
          eq(programContentBlocks.weekNumber, enrollment.currentWeek),
        ),
      )
      .orderBy(programContentBlocks.sortOrder);

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
    // Indefinite programs (durationWeeks=null) never expire
    let daysUntilExpiry: number | null = null;
    if (enrollment.durationWeeks !== null) {
      const enrolledAtMs = enrollment.enrolledAt.getTime();
      const expiryMs =
        enrolledAtMs + enrollment.durationWeeks * 7 * 24 * 60 * 60 * 1000;
      const nowMs = Date.now();
      daysUntilExpiry = Math.ceil((expiryMs - nowMs) / (24 * 60 * 60 * 1000));
    }

    // Check if enrollment came from the subscription plan's linkedProgramId
    // (i.e. presencial members who get Foundation for free with their plan)
    let isLinkedToSubscription = false;
    const subRows = await this.db
      .select({ linkedProgramId: subscriptionPlans.linkedProgramId })
      .from(subscriptions)
      .innerJoin(
        subscriptionPlans,
        eq(subscriptions.planId, subscriptionPlans.id),
      )
      .where(
        and(
          eq(subscriptions.userId, userId),
          sql`${subscriptions.status} IN ('active', 'paused')`,
        ),
      )
      .limit(1);

    if (
      subRows.length > 0 &&
      subRows[0].linkedProgramId === enrollment.programId
    ) {
      isLinkedToSubscription = true;
    }

    return {
      enrollmentId: enrollment.enrollmentId,
      programId: enrollment.programId,
      programName: enrollment.programName,
      goalPlanType: enrollment.goalPlanType ?? null,
      currentWeek: enrollment.currentWeek,
      durationWeeks: enrollment.durationWeeks,
      sessionsCompletedThisWeek: enrollment.sessionsCompletedThisWeek,
      sessionsPerWeekToAdvance: enrollment.sessionsPerWeekToAdvance,
      isWeekComplete,
      daysUntilExpiry:
        daysUntilExpiry !== null && daysUntilExpiry > 0
          ? daysUntilExpiry
          : daysUntilExpiry === null
            ? null
            : 0,
      isLinkedToSubscription,
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

  // =========================================================================
  // Session Completion Integration
  // =========================================================================

  /**
   * Record a completed session for program progression.
   * Called from session completion route. Increments weekly counter,
   * checks advancement criteria, awards AURA on week/program completion.
   *
   * Per D-04: next week unlocks when BOTH conditions are met:
   *   (a) sessions threshold met (sessionsCompletedThisWeek >= sessionsPerWeekToAdvance)
   *   (b) calendar week has arrived (current date >= enrolledAt + (currentWeek * 7 days))
   *
   * Per D-05: catch-up allowed — if member completes required sessions later,
   *   advancement happens retroactively once BOTH conditions are met.
   */
  async recordSessionForProgram(
    userId: number,
    auraService: AuraService,
  ): Promise<void> {
    // 1. Get active enrollment for userId
    const enrollmentRows = await this.db
      .select({
        id: programEnrollments.id,
        programId: programEnrollments.programId,
        currentWeek: programEnrollments.currentWeek,
        sessionsCompletedThisWeek: programEnrollments.sessionsCompletedThisWeek,
        enrolledAt: programEnrollments.enrolledAt,
      })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, userId),
          eq(programEnrollments.status, "active"),
        ),
      );

    if (enrollmentRows.length === 0) return; // No active enrollment, nothing to do

    const enrollment = enrollmentRows[0];

    // 2. Load joined program to get thresholds and AURA config
    const programRows = await this.db
      .select({
        durationWeeks: programs.durationWeeks,
        sessionsPerWeekToAdvance: programs.sessionsPerWeekToAdvance,
        auraWeeklyBonus: programs.auraWeeklyBonus,
        auraCompletionBonus: programs.auraCompletionBonus,
      })
      .from(programs)
      .where(eq(programs.id, enrollment.programId));

    if (programRows.length === 0) {
      this.log?.warn(
        { enrollmentId: enrollment.id, programId: enrollment.programId },
        "Program not found for active enrollment",
      );
      return;
    }

    const program = programRows[0];
    const auraWeeklyBonus = program.auraWeeklyBonus ?? 15;
    const auraCompletionBonus = program.auraCompletionBonus ?? 100;

    // 3. Increment sessionsCompletedThisWeek
    const newSessionCount = enrollment.sessionsCompletedThisWeek + 1;

    // 4. Check advancement conditions
    const sessionsThresholdMet =
      newSessionCount >= program.sessionsPerWeekToAdvance;

    // Calendar week check: next week starts at enrolledAt + (currentWeek * 7 days)
    const enrolledDate = new Date(enrollment.enrolledAt);
    const nextWeekStartDate = new Date(
      enrolledDate.getTime() + enrollment.currentWeek * 7 * 24 * 60 * 60 * 1000,
    );
    const calendarWeekArrived = new Date() >= nextWeekStartDate;

    // Use transaction for atomicity
    await this.db.transaction(async (tx) => {
      if (sessionsThresholdMet && calendarWeekArrived) {
        if (
          program.durationWeeks !== null &&
          enrollment.currentWeek >= program.durationWeeks
        ) {
          // Program completion! Award weekly + completion bonus, mark completed
          try {
            await auraService.award({
              userId,
              sourceType: "program_week_completion",
              referenceType: "program_enrollment",
              referenceId: enrollment.id,
              amount: auraWeeklyBonus,
              description: "Semana completada",
            });
          } catch (auraErr: unknown) {
            this.log?.warn(
              { err: auraErr, userId, enrollmentId: enrollment.id },
              "AURA weekly bonus award failed on program completion",
            );
          }

          try {
            await auraService.award({
              userId,
              sourceType: "program_completion",
              referenceType: "program_enrollment",
              referenceId: enrollment.id,
              amount: auraCompletionBonus,
              description: "Experiencia completada",
            });
          } catch (auraErr: unknown) {
            this.log?.warn(
              { err: auraErr, userId, enrollmentId: enrollment.id },
              "AURA completion bonus award failed",
            );
          }

          await tx
            .update(programEnrollments)
            .set({
              sessionsCompletedThisWeek: newSessionCount,
              status: "completed",
              completedAt: new Date(),
            })
            .where(eq(programEnrollments.id, enrollment.id));

          this.log?.info(
            { enrollmentId: enrollment.id, userId },
            "Program enrollment completed via session progression",
          );
        } else {
          // Week completion — advance to next week
          try {
            await auraService.award({
              userId,
              sourceType: "program_week_completion",
              referenceType: "program_enrollment",
              referenceId: enrollment.id,
              amount: auraWeeklyBonus,
              description: "Semana completada",
            });
          } catch (auraErr: unknown) {
            this.log?.warn(
              { err: auraErr, userId, enrollmentId: enrollment.id },
              "AURA weekly bonus award failed",
            );
          }

          await tx
            .update(programEnrollments)
            .set({
              currentWeek: enrollment.currentWeek + 1,
              sessionsCompletedThisWeek: 0,
              weekUnlockedAt: new Date(),
            })
            .where(eq(programEnrollments.id, enrollment.id));

          this.log?.info(
            {
              enrollmentId: enrollment.id,
              newWeek: enrollment.currentWeek + 1,
            },
            "Enrollment advanced to next week via session progression",
          );
        }
      } else {
        // Either sessions threshold not met, or calendar week hasn't arrived yet
        // Just save the incremented count
        await tx
          .update(programEnrollments)
          .set({ sessionsCompletedThisWeek: newSessionCount })
          .where(eq(programEnrollments.id, enrollment.id));
      }
    });
  }

  // =========================================================================
  // Personalizadas Gate
  // =========================================================================

  // =========================================================================
  // Current Program Pointer (R6)
  // =========================================================================

  /**
   * Read the user's current program pointer (users.current_program_enrollment_id)
   * joined with the program metadata. Returns { enrollmentId: null, program: null }
   * if no pointer is set OR if the pointer is stale (pointed-to enrollment was
   * hard-deleted, belongs to another user, or is no longer active).
   *
   * Stale pointers are logged as warnings so we can spot data integrity issues.
   */
  async getCurrentProgram(userId: number): Promise<CurrentProgramResponse> {
    const [user] = await this.db
      .select({ currentProgramEnrollmentId: users.currentProgramEnrollmentId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.currentProgramEnrollmentId === null) {
      return { enrollmentId: null, program: null };
    }

    const [row] = await this.db
      .select({
        enrollmentId: programEnrollments.id,
        enrollmentUserId: programEnrollments.userId,
        enrollmentStatus: programEnrollments.status,
        currentWeek: programEnrollments.currentWeek,
        programId: programs.id,
        programName: programs.name,
        goalPlanType: programs.goalPlanType,
        durationWeeks: programs.durationWeeks,
      })
      .from(programEnrollments)
      .innerJoin(programs, eq(programs.id, programEnrollments.programId))
      .where(eq(programEnrollments.id, user.currentProgramEnrollmentId))
      .limit(1);

    if (
      !row ||
      row.enrollmentUserId !== userId ||
      row.enrollmentStatus !== "active"
    ) {
      this.log?.warn(
        {
          userId,
          currentProgramEnrollmentId: user.currentProgramEnrollmentId,
          ownershipMatch: row?.enrollmentUserId === userId,
          status: row?.enrollmentStatus,
        },
        "Stale currentProgramEnrollmentId pointer — returning null",
      );
      return { enrollmentId: null, program: null };
    }

    return {
      enrollmentId: row.enrollmentId,
      program: {
        id: row.programId,
        name: row.programName,
        goalPlanType: row.goalPlanType ?? null,
        durationWeeks: row.durationWeeks,
        currentWeek: row.currentWeek,
      },
    };
  }

  /**
   * Set the user's current program pointer.
   *
   * - enrollmentId === null means "Templo view" — only valid when the user has
   *   an active or paused presencial subscription.
   * - non-null enrollmentId must (a) exist, (b) belong to this user, (c) be
   *   in status='active'. Ownership-not-found and ownership-mismatch share the
   *   same generic message to avoid leaking the existence of other users'
   *   enrollment IDs.
   *
   * Throws ForbiddenError on any validation failure (mapped to 403 by
   * handleServiceError).
   */
  async setCurrentProgram(
    userId: number,
    enrollmentId: number | null,
  ): Promise<CurrentProgramResponse> {
    if (enrollmentId === null) {
      const [presencialSub] = await this.db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .innerJoin(
          subscriptionPlans,
          eq(subscriptions.planId, subscriptionPlans.id),
        )
        .where(
          and(
            eq(subscriptions.userId, userId),
            or(
              eq(subscriptions.status, "active"),
              eq(subscriptions.status, "paused"),
            ),
            eq(subscriptionPlans.planCategory, "presencial"),
          ),
        )
        .limit(1);

      if (!presencialSub) {
        throw new ForbiddenError(
          "Solo usuarios con plan presencial activo pueden ver el Templo",
        );
      }

      await this.db
        .update(users)
        .set({ currentProgramEnrollmentId: null })
        .where(eq(users.id, userId));

      this.log?.info(
        { userId },
        "currentProgramEnrollmentId cleared (Templo view) for presencial member",
      );

      return { enrollmentId: null, program: null };
    }

    const [row] = await this.db
      .select({
        id: programEnrollments.id,
        userId: programEnrollments.userId,
        status: programEnrollments.status,
      })
      .from(programEnrollments)
      .where(eq(programEnrollments.id, enrollmentId))
      .limit(1);

    if (!row || row.userId !== userId) {
      throw new ForbiddenError("Inscripcion no encontrada o no autorizada");
    }
    if (row.status !== "active") {
      throw new ForbiddenError("La inscripcion no esta activa");
    }

    await this.db
      .update(users)
      .set({ currentProgramEnrollmentId: enrollmentId })
      .where(eq(users.id, userId));

    this.log?.info({ userId, enrollmentId }, "currentProgramEnrollmentId set");

    return this.getCurrentProgram(userId);
  }

  /**
   * List the user's active program enrollments ordered by id ASC.
   * Consumed by the Plan 05 program selector to populate the bottom-sheet
   * options. Returns an empty array if the user has no active enrollments.
   */
  async listMyActiveEnrollments(
    userId: number,
  ): Promise<EnrollmentsListResponse> {
    const rows = await this.db
      .select({
        id: programEnrollments.id,
        programId: programEnrollments.programId,
        programName: programs.name,
        goalPlanType: programs.goalPlanType,
        currentWeek: programEnrollments.currentWeek,
        durationWeeks: programs.durationWeeks,
      })
      .from(programEnrollments)
      .innerJoin(programs, eq(programs.id, programEnrollments.programId))
      .where(
        and(
          eq(programEnrollments.userId, userId),
          eq(programEnrollments.status, "active"),
        ),
      )
      .orderBy(programEnrollments.id);

    return {
      enrollments: rows.map((r) => ({
        id: r.id,
        programId: r.programId,
        programName: r.programName,
        goalPlanType: r.goalPlanType ?? null,
        currentWeek: r.currentWeek,
        durationWeeks: r.durationWeeks,
      })),
    };
  }

  /**
   * Check if user has an active program enrollment.
   * Used as Personalizadas access gate per D-08.
   */
  async hasActiveProgramEnrollment(userId: number): Promise<boolean> {
    const rows = await this.db
      .select({ count: count() })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, userId),
          eq(programEnrollments.status, "active"),
        ),
      );

    return (rows[0]?.count ?? 0) > 0;
  }
}
