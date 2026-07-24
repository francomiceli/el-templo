/**
 * Rutas de staff del TV (prefijo `/api/admin/tv`) — fase 164.
 *
 * Superficie opuesta a `device-routes.ts`: aca SI hay JWT, rol y scope de pais.
 * Se registra como plugin SEPARADO justamente por eso — un unico plugin no puede
 * tener a la vez un hook que exige `Authorization: Bearer` y rutas publicas para
 * un televisor sin credenciales (mismo motivo por el que `app.ts` separa
 * coachRoutes de coachLoadRoutes).
 *
 * Dos capas de autorizacion, independientes:
 *   1. QUE rol  — `TV_CONTROL_ROLES` (Dueño + coach, D-01) en el hook del plugin.
 *   2. QUE sede — `requireBranchAccess` / `canAccessBranch` sobre `request.scope`.
 *      Sin esta segunda capa, un coach de Moreno podria vincular o revocar el TV
 *      de Jujuy con solo mandar otro `branchId` (T-164-12).
 */

import { FastifyPluginAsync } from "fastify";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { TvPairingService } from "./pairing";
import { TvService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import { TV_CONTROL_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import {
  BRANCH_OUT_OF_SCOPE,
  canAccessBranch,
  requireBranchAccess,
} from "../shared/branch-access";
import {
  tvPairClaimSchema,
  tvDevicesListSchema,
  tvDeviceRevokeSchema,
  tvControlContextSchema,
  type TvPairClaimBody,
  type TvDevicesListQuery,
  type TvDeviceIdParams,
  type TvControlContextQuery,
} from "./schemas";
import * as schema from "../../db/schema";

export const tvControlRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(TV_CONTROL_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  /**
   * POST /api/admin/tv/pair/claim
   *
   * El staff tipea el codigo que ve en la pantalla del TV y elige la sede (D-01).
   * `requireBranchAccess` corre ANTES del handler: la sede tiene que estar en el
   * scope de quien reclama, no alcanza con tener el rol.
   */
  fastify.post<{ Body: TvPairClaimBody }>(
    "/pair/claim",
    {
      schema: tvPairClaimSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      try {
        const pairing = new TvPairingService(fastify.db, request.log);
        await pairing.claim(
          request.body.userCode,
          request.body.branchId,
          request.user.userId,
          request.body.name,
        );
        return reply.send({ ok: true, branchId: request.body.branchId });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv pair claim");
      }
    },
  );

  /**
   * GET /api/admin/tv/devices?branchId=NN
   *
   * `branchId` es opcional (`optional: true`): sin el, se listan los televisores
   * de TODAS las sedes que el usuario puede ver, derivadas de `request.scope` —
   * nunca todas las del sistema. Con el, `requireBranchAccess` ya valido el
   * acceso antes de llegar aca.
   *
   * NO devuelve `token_hash` (ni existe forma de pedirlo): el select es
   * explicito y el response schema lo vuelve a acotar (T-164-11).
   */
  fastify.get<{ Querystring: TvDevicesListQuery }>(
    "/devices",
    {
      schema: tvDevicesListSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const scopeFilter = buildScopeFilter(request.query.branchId, {
          role: request.scope.role,
          isOwner: request.scope.isOwner,
          country: request.scope.country,
          branchIds: request.scope.branchIds,
        });
        if (scopeFilter === "none") return reply.send({ devices: [] });

        const conditions: SQL[] = [];
        if (scopeFilter !== "all") conditions.push(scopeFilter);

        const rows = await fastify.db
          .select({
            id: schema.tvDevices.id,
            name: schema.tvDevices.name,
            branchId: schema.tvDevices.branchId,
            branchName: schema.branches.name,
            isActive: schema.tvDevices.isActive,
            lastSeenAt: schema.tvDevices.lastSeenAt,
            createdAt: schema.tvDevices.createdAt,
          })
          .from(schema.tvDevices)
          .leftJoin(
            schema.branches,
            eq(schema.branches.id, schema.tvDevices.branchId),
          )
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(schema.tvDevices.createdAt));

        return reply.send({ devices: rows });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv devices list");
      }
    },
  );

  /**
   * POST /api/admin/tv/devices/:id/revoke
   *
   * D-03: el token no expira, se corta por fila. `:id` es el id del DISPOSITIVO,
   * asi que `requireBranchAccess` no aplica (leeria un branchId del payload que
   * el atacante controla) — la sede se lee de la fila real y recien ahi se
   * evalua el acceso.
   *
   * Idempotente: revocar un TV ya revocado responde 200.
   */
  fastify.post<{ Params: TvDeviceIdParams }>(
    "/devices/:id/revoke",
    { schema: tvDeviceRevokeSchema },
    async (request, reply) => {
      try {
        const [device] = await fastify.db
          .select({
            id: schema.tvDevices.id,
            branchId: schema.tvDevices.branchId,
          })
          .from(schema.tvDevices)
          .where(eq(schema.tvDevices.id, request.params.id))
          .limit(1);

        if (!device) {
          return reply.code(404).send({
            error: "No encontrado",
            message: "Ese dispositivo no existe",
          });
        }

        const allowed = await canAccessBranch(
          request.scope,
          device.branchId,
          fastify.db,
        );
        if (!allowed) {
          request.log.warn(
            {
              userId: request.user.userId,
              role: request.user.role,
              deviceId: device.id,
              branchId: device.branchId,
            },
            BRANCH_OUT_OF_SCOPE,
          );
          return reply.code(403).send({
            error: "Forbidden",
            message: "No tenés acceso a esta sede",
            code: BRANCH_OUT_OF_SCOPE,
          });
        }

        await fastify.db
          .update(schema.tvDevices)
          .set({ isActive: false, revokedAt: new Date() })
          .where(eq(schema.tvDevices.id, device.id));

        return reply.send({ ok: true });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv device revoke");
      }
    },
  );

  /**
   * GET /api/admin/tv/control/context?branchId=NN
   *
   * La UNICA lectura del control del profe. El control es ciego (D-13): no
   * espeja la pantalla del TV, asi que de aca saca cuantos bloques hay, que
   * niveles existen hoy, cuantos ejercicios tiene cada (bloque, nivel) y si la
   * sesion del dia esta aprobada (D-10) para poder deshabilitar la botonera con
   * un motivo, en vez de dejar al profe apretando botones sin efecto.
   */
  fastify.get<{ Querystring: TvControlContextQuery }>(
    "/control/context",
    {
      schema: tvControlContextSchema,
      preHandler: [requireBranchAccess({ from: "query.branchId" })],
    },
    async (request, reply) => {
      try {
        const service = new TvService(fastify.db, request.log);
        const context = await service.buildControlContext(
          request.query.branchId,
        );
        return reply.send(context);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv control context");
      }
    },
  );
};

