// Module: referral-partners — admin-routes (fase 179, plan 03).
//
// CRUD admin de `referral_partners`: listar, ver, crear y editar. Guard de
// plugin calcado de `improvement-proposals/routes.ts` (T-179-10): solo
// MEMBER_LIFECYCLE_ROLES (owner/admin/gestion — mismo criterio que
// referidos: gestión administra, coach/recepción no).
//
// El gimnasio SIEMPRE sale de `assertTenant(request.scope)`, nunca del body
// (T-179-11/mass-assignment) — las 4 rutas arman su `ctx` así, y
// `PartnerReferralService` lo propaga a `tenantValues`/`tenantWhere`.

import { FastifyPluginAsync } from "fastify";
import { PartnerReferralService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import { assertTenant } from "../shared/tenant";
import { attachCountryScope } from "../shared/country-scope";
import { MEMBER_LIFECYCLE_ROLES } from "../shared/permissions";
import {
  createPartnerBodySchema,
  updatePartnerBodySchema,
  getPartnerParamsSchema,
  listPartnersQuerySchema,
} from "./schemas";
import type { CreatePartnerInput, UpdatePartnerInput } from "./types";

export const referralPartnersAdminRoutes: FastifyPluginAsync = async (
  fastify,
) => {
  const service = new PartnerReferralService(fastify.db, fastify.log);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (
      !(MEMBER_LIFECYCLE_ROLES as readonly string[]).includes(
        request.user.role,
      )
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "No tenés permisos para gestionar partners",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET / — listado con filtros de sede/estado, agregados de vínculos y
  // comisiones incluidos (ver PartnerReferralService.listPartners).
  fastify.get<{ Querystring: { branchId?: number; isActive?: boolean } }>(
    "/",
    { schema: listPartnersQuerySchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "referralPartners.list");
        return await service.listPartners(ctx, request.query);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "list referral partners");
      }
    },
  );

  // GET /:id — un partner puntual, mismos agregados que el listado.
  fastify.get<{ Params: { id: number } }>(
    "/:id",
    { schema: getPartnerParamsSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "referralPartners.get");
        return await service.getPartner(ctx, request.params.id);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get referral partner");
      }
    },
  );

  // POST / — crea un partner. `code` normalizado y validado contra los 3
  // espacios de nombres (D-03), `currency` derivada de la sede (D-13).
  fastify.post<{ Body: CreatePartnerInput }>(
    "/",
    { schema: createPartnerBodySchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "referralPartners.create");
        const result = await service.createPartner(
          ctx,
          request.body,
          request.user.userId,
        );
        return reply.code(201).send(result);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "create referral partner",
        );
      }
    },
  );

  // PATCH /:id — edita un partner. `code`/`currency` fuera del schema: no
  // son editables (T-179-13/D-13).
  fastify.patch<{ Params: { id: number }; Body: UpdatePartnerInput }>(
    "/:id",
    { schema: updatePartnerBodySchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "referralPartners.update");
        await service.updatePartner(ctx, request.params.id, request.body);
        return reply.code(200).send({ ok: true });
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "update referral partner",
        );
      }
    },
  );
};
