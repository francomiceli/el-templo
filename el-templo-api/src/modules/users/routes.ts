/**
 * User Management Routes
 *
 * Owner-only CRUD endpoints for staff user management.
 * Registered at /api/admin/users.
 */

import { FastifyPluginAsync } from "fastify";
import { UserService } from "./service";
import { OWNER_ROLES } from "../shared/permissions";
import { handleServiceError } from "../shared/error-handler";
import type { CreateStaffInput, UpdateStaffInput } from "./types";
import {
  listStaffSchema,
  createStaffSchema,
  updateStaffSchema,
  toggleStatusSchema,
} from "./schemas";

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  const userService = new UserService(fastify.db, fastify.log);

  /**
   * Guard: require owner role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(OWNER_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Solo el propietario puede gestionar usuarios",
      });
    }
  });

  // GET / - List staff users
  fastify.get<{ Querystring: { branchId?: number } }>(
    "/",
    { schema: listStaffSchema },
    async (request) => {
      return userService.listStaff(request.query.branchId);
    },
  );

  // POST / - Create staff user
  fastify.post<{ Body: CreateStaffInput }>(
    "/",
    { schema: createStaffSchema },
    async (request, reply) => {
      try {
        const id = await userService.createStaff(request.body);
        return reply.code(201).send({
          id,
          email: request.body.email,
          firstName: request.body.firstName,
          lastName: request.body.lastName,
          role: request.body.role,
          branchId: request.body.branchId,
        });
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err as Error & { statusCode?: number }).statusCode === 409
        ) {
          return reply.code(409).send({ error: err.message });
        }
        return handleServiceError(err, reply, request.log, "create staff user");
      }
    },
  );

  // PUT /:userId - Update staff user
  fastify.put<{ Params: { userId: number }; Body: UpdateStaffInput }>(
    "/:userId",
    { schema: updateStaffSchema },
    async (request, reply) => {
      try {
        const result = await userService.updateStaff(
          request.params.userId,
          request.body,
        );
        if (!result) {
          return reply
            .code(404)
            .send({ error: "Usuario no encontrado o es un miembro" });
        }
        return result;
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err as Error & { statusCode?: number }).statusCode === 409
        ) {
          return reply.code(409).send({ error: err.message });
        }
        return handleServiceError(err, reply, request.log, "update staff user");
      }
    },
  );

  // PATCH /:userId/status - Set staff_disabled (Phase 103-06, R11)
  // Payload: { disabled: boolean }. `disabled=true` deactivates the staff
  // member (writes users.staff_disabled=TRUE); `disabled=false` reactivates.
  // Replaces the prior toggle-style endpoint that read the current state and
  // flipped it server-side (now the client sends the explicit desired value).
  fastify.patch<{ Params: { userId: number }; Body: { disabled: boolean } }>(
    "/:userId/status",
    { schema: toggleStatusSchema },
    async (request, reply) => {
      try {
        const result = await userService.toggleDisabled(
          request.params.userId,
          request.body.disabled,
          request.user.userId,
        );
        if (!result) {
          return reply
            .code(404)
            .send({ error: "Usuario no encontrado o es un miembro" });
        }
        return result;
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err as Error & { statusCode?: number }).statusCode === 400
        ) {
          return reply.code(400).send({ error: err.message });
        }
        return handleServiceError(
          err,
          reply,
          request.log,
          "toggle staff user status",
        );
      }
    },
  );
};
