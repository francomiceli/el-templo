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
    // false = recordatorio: se ofrece pero no bloquea el cierre.
    required: { type: "boolean" },
  },
};

export const staffAttendanceMeSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        open: {
          type: ["object", "null"],
          properties: {
            ...staffShiftSchema.properties,
            cashCountedAt: { type: ["string", "null"] },
          },
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
        // el día en la sede): en el schema es opcional. 2026-10-06: `cobros`
        // también — un rol sin plata (coach_actividad) no lo tiene en su
        // checklist; el service exige las keys de SU lista y a los demás roles
        // les sigue exigiendo `cobros` (falta → 400 "Falta marcar").
        required: ["espacio"],
        properties: {
          cobros: { type: "boolean" },
          espacio: { type: "boolean" },
          lote: { type: "boolean" },
          // 2026-10-08: recordatorio de los profes (`coach`), no obligatorio.
          videos: { type: "boolean" },
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

const staffShiftsQuerystring = {
  type: "object",
  required: ["from", "to"],
  properties: {
    // Opcional: sin `branchId` = todas las sedes del alcance del actor.
    branchId: { type: "integer" },
    // Solo lo honra el owner (admin siempre queda en su país). Mismo
    // contrato que `?country=` del resto del admin.
    country: { type: "string", enum: ["AR", "ES"] },
    from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  },
};

export const staffAttendanceShiftsSchema = {
  querystring: staffShiftsQuerystring,
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
                  cobros: { type: ["boolean", "null"] },
                  espacio: { type: "boolean" },
                  lote: { type: ["boolean", "null"] },
                  videos: { type: ["boolean", "null"] },
                },
              },
            },
          },
        },
      },
    },
  },
};

const dashboardOpenShiftProperties = {
  shiftId: { type: "integer" },
  userId: { type: "integer" },
  userName: { type: "string" },
  branchId: { type: "integer" },
  branchName: { type: "string" },
  checkedInAt: { type: "string" },
};

export const staffAttendanceDashboardSchema = {
  querystring: staffShiftsQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        branches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              name: { type: "string" },
            },
          },
        },
        openNow: {
          type: "array",
          items: { type: "object", properties: dashboardOpenShiftProperties },
        },
        staleOpen: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ...dashboardOpenShiftProperties,
              shiftDate: { type: "string" },
            },
          },
        },
        totals: {
          type: "object",
          properties: {
            shifts: { type: "integer" },
            closedShifts: { type: "integer" },
            openShifts: { type: "integer" },
            totalMinutes: { type: "integer" },
          },
        },
        byPerson: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: { type: "integer" },
              userName: { type: "string" },
              branchNames: { type: "array", items: { type: "string" } },
              shifts: { type: "integer" },
              totalMinutes: { type: "integer" },
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
    /** Opcional solo para roles sin plata (coach_actividad); el service lo exige al resto. */
    cobros?: boolean;
    espacio: boolean;
    /** Solo miércoles y sábados. */
    lote?: boolean;
    /** Solo profes (`coach`). */
    videos?: boolean;
  };
}

export interface StaffShiftsQuery {
  branchId?: number;
  country?: "AR" | "ES";
  from: string;
  to: string;
}
