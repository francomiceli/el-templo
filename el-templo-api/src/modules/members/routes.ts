/**
 * Members API Routes
 *
 * Admin endpoints for member CRUD, profile management,
 * DNI uniqueness checks, and internal notes.
 *
 * All routes require authentication and coach/admin/superadmin role.
 */

import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { MemberService } from "./service";
import type {
  CreateMemberInput,
  UpdateMemberInput,
  MemberListParams,
} from "./types";
import {
  listMembersSchema,
  getMemberSchema,
  createMemberSchema,
  updateMemberSchema,
  toggleStatusSchema,
  checkDniSchema,
  listNotesSchema,
  createNoteSchema,
  updateNoteSchema,
  deleteNoteSchema,
} from "./schemas";

const ADMIN_ROLES = ["coach", "admin", "superadmin"];

/**
 * Check if an error is a MySQL duplicate key error and extract details.
 * Drizzle wraps MySQL errors: the real MySQL error is in `err.cause`.
 */
function isDuplicateKeyError(err: unknown): {
  isDuplicate: boolean;
  detail: string;
} {
  if (!(err instanceof Error)) return { isDuplicate: false, detail: "" };

  // Drizzle wraps the MySQL error in `cause`
  const cause = err.cause as Record<string, unknown> | undefined;
  const causeCode = typeof cause?.code === "string" ? cause.code : "";
  const causeSqlMessage =
    typeof cause?.sqlMessage === "string" ? cause.sqlMessage : "";
  const causeMessage = cause instanceof Error ? cause.message : causeSqlMessage;

  // Check the cause first (Drizzle wrapper), then the error itself
  const isDuplicate =
    causeCode === "ER_DUP_ENTRY" ||
    causeSqlMessage.includes("Duplicate entry") ||
    causeMessage.includes("Duplicate entry") ||
    err.message.includes("Duplicate entry");

  const detail = causeSqlMessage || causeMessage || err.message;

  return { isDuplicate, detail };
}

