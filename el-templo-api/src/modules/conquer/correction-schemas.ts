// Módulo: conquer — JSON-schemas de las correcciones con video (Fase 202)
//
// Archivo propio para no seguir agrandando `schemas.ts`. Fastify con
// `additionalProperties: false` DESCARTA las claves que falten en el schema de
// respuesta: cada campo de `CorrectionView`, `CorrectionTarget` o `limits`
// tiene su entrada acá.
//
// Los bodies fijan solo tipos (Fase 201 lección 201-12): los valores
// (`step`, `comboKey`, `durationSec`, `comment`) los valida el SERVICIO, para que
// queden detrás de los 409/503 y traigan `code`. Cuerpo plano.

const replyViewSchema = {
  type: ["object", "null"],
  properties: {
    text: { type: ["string", "null"] },
    hasVideo: { type: "boolean" },
    videoSeconds: { type: ["integer", "null"] },
    repliedAt: { type: "string" },
  },
  required: ["text", "hasVideo", "videoSeconds", "repliedAt"],
  additionalProperties: false,
} as const;

export const correctionViewSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    kind: { type: "string", enum: ["escalon", "combo"] },
    targetLabel: { type: "string" },
    comment: { type: ["string", "null"] },
    durationSec: { type: "integer" },
    createdAt: { type: "string" },
    status: { type: "string", enum: ["pendiente", "respondida"] },
    videoDeleted: { type: "boolean" },
    reply: replyViewSchema,
    replyUnseen: { type: "boolean" },
  },
  required: [
    "id",
    "kind",
    "targetLabel",
    "comment",
    "durationSec",
    "createdAt",
    "status",
    "videoDeleted",
    "reply",
    "replyUnseen",
  ],
  additionalProperties: false,
} as const;

export const correctionTargetSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    kind: { type: "string", enum: ["escalon", "combo"] },
    exerciseId: { type: ["integer", "null"] },
    step: { type: ["string", "null"] },
    comboKey: { type: ["string", "null"] },
    group: { type: "string" },
    label: { type: "string" },
  },
  required: ["key", "kind", "exerciseId", "step", "comboKey", "group", "label"],
  additionalProperties: false,
} as const;

/** `GET /corrections`. */
export const memberCorrectionsSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        items: { type: "array", items: correctionViewSchema },
        targets: { type: "array", items: correctionTargetSchema },
        limits: {
          type: "object",
          properties: {
            pending: { type: "integer" },
            pendingMax: { type: "integer" },
            maxSeconds: { type: "integer" },
            maxBytes: { type: "integer" },
            commentMax: { type: "integer" },
          },
          required: [
            "pending",
            "pendingMax",
            "maxSeconds",
            "maxBytes",
            "commentMax",
          ],
          additionalProperties: false,
        },
      },
      required: ["items", "targets", "limits"],
      additionalProperties: false,
    },
  },
} as const;

/** `POST /corrections/upload-url`. El tipo lo valida el servicio, no un `enum`. */
export const correctionUploadUrlSchema = {
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
        maxBytes: { type: "integer" },
      },
      required: ["uploadUrl", "key", "contentType", "expiresIn", "maxBytes"],
      additionalProperties: false,
    },
  },
} as const;

/** `POST /corrections`: objetivo (escalón o combo), comentario, clave y duración. */
export const createCorrectionSchema = {
  body: {
    type: "object",
    properties: {
      exerciseId: { type: ["integer", "null"] },
      step: { type: ["string", "null"] },
      comboKey: { type: ["string", "null"] },
      comment: { type: ["string", "null"] },
      key: { type: "string", minLength: 1, maxLength: 255 },
      durationSec: { type: "number" },
    },
    required: ["key", "durationSec"],
    additionalProperties: false,
  },
  response: { 201: correctionViewSchema },
} as const;

/**
 * `GET /corrections/:id/video-url?who=alumno|coach`. Fase 202 DA-44: `who` lo
 * valida el SERVICIO (queda detrás del 409 y del 404 y trae `code`). Video
 * ausente = 200 con `available: false`, nunca un error.
 */
export const correctionVideoUrlSchema = {
  params: {
    type: "object",
    properties: { id: { type: "integer" } },
    required: ["id"],
  },
  querystring: {
    type: "object",
    properties: { who: { type: "string" } },
    required: ["who"],
  },
  response: {
    200: {
      type: "object",
      properties: {
        available: { type: "boolean" },
        url: { type: ["string", "null"] },
        expiresIn: { type: ["integer", "null"] },
      },
      required: ["available", "url", "expiresIn"],
      additionalProperties: false,
    },
  },
} as const;

/** `POST /corrections/seen`: sin body (se tolera `{}`), responde `{ unseenReplies: 0 }`. */
export const correctionsSeenSchema = {
  body: {
    type: ["object", "null"],
    properties: {},
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: { unseenReplies: { type: "integer" } },
      required: ["unseenReplies"],
      additionalProperties: false,
    },
  },
} as const;

/**
 * `member.corrections` dentro de `GET /state` (Fase 202 DA-46). Lo importa
 * `schemas.ts`: este archivo NO importa de `schemas.ts` (sin ciclo).
 */
export const correctionCountsSchema = {
  type: "object",
  properties: {
    pending: { type: "integer" },
    unseenReplies: { type: "integer" },
  },
  required: ["pending", "unseenReplies"],
  additionalProperties: false,
} as const;

// ── Bandeja del coach (Fase 202 DA-44, DA-45, DA-46) ───────────────

/**
 * Vista del coach: la del alumno sin `replyUnseen` + quién es (`userId`,
 * `memberName`, `level`), cuándo se borró el video del alumno, quién respondió
 * y si todavía se puede responder.
 */
const { replyUnseen: _omitProperty, ...correctionBaseProperties } =
  correctionViewSchema.properties;

export const adminCorrectionViewSchema = {
  type: "object",
  properties: {
    ...correctionBaseProperties,
    userId: { type: "integer" },
    memberName: { type: "string" },
    level: { type: ["string", "null"] },
    videoDeletedAt: { type: ["string", "null"] },
    repliedByName: { type: ["string", "null"] },
    canReply: { type: "boolean" },
  },
  required: [
    ...correctionViewSchema.required.filter((k) => k !== "replyUnseen"),
    "userId",
    "memberName",
    "level",
    "videoDeletedAt",
    "repliedByName",
    "canReply",
  ],
  additionalProperties: false,
} as const;

/** `GET /corrections?status=...`: `status` lo valida el SERVICIO (400 con `code`). */
export const adminCorrectionsSchema = {
  querystring: {
    type: "object",
    properties: { status: { type: "string" } },
  },
  response: {
    200: {
      type: "object",
      properties: {
        items: { type: "array", items: adminCorrectionViewSchema },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
} as const;

/** `GET /corrections/count`: pendientes del gimnasio (badge del admin). */
export const adminCorrectionsCountSchema = {
  response: {
    200: {
      type: "object",
      properties: { count: { type: "integer" } },
      required: ["count"],
      additionalProperties: false,
    },
  },
} as const;

/** `GET /corrections/:id/video-url?who=alumno|coach`: mismo contrato que el del alumno. */
export const adminCorrectionVideoUrlSchema = correctionVideoUrlSchema;

/** `DELETE /corrections/:id/video`: responde la vista actualizada. */
export const deleteCorrectionVideoSchema = {
  params: {
    type: "object",
    properties: { id: { type: "integer" } },
    required: ["id"],
  },
  response: { 200: adminCorrectionViewSchema },
} as const;
