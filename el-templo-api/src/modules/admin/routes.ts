import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { AdminSessionService, SessionFilter } from "./service";
import { AdminEditService } from "./edit-service";
import { ExerciseService } from "./exercise-service";
import { VideoService } from "./video-service";
import { parseDayId } from "../shared/training-constants";
import { assembleVideoUrl } from "../shared/video-url";
import {
  getSessionsSchema,
  sessionIdSchema,
  bulkApproveSchema,
  getWeekSummarySchema,
  generateWeekSchema,
  getBlockPoolSchema,
  swapBlockSchema,
  getExercisePoolSchema,
  swapExerciseSchema,
  updatePrescriptionSchema,
  changeFormatSchema,
  addExerciseSchema,
  removeExerciseSchema,
  reorderExerciseSchema,
  resetSessionSchema,
  getCompatibleFormatsSchema,
  getPreviewSchema,
  updateFormatParamsSchema,
  saveBlockSchema,
  deleteSavedBlockSchema,
  getMobilityPoolSchema,
  swapMobilityExerciseSchema,
  updateBlockRoleSchema,
  searchExercisesSchema,
  getDaySessionDetailsSchema,
  getCompatibleFormatsBatchSchema,
} from "./schemas";
import {
  listExercisesSchema,
  exerciseIdParamsSchema,
  uploadCompleteBodySchema,
  bulkUploadUrlsBodySchema,
} from "./video-schemas";

