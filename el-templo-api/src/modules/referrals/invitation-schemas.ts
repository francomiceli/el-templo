// Módulo: referrals — JSON-schemas de las rutas de Invitaciones del socio (Fase 194-10).
//
// T-194-34: el body NO tiene `invitedUserId` ni `inviterId`: quien se activa es
// SIEMPRE el usuario del token, y `additionalProperties:false` rechaza (400)
// cualquier campo extra en vez de ignorarlo.

import type { FastifyReply, FastifyRequest } from "fastify";

/** Código de invitación: alfanumérico y guion (formato `PREFIJO-XXXX`). */
const codeProperty = {
  type: "string",
  minLength: 1,
  maxLength: 24,
  pattern: "^[A-Za-z0-9-]+$",
} as const;

/** GET /invitations/eligibility?code=X[&branchId=N] */
export const invitationEligibilityQuerySchema = {
  type: "object",
  required: ["code"],
  properties: {
    code: codeProperty,
    // Sede destino elegida en el selector (socio en la sede virtual).
    branchId: { type: "integer", minimum: 1 },
  },
  additionalProperties: false,
} as const;

/** POST /invitations/activate */
export const invitationActivateBodySchema = {
  type: "object",
  required: ["code", "branchId", "phone"],
  properties: {
    code: codeProperty,
    branchId: { type: "integer", minimum: 1 },
    phone: { type: "string", minLength: 6, maxLength: 30 },
    dni: { type: ["string", "null"], maxLength: 20 },
  },
  additionalProperties: false,
} as const;

/**
 * `preValidation` que rechaza con 400 un body con claves fuera del schema.
 *
 * Fastify (ajv `removeAdditional`) DESCARTA en silencio las claves extra cuando
 * hay `additionalProperties:false`, así que sin esto un `invitedUserId` ajeno
 * terminaría ignorado con un 201 (T-194-34). Acá se rechaza explícito, ANTES
 * de que ajv las borre. Deja pasar lo que no sea un objeto: lo resuelve el schema.
 */
export function rejectUnknownBodyKeys(
  allowed: readonly string[],
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const body = request.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return;
    }
    const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      await reply.code(400).send({
        error: "Solicitud invalida",
        message: `Campos no permitidos: ${unknown.join(", ")}`,
      });
    }
  };
}

export const INVITATION_ACTIVATE_BODY_KEYS = Object.keys(
  invitationActivateBodySchema.properties,
);

export interface InvitationEligibilityQuery {
  code: string;
  branchId?: number;
}

export interface InvitationActivateBody {
  code: string;
  branchId: number;
  phone: string;
  dni?: string | null;
}
