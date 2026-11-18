// Module: members (fase 214, foto propia): schemas de las 4 rutas del alumno y
// de las 4 rutas del staff (plan 15).
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

const userIdParams = {
  type: "object",
  required: ["userId"],
  properties: {
    userId: { type: "integer", minimum: 1 },
  },
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

// ---------------------------------------------------------------------------
// Staff (plan 15): rutas bajo /api/admin/members
// ---------------------------------------------------------------------------

/** `GET /profile-photos`: cola de revisión (el staff sí ve nombre y apellido). */
export const photoReviewQueueSchema = {
  response: {
    200: {
      type: "object",
      required: ["items", "counts"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            required: [
              "photoId",
              "userId",
              "firstName",
              "lastName",
              "branchId",
              "origin",
              "status",
              "reportCount",
              "lastReportedAt",
              "uploadedAt",
              "url",
            ],
            additionalProperties: false,
            properties: {
              photoId: { type: "integer" },
              userId: { type: "integer" },
              firstName: { type: ["string", "null"] },
              lastName: { type: ["string", "null"] },
              branchId: { type: ["integer", "null"] },
              origin: { type: "string", enum: ["alumno", "ficha"] },
              status: { type: "string", enum: ["pendiente", "aprobada"] },
              reportCount: { type: "integer" },
              lastReportedAt: { type: ["string", "null"] },
              uploadedAt: { type: "string" },
              url: { type: "string" },
            },
          },
        },
        counts: {
          type: "object",
          required: ["pending", "reported"],
          additionalProperties: false,
          properties: {
            pending: { type: "integer" },
            reported: { type: "integer" },
          },
        },
      },
    },
    503: errorSchema,
  },
} as const;

/** `POST /:userId/profile-photo/approve`. */
export const photoApproveSchema = {
  params: userIdParams,
  response: {
    200: {
      type: "object",
      required: ["status", "auraAwarded"],
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["aprobada"] },
        auraAwarded: { type: "boolean" },
      },
    },
    404: errorSchema,
  },
} as const;

/** `POST /:userId/profile-photo/reject`: el motivo es obligatorio (D-69). */
export const photoRejectSchema = {
  params: userIdParams,
  body: {
    type: "object",
    required: ["reason"],
    additionalProperties: false,
    properties: {
      reason: {
        type: "string",
        enum: ["sin_cara", "no_es_propia", "contenido", "otro"],
      },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["status"],
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["rechazada"] },
      },
    },
    404: errorSchema,
  },
} as const;

/** `DELETE /:userId/profile-photo`: el staff quita la foto visible (D-63). */
export const photoAdminDeleteSchema = {
  params: userIdParams,
  response: {
    204: { type: "null" },
    404: errorSchema,
    503: errorSchema,
  },
} as const;
