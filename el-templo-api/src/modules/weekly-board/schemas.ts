/**
 * Schemas AJV y tipos de request del Tablero semanal de gerencia (fase 206-06).
 *
 * FA-07: todo número que llega por HTTP va tipado acá (`integer`), si no el
 * body/params llegarían como string y `'3' !== 3` rompería comparaciones en
 * silencio. No hay schema de respuesta a propósito: el contrato
 * (`WeeklyBoardResponse`) tiene claves dinámicas (id de sede / país) y
 * fast-json-stringify solo serializa las propiedades declaradas.
 */

const WEEK_START_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

export const weeklyBoardGetSchema = {
  querystring: {
    type: "object",
    properties: {
      // Lunes de la semana. Que sea lunes y no futuro lo valida el servicio (400).
      weekStart: { type: "string", pattern: WEEK_START_PATTERN },
    },
    additionalProperties: false,
  },
} as const;

export const weeklyBoardLeadsPutSchema = {
  body: {
    type: "object",
    required: ["branchId", "weekStart", "leads"],
    properties: {
      branchId: { type: "integer", minimum: 1 },
      weekStart: { type: "string", pattern: WEEK_START_PATTERN },
      // `null` borra la carga de esa sede y semana.
      leads: { type: ["integer", "null"], minimum: 0, maximum: 100000 },
    },
    additionalProperties: false,
  },
} as const;

export interface WeeklyBoardQuery {
  weekStart?: string;
}

export interface WeeklyBoardLeadsBody {
  branchId: number;
  weekStart: string;
  leads: number | null;
}
