// Módulo: conquer — serialización de errores de negocio (Fase 201)
//
// Los errores de Conquer salen como `{ error, code }` para que el app ramifique
// (los mensajes ya vienen en español). Lo que no trae `code` o no es AppError
// sigue el camino común (`handleServiceError`). Un solo lugar para las rutas del
// alumno y del admin.
import type { FastifyBaseLogger, FastifyReply } from "fastify";
import { handleServiceError } from "../shared/error-handler";
import { AppError } from "../shared/errors";

export function sendConquerError(
  err: unknown,
  reply: FastifyReply,
  log: FastifyBaseLogger,
  context: string,
): void {
  if (reply.sent) return;
  if (err instanceof AppError && err.code) {
    reply.code(err.statusCode).send({ error: err.message, code: err.code });
    return;
  }
  handleServiceError(err, reply, log, context);
}
