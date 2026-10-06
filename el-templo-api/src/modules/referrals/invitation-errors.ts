// Módulo: referrals — mapeo de errores de Invitaciones a HTTP (Fase 194-10).
// Lo comparten el canal app (194-10) y el canal asistido (194-12): un solo lugar
// decide qué status lleva cada motivo, y todos devuelven `reason` estable.
import type { FastifyBaseLogger, FastifyReply } from "fastify";
import { handleServiceError } from "../shared/error-handler";
import { InvitationRuleError } from "./invitation-types";

const LABELS = {
  400: "Solicitud invalida",
  404: "No encontrado",
  409: "Conflicto",
} as const;

/**
 * - `inviter_not_found`  -> 404
 * - `phone_required`     -> 400 (falta un dato, no es un conflicto de reglas)
 * - resto de reglas      -> 409
 * Cualquier otro error pasa por `handleServiceError` (AppError o 500).
 * Body de reglas: `{ error, message, reason }`.
 */
export function sendInvitationError(
  err: unknown,
  reply: FastifyReply,
  log: FastifyBaseLogger,
  context: string,
): void {
  if (reply.sent) return;
  if (err instanceof InvitationRuleError) {
    const status =
      err.reason === "inviter_not_found"
        ? 404
        : err.reason === "phone_required"
          ? 400
          : 409;
    reply.code(status).send({
      error: LABELS[status],
      message: err.message,
      reason: err.reason,
    });
    return;
  }
  handleServiceError(err, reply, log, context);
}
