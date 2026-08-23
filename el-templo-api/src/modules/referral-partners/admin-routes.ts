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
import { FINANCE_VOID_ROLES, MEMBER_LIFECYCLE_ROLES } from "../shared/permissions";
import {
  createPartnerBodySchema,
  updatePartnerBodySchema,
  getPartnerParamsSchema,
  listPartnersQuerySchema,
  listConversionsQuerySchema,
  listBenefitsWithoutConversionQuerySchema,
  settlePartnerCommissionsParamsSchema,
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

  // GET /conversions — reporte de conversiones por partner (D-20, plan
  // 179-10): una fila por vínculo, con nombre del socio, estado y datos de
  // comisión. Registrada ANTES de GET /:id a propósito: aunque find-my-way
  // prioriza rutas estáticas sobre paramétricas, se declara explícita para no
  // depender de esa garantía — ver el test dedicado en reportes.test.ts.
  fastify.get<{
    Querystring: {
      partnerId?: number;
      status?: "pending" | "qualified" | "revoked";
      dateFrom?: string;
      dateTo?: string;
      branchId?: number;
    };
  }>(
    "/conversions",
    { schema: listConversionsQuerySchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "referralPartners.conversions",
        );
        return await service.listConversions(ctx, request.query);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "list partner conversions");
      }
    },
  );

  // GET /benefits-without-conversion — reporte de seguimiento manual (D-08
  // reescrita, plan 179-10). Mismo motivo de orden que /conversions arriba.
  fastify.get<{
    Querystring: { partnerId?: number; branchId?: number };
  }>(
    "/benefits-without-conversion",
    { schema: listBenefitsWithoutConversionQuerySchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "referralPartners.benefitsWithoutConversion",
        );
        return await service.listBenefitsWithoutConversion(
          ctx,
          request.query,
        );
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "list partner benefits without conversion",
        );
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

  // POST /:id/settle — liquidación batch (D-16, plan 179-10): marca TODAS
  // las comisiones `pending` del partner como `settled` en un acto.
  //
  // El guard EXTERIOR real de esta ruta —igual que las otras 6 del plugin—
  // es el `onRequest` de arriba (MEMBER_LIFECYCLE_ROLES): eso es lo que
  // decide efectivamente si un rol entra o no, `/settle` incluida. El
  // chequeo de acá abajo contra FINANCE_VOID_ROLES es DEFENSIVO
  // (future-proofing), no funcional hoy: en `origin/master`
  // FINANCE_VOID_ROLES y MEMBER_LIFECYCLE_ROLES son arrays byte-idénticos
  // (`["owner","admin","gestion"]`), así que este chequeo NUNCA produce un
  // 403 que el guard exterior no produzca ya — no existe hoy ningún rol que
  // pase el guard exterior y falle acá (ese caso es inescribible en un
  // test). Queda documentado y activo para que, si el gate exterior se
  // amplía algún día (p. ej. dando a `recepcion` acceso al resto del
  // plugin), la liquidación —que declara que el gimnasio ya le pagó al
  // comercio— siga protegida por su propia condición económica. No amplía
  // ningún set de roles.
  fastify.post<{ Params: { id: number } }>(
    "/:id/settle",
    { schema: settlePartnerCommissionsParamsSchema },
    async (request, reply) => {
      if (
        !(FINANCE_VOID_ROLES as readonly string[]).includes(
          request.user.role,
        )
      ) {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "No tenés permisos para liquidar comisiones de partners",
        });
      }
      try {
        const ctx = assertTenant(request.scope, "referralPartners.settle");
        const result = await service.settlePendingCommissions(
          ctx,
          request.params.id,
          request.user.userId,
        );
        return reply.code(200).send(result);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "settle partner commissions",
        );
      }
    },
  );
};