/**
 * Traduce el scope del usuario a un filtro de sedes para el listado.
 *
 * - `"all"`  → sin filtro (owner).
 * - `"none"` → el usuario no puede ver ninguna sede ⇒ lista vacia, NUNCA una
 *   query sin `WHERE` (fail-closed: un `scope.country` en null por corrupcion de
 *   datos no puede degradar en "mostrale todos los televisores del sistema").
 * - un `SQL` → condicion concreta.
 *
 * Espeja la eval order de `canAccessBranch`, aplicada a un listado en vez de a
 * una sede puntual.
 */
function buildScopeFilter(
  branchId: number | undefined,
  scope: {
    role: string;
    isOwner: boolean;
    country: string | null;
    branchIds: number[];
  },
): SQL | "all" | "none" {
  // Sede explicita: `requireBranchAccess` ya la autorizo en el preHandler.
  if (branchId !== undefined) {
    return eq(schema.tvDevices.branchId, branchId);
  }
  if (scope.isOwner) return "all";
  if (scope.role === "admin" || scope.role === "gestion") {
    if (scope.country === null) return "none";
    return eq(schema.branches.country, scope.country);
  }
  if (scope.role === "coach" || scope.role === "recepcion") {
    if (scope.branchIds.length === 0) return "none";
    return inArray(schema.tvDevices.branchId, scope.branchIds);
  }
  return "none";
}
