/**
 * AI Tool Definitions
 *
 * Tools available to the AI during conversation processing.
 * These map to actions the bot can take on behalf of the user.
 *
 * TODO: Implement tool definitions and execution.
 * See digital-initiatives/whatsapp-agent-renovafacil/message_processor.py
 * for function calling pattern.
 *
 * Tools to implement:
 * - check_schedule: Query available classes/slots for a branch
 * - book_class: Reserve a spot (calls el-templo-api via localhost)
 * - check_membership: Look up subscription status and pricing
 * - register_trial: Create a trial user (calls el-templo-api)
 * - get_location: Return branch address + Google Maps link
 * - request_human: Escalate to human agent (set conversation to takeover)
 *
 * For actions that modify data (book, register), call el-templo-api
 * via localhost HTTP rather than duplicating business logic.
 */

import type { ToolDefinition } from "./provider";

export const BOT_TOOLS: ToolDefinition[] = [
  {
    name: "check_schedule",
    description:
      "Consultar horarios disponibles de clases para una sede. Devuelve actividades, días, horarios y capacidad restante.",
    parameters: {
      type: "object",
      properties: {
        branchId: {
          type: "number",
          description:
            "ID de la sede (opcional, usa la sede principal si no se especifica)",
        },
        dayOfWeek: {
          type: "number",
          description:
            "Día de la semana (0=domingo, 1=lunes, ..., 6=sábado). Opcional.",
        },
      },
    },
  },
  {
    name: "book_class",
    description:
      "Reservar un lugar en una clase para un miembro. Requiere confirmación del usuario antes de ejecutar.",
    parameters: {
      type: "object",
      properties: {
        scheduleId: {
          type: "number",
          description: "ID del horario a reservar",
        },
        memberId: { type: "number", description: "ID del miembro" },
        date: { type: "string", description: "Fecha de la clase (YYYY-MM-DD)" },
      },
      required: ["scheduleId", "memberId", "date"],
    },
  },
  {
    name: "check_membership",
    description:
      "Consultar el estado de suscripción de un miembro: plan activo, precio, fecha de vencimiento, si tiene deuda.",
    parameters: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: "Número de teléfono del miembro para buscar su cuenta",
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "register_trial",
    description:
      "Registrar a una persona interesada para una clase de prueba gratuita.",
    parameters: {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        branchId: { type: "number", description: "Sede preferida" },
      },
      required: ["firstName", "phone"],
    },
  },
  {
    name: "get_location",
    description:
      "Obtener la dirección y link de Google Maps de una sede de El Templo.",
    parameters: {
      type: "object",
      properties: {
        branchName: {
          type: "string",
          description:
            "Nombre o zona de la sede (ej: 'Alem', 'Constitución', 'Jujuy')",
        },
      },
    },
  },
  {
    name: "request_human",
    description:
      "Transferir la conversación a un agente humano. Usar cuando el bot no puede resolver la consulta o el usuario lo pide explícitamente.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Motivo de la transferencia para contexto del agente humano",
        },
      },
    },
  },
];

// TODO: Implement tool execution functions
// Each tool should return a string result that gets fed back to the AI

// export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> { ... }
