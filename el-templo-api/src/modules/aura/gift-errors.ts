// Module: aura — errores con código del regalo (fase 215)
//
// `handleServiceError` descarta el `code` de un `AppError`, así que los rechazos
// del regalo salen por `sendGiftError`, que lo conserva en la respuesta (misma
// idea que `sendPhotoError` de la 214). La app decide el texto por el `code`,
// no por el `message`.
//
// - Una asistencia ajena o inexistente responde 404 `REGALO_NO_ENCONTRADO`: no
//   revela que existe.
// - Quien no puede regalar (oculto, sin plan, staff) recibe `REGALO_NO_DISPONIBLE`
//   sin que se le explique por qué (D-07).
// - Ningún mensaje lleva datos de otras personas.

import type { FastifyBaseLogger, FastifyReply } from "fastify";
import { AppError } from "../shared/errors";
import { handleServiceError } from "../shared/error-handler";

/** Códigos estables que la app y el admin reconocen. */
export const GIFT_ERROR_CODES = [
  "REGALO_TOPE_SEMANAL",
  "REGALO_YA_DADO",
  "REGALO_VENCIDO",
  "REGALO_NO_DISPONIBLE",
  "REGALO_NO_ENCONTRADO",
  "REGALO_YA_ANULADO",
  "REGALO_SIN_PERMISO",
] as const;

export type GiftErrorCode = (typeof GIFT_ERROR_CODES)[number];

/** Status HTTP y mensaje corto en español de cada código. */
const GIFT_ERROR_TABLE: Record<
  GiftErrorCode,
  { statusCode: number; label: string; message: string }
> = {
  REGALO_TOPE_SEMANAL: {
    statusCode: 409,
    label: "Conflicto",
    message: "Ya le diste Aura a esa persona esta semana.",
  },
  REGALO_YA_DADO: {
    statusCode: 409,
    label: "Conflicto",
    message: "Ya diste el regalo de esta clase.",
  },
  REGALO_VENCIDO: {
    statusCode: 409,
    label: "Conflicto",
    message: "Se pasó el plazo para dar el regalo de esta clase.",
  },
  REGALO_NO_DISPONIBLE: {
    statusCode: 409,
    label: "Conflicto",
    message: "No se puede dar este regalo ahora.",
  },
  REGALO_NO_ENCONTRADO: {
    statusCode: 404,
    label: "No encontrado",
    message: "No encontramos esa clase.",
  },
  REGALO_YA_ANULADO: {
    statusCode: 409,
    label: "Conflicto",
    message: "Ese regalo ya estaba anulado.",
  },
  REGALO_SIN_PERMISO: {
    statusCode: 403,
    label: "Acceso denegado",
    message: "No tenés permiso para este regalo.",
  },
};

export class GiftError extends AppError {
  declare readonly code: GiftErrorCode;

  constructor(code: GiftErrorCode) {
    super(
      GIFT_ERROR_TABLE[code].message,
      GIFT_ERROR_TABLE[code].statusCode,
      code,
    );
    this.name = "GiftError";
    Object.setPrototypeOf(this, GiftError.prototype);
  }
}

/** Cuerpo de la respuesta de un rechazo del regalo. */
export function giftErrorBody(err: GiftError): {
  error: string;
  message: string;
  code: GiftErrorCode;
} {
  return {
    error: GIFT_ERROR_TABLE[err.code].label,
    message: err.message,
    code: err.code,
  };
}

/**
 * Responde un error del servicio del regalo. Los `GiftError` conservan el
 * `code`; todo lo demás va a `handleServiceError` (que loguea los 500).
 */
export function sendGiftError(
  err: unknown,
  reply: FastifyReply,
  log: FastifyBaseLogger,
  context: string,
): void {
  if (reply.sent) return;
  if (err instanceof GiftError) {
    reply.code(err.statusCode).send(giftErrorBody(err));
    return;
  }
  handleServiceError(err, reply, log, context);
}
