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
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
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
   *
   * Fase 173 (ADO-02): `attachCountryScope` monta `request.scope` DESPUÉS del
   * check de rol (mismo orden que `coach-load-routes.ts:270-280`) — si no
   * estuviera acá, `request.scope` llegaría `undefined` a cada handler y
   * `assertTenant` no tendría de dónde leer (fue una regresión real del
   * piloto, doc 07 §4).
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(OWNER_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Solo el propietario puede gestionar usuarios",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET / - List staff users
  fastify.get<{ Querystring: { branchId?: number } }>(
    "/",
    { schema: listStaffSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "users.list");
        return await userService.listStaff(ctx, request.query.branchId);
      } catch (err: unknown) {
        return handleServiceError(err, reply, request.log, "list staff users");
      }
    },
  );

  // POST / - Create staff user
  fastify.post<{ Body: CreateStaffInput }>(
    "/",
    { schema: createStaffSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "users.createStaff");
        const id = await userService.createStaff(ctx, request.body);
        return reply.code(201).send({
          id,
          email: request.body.email,
          firstName: request.body.firstName,
          lastName: request.body.lastName,
          role: request.body.role,
          branchId: request.body.branchId,
          // Phase 110 REQ-9 / REQ-11: surface the new scope fields in the
          // 201 reply so the admin form can hydrate without a follow-up GET.
          country: request.body.country ?? null,
          branchIds: request.body.branchIds ?? [],
        });
      } catch (err: unknown) {
        // Phase 110: validateStaffCardinality throws statusCode=400 — coerce
        // to a 400 reply with the existing { error } shape (mirrors 409 path).
        if (
          err instanceof Error &&
          (err as Error & { statusCode?: number }).statusCode === 400
        ) {
          return reply.code(400).send({ error: err.message });
        }
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
        const ctx = assertTenant(request.scope, "users.updateStaff");
        const result = await userService.updateStaff(
          ctx,
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
        // Phase 110: validateStaffCardinality throws statusCode=400 — coerce
        // to a 400 reply with the existing { error } shape (mirrors 409 path).
        if (
          err instanceof Error &&
          (err as Error & { statusCode?: number }).statusCode === 400
        ) {
          return reply.code(400).send({ error: err.message });
        }
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
        const ctx = assertTenant(request.scope, "users.setStatus");
        const result = await userService.toggleDisabled(
          ctx,
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
