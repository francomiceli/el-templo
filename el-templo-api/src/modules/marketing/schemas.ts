// Módulo: marketing — schemas JSON reusables (fase 195, plan 07, D-18).
//
// Los largos coinciden con las columnas de `signup_attributions`
// (src/db/schema/signup-attributions.ts). Un valor más largo es 400 de
// validación (T-195-24): los clientes legítimos (web y app) ya truncan antes de
// mandar, así que un valor fuera de rango es un cliente roto o malicioso.
//
// `additionalProperties: false` con el AJV por defecto de Fastify
// (`removeAdditional: true`) descarta en silencio las claves desconocidas: un
// cliente más nuevo que la API no rompe el alta.
import { MANUAL_ORIGINS } from "./channel";

export const signupAttributionBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    utm_source: { type: "string", maxLength: 150 },
    utm_medium: { type: "string", maxLength: 150 },
    utm_campaign: { type: "string", maxLength: 150 },
    utm_content: { type: "string", maxLength: 150 },
    utm_term: { type: "string", maxLength: 150 },
    fbclid: { type: "string", maxLength: 255 },
    gclid: { type: "string", maxLength: 255 },
    // Host del referrer externo (lo calcula la web, ver 195-06 `src_ref`).
    src_ref: { type: "string", maxLength: 255 },
    // Ruta de aterrizaje en la web (`pathname`).
    landing: { type: "string", maxLength: 500 },
    // Cookie `_fbp` de Meta.
    fbp: { type: "string", maxLength: 100 },
    // Timestamp (ms) del first-touch: solo dígitos.
    ft: { type: "string", maxLength: 15, pattern: "^[0-9]{1,15}$" },
    // La declara el cliente: Meta CAPI excluye 'ios' (D-24) y 'unknown'.
    platform: { type: "string", enum: ["web", "android", "ios"] },
  },
} as const;

/** Origen manual del alta de Sesión de Prueba (T-195-28: enum, no texto libre). */
export const manualOriginSchema = {
  type: "string",
  enum: [...MANUAL_ORIGINS],
} as const;
