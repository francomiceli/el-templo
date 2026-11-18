// Module: aura — gift-admin-routes (fase 215, plan 08)
//
// Rutas del staff para el regalo del profe, registradas en el módulo
// `templo-gamification` bajo `/api/admin/aura`:
//   POST /gifts          el profe da Aura a un alumno de su clase (D-15)
//   GET  /gift-settings  valor vigente del regalo del profe (D-11)
//   PUT  /gift-settings  cambia el valor (solo dueño y admin)
//   POST /gifts/:id/void anula un regalo vigente (dueño, admin y admin_sede;
//                        el admin_sede solo en sus sedes, D-20)
//
// Roles (cada ruta con su propio chequeo, además del guard de staff):
//   - POST: solo profes (`isCoachLikeRole`). La sede sale de `request.scope`,
//     nunca del body.
//   - GET: dueño, admin y admin_sede.
//   - PUT: dueño y admin.
//
// Las reglas viven en `AuraGiftService` y `gift-settings.ts`; acá solo se
// controla el acceso y se arma la respuesta. Los rechazos del regalo salen por
// `sendGiftError` (conserva el `code`); el resto, por `handleServiceError`.
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { enforcedBranchIds } from "../shared/branch-access";
import { attachCountryScope } from "../shared/country-scope";
import { handleServiceError } from "../shared/error-handler";
import {
  ADMIN_ROLES,
  ADMIN_SEDE_ROLE,
  ALL_STAFF_ROLES,
  isCoachLikeRole,
} from "../shared/permissions";
import { assertTenant } from "../shared/tenant";
import { GiftError, sendGiftError } from "./gift-errors";
import { getCoachGiftAmount, setCoachGiftAmount } from "./gift-settings";
import {
  coachGiveGiftSchema,
  getGiftSettingsSchema,
  putGiftSettingsSchema,
  type CoachGiveGiftBody,
  voidGiftSchema,
  type GiftSettingsBody,
} from "./gift-schemas";
import { AuraGiftService } from "./gift-service";
import { voidGift } from "./gift-void";

/** 403 con el cuerpo del regalo (`REGALO_SIN_PERMISO`). */
function denyGift(reply: FastifyReply): void {
  const err = new GiftError("REGALO_SIN_PERMISO");
  reply.code(err.statusCode).send({
    error: "Acceso denegado",
    message: err.message,
    code: err.code,
  });
}

const SETTINGS_READ_ROLES: readonly string[] = [
  ...ADMIN_ROLES,
  ADMIN_SEDE_ROLE,
];
const SETTINGS_WRITE_ROLES: readonly string[] = ADMIN_ROLES;
// Anular: dueño, admin y admin_sede (los profes y la recepción, no).
const VOID_ROLES: readonly string[] = [...ADMIN_ROLES, ADMIN_SEDE_ROLE];

export const auraGiftAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    if (!(ALL_STAFF_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de personal requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  const service = new AuraGiftService(fastify);

  // POST /gifts — el profe da Aura. Responde 201 con el monto acreditado.
  fastify.post<{ Body: CoachGiveGiftBody }>(
    "/gifts",
    { schema: coachGiveGiftSchema },
    async (request, reply) => {
      try {
        if (!isCoachLikeRole(request.user.role)) return denyGift(reply);
        const ctx = assertTenant(request.scope, "aura.admin.gift");
        const result = await service.giveCoachGift(
          ctx,
          {
            userId: request.user.userId,
            role: request.user.role,
            branchIds: request.scope.branchIds,
          },
          request.body,
        );
        return reply.code(201).send({ amount: result.amount });
      } catch (err: unknown) {
        sendGiftError(err, reply, request.log, "aura.admin.gift");
      }
    },
  );

  // POST /gifts/:id/void — anula un regalo vigente y descuenta lo recibido.
  // Fuera de las sedes del admin_sede responde 404 (no revela el regalo).
  fastify.post<{ Params: { id: number } }>(
    "/gifts/:id/void",
    { schema: voidGiftSchema },
    async (request, reply) => {
      try {
        if (!VOID_ROLES.includes(request.user.role)) return denyGift(reply);
        const ctx = assertTenant(request.scope, "aura.admin.gift.void");
        await voidGift(fastify.db, ctx, {
          giftId: request.params.id,
          voidedBy: request.user.userId,
          cause: "staff",
          allowedBranchIds: enforcedBranchIds(request.scope),
          log: request.log,
        });
        return reply.code(204).send();
      } catch (err: unknown) {
        sendGiftError(err, reply, request.log, "aura.admin.gift.void");
      }
    },
  );

  // GET /gift-settings — valor vigente del regalo del profe.
  fastify.get(
    "/gift-settings",
    { schema: getGiftSettingsSchema },
    async (request, reply) => {
      try {
        if (!SETTINGS_READ_ROLES.includes(request.user.role)) {
          return denyGift(reply);
        }
        const ctx = assertTenant(request.scope, "aura.admin.settings.get");
        const coachGiftAmount = await getCoachGiftAmount(
          fastify.db,
          ctx,
          request.log,
        );
        return { coachGiftAmount };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "aura.admin.settings.get");
      }
    },
  );

  // PUT /gift-settings — cambia el valor (entero de 1 a 10).
  fastify.put<{ Body: GiftSettingsBody }>(
    "/gift-settings",
    { schema: putGiftSettingsSchema },
    async (request, reply) => {
      try {
        if (!SETTINGS_WRITE_ROLES.includes(request.user.role)) {
          return denyGift(reply);
        }
        const ctx = assertTenant(request.scope, "aura.admin.settings.put");
        const coachGiftAmount = await setCoachGiftAmount(
          fastify.db,
          ctx,
          request.body.coachGiftAmount,
        );
        return { coachGiftAmount };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "aura.admin.settings.put");
      }
    },
  );
};

export default auraGiftAdminRoutes;
