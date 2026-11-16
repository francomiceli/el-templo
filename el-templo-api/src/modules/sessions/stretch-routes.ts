/**
 * Rutas del estiramiento post-clase (fase 213).
 *
 * Se registran dentro de `sessionRoutes` SIN prefix, con el path relativo a
 * `/api/sessions`, para heredar el guard de `moduleScope("templo-training")`
 * (D-13), igual que `free-blocks-routes.ts`.
 */
import type { FastifyPluginAsync } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import { AuraService } from "../aura/service";
import { StretchService } from "./stretch-service";
import {
  getStretchTodaySchema,
  stretchCompleteResponse,
  stretchCompleteSchema,
  stretchEventResponse,
  stretchEventSchema,
  stretchTodayResponse,
  type StretchCompleteBody,
  type StretchCompleteResponse,
  type StretchEventBody,
  type StretchEventResponse,
  type StretchTodayResponse,
} from "./stretch-schemas";

export const stretchRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new StretchService(
    fastify.db,
    fastify.log,
    new AuraService(fastify.db),
  );

  // GET /sessions/stretch/today - Oferta de estiramiento del dia del socio.
  // Un error inesperado responde 500 y la app lo trata como "no se" (card
  // como hoy, fase 203).
  fastify.get<{ Reply: StretchTodayResponse }>(
    "/stretch/today",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...getStretchTodaySchema,
        response: stretchTodayResponse,
      },
    },
    async (request) => {
      const { userId } = request.user;

      // T-213-08: el gimnasio sale del scope del servidor, nunca del cliente.
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sessions.stretch");

      return service.getToday(ctx, userId, new Date());
    },
  );

  // POST /sessions/stretch/events - Marcas del embudo (card_seen, started,
  // push_opened). Idempotentes: cada marca se escribe una sola vez (D-15).
  fastify.post<{
    Body: StretchEventBody;
    Reply: StretchEventResponse | { error: string };
  }>(
    "/stretch/events",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...stretchEventSchema,
        response: stretchEventResponse,
      },
    },
    async (request, reply) => {
      const { userId } = request.user;
      const { type, from } = request.body;

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sessions.stretch");

      const result = await service.recordEvent(
        ctx,
        userId,
        type,
        from,
        new Date(),
      );
      if (result.kind === "not_found") {
        return reply
          .status(404)
          .send({ error: "No encontramos ese estiramiento" });
      }
      return { ok: true };
    },
  );

  // POST /sessions/stretch/complete - Cierre del estiramiento (D-08). La
  // duracion la calcula el servidor; el AURA se acredita una vez por dia.
  fastify.post<{
    Body: StretchCompleteBody;
    Reply: StretchCompleteResponse | { error: string };
  }>(
    "/stretch/complete",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...stretchCompleteSchema,
        response: stretchCompleteResponse,
      },
    },
    async (request, reply) => {
      const { userId } = request.user;
      const { offerId } = request.body;

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sessions.stretch");

      const result = await service.complete(
        ctx,
        userId,
        { offerId },
        new Date(),
      );
      if (result.kind === "error") {
        return reply.status(result.status).send({ error: result.message });
      }
      return result.view;
    },
  );
};
