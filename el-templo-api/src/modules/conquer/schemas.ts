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

// ── Hoy, guardado y cambio de escalón (plan 201-07) ─────────────────

const STEP_ENUM = ["e1", "e2", "e3", "hold"] as const;
const ESTADO_ENUM = ["sin_datos", "rango", "techo1", "bajo", "subir"] as const;

const todayStepSchema = {
  type: "object",
  properties: {
    step: { type: "string", enum: [...STEP_ENUM] },
    rungId: { type: "integer" },
    rungName: { type: "string" },
    mode: { type: "string", enum: [...MODE_ENUM] },
    target: { type: ["integer", "null"] },
    estado: { type: ["string", "null"], enum: [...ESTADO_ENUM, null] },
    value: { type: "integer" },
    brazosRectos: { type: "boolean" },
    unilateral: { type: "boolean" },
  },
  required: [
    "step",
    "rungId",
    "rungName",
    "mode",
    "target",
    "estado",
    "value",
    "brazosRectos",
    "unilateral",
  ],
  additionalProperties: false,
} as const;

const todayExerciseSchema = {
  type: "object",
  properties: {
    exerciseId: { type: "integer" },
    code: { type: "string" },
    name: { type: "string" },
    unit: { type: "string", enum: [...UNIT_ENUM] },
    rungs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          code: { type: "string" },
          name: { type: "string" },
          position: { type: "integer" },
          brazosRectos: { type: "boolean" },
          unilateral: { type: "boolean" },
        },
        required: [
          "id",
          "code",
          "name",
          "position",
          "brazosRectos",
          "unilateral",
        ],
        additionalProperties: false,
      },
    },
    steps: { type: "array", items: todayStepSchema },
  },
  required: ["exerciseId", "code", "name", "unit", "rungs", "steps"],
  additionalProperties: false,
} as const;

/** `GET /today?day=<dayKey>` (alumno). */
export const todaySchema = {
  querystring: {
    type: "object",
    properties: { day: { type: "string", pattern: "^[a-z_]{1,20}$" } },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        ...planWeekProperties,
        date: { type: "string" },
        dayKey: { type: "string" },
        label: { type: "string" },
        alreadySaved: { type: "boolean" },
        pain: { type: "integer" },
        finisher: { type: "string" },
        level: { type: "string", enum: [...CONQUER_LEVELS] },
        exercises: { type: "array", items: todayExerciseSchema },
      },
      required: [
        ...PLAN_WEEK_REQUIRED,
        "date",
        "dayKey",
        "label",
        "alreadySaved",
        "pain",
        "finisher",
        "level",
        "exercises",
      ],
      additionalProperties: false,
    },
  },
} as const;

/** Tope común del JSON-schema; el tope por unidad (reps 100) lo valida el servicio. */
const sessionValueSchema = {
  type: "integer",
  minimum: 0,
  maximum: 600,
} as const;

/** `CalibrationProposal` (PUT /sessions y Progreso). */
const calibrationProposalSchema = {
  type: "object",
  properties: {
    exerciseId: { type: "integer" },
    exerciseName: { type: "string" },
    proposal: { type: "string", enum: ["subir", "quedarse", "bajar"] },
    fromRungName: { type: "string" },
    toRungName: { type: ["string", "null"] },
  },
  required: [
    "exerciseId",
    "exerciseName",
    "proposal",
    "fromRungName",
    "toRungName",
  ],
  additionalProperties: false,
} as const;

/** `PUT /sessions` (alumno). La fecha y el prev NO existen en el body (T-201-21). */
export const saveSessionSchema = {
  body: {
    type: "object",
    properties: {
      dayKey: { type: "string", pattern: "^[a-z_]{1,20}$" },
      pain: { type: "integer", minimum: 0, maximum: 10 },
      exercises: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            exerciseId: { type: "integer", minimum: 1 },
            e1: sessionValueSchema,
            e2: sessionValueSchema,
            e3: sessionValueSchema,
            hold: sessionValueSchema,
          },
          required: ["exerciseId", "e1", "e2", "e3", "hold"],
          additionalProperties: false,
        },
      },
    },
    required: ["dayKey", "pain", "exercises"],
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        sessionId: { type: "integer" },
        date: { type: "string" },
        dayKey: { type: "string" },
        lighting: {
          type: "object",
          properties: {
            primary: { type: "array", items: { type: "string" } },
            secondary: { type: "array", items: { type: "string" } },
          },
          required: ["primary", "secondary"],
          additionalProperties: false,
        },
        calibration: { type: "array", items: calibrationProposalSchema },
      },
      required: ["sessionId", "date", "dayKey", "lighting", "calibration"],
      additionalProperties: false,
    },
  },
} as const;

