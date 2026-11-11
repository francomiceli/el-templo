/**
 * Esquemas de la oferta de estiramiento post-clase (fase 213).
 *
 * `GET /api/sessions/stretch/today` no recibe parametros: el socio sale del JWT
 * y el gimnasio del scope del servidor (T-213-08).
 */
import type { StretchTodayView } from "./stretch-service";

const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
};

export const getStretchTodaySchema = {};

/** Forma de la respuesta de hoy: la misma vista que arma `StretchService`. */
export type StretchTodayResponse = StretchTodayView;

export const stretchTodayResponse = {
  200: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["none", "available", "done"] },
      localDate: { type: "string" },
      offerId: { type: ["integer", "null"] },
      minutes: { type: ["integer", "null"] },
      plannedSeconds: { type: ["integer", "null"] },
      exercises: {
        type: "array",
        items: {
          type: "object",
          properties: {
            exerciseId: { type: "integer" },
            name: { type: "string" },
            family: { type: "string" },
            sides: { type: "integer" },
            secondsPerSide: { type: "integer" },
            transitionSeconds: { type: "integer" },
            videoUrl: { type: ["string", "null"] },
          },
        },
      },
      completedAt: { type: ["string", "null"] },
      auraAwarded: { type: "boolean" },
    },
  },
  401: errorResponseSchema,
  404: errorResponseSchema,
};