export const memberRoutes: FastifyPluginAsync = async (fastify) => {
  const memberService = new MemberService(fastify.db, fastify.log);

  /**
   * Guard: require admin role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!ADMIN_ROLES.includes(request.user.role)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Acceso de administrador requerido",
      });
    }
  });

  // =========================================================================
  // Branches (must be defined BEFORE :userId param routes)
  // =========================================================================

  // GET /admin/members/branches — List active branches for dropdowns
  fastify.get("/branches", async () => {
    const rows = await fastify.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
      })
      .from(schema.branches)
      .where(eq(schema.branches.isActive, true))
      .orderBy(schema.branches.name);
    return { branches: rows };
  });

  // =========================================================================
  // DNI Check (must be defined BEFORE :userId param routes)
  // =========================================================================

  // GET /admin/members/check-dni?dni=X&excludeUserId=Y
  fastify.get<{
    Querystring: { dni: string; excludeUserId?: number };
  }>("/check-dni", { schema: checkDniSchema }, async (request) => {
    const { dni, excludeUserId } = request.query;
    return memberService.checkDniUniqueness(dni, excludeUserId);
  });

  // =========================================================================
  // Member CRUD
  // =========================================================================

  // GET /admin/members — List members with search, filters, pagination
  fastify.get<{
    Querystring: {
      search?: string;
      branchId?: number;
      level?: string;
      isActive?: boolean;
      page?: number;
      limit?: number;
    };
  }>("/", { schema: listMembersSchema }, async (request) => {
    const {
      search,
      branchId,
      level,
      isActive,
      page = 1,
      limit = 20,
    } = request.query;

    const params: MemberListParams = {
      search,
      branchId,
      level,
      isActive,
      page,
      limit,
    };

    const result = await memberService.listMembers(params);
    return { ...result, page, limit };
  });

  // GET /admin/members/:userId — Get member profile
  fastify.get<{ Params: { userId: number } }>(
    "/:userId",
    { schema: getMemberSchema },
    async (request, reply) => {
      const member = await memberService.getMemberById(request.params.userId);
      if (!member) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Miembro no encontrado" });
      }
      return member;
    },
  );

  // POST /admin/members — Create member
  fastify.post<{ Body: CreateMemberInput }>(
    "/",
    { schema: createMemberSchema },
    async (request, reply) => {
      try {
        const member = await memberService.createMember(request.body);
        return reply.code(201).send(member);
      } catch (err: unknown) {
        const { isDuplicate, detail } = isDuplicateKeyError(err);

        if (isDuplicate) {
          if (detail.includes("email")) {
            return reply.code(409).send({
              error: "Conflict",
              message: "El email ya esta registrado",
            });
          }
          if (detail.includes("dni")) {
            return reply.code(409).send({
              error: "Conflict",
              message: "El DNI ya esta registrado",
            });
          }
          return reply
            .code(409)
            .send({ error: "Conflict", message: "Registro duplicado" });
        }

        request.log.error({ err }, "Error creating member");
        return reply
          .code(500)
          .send({ error: "Server Error", message: "Error al crear miembro" });
      }
    },
  );

  // PUT /admin/members/:userId — Update member
  fastify.put<{ Params: { userId: number }; Body: UpdateMemberInput }>(
    "/:userId",
    { schema: updateMemberSchema },
    async (request, reply) => {
      try {
        const member = await memberService.updateMember(
          request.params.userId,
          request.body,
        );
        if (!member) {
          return reply
            .code(404)
            .send({ error: "Not Found", message: "Miembro no encontrado" });
        }
        return member;
      } catch (err: unknown) {
        const { isDuplicate, detail } = isDuplicateKeyError(err);

        if (isDuplicate) {
          if (detail.includes("dni")) {
            return reply.code(409).send({
              error: "Conflict",
              message: "El DNI ya esta registrado",
            });
          }
          return reply
            .code(409)
            .send({ error: "Conflict", message: "Registro duplicado" });
        }

        request.log.error({ err }, "Error updating member");
        return reply.code(500).send({
          error: "Server Error",
          message: "Error al actualizar miembro",
        });
      }
    },
  );

  // PATCH /admin/members/:userId/status — Toggle active status
  fastify.patch<{ Params: { userId: number }; Body: { isActive: boolean } }>(
    "/:userId/status",
    { schema: toggleStatusSchema },
    async (request, reply) => {
      const member = await memberService.toggleActive(
        request.params.userId,
        request.body.isActive,
      );
      if (!member) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Miembro no encontrado" });
      }
      return member;
    },
  );

  // =========================================================================
  // Notes
  // =========================================================================

  // GET /admin/members/:userId/notes — List notes for a member
  fastify.get<{ Params: { userId: number } }>(
    "/:userId/notes",
    { schema: listNotesSchema },
    async (request) => {
      const notes = await memberService.getNotes(request.params.userId);
      return { notes };
    },
  );

  // POST /admin/members/:userId/notes — Create note
  fastify.post<{ Params: { userId: number }; Body: { content: string } }>(
    "/:userId/notes",
    { schema: createNoteSchema },
    async (request, reply) => {
      const note = await memberService.createNote(request.user.userId, {
        userId: request.params.userId,
        content: request.body.content,
      });
      return reply.code(201).send(note);
    },
  );

  // PUT /admin/members/:userId/notes/:noteId — Update note
  fastify.put<{
    Params: { userId: number; noteId: number };
    Body: { content: string };
  }>(
    "/:userId/notes/:noteId",
    { schema: updateNoteSchema },
    async (request, reply) => {
      const { noteId } = request.params;

      // Fetch note to check authorization
      const notes = await memberService.getNotes(request.params.userId);
      const existingNote = notes.find((n) => n.id === noteId);

      if (!existingNote) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Nota no encontrada" });
      }

      if (
        !memberService.canEditNote(
          existingNote.authorId,
          request.user.userId,
          request.user.role,
        )
      ) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "No tienes permiso para editar esta nota",
        });
      }

      const updated = await memberService.updateNote(noteId, {
        content: request.body.content,
      });
      if (!updated) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Nota no encontrada" });
      }
      return updated;
    },
  );

  // DELETE /admin/members/:userId/notes/:noteId — Delete note
  fastify.delete<{ Params: { userId: number; noteId: number } }>(
    "/:userId/notes/:noteId",
    { schema: deleteNoteSchema },
    async (request, reply) => {
      const { noteId } = request.params;

      // Fetch note to check authorization
      const notes = await memberService.getNotes(request.params.userId);
      const existingNote = notes.find((n) => n.id === noteId);

      if (!existingNote) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Nota no encontrada" });
      }

      if (
        !memberService.canEditNote(
          existingNote.authorId,
          request.user.userId,
          request.user.role,
        )
      ) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "No tienes permiso para eliminar esta nota",
        });
      }

      await memberService.deleteNote(noteId);
      return { success: true };
    },
  );
};