/** `PUT /steps/:exerciseId/:step` (alumno): cambia peldaño y modo de un escalón. */
export const changeStepSchema = {
  params: {
    type: "object",
    properties: {
      exerciseId: { type: "integer", minimum: 1 },
      step: { type: "string", enum: [...STEP_ENUM] },
    },
    required: ["exerciseId", "step"],
  },
  body: {
    type: "object",
    properties: {
      rungId: { type: "integer", minimum: 1 },
      mode: { type: "string", enum: [...MODE_ENUM] },
    },
    required: ["rungId", "mode"],
    additionalProperties: false,
  },
  response: { 200: todayStepSchema },
} as const;

// ── Progreso, Subir y calibración (plan 201-08) ─────────────────────

const COUNTED_STEP_ENUM = ["e1", "e2", "e3"] as const;

const progressStepSchema = {
  type: "object",
  properties: {
    step: { type: "string", enum: [...STEP_ENUM] },
    rungId: { type: "integer" },
    rungName: { type: "string" },
    mode: { type: "string", enum: [...MODE_ENUM] },
    last: { type: ["integer", "null"] },
    target: { type: ["integer", "null"] },
    estado: { type: ["string", "null"], enum: [...ESTADO_ENUM, null] },
  },
  required: ["step", "rungId", "rungName", "mode", "last", "target", "estado"],
  additionalProperties: false,
} as const;

const progressExerciseSchema = {
  type: "object",
  properties: {
    exerciseId: { type: "integer" },
    name: { type: "string" },
    unit: { type: "string", enum: [...UNIT_ENUM] },
    e1Curve: { type: "array", items: { type: "integer" } },
    steps: { type: "array", items: progressStepSchema },
  },
  required: ["exerciseId", "name", "unit", "e1Curve", "steps"],
  additionalProperties: false,
} as const;

/** `ProgressResponse`: respuesta de `GET /progress`, `POST .../subir` y `POST /calibration/:id`. */
export const progressResponseSchema = {
  200: {
    type: "object",
    properties: {
      sessionsCount: { type: "integer" },
      accuracy: {
        type: "object",
        properties: {
          n: { type: "integer" },
          hits: { type: "integer" },
          pct: { type: ["integer", "null"] },
          delta: { type: ["number", "null"] },
        },
        required: ["n", "hits", "pct", "delta"],
        additionalProperties: false,
      },
      weekLighting: {
        type: "object",
        properties: {
          primary: { type: "array", items: { type: "string" } },
          secondary: { type: "array", items: { type: "string" } },
        },
        required: ["primary", "secondary"],
        additionalProperties: false,
      },
      subir: {
        type: "array",
        items: {
          type: "object",
          properties: {
            exerciseId: { type: "integer" },
            exerciseName: { type: "string" },
            step: { type: "string", enum: [...COUNTED_STEP_ENUM] },
            fromRungName: { type: "string" },
            toRungName: { type: ["string", "null"] },
          },
          required: [
            "exerciseId",
            "exerciseName",
            "step",
            "fromRungName",
            "toRungName",
          ],
          additionalProperties: false,
        },
      },
      calibrations: { type: "array", items: calibrationProposalSchema },
      days: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dayKey: { type: "string" },
            label: { type: "string" },
            sessionsCount: { type: "integer" },
            exercises: { type: "array", items: progressExerciseSchema },
          },
          required: ["dayKey", "label", "sessionsCount", "exercises"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "sessionsCount",
      "accuracy",
      "weekLighting",
      "subir",
      "calibrations",
      "days",
    ],
    additionalProperties: false,
  },
} as const;

/** `GET /progress` (alumno). */
export const progressSchema = { response: progressResponseSchema } as const;

/** `POST /steps/:exerciseId/:step/subir` (alumno): sin body (se tolera `{}`). */
export const subirStepSchema = {
  params: {
    type: "object",
    properties: {
      exerciseId: { type: "integer", minimum: 1 },
      step: { type: "string", enum: [...COUNTED_STEP_ENUM] },
    },
    required: ["exerciseId", "step"],
  },
  body: {
    type: ["object", "null"],
    properties: {},
    additionalProperties: false,
  },
  response: progressResponseSchema,
} as const;

/** `POST /calibration/:exerciseId` (alumno): acepta o no la propuesta. */
export const resolveCalibrationSchema = {
  params: {
    type: "object",
    properties: { exerciseId: { type: "integer", minimum: 1 } },
    required: ["exerciseId"],
  },
  body: {
    type: "object",
    properties: { accept: { type: "boolean" } },
    required: ["accept"],
    additionalProperties: false,
  },
  response: progressResponseSchema,
} as const;
