/**
 * AI Tool Definitions & Execution
 *
 * Tools available to the AI during conversation processing.
 * These map to actions the bot can take on behalf of the user.
 *
 * Info tools (Phase 68): check_schedule, check_membership, get_location, request_human
 * Action tools (Phase 70): book_class, register_trial
 *
 * All DB queries use raw SQL via `sql` template literals to avoid
 * cross-package drizzle-orm type conflicts.
 */

import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../../el-templo-api/src/db/schema/index.js";
import type { ToolDefinition } from "./provider";

type DB = MySql2Database<typeof schema>;

// ─── Day name helpers ────────────────────────────────────────────────────────

const DAY_NAMES: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  0: "Domingo",
};

/**
 * Hardcoded address lookup for known branches.
 * TODO: Move to DB when address columns are added to the branches table.
 */
const BRANCH_ADDRESSES: Record<string, string> = {
  alem: "Av. Leandro N. Alem 896, San Miguel de Tucumán",
  constitucion: "Av. Constitución 1050, San Miguel de Tucumán",
  jujuy: "Av. Jujuy 300, San Miguel de Tucumán",
};

// ─── Tool Definitions ────────────────────────────────────────────────────────

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
            "Día de la semana (1=lunes, 2=martes, ..., 6=sábado, 0=domingo). Opcional.",
        },
      },
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

// ─── Tool Execution ──────────────────────────────────────────────────────────

