/**
 * Webhook Routes
 *
 * Fastify plugin providing GET /webhook (Meta verification)
 * and POST /webhook (inbound message handling).
 */

import type { FastifyPluginAsync } from "fastify";
import type { MetaWebhookPayload } from "../whatsapp/types.js";
import { verifyWebhook, parseWebhookPayload } from "../whatsapp/client.js";
import { handleInboundMessage } from "./handler.js";

interface WebhookQuerystring {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
}

export interface WebhookRouteOptions {
  /**
   * Optional callback invoked after handleInboundMessage completes.
   * Used in tests to await the async fire-and-forget handler.
   */
  onMessageHandled?: () => void;
}

export const webhookRoutes: FastifyPluginAsync<WebhookRouteOptions> = async (
  fastify,
  opts,
) => {
  // GET /webhook — Meta verification handshake
  fastify.get<{ Querystring: WebhookQuerystring }>(
    "/webhook",
    async (request, reply) => {
      const mode = request.query["hub.mode"] || "";
      const token = request.query["hub.verify_token"] || "";
      const challenge = request.query["hub.challenge"] || "";

      const result = verifyWebhook(mode, token, challenge);

      if (result !== null) {
        return reply.code(200).type("text/plain").send(result);
      }

      return reply.code(403).send({ error: "Forbidden" });
    },
  );

  // POST /webhook — Incoming messages from Meta
  fastify.post<{ Body: MetaWebhookPayload }>(
    "/webhook",
    async (request, reply) => {
      // Always respond 200 immediately — Meta retries on non-200
      void reply.code(200).send("EVENT_RECEIVED");

      const message = parseWebhookPayload(request.body);

      if (!message) {
        return;
      }

      // Fire-and-forget: process asynchronously
      handleInboundMessage(fastify.db, request.log, message)
        .then(() => {
          opts.onMessageHandled?.();
        })
        .catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          request.log.error(
            { err: errorMessage },
            "Error handling inbound message",
          );
          opts.onMessageHandled?.();
        });
    },
  );
};
