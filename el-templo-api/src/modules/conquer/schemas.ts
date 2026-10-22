// Módulo: conquer — JSON-schemas de rutas (Fase 201)
//
// Fastify con `additionalProperties: false` DESCARTA las claves que falten en
// el schema de respuesta: cada campo nuevo de una respuesta necesita su
// entrada acá o el serializador lo borra en silencio.
import { CONQUER_LEVELS, CONQUER_STEP_KEYS } from "../../db/schema/conquer";
import { CONQUER_INC_RANGES } from "./activation-service";
import { COMBO_KEYS } from "./combos";
import { CONQUER_POSES } from "./private-media";
import { CONQUER_SETTING_RANGES } from "./settings";

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

/** `bodyCheck` dentro de `GET /state` (member.bodyCheck, D-15). */
const bodyCheckSummarySchema = {
  type: "object",
  properties: {
    hasDay0: { type: "boolean" },
    day0Skipped: { type: "boolean" },
    mustPromptDay0: { type: "boolean" },
    day0Pending: { type: "boolean" },
    lastCheckDate: { type: ["string", "null"] },
    nextDueDate: { type: ["string", "null"] },
    due: { type: "boolean" },
    overdue: { type: "boolean" },
  },
  required: [
    "hasDay0",
    "day0Skipped",
    "mustPromptDay0",
    "day0Pending",
    "lastCheckDate",
    "nextDueDate",
    "due",
    "overdue",
  ],
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
    bodyCheck: bodyCheckSummarySchema,
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

/** `ComboView` (Hoy, sábado y Subir del combo): peldaño de arranque y series completadas (§3.3). */
const comboViewSchema = {
  type: "object",
  properties: {
    comboKey: { type: "string", enum: [...COMBO_KEYS] },
    label: { type: "string" },
    press: { type: "string" },
    push: { type: "string" },
    hold: { type: "string" },
    rungs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          code: { type: "string" },
          name: { type: "string" },
          position: { type: "integer" },
        },
        required: ["id", "code", "name", "position"],
        additionalProperties: false,
      },
    },
    rungId: { type: "integer" },
    rungName: { type: "string" },
    target: { type: "integer" },
    value: { type: "integer" },
    maxSeries: { type: ["integer", "null"] },
    drops: { type: ["integer", "null"] },
    subir: {
      type: "object",
      properties: {
        ready: { type: "boolean" },
        toRungName: { type: ["string", "null"] },
      },
      required: ["ready", "toRungName"],
      additionalProperties: false,
    },
  },
  required: [
    "comboKey",
    "label",
    "press",
    "push",
    "hold",
    "rungs",
    "rungId",
    "rungName",
    "target",
    "value",
    "maxSeries",
    "drops",
    "subir",
  ],
  additionalProperties: false,
} as const;

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
        // S12-3: solo Toro. `opening` en los días con combo, `saturday` el sábado.
        opening: { ...comboViewSchema, type: ["object", "null"] },
        saturday: {
          type: ["object", "null"],
          properties: {
            warmup: { type: "string" },
            push: comboViewSchema,
            pull: comboViewSchema,
          },
          required: ["warmup", "push", "pull"],
          additionalProperties: false,
        },
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
        "opening",
        "saturday",
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

/** Combo del body (§3.3): peldaño de arranque y series completadas (T-201-35: tope por combo). */
function comboEntrySchema(maxSeries: number) {
  return {
    type: "object",
    properties: {
      rungId: { type: "integer", minimum: 1 },
      series: { type: "integer", minimum: 0, maximum: maxSeries },
    },
    required: ["rungId", "series"],
    additionalProperties: false,
  } as const;
}

/**
 * `PUT /sessions` (alumno). La fecha y el prev NO existen en el body (T-201-21).
 * `exercises` es obligatorio salvo el sábado de Toro (lo exige el servicio, que
 * conoce el día); `opening` es opcional y `push`/`pull` son del sábado.
 */
