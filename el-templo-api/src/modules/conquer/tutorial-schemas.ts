// Módulo: conquer — JSON-schemas de los tutoriales en video (Fase 202 D-25)
//
// Archivo propio (no importa de `schemas.ts`). Fastify con
// `additionalProperties: false` DESCARTA las claves que falten en el schema de
// respuesta: cada campo de las vistas tiene su entrada acá.
//
// Los bodies son planos (una sola forma, lección 201-11) y fijan solo tipos: el
// objetivo (`target`, `exerciseId`, `comboKey`) y el tipo del archivo los valida
// el SERVICIO, para que queden detrás de los 404/503 y traigan `code`.

const targetBodyProperties = {
  target: { type: "string" },
  exerciseId: { type: ["integer", "null"] },
  comboKey: { type: ["string", "null"] },
} as const;

/** `GET /api/members/conquer/tutorials`: solo lo que tiene URL. */
export const memberTutorialsSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        exercises: {
          type: "array",
          items: {
            type: "object",
            properties: {
              exerciseId: { type: "integer" },
              url: { type: "string" },
            },
            required: ["exerciseId", "url"],
            additionalProperties: false,
          },
        },
        combos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              comboKey: { type: "string" },
              url: { type: "string" },
            },
            required: ["comboKey", "url"],
            additionalProperties: false,
          },
        },
      },
      required: ["exercises", "combos"],
      additionalProperties: false,
    },
  },
} as const;

/** Vista del coach: la devuelven el `GET`, el `PUT` y los dos `DELETE`. */
export const adminTutorialsViewSchema = {
  type: "object",
  properties: {
    storageReady: { type: "boolean" },
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          exerciseId: { type: "integer" },
          url: { type: ["string", "null"] },
        },
        required: ["exerciseId", "url"],
        additionalProperties: false,
      },
    },
    combos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          comboKey: { type: "string" },
          label: { type: "string" },
          url: { type: ["string", "null"] },
        },
        required: ["comboKey", "label", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["storageReady", "exercises", "combos"],
  additionalProperties: false,
} as const;

/** `GET /api/admin/conquer/tutorials`. */
export const adminTutorialsSchema = {
  response: { 200: adminTutorialsViewSchema },
} as const;

/** `POST /api/admin/conquer/tutorials/upload-url`. */
export const tutorialUploadUrlSchema = {
  body: {
    type: "object",
    properties: { ...targetBodyProperties, contentType: { type: "string" } },
    required: ["target", "contentType"],
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

/** `PUT /api/admin/conquer/tutorials`: confirma el video subido. */
export const confirmTutorialSchema = {
  body: {
    type: "object",
    properties: {
      ...targetBodyProperties,
      key: { type: "string", minLength: 1, maxLength: 255 },
    },
    required: ["target", "key"],
    additionalProperties: false,
  },
  response: { 200: adminTutorialsViewSchema },
} as const;

/** `DELETE /api/admin/conquer/tutorials/exercise/:exerciseId`. */
export const deleteExerciseTutorialSchema = {
  params: {
    type: "object",
    properties: { exerciseId: { type: "integer" } },
    required: ["exerciseId"],
  },
  response: { 200: adminTutorialsViewSchema },
} as const;

/** `DELETE /api/admin/conquer/tutorials/combo/:comboKey` (el valor lo valida el servicio). */
export const deleteComboTutorialSchema = {
  params: {
    type: "object",
    properties: { comboKey: { type: "string" } },
    required: ["comboKey"],
  },
  response: { 200: adminTutorialsViewSchema },
} as const;
