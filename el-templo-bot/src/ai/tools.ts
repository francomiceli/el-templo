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
import type { ClientState } from "../state/machine.js";
import { sendInteractiveMessage } from "../whatsapp/client.js";
import { withTimeout, ToolTimeoutError } from "./with-timeout.js";

type DB = MySql2Database<typeof schema>;

// ─── Tool-handler timeout (Phase 95 BOOK-01 + Phase 97 RGUARD-03) ───────────

/**
 * Resolve the tool-handler localhost-call timeout (milliseconds).
 *
 * Env-overridable via `EXECUTE_TOOL_TIMEOUT_MS`; default 30_000 ms is
 * locked by the Cross-Phase Invariant (`executeTool_timeout_seconds = 30`
 * — see `el-templo-bot/.env.example` DEBOUNCE_TTL_SECONDS block).
 * Non-numeric or non-positive values fall back to the default for
 * predictable behavior with a misconfigured env. Mirrors the
 * `resolveOpenAiTimeoutMs()` pattern in `openai.ts`.
 */
function resolveExecuteToolTimeoutMs(): number {
  const raw = process.env.EXECUTE_TOOL_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 30_000;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

const EXECUTE_TOOL_TIMEOUT_MS = resolveExecuteToolTimeoutMs();

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
export const BRANCH_ADDRESSES: Record<string, string> = {
  constitucion: "Av. Constitucion 6745, Mar del Plata",
  jujuy: "Jujuy 3761, Mar del Plata",
  alem: "Alem 3958, Mar del Plata",
  moreno: "Moreno 3751, Mar del Plata",
  "mario bravo": "Mario Bravo 618, Mar del Plata",
};

/**
 * Real Google Maps short links for each branch.
 */
export const BRANCH_MAPS_LINKS: Record<string, string> = {
  constitucion: "https://maps.app.goo.gl/vi9c8ErtHr7RpQxD6",
  jujuy: "https://maps.app.goo.gl/EFEVhYhphKKaZqF5A",
  alem: "https://maps.app.goo.gl/KiyqJQJYG1LbUsAL6",
  moreno: "https://maps.app.goo.gl/EFEVhYhphKKaZqF5A",
  "mario bravo": "https://maps.app.goo.gl/DciqhK6yc3dhpmTn6",
};

/**
 * Normalize branch code variations to canonical keys used in BRANCH_ADDRESSES
 * and BRANCH_MAPS_LINKS. Database codes may differ from our display keys.
 */
function normalizeBranchCode(code: string): string {
  const normalized = code.toLowerCase().trim();
  const aliases: Record<string, string> = {
    mario_bravo: "mario bravo",
    mariobravo: "mario bravo",
    "mario-bravo": "mario bravo",
  };
  return aliases[normalized] ?? normalized;
}

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
  {
    name: "book_class",
    description:
      "Reservar una clase para un miembro activo. Primero muestra un resumen de confirmacion y espera que el usuario confirme antes de ejecutar la reserva.",
    parameters: {
      type: "object",
      properties: {
        scheduleId: {
          type: "number",
          description: "ID del horario a reservar (obtenido de check_schedule)",
        },
        date: {
          type: "string",
          description:
            "Fecha de la clase en formato YYYY-MM-DD (debe ser dentro de la semana actual)",
        },
        confirmed: {
          type: "boolean",
          description:
            "true si el usuario ya confirmo la reserva, false para mostrar resumen de confirmacion",
        },
      },
      required: ["scheduleId", "date"],
    },
  },
  {
    name: "register_trial",
    description:
      "Registrar un lead para una clase de prueba gratuita. Recoger nombre y preferencia de clase, luego confirmar antes de ejecutar.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Nombre de la persona para registrar",
        },
        scheduleId: {
          type: "number",
          description: "ID del horario elegido para la clase de prueba",
        },
        date: {
          type: "string",
          description: "Fecha de la clase en formato YYYY-MM-DD",
        },
        confirmed: {
          type: "boolean",
          description:
            "true si el usuario ya confirmo el registro, false para mostrar resumen",
        },
      },
      required: ["name"],
    },
  },
];

// ─── Tool Execution ──────────────────────────────────────────────────────────

// ─── Pending Actions (interactive button confirmation state) ─────────────────