export const saveSessionSchema = {
  body: {
    type: "object",
    properties: {
      dayKey: { type: "string", pattern: "^[a-z_]{1,20}$" },
      pain: { type: "integer", minimum: 0, maximum: 10 },
      opening: comboEntrySchema(10),
      push: comboEntrySchema(13),
      pull: comboEntrySchema(13),
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
    required: ["dayKey", "pain"],
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
      comboSubir: {
        type: "array",
        items: {
          type: "object",
          properties: {
            comboKey: { type: "string", enum: [...COMBO_KEYS] },
            label: { type: "string" },
            fromRungName: { type: "string" },
            toRungName: { type: ["string", "null"] },
          },
          required: ["comboKey", "label", "fromRungName", "toRungName"],
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
      "comboSubir",
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

/** `POST /combos/:comboKey/subir` (alumno): sube la progresión de arranque del combo (D-14). */
export const subirComboSchema = {
  params: {
    type: "object",
    properties: { comboKey: { type: "string", enum: [...COMBO_KEYS] } },
    required: ["comboKey"],
  },
  body: {
    type: ["object", "null"],
    properties: {},
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: { combo: comboViewSchema },
      required: ["combo"],
      additionalProperties: false,
    },
  },
} as const;

// ── Tablero y alertas del coach (plan 201-09) ───────────────────────

const ALERT_KIND_ENUM = [
  "molestia",
  "caida",
  "tope_escalera",
  "paso_nivel",
  "inactivo",
  "control_vencido",
  "control_dia0_pendiente",
] as const;
const LIGHT_ENUM = ["rojo", "amarillo", "verde", "ok"] as const;

/** `BoardAlert`: `detail` es libre (cada tipo trae lo suyo), no se vacía. */
const boardAlertSchema = {
  type: "object",
  properties: {
    id: { type: ["integer", "null"] },
    kind: { type: "string", enum: [...ALERT_KIND_ENUM] },
    severity: { type: "string", enum: ["rojo", "amarillo", "verde"] },
    label: { type: "string" },
    status: {
      type: ["string", "null"],
      enum: ["abierta", "vista", "resuelta", null],
    },
    createdAt: { type: ["string", "null"] },
    detail: { type: "object", additionalProperties: true },
    proposal: {
      type: ["object", "null"],
      properties: {
        kind: { type: "string", enum: ["etapa", "bajar_escalon"] },
        stage: { type: "integer" },
        label: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  required: [
    "id",
    "kind",
    "severity",
    "label",
    "status",
    "createdAt",
    "detail",
    "proposal",
  ],
  additionalProperties: false,
} as const;

const boardMemberSchema = {
  type: "object",
  properties: {
    userId: { type: "integer" },
    firstName: { type: "string" },
    lastName: { type: "string" },
    level: { type: "string", enum: [...CONQUER_LEVELS] },
    daysCount: { type: "integer" },
    cutStage: { type: "integer" },
    lastSessionDate: { type: ["string", "null"] },
    light: { type: "string", enum: [...LIGHT_ENUM] },
    alerts: { type: "array", items: boardAlertSchema },
  },
  required: [
    "userId",
    "firstName",
    "lastName",
    "level",
    "daysCount",
    "cutStage",
    "lastSessionDate",
    "light",
    "alerts",
  ],
  additionalProperties: false,
} as const;

/** `GET /members` (admin): el tablero con semáforo (S12-7). */
export const boardSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        counts: {
          type: "object",
          properties: {
            rojo: { type: "integer" },
            amarillo: { type: "integer" },
            verde: { type: "integer" },
            ok: { type: "integer" },
            total: { type: "integer" },
          },
          required: ["rojo", "amarillo", "verde", "ok", "total"],
          additionalProperties: false,
        },
        members: { type: "array", items: boardMemberSchema },
      },
      required: ["counts", "members"],
      additionalProperties: false,
    },
  },
} as const;

/** `PATCH /alerts/:id` (admin): marca una alerta vista o resuelta. */
export const updateAlertSchema = {
  params: {
    type: "object",
    properties: { id: { type: "integer", minimum: 1 } },
    required: ["id"],
  },
  body: {
    type: "object",
    properties: { status: { type: "string", enum: ["vista", "resuelta"] } },
    required: ["status"],
    additionalProperties: false,
  },
  response: { 200: boardAlertSchema },
} as const;

// ── Ficha del alumno y acciones del coach (plan 201-11) ─────────────

const memberIdParams = {
  type: "object",
  properties: { userId: { type: "integer", minimum: 1 } },
  required: ["userId"],
} as const;

/** `FichaResponse`: todo lo que el coach necesita del alumno en una pantalla. */
const fichaResponseSchema = {
  200: {
    type: "object",
    properties: {
      member: {
        ...adminMemberViewSchema,
        properties: {
          ...adminMemberViewSchema.properties,
          firstName: { type: "string" },
          lastName: { type: "string" },
          email: { type: ["string", "null"] },
        },
        required: [
          ...adminMemberViewSchema.required,
          "firstName",
          "lastName",
          "email",
        ],
      },
      progress: progressResponseSchema[200],
      alerts: { type: "array", items: boardAlertSchema },
      cutProposal: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["etapa", "bajar_escalon"] },
          stage: { type: "integer" },
          label: { type: "string" },
        },
        required: ["kind", "label"],
        additionalProperties: false,
      },
      levelUp: {
        type: "object",
        properties: {
          to: { type: ["string", "null"], enum: [...CONQUER_LEVELS, null] },
          validDays: { type: "array", items: { type: "integer" } },
        },
        required: ["to", "validDays"],
        additionalProperties: false,
      },
    },
    required: ["member", "progress", "alerts", "cutProposal", "levelUp"],
    additionalProperties: false,
  },
} as const;

