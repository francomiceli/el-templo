// Módulo: conquer — JSON-schemas de rutas (Fase 201)
//
// Fastify con `additionalProperties: false` DESCARTA las claves que falten en
// el schema de respuesta: cada campo nuevo de una respuesta necesita su
// entrada acá o el serializador lo borra en silencio.
import { CONQUER_LEVELS } from "../../db/schema/conquer";
import { CONQUER_INC_RANGES } from "./activation-service";
import { COMBO_KEYS } from "./combos";

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
