/**
 * Referrals — member-facing routes (fase 158, milestone v5.5).
 *
 * Superficie de LECTURA del sistema de referidos. Sirve el `getReferralOverview`
 * del servicio (código lazy + descuento con desglose + vínculos con estado
 * derivado) al socio autenticado.
 *
 * IDOR (T-158-01): el userId SIEMPRE se deriva del token (`request.user`), nunca
 * de params/body — un socio solo puede leer sus propios vínculos.
 */

import { FastifyPluginAsync } from "fastify";
import { ReferralService } from "./service";
import { buildInvitationService } from "./invitation-factory";
import {
  INVITATION_ACTIVATE_BODY_KEYS,
  rejectUnknownBodyKeys,
  invitationActivateBodySchema,
  invitationEligibilityQuerySchema,
  type InvitationActivateBody,
  type InvitationEligibilityQuery,
} from "./invitation-schemas";
import { sendInvitationError } from "./invitation-errors";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";

export const referralMemberRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ReferralService(fastify.db, fastify.log);

  // Fase 194 D-06: activación de invitaciones del socio (canal app). El armado
  // (con el `BookingService` como 4.º argumento) es compartido con el canal
  // asistido: ver `invitation-factory.ts`.
  const invitationService = buildInvitationService(fastify.db, fastify.log);

  // GET /api/members/referrals — overview del socio autenticado.
  fastify.get("/", { onRequest: [fastify.authenticate] }, async (request) => {
    // Server-derived: nunca aceptar el userId del cliente (IDOR, T-158-01).
    const { userId } = request.user;
    // T-173-08: `users` es tabla strict — el ctx sale de la propia fila del
    // socio autenticado, nunca del body.
    await attachCountryScope(request, fastify.db);
    const ctx = assertTenant(request.scope, "referrals.overview");
    return service.getReferralOverview(ctx, userId);
  });

  // POST /api/members/referrals/cta-click — A/B copy test: registra el tap en el
  // CTA "Compartir código" de la card. La variante se recomputa server-side desde
  // el token (IDOR, igual que arriba). Best-effort: un fallo del insert NO debe
  // romper la UX del socio, así que se swallowea y se responde 204 igual.
  fastify.post(
    "/cta-click",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      try {
        // T-175-04: `ctx` de la propia fila del socio autenticado, mismo patrón
        // que el handler GET hermano de arriba (Pattern B, no del body/token).
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "referrals.cta-click");
        await service.recordCtaClick(ctx, userId);
      } catch (err: unknown) {
        request.log.warn(
          { err: err instanceof Error ? err.message : String(err), userId },
          "Referral CTA click tracking failed (graceful degradation)",
        );
      }
      return reply.code(204).send();
    },
  );

  // GET /api/members/referrals/invitations/eligibility?code=X[&branchId=N]
  // Fase 194 D-06: el socio autenticado consulta si puede activar la invitación
  // de ese código (mismas reglas que `activate`). T-194-35: solo autenticado y
  // solo el nombre de pila del invitador; T-194-34: el invitado es SIEMPRE el
  // usuario del token.
  fastify.get<{ Querystring: InvitationEligibilityQuery }>(
    "/invitations/eligibility",
    {
      onRequest: [fastify.authenticate],
      schema: { querystring: invitationEligibilityQuerySchema },
    },
    async (request, reply) => {
      const { userId } = request.user;
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(
          request.scope,
          "referrals.invitation-eligibility",
        );
        const { code, branchId } = request.query;
        return await invitationService.previewActivation(ctx, {
          code,
          invitedUserId: userId,
          branchId,
        });
      } catch (err: unknown) {
        sendInvitationError(
          err,
          reply,
          request.log,
          "GET /members/referrals/invitations/eligibility",
        );
      }
    },
  );

  // POST /api/members/referrals/invitations/activate
  // Fase 194 D-06 (canal `self_service`): activa SIEMPRE para el usuario del
  // token. El body no admite `invitedUserId`/`inviterId` (additionalProperties:
  // false): el invitador sale del `code`, resuelto en el servidor.
  fastify.post<{ Body: InvitationActivateBody }>(
    "/invitations/activate",
    {
      onRequest: [fastify.authenticate],
      // Claves extra => 400 explícito (ajv las descartaría en silencio, T-194-34).
      preValidation: [rejectUnknownBodyKeys(INVITATION_ACTIVATE_BODY_KEYS)],
      schema: { body: invitationActivateBodySchema },
    },
    async (request, reply) => {
      const { userId } = request.user;
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(
          request.scope,
          "referrals.invitation-activate",
        );
        const { code, branchId, phone, dni } = request.body;
        const activated = await invitationService.activate(ctx, {
          code,
          invitedUserId: userId,
          branchId,
          phone,
          dni,
          channel: "self_service",
          createdBy: null,
        });
        return reply.code(201).send(activated);
      } catch (err: unknown) {
        sendInvitationError(
          err,
          reply,
          request.log,
          "POST /members/referrals/invitations/activate",
        );
      }
    },
  );
};