/** `GET /members/:userId` (admin): la ficha del alumno. */
export const fichaSchema = {
  params: memberIdParams,
  response: fichaResponseSchema,
} as const;

/** `PUT /members/:userId/steps/:exerciseId/:step` (admin): corrige una progresión (§7.2). */
export const correctStepSchema = {
  params: {
    type: "object",
    properties: {
      userId: { type: "integer", minimum: 1 },
      exerciseId: { type: "integer", minimum: 1 },
      step: { type: "string", enum: [...STEP_ENUM] },
    },
    required: ["userId", "exerciseId", "step"],
  },
  body: changeStepSchema.body,
  response: fichaResponseSchema,
} as const;

/**
 * `POST /members/:userId/recortes` (admin). Esquema plano a propósito: un `oneOf`
 * por acción con `additionalProperties: false` y `removeAdditional` de Ajv borraría
 * en silencio las claves de las otras ramas. Los campos que exige cada acción los
 * valida `parseCutBody` (400 `CONQUER_CORTE_INVALIDO`).
 */
export const cutSchema = {
  params: memberIdParams,
  body: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["aplicar_etapa", "deshacer_etapa", "bajar_escalon"],
      },
      alertId: { type: "integer", minimum: 1 },
      exerciseId: { type: "integer", minimum: 1 },
      step: { type: "string", enum: [...STEP_ENUM] },
    },
    required: ["action"],
    additionalProperties: false,
  },
  response: fichaResponseSchema,
} as const;

/** `POST /members/:userId/level-up` (admin): confirma el paso de nivel (§2.2). */
export const levelUpSchema = {
  params: memberIdParams,
  body: {
    type: "object",
    properties: { daysCount: { type: "integer" } },
    required: ["daysCount"],
    additionalProperties: false,
  },
  response: fichaResponseSchema,
} as const;

// ── Control físico del alumno (plan 201-12) ─────────────────────────

const nullableNumber = { type: ["number", "null"] } as const;