/**
 * Execute a tool by name with the given arguments.
 * Returns a string result that gets fed back to the AI as a tool response.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  db: DB,
  conversationId?: number,
): Promise<string> {
  switch (name) {
    case "check_schedule":
      return checkSchedule(db, args);
    case "check_membership":
      return checkMembership(db, args);
    case "get_location":
      return getLocation(db, args);
    case "request_human":
      return requestHuman(db, args, conversationId);
    default:
      return `Herramienta "${name}" no disponible.`;
  }
}

// ─── Individual Tool Handlers ────────────────────────────────────────────────

interface ScheduleRow {
  id: number;
  activity_name: string;
  branch_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  max_capacity: number;
  booking_count: number;
}

async function checkSchedule(
  db: DB,
  args: Record<string, unknown>,
): Promise<string> {
  const branchId = typeof args.branchId === "number" ? args.branchId : null;
  const dayOfWeek = typeof args.dayOfWeek === "number" ? args.dayOfWeek : null;

  // Build the query with optional filters
  // Count bookings for today (or the target day) with status != 'cancelado'
  const today = new Date().toISOString().slice(0, 10);

  let query = sql`
    SELECT
      s.id,
      a.name AS activity_name,
      b.name AS branch_name,
      s.day_of_week,
      s.start_time,
      s.end_time,
      b.max_capacity,
      COALESCE(
        (SELECT COUNT(*) FROM bookings bk
         WHERE bk.schedule_id = s.id
           AND bk.booking_date = ${today}
           AND bk.status != 'cancelado'),
        0
      ) AS booking_count
    FROM schedules s
    JOIN activities a ON a.id = s.activity_id
    JOIN branches b ON b.id = s.branch_id
    WHERE s.is_active = true
      AND a.is_active = true
      AND b.is_active = true
  `;

  if (branchId !== null) {
    query = sql`${query} AND s.branch_id = ${branchId}`;
  }

  if (dayOfWeek !== null) {
    query = sql`${query} AND s.day_of_week = ${dayOfWeek}`;
  }

  query = sql`${query} ORDER BY s.day_of_week, s.start_time LIMIT 6`;

  const result = await db.execute<ScheduleRow[]>(query);
  const rows = result[0] as unknown as ScheduleRow[];

  if (rows.length === 0) {
    return "No encontré clases disponibles con esos filtros.";
  }

  const displayRows = rows.slice(0, 5);
  const hasMore = rows.length > 5;

  const lines = displayRows.map((row) => {
    const spotsRemaining = row.max_capacity - Number(row.booking_count);
    const spotsText =
      spotsRemaining <= 0 ? "lleno" : `${spotsRemaining} lugares`;
    const dayName = DAY_NAMES[row.day_of_week] ?? `Día ${row.day_of_week}`;
    return `- ${row.activity_name} (${row.branch_name}) — ${dayName} ${row.start_time}-${row.end_time} — ${spotsText}`;
  });

  let response = "Clases disponibles:\n\n" + lines.join("\n");

  if (hasMore) {
    // We fetched 6 but only displayed 5 — there are more results
    // We can't know the exact total without a COUNT query, so use a generic message
    response +=
      "\n\nHay más clases disponibles. ¿Querés filtrar por día o tipo de clase?";
  }

  return response;
}

interface UserRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
}

interface SubscriptionRow {
  plan_name: string;
  status: string;
  start_date: string;
  end_date: string | null;
  price_paid: number;
  classes_per_week: number | null;
  multi_branch: number;
}

interface PlanRow {
  name: string;
  price_regular: number;
  duration_days: number;
  classes_per_week: number | null;
}

async function checkMembership(
  db: DB,
  args: Record<string, unknown>,
): Promise<string> {
  const phone = typeof args.phone === "string" ? args.phone : "";

  if (!phone) {
    return "Se necesita un número de teléfono para consultar la membresía.";
  }

  // Look up user by phone
  const userResult = await db.execute<UserRow[]>(
    sql`SELECT id, first_name, last_name FROM users WHERE phone = ${phone} AND is_active = true LIMIT 1`,
  );
  const users = userResult[0] as unknown as UserRow[];

  if (users.length === 0) {
    return "No encontré una cuenta con ese número. Si sos miembro, puede que estés registrado con otro número.";
  }

  const user = users[0];
  const userName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "Miembro";

  // Find active or paused subscription
  const subResult = await db.execute<SubscriptionRow[]>(
    sql`SELECT sp.name AS plan_name, sub.status, sub.start_date, sub.end_date,
               sub.price_paid, sp.classes_per_week, sp.multi_branch
        FROM subscriptions sub
        JOIN subscription_plans sp ON sp.id = sub.plan_id
        WHERE sub.user_id = ${user.id}
          AND sub.status IN ('active', 'paused')
        ORDER BY sub.start_date DESC
        LIMIT 1`,
  );
  const subs = subResult[0] as unknown as SubscriptionRow[];

  if (subs.length === 0) {
    // No active subscription — show available plans
    const planResult = await db.execute<PlanRow[]>(
      sql`SELECT name, price_regular, duration_days, classes_per_week
          FROM subscription_plans
          WHERE is_active = true AND is_archived = false AND is_trial = false
          ORDER BY price_regular ASC`,
    );
    const plans = planResult[0] as unknown as PlanRow[];

    let response = `${userName} no tiene una suscripción activa.`;

    if (plans.length > 0) {
      response += "\n\nPlanes disponibles:\n";
      for (const plan of plans) {
        const classesText =
          plan.classes_per_week !== null
            ? `${plan.classes_per_week} clases/semana`
            : "clases ilimitadas";
        response += `\n- *${plan.name}*: $${plan.price_regular} — ${plan.duration_days} días — ${classesText}`;
      }
    }

    return response;
  }

  const sub = subs[0];
  const classesText =
    sub.classes_per_week !== null
      ? `${sub.classes_per_week} clases/semana`
      : "clases ilimitadas";
  const multiBranchText = Number(sub.multi_branch) ? "Sí" : "No";
  const statusText = sub.status === "active" ? "Activa" : "Pausada";

  return [
    `Membresía de ${userName}:`,
    "",
    `- *Plan:* ${sub.plan_name}`,
    `- *Estado:* ${statusText}`,
    `- *Inicio:* ${sub.start_date}`,
    `- *Vencimiento:* ${sub.end_date ?? "Sin fecha"}`,
    `- *Precio pagado:* $${sub.price_paid}`,
    `- *Clases:* ${classesText}`,
    `- *Acceso multi-sede:* ${multiBranchText}`,
  ].join("\n");
}

interface BranchRow {
  id: number;
  name: string;
  code: string;
}

async function getLocation(
  db: DB,
  args: Record<string, unknown>,
): Promise<string> {
  const branchName =
    typeof args.branchName === "string" ? args.branchName : null;

  let query;
  if (branchName) {
    query = sql`SELECT id, name, code FROM branches WHERE is_active = true AND name LIKE ${`%${branchName}%`} ORDER BY name`;
  } else {
    query = sql`SELECT id, name, code FROM branches WHERE is_active = true ORDER BY name`;
  }

  const result = await db.execute<BranchRow[]>(query);
  const rows = result[0] as unknown as BranchRow[];

  if (rows.length === 0) {
    // If filtered and no match, try returning all active branches
    if (branchName) {
      const allResult = await db.execute<BranchRow[]>(
        sql`SELECT id, name, code FROM branches WHERE is_active = true ORDER BY name`,
      );
      const allRows = allResult[0] as unknown as BranchRow[];

      if (allRows.length === 0) {
        return "No encontré sedes disponibles.";
      }

      return formatBranchLocations(
        allRows,
        `No encontré una sede con "${branchName}". Estas son nuestras sedes:`,
      );
    }
    return "No encontré sedes disponibles.";
  }

  return formatBranchLocations(rows);
}

function formatBranchLocations(rows: BranchRow[], prefix?: string): string {
  const lines = rows.map((row) => {
    const codeKey = row.code.toLowerCase();
    const address = BRANCH_ADDRESSES[codeKey] ?? null;
    const mapsQuery = encodeURIComponent(`El Templo ${row.name} ${row.code}`);
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

    if (address) {
      return `- *${row.name}*: ${address}\n  Maps: ${mapsLink}`;
    }
    return `- *${row.name}*\n  Maps: ${mapsLink}`;
  });

  const header = prefix ?? "Sedes de El Templo:";
  return header + "\n\n" + lines.join("\n\n");
}

async function requestHuman(
  db: DB,
  args: Record<string, unknown>,
  conversationId?: number,
): Promise<string> {
  const reason =
    typeof args.reason === "string" ? args.reason : "Sin motivo especificado";

  if (!conversationId) {
    return "No se pudo transferir la conversación: ID de conversación no disponible.";
  }

  await db.execute(
    sql`UPDATE whatsapp_conversations
        SET conversation_status = 'human_takeover', updated_at = NOW()
        WHERE id = ${conversationId}`,
  );

  return `Conversación transferida a un agente humano. Motivo: ${reason}`;
}
