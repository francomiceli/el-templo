// Módulo: web-public — rutas públicas de solo lectura para la web (Fase 195).
//
// GET /api/web/site-data (prefijo en `modules-boot.ts`): marca, WhatsApp de
// ventas por país y sedes publicadas con horarios. Sin autenticación y sin
// datos personales. El tenant sale del servidor (`DEFAULT_PUBLIC_TENANT_ID`,
// igual que el resto de la superficie pública de marketing), nunca del request.
import type { FastifyPluginAsync } from "fastify";
import { handleServiceError } from "../shared/error-handler";
import { DEFAULT_PUBLIC_TENANT_ID } from "../shared/modules";
import { siteDataSchema } from "./schemas";
import { WebPublicService } from "./service";

export const webPublicRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new WebPublicService(fastify.db, fastify.log);

  fastify.get(
    "/site-data",
    {
      schema: siteDataSchema,
      // 1-3 requests por build de la web: el tope solo frena abuso (T-195-07).
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      try {
        const data = await service.getSiteData({
          tenantId: DEFAULT_PUBLIC_TENANT_ID,
        });
        reply.header("Cache-Control", "public, max-age=300");
        return data;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "webPublic.getSiteData");
      }
    },
  );
};
