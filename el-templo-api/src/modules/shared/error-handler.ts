/**
 * Shared error handler for route catch blocks.
 *
 * Uses instanceof AppError to derive status code and message from
 * the error hierarchy, avoiding per-subclass instanceof chains.
 */

import type { FastifyReply, FastifyBaseLogger } from "fastify";
import { AppError } from "./errors";

const STATUS_LABELS: Record<number, string> = {
  400: "Solicitud invalida",
  403: "Acceso denegado",
  404: "No encontrado",
  409: "Conflicto",
  422: "Datos no procesables",
};

/**
 * Map a service-layer error to an HTTP response.
 *
 * - AppError subclasses (BadRequestError, NotFoundError, ConflictError, etc.)
 *   are sent with their statusCode and message.
 * - Unknown errors are logged and result in a generic 500.
 */
export function handleServiceError(
  err: unknown,
  reply: FastifyReply,
  log: FastifyBaseLogger,
  context: string,
): void {
  if (err instanceof AppError) {
    const label = STATUS_LABELS[err.statusCode] ?? "Error desconocido";
    reply.code(err.statusCode).send({ error: label, message: err.message });
    return;
  }
  log.error({ err }, `Error in ${context}`);
  reply.code(500).send({
    error: "Error del servidor",
    message: "Error interno del servidor",
  });
}
