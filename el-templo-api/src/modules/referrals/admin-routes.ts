/**
 * Referrals — admin routes (v5.5 follow-up, A/B copy test).
 *
 * Registrado en /api/admin/referrals. El `onRequest` del plugin autentica y resuelve
 * `request.scope`; el gate de ROL va POR RUTA (hay dos audiencias distintas):
 *
 *   - Reportes agregados (`REFERRAL_PROGRAM_REPORT_ROLES`: gestion/admin/owner; coach,
 *     recepción, admin_sede y los tokens de socio reciben 403). Son números de TODO el
 *     gimnasio, sin dimensión de sede, así que `admin_sede` queda afuera:
 *       - GET /ab-results           números por variante del test A/B (tab "Referidos A/B").
 *       - GET /invitations/report   KPIs D-19 por mes de cohorte y moneda (Fase 194-20).
 *
 *   - Seguimiento de invitados (`INVITATION_FOLLOWUP_ROLES`: gestion/admin_sede/admin/owner;
 *     recepción y coach reciben 403). Es una lista de trabajo POR FILA con sede propia
 *     (`invitations.branch_id`), igual que Renovaciones, así que `admin_sede` la ve y la opera
 *     acotado a sus sedes (`enforcedBranchIds`: lectura con `branchId` forzado, escrituras con
 *     404 fuera de alcance); gestion/admin quedan acotados a su país y el owner ve todo:
 *       - GET   /invitations                            bandeja de leads de invitación (D-18).
 *       - GET   /invitations/pending-count              contadores del aviso rojo.
 *       - PATCH /invitations/:invitationId/followup     seguimiento manual (mensajes, motivo).
 *       - POST  /invitations/:invitationId/notes        nota del invitado.
 *
 * Tenancy (T-175.1, decisión de Franco 2026-08-18): los números se ACOTAN al
 * gimnasio del request vía `assertTenant(request.scope, ...)`. Cada gimnasio ve
 * solo sus propias variantes — ya NO es una superficie cross-tenant global.
 */

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { ReferralService } from "./service";
import { InvitationReportService } from "./invitation-report";
import { InvitationLeadList } from "./invitation-lead-list";
import { InvitationFollowupService } from "./invitation-followup";
import {
  invitationFollowupRouteSchema,
  invitationLeadsRouteSchema,
  invitationNoteRouteSchema,
  invitationPendingCountRouteSchema,
  invitationReportQuerySchema,
  type InvitationFollowupBody,
  type InvitationFollowupParams,
  type InvitationLeadsQuery,
  type InvitationNoteBody,
  type InvitationReportQuery,
} from "./invitation-schemas";
import {
  INVITATION_FOLLOWUP_ROLES,
  REFERRAL_PROGRAM_REPORT_ROLES,
} from "../shared/permissions";
import { ForbiddenError, AppError } from "../shared/errors";
import { handleServiceError } from "../shared/error-handler";
import { assertTenant } from "../shared/tenant";
import { attachCountryScope, type CountryCode } from "../shared/country-scope";
import { enforcedBranchIds } from "../shared/branch-access";
import { REASON_REQUIRED } from "../renewals/followup-core";
import type { RenewalActorScope } from "../renewals/types";

/**
 * País al que se acota un reporte/listado de Invitaciones (Fase 194-20). El
 * owner ve todo el gimnasio (los montos ya salen separados por moneda); admin y
 * gestión solo ven las sedes de SU país, como en el resto de los reportes
 * (`request.scope.country`). Un admin/gestión sin país cargado es dato corrupto:
 * falla cerrado (403) en vez de ver los dos países.
 */
function countryScopeOf(request: FastifyRequest): CountryCode | undefined {
  if (request.scope.isOwner) return undefined;
  if (request.scope.country === null) {
    throw new ForbiddenError("Tu usuario no tiene un país asignado");
  }
  return request.scope.country;
}

/**
 * Alcance de LECTURA del seguimiento de invitados: `admin_sede` (alcance forzado por sede,
 * `enforcedBranchIds`) ve solo las invitaciones de SUS sedes; gestión/admin, las de su país;
 * el owner, todo. Un `admin_sede` sin sedes asignadas no ve nada (array vacío = fail-closed).
 * Sale SIEMPRE del scope server-side, nunca del querystring: el `branchId` del query solo
 * puede estrechar dentro de este alcance (una sede ajena da una página vacía, no un 403).
 */
function followupReadScopeOf(request: FastifyRequest): {
  country?: CountryCode;
  branchIds?: number[];
} {
  const branchIds = enforcedBranchIds(request.scope);
  if (branchIds !== null) return { branchIds };
  return { country: countryScopeOf(request) };
}

/** Alcance del actor para las ESCRITURAS (mismo contrato que las rutas de Renovaciones). */
function actorScopeOf(request: FastifyRequest): RenewalActorScope {
  return {
    userId: request.user.userId,
    isOwner: request.scope.isOwner,
    country: request.scope.country,
    branchIds: enforcedBranchIds(request.scope),
  };
}

/**
 * Gate de rol POR RUTA (el `onRequest` del plugin solo autentica y resuelve el scope):
 * 403 si el rol del token no está en `roles`.
 */
function requireRoles(roles: readonly string[], message: string) {
  return async function gate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!roles.includes(request.user.role)) {
      await reply.code(403).send({ error: "Acceso denegado", message });
    }
  };
}

const requireReportRole = requireRoles(
  REFERRAL_PROGRAM_REPORT_ROLES,
  "No tenés acceso a los reportes del programa de invitaciones",
);

