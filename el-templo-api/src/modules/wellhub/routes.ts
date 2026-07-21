/**
 * Wellhub — webhook público (una sola URL para TODOS los eventos, como
 * sugiere Wellhub: checkin, booking-requested, booking-canceled,
 * booking-late-canceled).
 *
 * Sin JWT: el request se autentica por la firma HMAC X-Gympass-Signature
 * calculada sobre el body CRUDO con el secreto compartido. Por eso este
 * plugin registra su propio parser de application/json con parseAs "buffer"
 * (encapsulado a este plugin — no afecta el resto de la app, que sigue
 * parseando JSON normal).
 *
 * Respuestas: 503 si la integración no está configurada, 401 firma inválida,
 * 400 payload no-JSON, 200 procesado/ignorado/duplicado, 500 falla
 * transitoria (Wellhub reintenta y la idempotencia de wellhub_events absorbe
 * el reproceso).
 */

import { FastifyPluginAsync } from "fastify";
import { AuraService } from "../aura/service";
import { EnrollmentService } from "../programs/enrollment-service";
import { NotificationService } from "../notifications/service";
import { SubscriptionService } from "../subscriptions/service";
import { BookingService } from "../scheduling/booking-service";
import { getWellhubConfig } from "./config";
import { verifyWellhubSignature } from "./signature";
import { WellhubClient } from "./client";
import { WellhubService } from "./service";
import type { WellhubWebhookEvent } from "./types";

export const wellhubWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Cadena mínima para BookingService (promoteWaitlist/countActiveBookings),
  // mismo wiring que scheduling/routes.ts.
  const auraService = new AuraService(fastify.db);
  const enrollmentService = new EnrollmentService(fastify.db, fastify.log);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
    undefined,
    enrollmentService,
  );
  const notificationService = new NotificationService(fastify.db, fastify.log);
  const bookingService = new BookingService(
    fastify.db,
    fastify.log,
    subscriptionService,
    notificationService,
  );
  // Body crudo para verificar la firma HMAC (Fastify no preserva el raw body
  // con el parser JSON default).
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  fastify.post("/", async (request, reply) => {
    const config = getWellhubConfig();
    if (!config) {
      return reply
        .code(503)
        .send({ error: "Integración Wellhub no configurada" });
    }

    const rawBody = request.body;
    if (!Buffer.isBuffer(rawBody)) {
      return reply.code(400).send({ error: "Body inválido" });
    }

    const signatureHeader = request.headers["x-gympass-signature"];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;

    if (!verifyWellhubSignature(rawBody, signature, config.webhookSecret)) {
      request.log.warn("Webhook Wellhub con firma inválida rechazado");
      return reply.code(401).send({ error: "Firma inválida" });
    }

    let event: WellhubWebhookEvent;
    try {
      const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as { event_type?: unknown }).event_type !== "string" ||
        typeof (parsed as { event_data?: unknown }).event_data !== "object"
      ) {
        return reply.code(400).send({ error: "Payload inválido" });
      }
      event = parsed as WellhubWebhookEvent;
    } catch {
      return reply.code(400).send({ error: "JSON inválido" });
    }

    const client = new WellhubClient(config, request.log);
    const service = new WellhubService(
      fastify.db,
      request.log,
      client,
      bookingService,
    );
    const result = await service.handleEvent(event, rawBody.toString("utf8"));

    return reply
      .code(result.httpStatus)
      .send({ outcome: result.outcome, detail: result.detail });
  });
};