import { handleServiceError } from "../shared/error-handler";
import { COACH_ROLES } from "../shared/permissions";

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const adminService = new AdminSessionService(fastify.db);
  const editService = new AdminEditService(fastify.db);

  // Role check hook for all routes
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(COACH_ROLES as readonly string[]).includes(request.user.role)) {
      return reply
        .status(403)
        .send({ error: "Acceso de administrador requerido" });
    }
  });

  // GET /admin/sessions - List sessions with filters
  fastify.get("/sessions", { schema: getSessionsSchema }, async (request) => {
    const filter = request.query as SessionFilter;
    return adminService.getSessions(filter);
  });

  // GET /admin/sessions/pending-count - Get pending session count
  fastify.get("/sessions/pending-count", async () => {
    const count = await adminService.getPendingCount();
    return { count };
  });

  // GET /admin/sessions/coverage - Get weeks coverage info for alert display
  fastify.get("/sessions/coverage", async () => {
    return adminService.getApprovedWeeksCoverage();
  });

  // GET /admin/sessions/day-details - Batch fetch all session details for a day
  fastify.get<{
    Querystring: { week: number; day: string; journeyType?: string };
  }>(
    "/sessions/day-details",
    { schema: getDaySessionDetailsSchema },
    async (request) => {
      const { week, day, journeyType } = request.query;
      const sessions = await adminService.getDaySessionDetails(
        week,
        day,
        journeyType,
      );
      return { sessions };
    },
  );

  // GET /admin/sessions/:id - Get session details
  fastify.get<{ Params: { id: number } }>(
    "/sessions/:id",
    {
      schema: sessionIdSchema,
    },
    async (request, reply) => {
      const session = await adminService.getSessionWithDetails(
        request.params.id,
      );
      if (!session) {
        return reply.status(404).send({ error: "Sesion no encontrada" });
      }
      return session;
    },
  );

  // POST /admin/sessions/:id/approve - Approve session
  fastify.post<{ Params: { id: number } }>(
    "/sessions/:id/approve",
    {
      schema: sessionIdSchema,
    },
    async (request, reply) => {
      const success = await adminService.approveSession(
        request.params.id,
        request.user.userId,
      );
      if (!success) {
        return reply.status(404).send({ error: "Sesion no encontrada" });
      }
      return { success: true };
    },
  );

  // POST /admin/sessions/:id/revert - Revert approved session to pending
  fastify.post<{ Params: { id: number } }>(
    "/sessions/:id/revert",
    {
      schema: sessionIdSchema,
    },
    async (request, reply) => {
      const success = await adminService.revertSession(request.params.id);
      if (!success) {
        return reply.status(404).send({ error: "Sesion no encontrada" });
      }
      return { success: true };
    },
  );

  // POST /admin/sessions/bulk-approve - Approve multiple sessions
  fastify.post<{ Body: { ids: number[] } }>(
    "/sessions/bulk-approve",
    {
      schema: bulkApproveSchema,
    },
    async (request) => {
      const count = await adminService.bulkApprove(
        request.body.ids,
        request.user.userId,
      );
      return { success: true, approvedCount: count };
    },
  );

  // GET /admin/weeks/:week/summary - Get week generation status
  fastify.get<{ Params: { week: number } }>(
    "/weeks/:week/summary",
    {
      schema: getWeekSummarySchema,
    },
    async (request) => {
      return adminService.getWeekSummary(request.params.week);
    },
  );

  // POST /admin/generate - Generate sessions for a week
  fastify.post<{
    Body: {
      week: number;
      days?: string[];
      levelGroups?: string[];
      regenerate?: boolean;
    };
  }>(
    "/generate",
    {
      schema: generateWeekSchema,
    },
    async (request) => {
      const result = await adminService.generateWeek(request.body.week, {
        days: request.body.days,
        levelGroups: request.body.levelGroups,
        regenerate: request.body.regenerate,
      });
      return result;
    },
  );

  // GET /admin/blocks/pool - Get pool of blocks from approved sessions
  fastify.get<{
    Querystring: {
      route: string;
      memberLevel: string;
      excludeSessionId?: number;
      excludeBlockId?: number;
    };
  }>(
    "/blocks/pool",
    {
      schema: getBlockPoolSchema,
    },
    async (request) => {
      return adminService.getBlockPool(
        request.query.route,
        request.query.memberLevel,
        request.query.excludeSessionId,
        request.query.excludeBlockId,
      );
    },
  );

  // POST /admin/sessions/:sessionId/blocks/:blockId/swap - Swap block with pool block
  fastify.post<{
    Params: { sessionId: number; blockId: number };
    Body: { sourceBlockId: number };
  }>(
    "/sessions/:sessionId/blocks/:blockId/swap",
    {
      schema: swapBlockSchema,
    },
    async (request, reply) => {
      const success = await adminService.swapBlock(
        request.params.sessionId,
        request.params.blockId,
        request.body.sourceBlockId,
      );
      if (!success) {
        return reply
          .status(404)
          .send({ error: "Bloque no encontrado o sesion fuente no aprobada" });
      }
      return { success: true };
    },
  );

  // ==========================================================================
  // Session Editing Routes (Phase 15-03)
  // ==========================================================================

  // GET /admin/exercises/pool - Get exercise pool for swap
  fastify.get<{
    Querystring: {
      route: string;
      contraction?: string;
      blockId: number;
      pattern?: string;
    };
  }>(
    "/exercises/pool",
    {
      schema: getExercisePoolSchema,
    },
    async (request, reply) => {
      try {
        const exercises = await editService.getExercisePoolForBlock(
          request.query,
        );
        return { exercises };
      } catch (err: unknown) {
        return handleServiceError(err, reply, request.log, "get exercise pool");
      }
    },
  );

  // GET /admin/exercises/search - Search exercises by name for swap dialog
  fastify.get<{
    Querystring: {
      q: string;
      contraction?: string;
      blockId?: number;
      limit?: number;
    };
  }>(
    "/exercises/search",
    { schema: searchExercisesSchema },
    async (request) => {
      const { q, contraction, blockId, limit = 50 } = request.query;
      const exercises = await editService.searchExercisesForBlock({
        query: q,
        contraction,
        blockId,
        limit,
      });
      return { exercises };
    },
  );

  // POST /admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId/swap - Swap exercise
  fastify.post<{
    Params: { sessionId: number; blockId: number; prescriptionId: number };
    Body: { newExerciseId: number };
  }>(
    "/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId/swap",
    {
      schema: swapExerciseSchema,
    },
    async (request, reply) => {
      try {
        const result = await editService.swapExercise({
          sessionId: request.params.sessionId,
          blockId: request.params.blockId,
          oldPrescriptionId: request.params.prescriptionId,
          newExerciseId: request.body.newExerciseId,
          userId: request.user.userId,
        });
        return result;
      } catch (err: unknown) {
        return handleServiceError(err, reply, request.log, "swap exercise");
      }
    },
  );

  // PATCH /admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId - Update prescription
  fastify.patch<{
    Params: { sessionId: number; blockId: number; prescriptionId: number };
    Body: {
      reps?: number;
      repsMax?: number | null;
      seconds?: number;
      secondsMax?: number | null;
      increment?: number | null;
      rest?: number;
      notes?: string | null;
      contraction?: "CON" | "EXC" | "ISO";
      weighted?: boolean;
    };
  }>(
    "/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId",
    {
      schema: updatePrescriptionSchema,
    },
    async (request, reply) => {
      try {
        const result = await editService.updatePrescription({
          sessionId: request.params.sessionId,
          blockId: request.params.blockId,
          prescriptionId: request.params.prescriptionId,
          fields: request.body,
          userId: request.user.userId,
        });
        return result;
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "update prescription",
        );
      }
    },
  );

  // PATCH /admin/sessions/:sessionId/blocks/:blockId/format - Change block format
  fastify.patch<{
    Params: { sessionId: number; blockId: number };
    Body: { formatId: number; formatName: string };
  }>(
    "/sessions/:sessionId/blocks/:blockId/format",
    {
      schema: changeFormatSchema,
    },
    async (request, reply) => {
      try {
        const result = await editService.changeBlockFormat({
          sessionId: request.params.sessionId,
          blockId: request.params.blockId,
          newFormatId: request.body.formatId,
          newFormatName: request.body.formatName,
          userId: request.user.userId,
        });
        return result;
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "change block format",
        );
      }
    },
  );

  // PATCH /admin/sessions/:sessionId/blocks/:blockId/format-params - Update format params
  fastify.patch<{
    Params: { sessionId: number; blockId: number };
    Body: { formatParams: Record<string, unknown> };
  }>(
    "/sessions/:sessionId/blocks/:blockId/format-params",
    {
      schema: updateFormatParamsSchema,
    },
    async (request, reply) => {
      try {
        const result = await editService.updateFormatParams({
          sessionId: request.params.sessionId,
          blockId: request.params.blockId,
          formatParams: request.body.formatParams,
          userId: request.user.userId,
        });
        return result;
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "update format params",
        );
      }
    },
  );

  // PATCH /admin/sessions/:sessionId/blocks/:blockId/role - Update block role (ATHLOS/EPIKOS)
  fastify.patch<{
    Params: { sessionId: number; blockId: number };
    Body: { role: "ATHLOS" | "EPIKOS" };
  }>(
    "/sessions/:sessionId/blocks/:blockId/role",
    {
      schema: updateBlockRoleSchema,
    },
    async (request, reply) => {
      try {
        const result = await editService.updateBlockRole({
          sessionId: request.params.sessionId,
          blockId: request.params.blockId,
          role: request.body.role,
          userId: request.user.userId,
        });
        return result;
      } catch (err: unknown) {
        return handleServiceError(err, reply, request.log, "update block role");
      }
    },
  );

  // POST /admin/sessions/:sessionId/blocks/:blockId/exercises - Add exercise to block
  fastify.post<{
    Params: { sessionId: number; blockId: number };
    Body: { exerciseId: number };
  }>(
    "/sessions/:sessionId/blocks/:blockId/exercises",
    {
      schema: addExerciseSchema,
    },
    async (request, reply) => {
      try {
        const result = await editService.addExercise({
          sessionId: request.params.sessionId,
          blockId: request.params.blockId,
          exerciseId: request.body.exerciseId,
          userId: request.user.userId,
        });
        return result;
      } catch (err: unknown) {
        return handleServiceError(err, reply, request.log, "add exercise");
      }
    },
  );

  // DELETE /admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId - Remove exercise
  fastify.delete<{
    Params: { sessionId: number; blockId: number; prescriptionId: number };
  }>(
    "/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId",
    {
      schema: removeExerciseSchema,
    },
    async (request, reply) => {
      try {
        await editService.removeExercise({
          sessionId: request.params.sessionId,
          blockId: request.params.blockId,
          prescriptionId: request.params.prescriptionId,
          userId: request.user.userId,
        });
        return { success: true };
      } catch (err: unknown) {
        return handleServiceError(err, reply, request.log, "remove exercise");
      }
    },
  );

  // PATCH /admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId/reorder
  fastify.patch<{
    Params: { sessionId: number; blockId: number; prescriptionId: number };
    Body: { direction: "up" | "down" };
  }>(
    "/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId/reorder",
    { schema: reorderExerciseSchema },
    async (request, reply) => {
      try {
        await editService.reorderExercise({
          sessionId: request.params.sessionId,
          blockId: request.params.blockId,
          prescriptionId: request.params.prescriptionId,
          direction: request.body.direction,
          userId: request.user.userId,
        });
        return { success: true };
      } catch (err: unknown) {
        return handleServiceError(err, reply, request.log, "reorder exercise");
      }
    },
  );

  // ==========================================================================
  // Mobility Editing Routes (Phase 17-02)
  // ==========================================================================

  // GET /admin/exercises/mobility-pool - Get mobility exercise pool for swap
  fastify.get<{
    Querystring: { blockRoute: string };
  }>(
    "/exercises/mobility-pool",
    {
      schema: getMobilityPoolSchema,
    },
    async (request) => {
      const exercises = await editService.getMobilityPool(
        request.query.blockRoute,
      );
      return { exercises };
    },
  );

  // POST /admin/sessions/:sessionId/blocks/:blockId/mobility/swap - Swap mobility exercise
  fastify.post<{
    Params: { sessionId: number; blockId: number };
    Body: { newExerciseId: number };
  }>(
    "/sessions/:sessionId/blocks/:blockId/mobility/swap",
    {
      schema: swapMobilityExerciseSchema,
    },
    async (request, reply) => {
      try {
        const result = await editService.swapMobilityExercise({
          sessionId: request.params.sessionId,
          blockId: request.params.blockId,
          newExerciseId: request.body.newExerciseId,
          userId: request.user.userId,
        });
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "swap mobility exercise");
      }
    },
  );

  // POST /admin/sessions/:id/reset - Reset session to algorithm snapshot
  fastify.post<{
    Params: { id: number };
  }>(
    "/sessions/:id/reset",
    {
      schema: resetSessionSchema,
    },
    async (request, reply) => {
      try {
        await editService.resetToAlgorithm({
          sessionId: request.params.id,
          userId: request.user.userId,
        });
        return { success: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("snapshot")) {
          return reply
            .status(400)
            .send({ error: "No hay snapshot disponible para esta sesion" });
        }
        return reply
          .status(404)
          .send({ error: message || "Recurso no encontrado" });
      }
    },
  );

  // GET /admin/formats/compatible - Get compatible formats for block
  fastify.get<{
    Querystring: { blockRole: string; level: string; intensity: number };
  }>(
    "/formats/compatible",
    {
      schema: getCompatibleFormatsSchema,
    },
    async (request) => {
      const formats = await editService.getCompatibleFormats({
        blockRole: request.query.blockRole,
        level: request.query.level,
        intensity: request.query.intensity,
      });
      return { formats };
    },
  );

  // POST /admin/formats/compatible-batch - Batch fetch formats for multiple blocks
  fastify.post<{
    Body: {
      blocks: Array<{
        blockRole: string;
        level: string;
        intensity: number;
      }>;
    };
  }>(
    "/formats/compatible-batch",
    { schema: getCompatibleFormatsBatchSchema },
    async (request) => {
      const results = await Promise.all(
        request.body.blocks.map((b) => editService.getCompatibleFormats(b)),
      );
      return {
        results: request.body.blocks.map((b, i) => ({
          blockRole: b.blockRole,
          formats: results[i],
        })),
      };
    },
  );

  // GET /admin/sessions/:id/preview - Get member preview data
  fastify.get<{
    Params: { id: number };
    Querystring: { memberLevel?: string };
  }>(
    "/sessions/:id/preview",
    {
      schema: getPreviewSchema,
    },
    async (request, reply) => {
      const { id } = request.params;
      const { memberLevel } = request.query;

      // Get the base session
      const baseSession = await adminService.getSessionWithDetails(id);
      if (!baseSession) {
        return reply.status(404).send({ error: "Sesion no encontrada" });
      }

      // If memberLevel is provided and differs from current session,
      // find the session for that level (same week/day)
      let sessionData = baseSession;
      if (memberLevel) {
        const currentLevel = parseDayId(baseSession.dayId).level;
        if (memberLevel !== currentLevel) {
          // Build target dayId: W{week}-{day}-{memberLevel}
          const parts = baseSession.dayId.split("-");
          parts[parts.length - 1] = memberLevel;
          const targetDayId = parts.join("-");

          const [targetSession] = await fastify.db
            .select({ id: schema.sessions.id })
            .from(schema.sessions)
            .where(eq(schema.sessions.dayId, targetDayId));

          if (targetSession) {
            const targetData = await adminService.getSessionWithDetails(
              targetSession.id,
            );
            if (targetData) {
              sessionData = targetData;
            }
          }
        }
      }

      // Transform to preview format
      const preview = {
        sessionId: sessionData.id,
        dayId: sessionData.dayId,
        week: sessionData.week,
        day: sessionData.day,
        levelGroup: sessionData.levelGroup,
        memberLevel: sessionData.memberLevel,
        status: sessionData.status,
        blocks: sessionData.blocks.map((block) => ({
          name: block.role,
          format: block.formatName,
          intensity: block.intensity,
          repsBudget: block.repsBudget,
          exercises: block.exercises.map((ex) => ({
            name: ex.exerciseName,
            prescription:
              ex.seconds > 0
                ? `${ex.seconds} segundos`
                : ex.reps > 0
                  ? `${ex.reps} reps`
                  : "Sin prescripcion",
            rest: ex.rest > 0 ? `${ex.rest}s descanso` : "Sin descanso",
            notes: ex.notes || null,
          })),
        })),
      };

      return preview;
    },
  );

  // ==========================================================================
  // Saved Blocks Routes (Phase 16-07)
  // ==========================================================================

  // POST /admin/saved-blocks - Save a block for reuse
  fastify.post<{
    Body: { blockId: number; name: string };
  }>(
    "/saved-blocks",
    {
      schema: saveBlockSchema,
    },
    async (request, reply) => {
      try {
        const savedBlock = await editService.saveBlock({
          blockId: request.body.blockId,
          name: request.body.name,
          userId: request.user.userId,
        });
        return savedBlock;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "save block");
      }
    },
  );

  // GET /admin/saved-blocks - List saved blocks for current user
  fastify.get("/saved-blocks", async (request) => {
    const savedBlocks = await editService.listSavedBlocks(request.user.userId);
    return { savedBlocks };
  });

  // DELETE /admin/saved-blocks/:id - Delete a saved block
  fastify.delete<{
    Params: { id: number };
  }>(
    "/saved-blocks/:id",
    {
      schema: deleteSavedBlockSchema,
    },
    async (request, reply) => {
      const success = await editService.deleteSavedBlock({
        savedBlockId: request.params.id,
        userId: request.user.userId,
      });
      if (!success) {
        return reply
          .status(404)
          .send({ error: "Bloque guardado no encontrado" });
      }
      return { success: true };
    },
  );

  // ==========================================================================
  // Exercise Management & Video Upload Routes (Phase 28-01)
  // ==========================================================================

  // GET /admin/exercises - List exercises with pagination and filters
  fastify.get<{
    Querystring: {
      page?: number;
      limit?: number;
      search?: string;
      category?: string;
      level?: string;
      route?: string;
      effort?: string;
      hasVideo?: boolean;
    };
  }>("/exercises", { schema: listExercisesSchema }, async (request) => {
    const result = await ExerciseService.listExercises(
      fastify.db,
      request.query,
    );
    return {
      ...result,
      exercises: result.exercises.map((ex) => ({
        ...ex,
        videoUrl: assembleVideoUrl(ex.videoUrl),
      })),
    };
  });

  // POST /admin/exercises - Create exercise
  fastify.post<{
    Body: {
      exercise: string;
      category: string;
      pattern: string;
      route: string;
      effort: string;
      level?: string;
      difficulty?: number;
      dificultadLineal?: number;
      position?: string;
      categorySecondary?: string;
    };
  }>(
    "/exercises",
    {
      schema: {
        body: {
          type: "object",
          required: ["exercise", "category", "pattern", "route", "effort"],
          properties: {
            exercise: { type: "string", minLength: 1 },
            category: { type: "string" },
            pattern: { type: "string" },
            route: { type: "string" },
            effort: { type: "string", enum: ["CON", "EXC", "ISO", ""] },
            level: {
              type: "string",
              enum: ["alfa", "delta", "sigma", "omega", "spartan"],
            },
            difficulty: { type: "integer", minimum: 1, maximum: 12 },
            dificultadLineal: { type: "integer", minimum: 1, maximum: 12 },
            position: { type: "string" },
            categorySecondary: { type: "string" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              id: { type: "integer" },
              exercise: { type: "string" },
              category: { type: "string" },
              level: { type: "string", nullable: true },
              route: { type: "string" },
              effort: { type: "string" },
              difficulty: { type: "integer" },
              dificultadLineal: { type: "integer" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {
        exercise,
        category,
        pattern,
        route,
        effort,
        level,
        difficulty,
        dificultadLineal,
        position,
        categorySecondary,
      } = request.body;

      const result = await fastify.db.insert(schema.exercises).values({
        exercise,
        category,
        pattern,
        route,
        effort,
        level:
          (level as
            | "alfa"
            | "delta"
            | "sigma"
            | "omega"
            | "spartan"
            | undefined) ?? null,
        difficulty: difficulty ?? 1,
        dificultadLineal: dificultadLineal ?? 1,
        position: position ?? null,
        categorySecondary: categorySecondary ?? null,
      });

      const insertId = Number(result[0].insertId);
      const [created] = await fastify.db
        .select()
        .from(schema.exercises)
        .where(eq(schema.exercises.id, insertId));

      request.log.info({ exerciseId: insertId, exercise }, "Exercise created");

      return reply.code(201).send(created);
    },
  );

  // POST /admin/exercises/:exerciseId/upload-url - Generate presigned upload URL
  fastify.post<{ Params: { exerciseId: number } }>(
    "/exercises/:exerciseId/upload-url",
    { schema: exerciseIdParamsSchema },
    async (request, reply) => {
      if (!fastify.r2) {
        return reply
          .status(503)
          .send({ error: "Video storage not configured" });
      }

      // Validate exercise exists
      const [exercise] = await fastify.db
        .select({ id: schema.exercises.id })
        .from(schema.exercises)
        .where(eq(schema.exercises.id, request.params.exerciseId));

      if (!exercise) {
        return reply.status(404).send({ error: "Ejercicio no encontrado" });
      }

      const videoService = new VideoService(
        fastify.r2,
        fastify.r2Bucket,
        request.log,
      );
      return videoService.generateUploadUrl(request.params.exerciseId);
    },
  );

  // POST /admin/exercises/:exerciseId/upload-complete - Confirm upload completed
  fastify.post<{ Params: { exerciseId: number }; Body: { key: string } }>(
    "/exercises/:exerciseId/upload-complete",
    { schema: uploadCompleteBodySchema },
    async (request, reply) => {
      if (!fastify.r2) {
        return reply
          .status(503)
          .send({ error: "Video storage not configured" });
      }

      // Validate exercise exists
      const [exercise] = await fastify.db
        .select({ id: schema.exercises.id })
        .from(schema.exercises)
        .where(eq(schema.exercises.id, request.params.exerciseId));

      if (!exercise) {
        return reply.status(404).send({ error: "Ejercicio no encontrado" });
      }

      const videoService = new VideoService(
        fastify.r2,
        fastify.r2Bucket,
        request.log,
      );
      const result = await videoService.confirmUpload(
        request.params.exerciseId,
        fastify.db,
      );

      return {
        success: true,
        videoUrl: assembleVideoUrl(result.videoUrl),
        thumbnailUrl: assembleVideoUrl(result.thumbnailUrl),
      };
    },
  );

  // DELETE /admin/exercises/:exerciseId/video - Delete video
  fastify.delete<{ Params: { exerciseId: number } }>(
    "/exercises/:exerciseId/video",
    { schema: exerciseIdParamsSchema },
    async (request, reply) => {
      if (!fastify.r2) {
        return reply
          .status(503)
          .send({ error: "Video storage not configured" });
      }

      // Validate exercise exists
      const [exercise] = await fastify.db
        .select({ id: schema.exercises.id })
        .from(schema.exercises)
        .where(eq(schema.exercises.id, request.params.exerciseId));

      if (!exercise) {
        return reply.status(404).send({ error: "Ejercicio no encontrado" });
      }

      const videoService = new VideoService(
        fastify.r2,
        fastify.r2Bucket,
        request.log,
      );
      await videoService.deleteVideo(request.params.exerciseId, fastify.db);

      return { success: true };
    },
  );

  // POST /admin/exercises/bulk-upload-urls - Generate multiple presigned URLs
  fastify.post<{ Body: { exercises: Array<{ exerciseId: number }> } }>(
    "/exercises/bulk-upload-urls",
    { schema: bulkUploadUrlsBodySchema },
    async (request, reply) => {
      if (!fastify.r2) {
        return reply
          .status(503)
          .send({ error: "Video storage not configured" });
      }

      const { exercises } = request.body;

      // Validate all exercise IDs exist
      const exerciseIds = exercises.map((e) => e.exerciseId);
      const existingExercises = await fastify.db
        .select({ id: schema.exercises.id })
        .from(schema.exercises);
      const existingIds = new Set(existingExercises.map((e) => e.id));

      const invalidIds = exerciseIds.filter((id) => !existingIds.has(id));
      if (invalidIds.length > 0) {
        return reply.status(404).send({
          error: `Ejercicios no encontrados: ${invalidIds.join(", ")}`,
        });
      }

      const videoService = new VideoService(
        fastify.r2,
        fastify.r2Bucket,
        request.log,
      );

      const urls = await Promise.all(
        exercises.map(async (e) => {
          const result = await videoService.generateUploadUrl(e.exerciseId);
          return { exerciseId: e.exerciseId, ...result };
        }),
      );

      return { urls };
    },
  );
};