/** `BodyCheckView`: NUNCA lleva claves de storage ni URLs (T-201-43). */
const bodyCheckViewSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    checkDate: { type: "string" },
    kind: { type: "string", enum: ["dia0", "periodico"] },
    photos: {
      type: "object",
      properties: {
        frente: { type: "boolean" },
        perfil: { type: "boolean" },
        espalda: { type: "boolean" },
      },
      required: ["frente", "perfil", "espalda"],
      additionalProperties: false,
    },
    armCm: nullableNumber,
    chestCm: nullableNumber,
    shouldersCm: nullableNumber,
    waistCm: nullableNumber,
    weightKg: nullableNumber,
  },
  required: [
    "id",
    "checkDate",
    "kind",
    "photos",
    "armCm",
    "chestCm",
    "shouldersCm",
    "waistCm",
    "weightKg",
  ],
  additionalProperties: false,
} as const;

const checkComparisonSchema = {
  type: ["object", "null"],
  properties: {
    from: {
      type: "object",
      properties: { id: { type: "integer" }, checkDate: { type: "string" } },
      required: ["id", "checkDate"],
      additionalProperties: false,
    },
    to: {
      type: "object",
      properties: { id: { type: "integer" }, checkDate: { type: "string" } },
      required: ["id", "checkDate"],
      additionalProperties: false,
    },
    weeks: { type: "integer" },
    measures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: {
            type: "string",
            enum: ["arm", "chest", "shoulders", "waist", "weight"],
          },
          label: { type: "string" },
          from: nullableNumber,
          to: nullableNumber,
          diff: nullableNumber,
        },
        required: ["key", "label", "from", "to", "diff"],
        additionalProperties: false,
      },
    },
  },
  required: ["from", "to", "weeks", "measures"],
  additionalProperties: false,
} as const;

const photoParams = {
  type: "object",
  properties: {
    checkId: { type: "integer", minimum: 1 },
    pose: { type: "string", enum: [...CONQUER_POSES] },
  },
  required: ["checkId", "pose"],
} as const;

/** `POST /body-checks`: perímetros 10-300 cm y peso 20-400 kg, todos opcionales. */
export const upsertBodyCheckSchema = {
  body: {
    type: "object",
    properties: {
      armCm: { type: "number", minimum: 10, maximum: 300 },
      chestCm: { type: "number", minimum: 10, maximum: 300 },
      shouldersCm: { type: "number", minimum: 10, maximum: 300 },
      waistCm: { type: "number", minimum: 10, maximum: 300 },
      weightKg: { type: "number", minimum: 20, maximum: 400 },
    },
    additionalProperties: false,
  },
  response: { 200: bodyCheckViewSchema },
} as const;

/** `GET /body-checks`. */
export const listBodyChecksSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        checks: { type: "array", items: bodyCheckViewSchema },
        compare: checkComparisonSchema,
        due: {
          type: "object",
          properties: {
            nextDueDate: { type: ["string", "null"] },
            due: { type: "boolean" },
            overdue: { type: "boolean" },
          },
          required: ["nextDueDate", "due", "overdue"],
          additionalProperties: false,
        },
      },
      required: ["checks", "compare", "due"],
      additionalProperties: false,
    },
  },
} as const;

/**
 * `POST /body-checks/:checkId/photos/:pose/upload-url`. `contentType` NO lleva
 * `enum`: el servicio lo valida DESPUÉS de la propiedad (404) y del storage (503).
 */
export const photoUploadUrlSchema = {
  params: photoParams,
  body: {
    type: "object",
    properties: { contentType: { type: "string" } },
    required: ["contentType"],
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        uploadUrl: { type: "string" },
        key: { type: "string" },
        contentType: { type: "string" },
        expiresIn: { type: "integer" },
      },
      required: ["uploadUrl", "key", "contentType", "expiresIn"],
      additionalProperties: false,
    },
  },
} as const;

/** `POST /body-checks/:checkId/photos/:pose/confirm`. */
export const photoConfirmSchema = {
  params: photoParams,
  body: {
    type: "object",
    properties: { key: { type: "string", minLength: 1, maxLength: 255 } },
    required: ["key"],
    additionalProperties: false,
  },
  response: { 200: bodyCheckViewSchema },
} as const;

