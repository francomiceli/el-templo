// Módulo: conquer — JSON-schemas de rutas (Fase 201)
//
// Fastify con `additionalProperties: false` DESCARTA las claves que falten en
// el schema de respuesta: cada campo nuevo de una respuesta necesita su
// entrada acá o el serializador lo borra en silencio.
import { CONQUER_LEVELS } from "../../db/schema/conquer";
import { CONQUER_INC_RANGES } from "./activation-service";

// ── Hoy e Inicio (plan 201-07) ──────────────────────────────────────

const UNIT_ENUM = ["reps", "s"] as const;
const MODE_ENUM = ["completa", "negativa", "hold"] as const;

/** Campos de la semana del plan (D-16), comunes a `TodayResponse` y `HomeView`. */
const planWeekProperties = {
  weekMonday: { type: "string" },
  plan: {
    type: "array",
    items: {
      type: "object",
      properties: {
        dayKey: { type: "string" },
        label: { type: "string" },
        done: { type: "boolean" },
      },
      required: ["dayKey", "label", "done"],
      additionalProperties: false,
    },
  },
  nextDayKey: { type: ["string", "null"] },
  weekComplete: { type: "boolean" },
} as const;

const PLAN_WEEK_REQUIRED = [
  "weekMonday",
  "plan",
  "nextDayKey",
  "weekComplete",
] as const;

/** `HomeView` dentro de `GET /state` (member.home). */
const homeSchema = {
  type: "object",
  properties: {
    ...planWeekProperties,
    lastByDay: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dayKey: { type: "string" },
          label: { type: "string" },
          date: { type: ["string", "null"] },
          e1: {
            type: "array",
            items: {
              type: "object",
              properties: {
                exerciseName: { type: "string" },
                value: { type: "integer" },
                unit: { type: "string", enum: [...UNIT_ENUM] },
              },
              required: ["exerciseName", "value", "unit"],
              additionalProperties: false,
            },
          },
        },
        required: ["dayKey", "label", "date", "e1"],
        additionalProperties: false,
      },
    },
  },
  required: [...PLAN_WEEK_REQUIRED, "lastByDay"],
  additionalProperties: false,
} as const;

const memberStateSchema = {
  type: ["object", "null"],
  properties: {
    level: { type: ["string", "null"], enum: [...CONQUER_LEVELS, null] },
    daysCount: { type: ["integer", "null"] },
    incReps: { type: "integer" },
    incS: { type: "integer" },
    activationDate: { type: ["string", "null"] },
    blockWeek: { type: "integer" },
    cutStage: { type: "integer" },
    publishEnabled: { type: "boolean" },
    publishNoFace: { type: "boolean" },
    home: homeSchema,
  },
  additionalProperties: false,
} as const;

/** Respuesta de `GET /state` y `POST /unlock-request` (alumno). */
export const conquerStateResponseSchema = {
  200: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["bloqueado", "pedido", "activo"] },
      requestedAt: { type: ["string", "null"] },
      member: memberStateSchema,
    },
    required: ["status", "requestedAt", "member"],
    additionalProperties: false,
  },
} as const;

/** `POST /unlock-request`: sin body (se tolera `{}`). */
export const unlockRequestSchema = {
  body: {
    type: ["object", "null"],
    properties: {},
    additionalProperties: false,
  },
  response: conquerStateResponseSchema,
} as const;

/** `GET /requests` (admin). */
export const unlockRequestsResponseSchema = {
  200: {
    type: "object",
    properties: {
      requests: {
        type: "array",
        items: {
          type: "object",
          properties: {
            userId: { type: "integer" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string" },
            branchName: { type: ["string", "null"] },
            requestedAt: { type: "string" },
          },
          required: [
            "userId",
            "firstName",
            "lastName",
            "email",
            "branchName",
            "requestedAt",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["requests"],
    additionalProperties: false,
  },
} as const;

/** `GET /requests/count` (admin). */
export const unlockRequestsCountResponseSchema = {
  200: {
    type: "object",
    properties: { count: { type: "integer" } },
    required: ["count"],
    additionalProperties: false,
  },
} as const;

// ── Alta y edición del alumno (plan 201-06) ─────────────────────────

/** Vista del alumno para el admin (`AdminMemberView`). */
const adminMemberViewSchema = {
  type: "object",
  properties: {
    userId: { type: "integer" },
    status: { type: "string", enum: ["pedido", "activo"] },
    level: { type: ["string", "null"], enum: [...CONQUER_LEVELS, null] },
    daysCount: { type: ["integer", "null"] },
    incReps: { type: "integer" },
    incS: { type: "integer" },
    coachUserId: { type: ["integer", "null"] },
    activatedAt: { type: ["string", "null"] },
    activationDate: { type: ["string", "null"] },
    levelSince: { type: ["string", "null"] },
    cutStage: { type: "integer" },
  },
  required: [
    "userId",
    "status",
    "level",
    "daysCount",
    "incReps",
    "incS",
    "coachUserId",
    "activatedAt",
    "activationDate",
    "levelSince",
    "cutStage",
  ],
  additionalProperties: false,
} as const;

/** `POST /members` (admin): activa a un alumno. */
export const activateMemberSchema = {
  body: {
    type: "object",
    properties: {
      userId: { type: "integer", minimum: 1 },
      level: { type: "string", enum: [...CONQUER_LEVELS] },
      daysCount: { type: "integer" },
      coachUserId: { type: ["integer", "null"], minimum: 1 },
    },
    required: ["userId", "level", "daysCount"],
    additionalProperties: false,
  },
  response: { 201: adminMemberViewSchema },
} as const;

/** `PUT /members/:userId` (admin): edita nivel, días, incrementos y coach. */
export const updateMemberSchema = {
  params: {
    type: "object",
    properties: { userId: { type: "integer", minimum: 1 } },
    required: ["userId"],
  },
  body: {
    type: "object",
    properties: {
      level: { type: "string", enum: [...CONQUER_LEVELS] },
      daysCount: { type: "integer" },
      incReps: {
        type: "integer",
        minimum: CONQUER_INC_RANGES.incReps.min,
        maximum: CONQUER_INC_RANGES.incReps.max,
      },
      incS: {
        type: "integer",
        minimum: CONQUER_INC_RANGES.incS.min,
        maximum: CONQUER_INC_RANGES.incS.max,
      },
      coachUserId: { type: ["integer", "null"], minimum: 1 },
    },
    minProperties: 1,
    additionalProperties: false,
  },
  response: { 200: adminMemberViewSchema },
} as const;
