/**
 * Shared error handler for route catch blocks.
 *
 * Uses instanceof AppError to derive status code and message from
 * the error hierarchy, avoiding per-subclass instanceof chains.
 */

import * as Sentry from "@sentry/node";
import type { FastifyReply, FastifyBaseLogger } from "fastify";
import { AppError } from "./errors";

const STATUS_LABELS: Record<number, string> = {
  400: "Solicitud invalida",
  401: "No autorizado",
  403: "Acceso denegado",
  404: "No encontrado",
  409: "Conflicto",
  422: "Datos no procesables",
};

/**
 * Cuerpo genérico de todo 500: nunca lleva SQL, stack ni el mensaje del error
 * original (eso queda en el log y en Sentry). Lo usan `handleServiceError` y el
 * `setErrorHandler` global de `app.ts`.
 */
export const INTERNAL_ERROR_BODY = {
  error: "Error del servidor",
  message: "Error interno del servidor",
} as const;

/**
 * Map a service-layer error to an HTTP response.
 *
 * - AppError subclasses (BadRequestError, NotFoundError, ConflictError, etc.)
 *   are sent with their statusCode and message.
 * - Unknown errors are logged, reported to Sentry and result in a generic 500.
 */
export function handleServiceError(
  err: unknown,
  reply: FastifyReply,
  log: FastifyBaseLogger,
  context: string,
): void {
  // If the reply was already sent (e.g. authenticate sent a 401 before
  // throwing), don't try to send again — that produces a confusing
  // "Reply was already sent" FastifyError on top of the real cause.
  if (reply.sent) return;
  if (err instanceof AppError) {
    const label = STATUS_LABELS[err.statusCode] ?? "Error desconocido";
    reply.code(err.statusCode).send({ error: label, message: err.message });
    return;
  }
  log.error({ err }, `Error in ${context}`);
  reportUnexpectedError(err, context);
  reply.code(500).send(INTERNAL_ERROR_BODY);
}

/**
 * Contextos que NO se reportan a Sentry: las rutas de la TV. Las pantallas
 * consultan cada 750 ms (≈80% del tráfico de la API) y ante un corte breve de
 * MySQL una sola TV dispara decenas de 500 en segundos (12/11/2026: 30 en 21 s
 * durante el reinicio mensual de MySQL) — ruido, no un bug a investigar.
 */
function isTvContext(context: string): boolean {
  return context.startsWith("tv ") || context.startsWith("tvAvisos.");
}

/**
 * Reporta a Sentry un error INESPERADO (el que termina en 500) que una ruta
 * atrapó y respondió ella misma. Esos nunca llegaban a Sentry: el hook
 * `onError` de `setupFastifyErrorHandler` solo ve lo que nadie atrapa (caso
 * María Eugenia Rossi 2026-11-25: 3 × "Error in member reserve" solo en el log
 * de pm2). Lo usan `handleServiceError` y los 500 armados a mano en las rutas.
 * Sin `SENTRY_DSN` (tests, local) es un no-op; el `beforeSend` de
 * `instrument.ts` sigue filtrando lo transitorio de MySQL y scrubeando datos.
 */
export function reportUnexpectedError(err: unknown, context: string): void {
  if (isTvContext(context)) return;
  Sentry.captureException(err, { tags: { context } });
}