/** `GET /body-checks/:checkId/photos/:pose/url`. */
export const photoUrlSchema = {
  params: photoParams,
  response: {
    200: {
      type: "object",
      properties: { url: { type: "string" }, expiresIn: { type: "integer" } },
      required: ["url", "expiresIn"],
      additionalProperties: false,
    },
  },
} as const;

/** `POST /body-checks/skip-day0`: sin body (se tolera `{}`). */
export const skipDay0Schema = {
  body: {
    type: ["object", "null"],
    properties: {},
    additionalProperties: false,
  },
  response: { 200: bodyCheckSummarySchema },
} as const;

// ── Publicación, controles en el admin y galería (plan 201-13) ──────

/** `PUT /publish-permission` (alumno): ambos campos obligatorios. */
export const publishPermissionSchema = {
  body: {
    type: "object",
    properties: { enabled: { type: "boolean" }, noFace: { type: "boolean" } },
    required: ["enabled", "noFace"],
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        noFace: { type: "boolean" },
        changedAt: { type: "string" },
      },
      required: ["enabled", "noFace", "changedAt"],
      additionalProperties: false,
    },
  },
} as const;

/** `GET /members/:userId/body-checks` (admin): mismo cuerpo que el del alumno. */
export const adminBodyChecksSchema = {
  params: {
    type: "object",
    properties: { userId: { type: "integer", minimum: 1 } },
    required: ["userId"],
  },
  response: listBodyChecksSchema.response,
} as const;

/** `GET /members/:userId/body-checks/:checkId/photos/:pose/url` (admin). */
export const adminPhotoUrlSchema = {
  params: {
    type: "object",
    properties: {
      userId: { type: "integer", minimum: 1 },
      checkId: { type: "integer", minimum: 1 },
      pose: { type: "string", enum: [...CONQUER_POSES] },
    },
    required: ["userId", "checkId", "pose"],
  },
  response: photoUrlSchema.response,
} as const;

/** `BodyCheckView` que puede ser `null` (mismo patrón que `checkComparisonSchema`). */
const nullableBodyCheckViewSchema = {
  ...bodyCheckViewSchema,
  type: ["object", "null"],
} as const;

/** `GalleryItem`: sin claves ni URLs (T-201-48). */
const galleryItemSchema = {
  type: "object",
  properties: {
    userId: { type: "integer" },
    firstName: { type: "string" },
    lastName: { type: "string" },
    level: { type: ["string", "null"], enum: [...CONQUER_LEVELS, null] },
    publishEnabled: { type: "boolean" },
    publishNoFace: { type: "boolean" },
    publishChangedAt: { type: ["string", "null"] },
    day0: nullableBodyCheckViewSchema,
    last: nullableBodyCheckViewSchema,
    compare: checkComparisonSchema,
  },
  required: [
    "userId",
    "firstName",
    "lastName",
    "level",
    "publishEnabled",
    "publishNoFace",
    "publishChangedAt",
    "day0",
    "last",
    "compare",
  ],
  additionalProperties: false,
} as const;

/** `GET /gallery?authorized=true|false` (admin); sin el parámetro = todos. */
export const gallerySchema = {
  querystring: {
    type: "object",
    properties: { authorized: { type: "boolean" } },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: { items: { type: "array", items: galleryItemSchema } },
      required: ["items"],
      additionalProperties: false,
    },
  },
} as const;

// ── Edición del catálogo y de los parámetros (plan 201-14, D-14) ────

const rungAdminSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    code: { type: "string" },
    name: { type: "string" },
    position: { type: "integer" },
    brazosRectos: { type: "boolean" },
    unilateral: { type: "boolean" },
    isActive: { type: "boolean" },
    inUse: { type: "boolean" },
  },
  required: [
    "id",
    "code",
    "name",
    "position",
    "brazosRectos",
    "unilateral",
    "isActive",
    "inUse",
  ],
  additionalProperties: false,
} as const;

const ladderAdminSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    code: { type: "string" },
    name: { type: "string" },
    sortOrder: { type: "integer" },
    isActive: { type: "boolean" },
    rungs: { type: "array", items: rungAdminSchema },
  },
  required: ["id", "code", "name", "sortOrder", "isActive", "rungs"],
  additionalProperties: false,
} as const;

const exerciseAdminSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    code: { type: "string" },
    name: { type: "string" },
    ladderId: { type: "integer" },
    ladderCode: { type: "string" },
    unit: { type: "string", enum: [...UNIT_ENUM] },
    muscles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          zone: { type: "string" },
          role: { type: "string", enum: ["principal", "secundario"] },
        },
        required: ["zone", "role"],
        additionalProperties: false,
      },
    },
    startSteps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "string", enum: [...CONQUER_STEP_KEYS] },
          rung: { type: "string" },
          mode: { type: "string", enum: [...MODE_ENUM] },
        },
        required: ["step", "rung", "mode"],
        additionalProperties: false,
      },
    },
    sortOrder: { type: "integer" },
    isActive: { type: "boolean" },
  },
  required: [
    "id",
    "code",
    "name",
    "ladderId",
    "ladderCode",
    "unit",
    "muscles",
    "startSteps",
    "sortOrder",
    "isActive",
  ],
  additionalProperties: false,
} as const;

const templateDayAdminSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    daysCount: { type: "integer" },
    dayKey: { type: "string" },
    label: { type: "string" },
    sortOrder: { type: "integer" },
    finisherText: { type: "string" },
    exerciseCodes: { type: "array", items: { type: "string" } },
    openingComboKey: { type: ["string", "null"] },
  },
  required: [
    "id",
    "daysCount",
    "dayKey",
    "label",
    "sortOrder",
    "finisherText",
    "exerciseCodes",
    "openingComboKey",
  ],
  additionalProperties: false,
} as const;

/** `GET /catalog` (admin): el catálogo completo para el editor. */
export const catalogAdminSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        ladders: { type: "array", items: ladderAdminSchema },
        exercises: { type: "array", items: exerciseAdminSchema },
        templateDays: { type: "array", items: templateDayAdminSchema },
        zones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slug: { type: "string" },
              label: { type: "string" },
            },
            required: ["slug", "label"],
            additionalProperties: false,
          },
        },
      },
      required: ["ladders", "exercises", "templateDays", "zones"],
      additionalProperties: false,
    },
  },
} as const;

const ladderIdParams = {
  type: "object",
  properties: { ladderId: { type: "integer", minimum: 1 } },
  required: ["ladderId"],
} as const;

/** `POST /ladders/:ladderId/rungs` (admin): agrega un peldaño al final. */
export const createRungSchema = {
  params: ladderIdParams,
  body: {
    type: "object",
    properties: {
      name: { type: "string", maxLength: 60 },
      brazosRectos: { type: "boolean" },
      unilateral: { type: "boolean" },
    },
    required: ["name", "brazosRectos", "unilateral"],
    additionalProperties: false,
  },
  response: { 201: ladderAdminSchema },
} as const;

/** `PUT /rungs/:rungId` (admin): renombra, marca o activa y desactiva. */
export const updateRungSchema = {
  params: {
    type: "object",
    properties: { rungId: { type: "integer", minimum: 1 } },
    required: ["rungId"],
  },
  body: {
    type: "object",
    properties: {
      name: { type: "string", maxLength: 60 },
      brazosRectos: { type: "boolean" },
      unilateral: { type: "boolean" },
      isActive: { type: "boolean" },
    },
    minProperties: 1,
    additionalProperties: false,
  },
  response: { 200: ladderAdminSchema },
} as const;