const requireFollowupRole = requireRoles(
  INVITATION_FOLLOWUP_ROLES,
  "No tenés acceso al seguimiento de invitados",
);

export const referralAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ReferralService(fastify.db, fastify.log);

  // Guard del plugin: autenticar y resolver `request.scope` (gimnasio, país y sedes del
  // actor). El gate de ROL va por ruta (ver el docblock de cabecera): los reportes
  // agregados y el seguimiento de invitados tienen audiencias distintas.
  // T-175.1: `request.scope` es lo que permite a `assertTenant` en el handler acotar los
  // números por tenant; sin esto queda undefined y el handler tira 500. Mismo patrón que el
  // onRequest de analytics/routes.ts.
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    await attachCountryScope(request, fastify.db);
  });

  // GET /api/admin/referrals/ab-results — números por variante (expuestos,
  // clics únicos, referidos creados/cualificados + tasas) del gimnasio.
  // Gate: gestion/admin/owner (2026-09-09: sin `admin_sede`, el agregado es de TODO el
  // gimnasio y ese rol solo debe ver su sede).
  fastify.get(
    "/ab-results",
    { preHandler: [requireReportRole] },
    async (request) => {
      const ctx = assertTenant(request.scope, "referrals.ab-results");
      return service.getAbTestResults(ctx);
    },
  );

  const reportService = new InvitationReportService(fastify.db);
  const leadList = new InvitationLeadList(fastify.db);
  const followupService = new InvitationFollowupService(
    fastify.db,
    fastify.log,
  );

  // GET /api/admin/referrals/invitations/report — KPIs D-19: activadas,
  // conversiones y tasa por mes de cohorte, invitados activos y descuentos por
  // mes Y moneda. Mismo gate que ab-results (agregado de todo el gimnasio, sin
  // dimensión de sede). Se declara antes que `/invitations` por legibilidad (rutas
  // distintas para el router, no hay captura de parámetros).
  fastify.get<{ Querystring: InvitationReportQuery }>(
    "/invitations/report",
    {
      schema: { querystring: invitationReportQuerySchema },
      preHandler: [requireReportRole],
    },
    async (request) => {
      const ctx = assertTenant(request.scope, "referrals.invitations.report");
      return reportService.getReport(ctx, {
        from: request.query.from,
        to: request.query.to,
        country: countryScopeOf(request),
      });
    },
  );

  // GET /api/admin/referrals/invitations — bandeja de leads de invitación (D-18) como lista
  // de seguimiento: una fila por invitación activa, etapa y estado de seguimiento derivados
  // en SQL, seguimiento manual y última nota; paginado exacto. Gate: INVITATION_FOLLOWUP_ROLES.
  fastify.get<{ Querystring: InvitationLeadsQuery }>(
    "/invitations",
    {
      schema: invitationLeadsRouteSchema,
      preHandler: [requireFollowupRole],
    },
    async (request) => {
      const ctx = assertTenant(request.scope, "referrals.invitations.list");
      return leadList.list(ctx, {
        ...request.query,
        ...followupReadScopeOf(request),
      });
    },
  );

  // GET /api/admin/referrals/invitations/pending-count — contadores del aviso rojo:
  // `open` (invitaciones en `para_contactar`) y `uncontacted` (las de `open` sin ningún
  // mensaje registrado). Mismo alcance por rol que la bandeja.
  fastify.get(
    "/invitations/pending-count",
    {
      schema: invitationPendingCountRouteSchema,
      preHandler: [requireFollowupRole],
    },
    async (request) => {
      const ctx = assertTenant(
        request.scope,
        "referrals.invitations.pendingCount",
      );
      return leadList.countPending(ctx, followupReadScopeOf(request));
    },
  );

  // PATCH /api/admin/referrals/invitations/:invitationId/followup — seguimiento manual del
  // invitado: mismo cuerpo y mismas reglas que `PATCH /api/admin/renewals/:subscriptionId`
  // (el 400 de motivo lleva `code: REASON_REQUIRED`). Devuelve la fila actualizada.
  fastify.patch<{
    Params: InvitationFollowupParams;
    Body: InvitationFollowupBody;
  }>(
    "/invitations/:invitationId/followup",
    {
      schema: invitationFollowupRouteSchema,
      preHandler: [requireFollowupRole],
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "referrals.invitations.updateFollowup",
        );
        const row = await followupService.updateFollowup(
          ctx,
          request.params.invitationId,
          request.body,
          actorScopeOf(request),
        );
        return reply.send(row);
      } catch (err: unknown) {
        // El default handleServiceError solo emite { error, message }: el `code`
        // REASON_REQUIRED se agrega acá, igual que en las rutas de Renovaciones.
        if (err instanceof AppError && err.code === REASON_REQUIRED) {
          return reply.code(400).send({
            error: "Solicitud invalida",
            message: err.message,
            code: err.code,
          });
        }
        handleServiceError(
          err,
          reply,
          request.log,
          "update invitation followup",
        );
      }
    },
  );

  // POST /api/admin/referrals/invitations/:invitationId/notes — nota del invitado (reusa
  // `MemberService.createNote`, igual que las notas de Renovaciones).
  fastify.post<{
    Params: InvitationFollowupParams;
    Body: InvitationNoteBody;
  }>(
    "/invitations/:invitationId/notes",
    { schema: invitationNoteRouteSchema, preHandler: [requireFollowupRole] },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "referrals.invitations.addNote",
        );
        const note = await followupService.addNote(
          ctx,
          request.params.invitationId,
          request.body.content,
          actorScopeOf(request),
        );
        return reply.code(201).send(note);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "add invitation note");
      }
    },
  );
};
