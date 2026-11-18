// Module: members (fase 214, foto propia): schemas de las 4 rutas del alumno.
//
// fast-json-stringify descarta lo no declarado: las respuestas están completas.
// `acceptedRules` lleva `const: true` (D-50): sin aceptar las normas no se pide
// la URL de subida. `contentType` NO lleva `enum`: el servicio lo valida después
// del socio (404) y del storage (503).

/** Cuerpo de error: `error`, y `message`/`code` cuando el servicio los define. */
const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    code: { type: "string" },
  },
  required: ["error"],
} as const;

/** `POST /profile-photo/upload-url`. */
export const profilePhotoUploadUrlSchema = {
  body: {
    type: "object",
    required: ["contentType", "acceptedRules"],
    additionalProperties: false,
    properties: {
      contentType: { type: "string", minLength: 1, maxLength: 50 },
      acceptedRules: { type: "boolean", const: true },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["uploadUrl", "key", "contentType", "expiresIn"],
      additionalProperties: false,
      properties: {
        uploadUrl: { type: "string" },
        key: { type: "string" },
        contentType: { type: "string" },
        expiresIn: { type: "integer" },
      },
    },
    400: errorSchema,
    404: errorSchema,
    503: errorSchema,
  },
} as const;

/** `POST /profile-photo/confirm`. */
export const profilePhotoConfirmSchema = {
  body: {
    type: "object",
    required: ["key"],
    additionalProperties: false,
    properties: {
      key: { type: "string", minLength: 1, maxLength: 255 },
    },
  },
  response: {
    201: {
      type: "object",
      required: ["photoId", "status"],
      additionalProperties: false,
      properties: {
        photoId: { type: "integer" },
        status: { type: "string", enum: ["pendiente"] },
      },
    },
    400: errorSchema,
    404: errorSchema,
    409: errorSchema,
    503: errorSchema,
  },
} as const;

/** `DELETE /profile-photo`. */
export const profilePhotoDeleteSchema = {
  response: {
    204: { type: "null" },
    404: errorSchema,
  },
} as const;

/** `POST /profile-photos/:photoId/report`. */
export const profilePhotoReportSchema = {
  params: {
    type: "object",
    required: ["photoId"],
    properties: {
      photoId: { type: "integer", minimum: 1 },
    },
  },
  response: {
    204: { type: "null" },
    404: errorSchema,
  },
} as const;