/** `PUT /ladders/:ladderId/order` (admin): todos los peldaños, del más difícil al más fácil. */
export const reorderRungsSchema = {
  params: ladderIdParams,
  body: {
    type: "object",
    properties: {
      rungIds: {
        type: "array",
        items: { type: "integer", minimum: 1 },
        minItems: 1,
      },
    },
    required: ["rungIds"],
    additionalProperties: false,
  },
  response: { 200: ladderAdminSchema },
} as const;

/**
 * `PUT /exercises/:exerciseId` (admin). La estructura de `startSteps` y
 * `muscles` se valida en el servicio (detrás del 404, con `code`).
 */
export const updateExerciseSchema = {
  params: {
    type: "object",
    properties: { exerciseId: { type: "integer", minimum: 1 } },
    required: ["exerciseId"],
  },
  body: {
    type: "object",
    properties: {
      name: { type: "string", maxLength: 80 },
      startSteps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step: { type: "string" },
            rung: { type: "string" },
            mode: { type: "string" },
          },
        },
      },
      muscles: {
        type: "array",
        items: {
          type: "object",
          properties: { zone: { type: "string" }, role: { type: "string" } },
        },
      },
    },
    minProperties: 1,
    additionalProperties: false,
  },
  response: { 200: exerciseAdminSchema },
} as const;

/** `PUT /template-days/:id` (admin): nombre, finisher y los 3 ejercicios del día. */
export const updateTemplateDaySchema = {
  params: {
    type: "object",
    properties: { id: { type: "integer", minimum: 1 } },
    required: ["id"],
  },
  body: {
    type: "object",
    properties: {
      label: { type: "string", maxLength: 40 },
      finisherText: { type: "string", maxLength: 200 },
      exerciseCodes: { type: "array", items: { type: "string" } },
    },
    minProperties: 1,
    additionalProperties: false,
  },
  response: { 200: templateDayAdminSchema },
} as const;

const rangeSchema = {
  type: "object",
  properties: { min: { type: "integer" }, max: { type: "integer" } },
  required: ["min", "max"],
  additionalProperties: false,
} as const;

const settingsResponseSchema = {
  200: {
    type: "object",
    properties: {
      settings: {
        type: "object",
        properties: {
          startOffset: {
            type: "object",
            properties: {
              ternero: { type: "integer" },
              novillo: { type: "integer" },
              toro: { type: "integer" },
            },
            required: ["ternero", "novillo", "toro"],
            additionalProperties: false,
          },
          comboWeeksN: { type: "integer" },
        },
        required: ["startOffset", "comboWeeksN"],
        additionalProperties: false,
      },
      ranges: {
        type: "object",
        properties: {
          startOffsetTernero: rangeSchema,
          startOffsetNovillo: rangeSchema,
          comboWeeksN: rangeSchema,
        },
        required: ["startOffsetTernero", "startOffsetNovillo", "comboWeeksN"],
        additionalProperties: false,
      },
    },
    required: ["settings", "ranges"],
    additionalProperties: false,
  },
} as const;

/** `GET /settings` (admin): parámetros de Nacho y sus rangos. */
export const getSettingsSchema = { response: settingsResponseSchema } as const;

/** `PUT /settings` (admin): rangos tomados de `CONQUER_SETTING_RANGES` (fuente única). */
export const putSettingsSchema = {
  body: {
    type: "object",
    properties: {
      startOffsetTernero: {
        type: "integer",
        minimum: CONQUER_SETTING_RANGES.startOffsetTernero.min,
        maximum: CONQUER_SETTING_RANGES.startOffsetTernero.max,
      },
      startOffsetNovillo: {
        type: "integer",
        minimum: CONQUER_SETTING_RANGES.startOffsetNovillo.min,
        maximum: CONQUER_SETTING_RANGES.startOffsetNovillo.max,
      },
      comboWeeksN: {
        type: "integer",
        minimum: CONQUER_SETTING_RANGES.comboWeeksN.min,
        maximum: CONQUER_SETTING_RANGES.comboWeeksN.max,
      },
    },
    minProperties: 1,
    additionalProperties: false,
  },
  response: settingsResponseSchema,
} as const;
