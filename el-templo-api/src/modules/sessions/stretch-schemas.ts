/**
 * Esquemas de la oferta de estiramiento post-clase (fase 213).
 *
 * `GET /api/sessions/stretch/today` no recibe parametros: el socio sale del JWT
 * y el gimnasio del scope del servidor (T-213-08).
 *
 * Los body de `POST /stretch/events` y `POST /stretch/complete` son cerrados
 * (`additionalProperties: false`, T-213-15). Fastify corre con `removeAdditional`:
 * las propiedades extra se DESCARTAN (no se rechazan con 400), asi que el
 * cliente no puede inyectar tiempos ni ids de gimnasio: la duracion la calcula
 * el servidor.
 */
import type {
  StretchCompleteView,
  StretchEventType,
  StretchStartedFrom,
  StretchTodayView,
} from "./stretch-service";

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

// ---------------------------------------------------------------------------
// POST /stretch/events
// ---------------------------------------------------------------------------

export interface StretchEventBody {
  type: StretchEventType;
  from?: StretchStartedFrom;
}

export interface StretchEventResponse {
  ok: true;
}

export const stretchEventSchema = {
  body: {
    type: "object",
    required: ["type"],
    additionalProperties: false,
    properties: {
      type: { type: "string", enum: ["card_seen", "started", "push_opened"] },
      from: { type: "string", enum: ["card", "push"] },
    },
  },
};

export const stretchEventResponse = {
  200: {
    type: "object",
    properties: { ok: { type: "boolean" } },
  },
  401: errorResponseSchema,
  404: errorResponseSchema,
};

// ---------------------------------------------------------------------------
// POST /stretch/complete
// ---------------------------------------------------------------------------

export interface StretchCompleteBody {
  offerId: number;
  exercisesCompleted: number[];
}

export type StretchCompleteResponse = StretchCompleteView;

export const stretchCompleteSchema = {
  body: {
    type: "object",
    required: ["offerId", "exercisesCompleted"],
    additionalProperties: false,
    properties: {
      offerId: { type: "integer", minimum: 1 },
      exercisesCompleted: {
        type: "array",
        maxItems: 20,
        items: { type: "integer", minimum: 1 },
      },
    },
  },
};

export const stretchCompleteResponse = {
  200: {
    type: "object",
    properties: {
      completedAt: { type: "string" },
      durationSeconds: { type: ["integer", "null"] },
      allDone: { type: "boolean" },
      auraAwarded: { type: "boolean" },
      alreadyCompleted: { type: "boolean" },
      minutes: { type: "integer" },
    },
  },
  401: errorResponseSchema,
  404: errorResponseSchema,
  410: errorResponseSchema,
};