const pendingActions = new Map<
  string,
  { tool: string; args: Record<string, unknown> }
>();

/**
 * Resolve and clear a pending action for a phone number.
 * Called by the handler when a confirmation button is pressed.
 */
export function resolvePendingAction(
  phone: string,
): { tool: string; args: Record<string, unknown> } | undefined {
  const action = pendingActions.get(phone);
  if (action) pendingActions.delete(phone);
  return action;
}

/**
 * Execute a tool by name with the given arguments.
 * Returns a string result that gets fed back to the AI as a tool response.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  db: DB,
  conversationId?: number,
  context?: { phone: string; clientState: ClientState },
): Promise<string> {
  try {
    switch (name) {
      case "check_schedule":
        return await checkSchedule(db, args);
      case "check_membership":
        return await checkMembership(db, args);
      case "get_location":
        return await getLocation(db, args);
      case "request_human":
        return await requestHuman(db, args, conversationId);
      case "book_class":
        return await bookClass(db, args, context);
      case "register_trial":
        return await registerTrial(db, args, context);
      default:
        return `Herramienta "${name}" no disponible.`;
    }
  } catch (err: unknown) {
    // Per 95-CONTEXT.md D-18: ToolTimeoutError discrimination ONLY.
    // Plan 95-03's retry-counter allowlist consumes the exact byte-equal
    // string `"Herramienta agotada por tiempo de espera."`.
    if (err instanceof ToolTimeoutError) {
      return "Herramienta agotada por tiempo de espera.";
    }
    throw err;
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

interface CountRow {
  total: number;
}

async function checkSchedule(
  db: DB,
  args: Record<string, unknown>,
): Promise<string> {
  const branchId = typeof args.branchId === "number" ? args.branchId : null;
  const dayOfWeek = typeof args.dayOfWeek === "number" ? args.dayOfWeek : null;

  // Build the row-fetch and total-count queries with shared WHERE filters.
  //
  // booking_count derives its booking_date from each schedule's NEXT
  // occurrence of its day_of_week via MySQL date arithmetic. MySQL's
  // DAYOFWEEK() returns Sun=1..Sat=7 while the schedules.day_of_week
  // column follows DAY_NAMES (Sun=0..Sat=6). The
  // (s.day_of_week - DAYOFWEEK(CURDATE()) + 8) % 7 form bridges the two
  // conventions: the +8 (equivalent to -1 on DAYOFWEEK then +7 to wrap
  // into the modulus) corrects the off-by-one introduced by MySQL's
  // 1-indexed DAYOFWEEK against our 0-indexed stored values. Deviation
  // from 95-AUDIT.md §E and 95-02-PLAN.md must_have line 38 (which
  // both state `+ 7) % 7`) — empirically verified: with `+ 7`, the
  // candidate (v) RED test ("9 cupos") still fails because the formula
  // resolves to CURDATE (today) when schedule.day_of_week equals JS
  // today's day, not tomorrow's. Audit doc amendment deferred to
  // post-execution per scope discipline (2026-05-19).
  let rowQuery = sql`
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
           AND bk.booking_date = (SELECT DATE_ADD(CURDATE(), INTERVAL (s.day_of_week - DAYOFWEEK(CURDATE()) + 8) % 7 DAY))
           AND bk.booking_status != 'cancelado'),
        0
      ) AS booking_count
    FROM schedules s
    JOIN activities a ON a.id = s.activity_id
    JOIN branches b ON b.id = s.branch_id
    WHERE s.is_active = true
      AND a.is_active = true
      AND b.is_active = true
  `;

  let countQuery = sql`
    SELECT COUNT(*) AS total
    FROM schedules s
    JOIN activities a ON a.id = s.activity_id
    JOIN branches b ON b.id = s.branch_id
    WHERE s.is_active = true
      AND a.is_active = true
      AND b.is_active = true
  `;

  if (branchId !== null) {
    rowQuery = sql`${rowQuery} AND s.branch_id = ${branchId}`;
    countQuery = sql`${countQuery} AND s.branch_id = ${branchId}`;
  }

  if (dayOfWeek !== null) {
    rowQuery = sql`${rowQuery} AND s.day_of_week = ${dayOfWeek}`;
    countQuery = sql`${countQuery} AND s.day_of_week = ${dayOfWeek}`;
  }

  rowQuery = sql`${rowQuery} ORDER BY s.day_of_week, s.start_time LIMIT 20`;

  const totalResult = await db.execute<CountRow[]>(countQuery);
  const totalRows = totalResult[0] as unknown as CountRow[];
  const total = Number(totalRows[0]?.total ?? 0);

  const result = await db.execute<ScheduleRow[]>(rowQuery);
  const rows = result[0] as unknown as ScheduleRow[];

  if (rows.length === 0) {
    return "No encontré clases disponibles con esos filtros.";
  }

  // Display cap of 10 (deviation from 95-AUDIT.md §E + 95-02-PLAN.md
  // must_have line 35 which both state slice(0, 5)). Cap of 5 makes
  // the candidate (iv) RED test "Saturday 21:00 schedule is reachable"
  // impossible by construction — the seeded Saturday schedule sorts
  // to position 7 under ORDER BY day_of_week, start_time and any cap
  // ≤ 6 drops it. Cap of 10 satisfies the test seed while preserving
  // WhatsApp UX bounds (no message flooding for typical multi-class
  // results). Audit doc amendment deferred to post-execution.
  const displayRows = rows.slice(0, 10);

  const formatRow = (
    row: ScheduleRow,
  ): { spotsText: string; dayName: string } => {
    const spotsRemaining = row.max_capacity - Number(row.booking_count);
    const spotsText =
      spotsRemaining <= 0 ? "sin cupos" : `${spotsRemaining} cupos disponibles`;
    const dayName = DAY_NAMES[row.day_of_week] ?? `Día ${row.day_of_week}`;
    return { spotsText, dayName };
  };

  const uniqueBranches = new Set(displayRows.map((r) => r.branch_name));

  let body: string;
  let shownRowCount: number;
  if (uniqueBranches.size > 1 && branchId === null) {
    // Multi-branch result with no branchId filter — show ONLY the first
    // branch's classes under a `*BranchName*` header and append a
    // disambiguation request. Deviation from 95-AUDIT.md §E candidate (ii)
    // proposed shape ("group displayRows by branch_name, emit per-group
    // headers") because the BUG-03 candidate (ii) RED test 1 at
    // v5-3-3-booking.integration.test.ts:229 asserts
    // `expect([mentionsBranch1, mentionsBranch2]).not.toEqual([true, true])`
    // which forbids both branch names co-appearing — that is option (a)
    // semantics, not option (b). Plan-checker §289 executor-adaptation
    // contract exercised. Audit doc amendment deferred to post-execution.
    const firstBranch = displayRows[0].branch_name;
    const firstBranchRows = displayRows.filter(
      (r) => r.branch_name === firstBranch,
    );
    const lines = firstBranchRows.map((row) => {
      const { spotsText, dayName } = formatRow(row);
      return `- ${row.activity_name} — ${dayName} ${row.start_time}-${row.end_time} — ${spotsText}`;
    });
    body =
      `*${firstBranch}*\n${lines.join("\n")}` +
      `\n\nTambién hay clases en otras sedes — ¿de cuál te interesa saber?`;
    shownRowCount = firstBranchRows.length;
  } else {
    // Single-branch (or branchId-filtered) — preserve the existing
    // flat-list shape with the (branch_name) parenthetical.
    const lines = displayRows.map((row) => {
      const { spotsText, dayName } = formatRow(row);
      return `- ${row.activity_name} (${row.branch_name}) — ${dayName} ${row.start_time}-${row.end_time} — ${spotsText}`;
    });
    body = lines.join("\n");
    shownRowCount = displayRows.length;
  }

  let response = "Clases disponibles:\n\n" + body;

  // Emit a real COUNT(*) total whenever there are more matches than
  // displayed OR the displayed set exceeds 5 rows. Replaces the prior
  // generic "Hay más clases disponibles" string (no digit) which
  // blocked the candidate (iv) RED test's `\d+\s+clases?\s+(más|en total)`
  // assertion. Per 95-AUDIT.md §E candidate (iv) Concrete fix shape.
  if (total > shownRowCount || shownRowCount > 5) {
    response += `\n\nHay ${total} clases en total. Te muestro las primeras ${shownRowCount}.`;
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
  subscription_status: string;
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
    sql`SELECT sp.name AS plan_name, sub.subscription_status, sub.start_date, sub.end_date,
               sub.price_paid, sp.classes_per_week, sp.multi_branch
        FROM subscriptions sub
        JOIN subscription_plans sp ON sp.id = sub.plan_id
        WHERE sub.user_id = ${user.id}
          AND sub.subscription_status IN ('active', 'paused')
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
  const statusText =
    sub.subscription_status === "active" ? "Activa" : "Pausada";

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
    const codeKey = normalizeBranchCode(row.code);
    // Also try matching by name if code doesn't match
    const nameKey = Object.keys(BRANCH_ADDRESSES).find((key) =>
      row.name.toLowerCase().includes(key),
    );
    const lookupKey =
      codeKey in BRANCH_ADDRESSES ? codeKey : (nameKey ?? codeKey);

    const address = BRANCH_ADDRESSES[lookupKey] ?? null;
    const realMapsLink = BRANCH_MAPS_LINKS[lookupKey] ?? null;
    const mapsLink =
      realMapsLink ??
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`El Templo ${row.name} Mar del Plata`)}`;

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

// ─── Action Tool Handlers ───────────────────────────────────────────────────

interface ScheduleDetailRow {
  id: number;
  activity_name: string;
  branch_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface AlternativeScheduleRow {
  id: number;
  activity_name: string;
  branch_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  max_capacity: number;
  booking_count: number;
}

async function bookClass(
  db: DB,
  args: Record<string, unknown>,
  context?: { phone: string; clientState: ClientState },
): Promise<string> {
  // State gate
  if (!context) {
    return "No se pudo procesar la reserva: contexto no disponible.";
  }

  if (context.clientState !== "active_member") {
    switch (context.clientState) {
      case "lead":
        return "Para reservar clases necesitas ser miembro. Te interesa una clase de prueba gratuita?";
      case "trial":
        return "Tu cuenta de prueba no permite reservar clases adicionales. Queres info sobre membresias?";
      case "inactive_member":
      case "expired_member":
        return "Tu membresia no esta activa. Queres info sobre como reactivarla?";
    }
  }

  const scheduleId = typeof args.scheduleId === "number" ? args.scheduleId : 0;
  const date = typeof args.date === "string" ? args.date : "";
  const confirmed = args.confirmed === true;

  if (!scheduleId || !date) {
    return "Necesito el ID del horario y la fecha para hacer la reserva. Usa check_schedule para ver las opciones.";
  }

  // Resolve memberId from phone
  const userResult = await db.execute<UserRow[]>(
    sql`SELECT id FROM users WHERE phone = ${context.phone} LIMIT 1`,
  );
  const users = userResult[0] as unknown as UserRow[];

  if (users.length === 0) {
    return "No encontre tu cuenta. Contacta al equipo para verificar tu registro.";
  }

  const memberId = users[0].id;

  if (!confirmed) {
    // Fetch schedule details for confirmation summary
    const schedResult = await db.execute<ScheduleDetailRow[]>(
      sql`SELECT s.id, a.name AS activity_name, b.name AS branch_name,
                 s.day_of_week, s.start_time, s.end_time
          FROM schedules s
          JOIN activities a ON a.id = s.activity_id
          JOIN branches b ON b.id = s.branch_id
          WHERE s.id = ${scheduleId}
          LIMIT 1`,
    );
    const schedRows = schedResult[0] as unknown as ScheduleDetailRow[];

    if (schedRows.length === 0) {
      return "No encontre ese horario. Usa check_schedule para ver las opciones disponibles.";
    }

    const sched = schedRows[0];
    const dayName = DAY_NAMES[sched.day_of_week] ?? `Dia ${sched.day_of_week}`;

    const summaryText = `*Resumen de reserva*\n\n${sched.activity_name}\n${dayName} ${date}\n${sched.start_time} - ${sched.end_time}\n${sched.branch_name}`;

    await sendInteractiveMessage(context.phone, summaryText, [
      { id: "confirm_booking", title: "Confirmar" },
      { id: "cancel_booking", title: "Cancelar" },
    ]);

    pendingActions.set(context.phone, {
      tool: "book_class",
      args: { scheduleId, date, confirmed: true },
    });

    return "[BUTTONS_SENT]";
  }

  // Confirmed -- call API
  const apiUrl = process.env.API_BASE_URL || "http://localhost:3000";
  const apiKey = process.env.BOT_API_KEY;

  const response = await withTimeout(
    (signal) =>
      fetch(`${apiUrl}/api/bot/scheduling/book-class`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bot-api-key": apiKey ?? "",
        },
        body: JSON.stringify({ memberId, scheduleId, date }),
        signal,
      }),
    EXECUTE_TOOL_TIMEOUT_MS,
  );

  if (response.status === 201) {
    // Fetch schedule details for success message
    const schedResult = await db.execute<ScheduleDetailRow[]>(
      sql`SELECT s.id, a.name AS activity_name, b.name AS branch_name,
                 s.day_of_week, s.start_time, s.end_time
          FROM schedules s
          JOIN activities a ON a.id = s.activity_id
          JOIN branches b ON b.id = s.branch_id
          WHERE s.id = ${scheduleId}
          LIMIT 1`,
    );
    const schedRows = schedResult[0] as unknown as ScheduleDetailRow[];
    if (schedRows.length > 0) {
      const sched = schedRows[0];
      const dayName =
        DAY_NAMES[sched.day_of_week] ?? `Dia ${sched.day_of_week}`;
      return `Reserva confirmada! Te esperamos el ${dayName} a las ${sched.start_time} en ${sched.branch_name}. Nos vemos!`;
    }
    return "Reserva confirmada! Nos vemos en la clase!";
  }

  if (response.status === 409) {
    return "Ya tenes una reserva para esa clase. Te esperamos!";
  }

  if (response.status === 400) {
    // Class full -- try to offer alternatives
    const alternatives = await queryAlternativeSchedules(db, scheduleId, date);
    if (alternatives.length > 0) {
      const buttons = alternatives.slice(0, 3).map((alt) => ({
        id: `schedule_${alt.id}_${date}`,
        title: `${alt.activity_name} ${alt.start_time}`.slice(0, 20),
      }));
      await sendInteractiveMessage(
        context.phone,
        "Esa clase esta llena. Estas son otras opciones:",
        buttons,
      );
      return "[BUTTONS_SENT]";
    }
    return "Esa clase esta llena y no hay alternativas disponibles esta semana.";
  }

  return "No pude completar la reserva. Intenta de nuevo en un momento.";
}

async function queryAlternativeSchedules(
  db: DB,
  scheduleId: number,
  date: string,
): Promise<AlternativeScheduleRow[]> {
  // Find schedules for the same activity this week, or same day different activity,
  // that still have capacity
  const result = await db.execute<AlternativeScheduleRow[]>(
    sql`SELECT
          s.id, a.name AS activity_name, b.name AS branch_name,
          s.day_of_week, s.start_time, s.end_time, b.max_capacity,
          COALESCE(
            (SELECT COUNT(*) FROM bookings bk
             WHERE bk.schedule_id = s.id
               AND bk.booking_date = ${date}
               AND bk.booking_status != 'cancelado'),
            0
          ) AS booking_count
        FROM schedules s
        JOIN activities a ON a.id = s.activity_id
        JOIN branches b ON b.id = s.branch_id
        WHERE s.is_active = true
          AND a.is_active = true
          AND b.is_active = true
          AND s.id != ${scheduleId}
          AND (
            a.id = (SELECT activity_id FROM schedules WHERE id = ${scheduleId})
            OR s.day_of_week = (SELECT day_of_week FROM schedules WHERE id = ${scheduleId})
          )
        HAVING booking_count < b.max_capacity
        ORDER BY s.day_of_week, s.start_time
        LIMIT 3`,
  );
  return result[0] as unknown as AlternativeScheduleRow[];
}

async function registerTrial(
  db: DB,
  args: Record<string, unknown>,
  context?: { phone: string; clientState: ClientState },
): Promise<string> {
  // State gate
  if (!context) {
    return "No se pudo procesar el registro: contexto no disponible.";
  }

  if (context.clientState !== "lead") {
    switch (context.clientState) {
      case "trial":
        return "Ya tenes una clase de prueba registrada. Queres info sobre membresias?";
      case "active_member":
        return "Ya sos miembro! Podes reservar clases directamente con la herramienta de reservas.";
      case "inactive_member":
      case "expired_member":
        return "Hola de nuevo! Veo que ya fuiste miembro. Te gustaria renovar tu membresia?";
    }
  }

  const name = typeof args.name === "string" ? args.name : "";
  const scheduleId = typeof args.scheduleId === "number" ? args.scheduleId : 0;
  const date = typeof args.date === "string" ? args.date : "";
  const confirmed = args.confirmed === true;

  if (!name) {
    return "Necesito tu nombre para registrarte. Como te llamas?";
  }

  // Name provided but no scheduleId -- need class selection
  if (!scheduleId) {
    return "Necesito saber a que clase queres venir. Usa check_schedule para mostrarle las opciones.";
  }

  if (!date) {
    return "Necesito la fecha de la clase. En que dia te gustaria venir?";
  }

  if (!confirmed) {
    // Fetch schedule details for confirmation summary
    const schedResult = await db.execute<ScheduleDetailRow[]>(
      sql`SELECT s.id, a.name AS activity_name, b.name AS branch_name,
                 s.day_of_week, s.start_time, s.end_time
          FROM schedules s
          JOIN activities a ON a.id = s.activity_id
          JOIN branches b ON b.id = s.branch_id
          WHERE s.id = ${scheduleId}
          LIMIT 1`,
    );
    const schedRows = schedResult[0] as unknown as ScheduleDetailRow[];

    if (schedRows.length === 0) {
      return "No encontre ese horario. Usa check_schedule para ver las opciones disponibles.";
    }

    const sched = schedRows[0];
    const dayName = DAY_NAMES[sched.day_of_week] ?? `Dia ${sched.day_of_week}`;

    const summaryText = `*Registro de clase de prueba*\n\n${name}\n${sched.activity_name}\n${dayName} ${date}\n${sched.start_time}\n${sched.branch_name}`;

    await sendInteractiveMessage(context.phone, summaryText, [
      { id: "confirm_trial", title: "Confirmar" },
      { id: "cancel_trial", title: "Cancelar" },
    ]);

    pendingActions.set(context.phone, {
      tool: "register_trial",
      args: { name, scheduleId, date, confirmed: true },
    });

    return "[BUTTONS_SENT]";
  }

  // Confirmed -- call API
  const apiUrl = process.env.API_BASE_URL || "http://localhost:3000";
  const apiKey = process.env.BOT_API_KEY;

  const response = await withTimeout(
    (signal) =>
      fetch(`${apiUrl}/api/bot/scheduling/register-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bot-api-key": apiKey ?? "",
        },
        body: JSON.stringify({
          phone: context.phone,
          name,
          scheduleId,
          date,
        }),
        signal,
      }),
    EXECUTE_TOOL_TIMEOUT_MS,
  );

  if (response.status === 201) {
    // Fetch schedule details for success message
    const schedResult = await db.execute<ScheduleDetailRow[]>(
      sql`SELECT s.id, a.name AS activity_name, b.name AS branch_name,
                 s.day_of_week, s.start_time, s.end_time
          FROM schedules s
          JOIN activities a ON a.id = s.activity_id
          JOIN branches b ON b.id = s.branch_id
          WHERE s.id = ${scheduleId}
          LIMIT 1`,
    );
    const schedRows = schedResult[0] as unknown as ScheduleDetailRow[];
    if (schedRows.length > 0) {
      const sched = schedRows[0];
      const dayName =
        DAY_NAMES[sched.day_of_week] ?? `Dia ${sched.day_of_week}`;
      return `Listo! Quedaste registrado/a para ${sched.activity_name} el ${dayName} a las ${sched.start_time} en ${sched.branch_name}. Te esperamos!`;
    }
    return "Listo! Quedaste registrado/a para la clase de prueba. Te esperamos!";
  }

  if (response.status === 409) {
    return "Ya tuviste una clase de prueba con nosotros. Te gustaria ver nuestros planes de membresia?";
  }

  return "No pude completar el registro. Intenta de nuevo en un momento.";
}
