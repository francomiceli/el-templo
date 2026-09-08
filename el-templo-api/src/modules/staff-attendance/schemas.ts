/**
 * JSON Schemas + interfaces tipadas del módulo `staff-attendance` (2026-09-07).
 *
 * Patrón del repo: el schema de validación y la interfaz que lo describe
 * viven en el MISMO archivo (ver `modules/tv/schemas.ts`), así el handler
 * tipa `request.body`/`request.query` contra lo que Fastify realmente validó.
 *
 * Los schemas de RESPUESTA no son decorativos: fast-json-stringify solo
 * serializa las propiedades declaradas, así que actúan de red de contención
 * contra una futura fuga de datos si un `select({...})` explícito se
 * reemplaza por uno más ancho.
 */

const staffShiftSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    checkedInAt: { type: "string" },
  },
};

const staffShiftClosedSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    checkedInAt: { type: "string" },
    checkedOutAt: { type: "string" },
    durationMinutes: { type: "integer" },
  },
};

const checklistItemSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    label: { type: "string" },
  },
};

export const staffAttendanceMeSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        open: {
          type: ["object", "null"],
          properties: staffShiftSchema.properties,
        },
        checklist: { type: "array", items: checklistItemSchema },
      },
    },
  },
};

export const staffAttendanceCheckInSchema = {
  body: {
    type: "object",
    required: ["qrToken"],
    properties: {
      qrToken: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
  response: {
    201: {
      type: "object",
      properties: {
        shift: staffShiftSchema,
      },
    },
  },
};

export const staffAttendanceCheckOutSchema = {
  body: {
    type: "object",
    required: ["qrToken", "checklist"],
    properties: {
      qrToken: { type: "string", minLength: 1, maxLength: 500 },
      checklist: {
        type: "object",
        // `lote` solo se exige miércoles y sábados (lo decide el service por
        // el día en la sede): en el schema es opcional.
        required: ["cobros", "espacio"],
        properties: {
          cobros: { type: "boolean" },
          espacio: { type: "boolean" },
          lote: { type: "boolean" },
        },
      },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        shift: staffShiftClosedSchema,
      },
    },
  },
};

export const staffAttendanceShiftsSchema = {
  querystring: {
    type: "object",
    required: ["branchId", "from", "to"],
    properties: {
      branchId: { type: "integer" },
      from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        shifts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              userId: { type: "integer" },
              userName: { type: "string" },
              branchId: { type: "integer" },
              branchName: { type: "string" },
              shiftDate: { type: "string" },
              checkedInAt: { type: "string" },
              checkedOutAt: { type: ["string", "null"] },
              durationMinutes: { type: ["integer", "null"] },
              checklist: {
                type: ["object", "null"],
                properties: {
                  cobros: { type: "boolean" },
                  espacio: { type: "boolean" },
                  lote: { type: ["boolean", "null"] },
                },
              },
            },
          },
        },
      },
    },
  },
};

// ─── Tipos de request ───────────────────────────────────────────────────────

export interface StaffCheckInBody {
  qrToken: string;
}

export interface StaffCheckOutBody {
  qrToken: string;
  checklist: {
    cobros: boolean;
    espacio: boolean;
    /** Solo miércoles y sábados. */
    lote?: boolean;
  };
}

export interface StaffShiftsQuery {
  branchId: number;
  from: string;
  to: string;
}
