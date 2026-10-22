// Módulo: conquer — alertas por evento (Fase 201 §5, T-201-28)
//
// Una alerta por evento se identifica con `dedupe_key` y el UNIQUE
// (tenant, alumno, tipo, dedupe_key): repetir el evento no duplica la fila.
// Fase 201 plan 09: este archivo también evalúa las alertas al guardar la sesión
// (molestia, caída, paso de nivel), deriva las alertas por tiempo (inactivo,
// control vencido, control día 0 pendiente: sin cron, AS-11) y cambia el estado
// de una alerta desde el tablero del coach.
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { daysBetweenIso, levelUpStreak, mondayOfIso } from "./calendar";
import { planDays } from "./catalog-service";
import { caidaE1, selectReales, type MarkRow } from "./engine";
import { markKey, type MemberContext } from "./history-loader";
import {
  CHECK_OVERDUE_DAYS,
  INACTIVE_DAYS,
  LEVEL_UP_WEEKS,
  nextLevel,
  PAIN_ALERT_MIN,
} from "./rules";

type DbInstance = MySql2Database<typeof schema>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

export type EventAlertType =
  | "molestia"
  | "caida"
  | "tope_escalera"
  | "paso_nivel";

export interface EventAlertKey {
  userId: number;
  type: EventAlertType;
  dedupeKey: string;
}

export interface EventAlertInput extends EventAlertKey {
  detail: Record<string, unknown>;
}

/**
 * Alta idempotente. Si la alerta ya existe solo se actualiza el `detail`. Si la
 * había auto-resuelto el sistema (`resuelta` con `resolved_by` NULL) se reabre;
 * una que resolvió el coach NO se reabre (decisión del orquestador, §5).
 */
export async function upsertEventAlert(
  db: DbInstance | Tx,
  ctx: TenantContext,
  input: EventAlertInput,
): Promise<void> {
  const { status, resolvedBy, resolvedAt } = schema.conquerAlerts;
  const autoResolved = sql`${status} = 'resuelta' AND ${resolvedBy} IS NULL`;
  await db
    .insert(schema.conquerAlerts)
    .values(
      tenantValues(ctx, {
        userId: input.userId,
        type: input.type,
        dedupeKey: input.dedupeKey,
        detail: input.detail,
      }),
    )
    .onDuplicateKeyUpdate({
      // Drizzle arma el SET en el orden de las columnas de la tabla (status antes
      // que resolved_at) y MySQL deja que cada asignación vea las anteriores:
      // `resolved_at` NO puede depender de `status`. Sin `resolved_by` la fila
      // solo tiene `resolved_at` si la cerró el sistema, así que se limpia al reabrir.
      set: {
        detail: input.detail,
        status: sql`IF(${autoResolved}, 'abierta', ${status})`,
        resolvedAt: sql`IF(${resolvedBy} IS NULL, NULL, ${resolvedAt})`,
      },
    });
}

/**
 * Auto-resolución por el sistema: `resuelta` con `resolved_by` NULL (NULL =
 * automática). Solo toca alertas `abierta` o `vista`.
 */
export async function autoResolveEventAlert(
  db: DbInstance | Tx,
  ctx: TenantContext,
  input: EventAlertKey,
): Promise<void> {
  await db
    .update(schema.conquerAlerts)
    .set({ status: "resuelta", resolvedBy: null, resolvedAt: sql`NOW()` })
    .where(
      and(
        tenantWhere(schema.conquerAlerts, ctx),
        eq(schema.conquerAlerts.userId, input.userId),
        eq(schema.conquerAlerts.type, input.type),
        eq(schema.conquerAlerts.dedupeKey, input.dedupeKey),
        inArray(schema.conquerAlerts.status, ["abierta", "vista"]),
      ),
    );
}

// ------------------------------------------------- evaluación al guardar (§5)

/** Lo que `saveSession` le pasa a la evaluación: la sesión recién guardada. */
export interface SavedSessionInfo {
  sessionId: number;
  /** YYYY-MM-DD de "hoy" en la sede del alumno. */
  date: string;
  dayKey: string;
  pain: number;
  exerciseIds: number[];
}

/**
 * §5 / §5.1: molestia de 4 o más = alerta roja por sesión (una por fecha y día).
 * Si al re-guardar la molestia bajó, la alerta de esa misma sesión se
 * auto-resuelve (Pitfall 9).
 */
async function evaluatePain(
  tx: Tx,
  ctx: TenantContext,
  mctx: MemberContext,
  saved: SavedSessionInfo,
): Promise<void> {
  const key = {
    userId: mctx.userId,
    type: "molestia" as const,
    dedupeKey: `molestia:${saved.date}:${saved.dayKey}`,
  };
  if (saved.pain >= PAIN_ALERT_MIN) {
    await upsertEventAlert(tx, ctx, {
      ...key,
      detail: { pain: saved.pain, date: saved.date, dayKey: saved.dayKey },
    });
  } else {
    await autoResolveEventAlert(tx, ctx, key);
  }
}

/**
 * §5 / A6: el E1 de un ejercicio del día baja dos sesiones seguidas, sin contar
 * la de calibración. `caidaE1` mira las marcas posteriores al último cambio de
 * peldaño (`selectReales`), así que un Subir reinicia la cuenta.
 */
async function evaluateFalls(
  tx: Tx,
  ctx: TenantContext,
  mctx: MemberContext,
  saved: SavedSessionInfo,
  marksAfter: ReadonlyMap<string, MarkRow[]>,
): Promise<void> {
  for (const exerciseId of saved.exerciseIds) {
    const e1 = mctx.steps.get(markKey(exerciseId, "e1"));
    const exercise = mctx.catalog.exercises.get(exerciseId);
    if (!e1 || !exercise) continue;
    const values = selectReales(
      marksAfter.get(markKey(exerciseId, "e1")) ?? [],
      e1.sinceDate,
      e1.rungId,
    ).map((m) => m.value);
    const key = {
      userId: mctx.userId,
      type: "caida" as const,
      dedupeKey: `caida:${exerciseId}:${saved.date}`,
    };
    if (caidaE1(values)) {
      await upsertEventAlert(tx, ctx, {
        ...key,
        detail: {
          exerciseId,
          exerciseName: exercise.name,
          values: values.slice(-3),
        },
      });
    } else {
      await autoResolveEventAlert(tx, ctx, key);
    }
  }
}

export interface WeekSummary {
  monday: string;
  daysDone: number;
  maxPain: number;
}

/**
 * A13: resumen por semana calendario. `daysDone` cuenta días DISTINTOS del plan
 * (el sábado de Toro no cuenta) y `maxPain` mira todas las sesiones de la semana.
 */
export function summarizeWeeks(
  sessions: readonly { date: string; dayKey: string; pain: number }[],
  planKeys: ReadonlySet<string>,
): WeekSummary[] {
  const byWeek = new Map<string, { days: Set<string>; maxPain: number }>();
  for (const s of sessions) {
    const monday = mondayOfIso(s.date);
    const week = byWeek.get(monday) ?? { days: new Set<string>(), maxPain: 0 };
    if (planKeys.has(s.dayKey)) week.days.add(s.dayKey);
    week.maxPain = Math.max(week.maxPain, s.pain);
    byWeek.set(monday, week);
  }
  return [...byWeek.entries()].map(([monday, w]) => ({
    monday,
    daysDone: w.days.size,
    maxPain: w.maxPain,
  }));
}

/**
 * §2.2 / A13: 4 semanas calendario seguidas con todos los días del plan y sin
 * molestia de 4 o más, contadas desde `level_since`. Toro no tiene nivel
 * siguiente. Una sola query de sesiones. La clave incluye nivel y `level_since`:
 * al subir de nivel nace una alerta nueva.
 */
async function evaluateLevelUp(
  tx: Tx,
  ctx: TenantContext,
  mctx: MemberContext,
  saved: SavedSessionInfo,
): Promise<void> {
  const to = nextLevel(mctx.level);
  const since = mctx.member.levelSince ?? mctx.member.activationDate;
  if (!to || !since) return;

  const sessions = await tx
    .select({
      date: schema.conquerSessions.sessionDate,
      dayKey: schema.conquerSessions.dayKey,
      pain: schema.conquerSessions.pain,
    })
    .from(schema.conquerSessions)
    .where(
      and(
        tenantWhere(schema.conquerSessions, ctx),
        eq(schema.conquerSessions.userId, mctx.userId),
        gte(schema.conquerSessions.sessionDate, since),
      ),
    );
  const planKeys = new Set(
    planDays(mctx.catalog, mctx.daysCount).map((d) => d.dayKey),
  );
  const streak = levelUpStreak(
    summarizeWeeks(sessions, planKeys),
    mctx.daysCount,
    PAIN_ALERT_MIN,
    mondayOfIso(saved.date),
  );
  const key = {
    userId: mctx.userId,
    type: "paso_nivel" as const,
    dedupeKey: `paso_nivel:${mctx.level}:${since}`,
  };
  if (streak >= LEVEL_UP_WEEKS) {
    await upsertEventAlert(tx, ctx, {
      ...key,
      detail: { from: mctx.level, to, weeks: streak },
    });
  } else {
    await autoResolveEventAlert(tx, ctx, key);
  }
}

/**
 * Evalúa las alertas por evento de la sesión recién guardada, dentro de la
 * misma transacción del guardado. `marksAfter` ya incluye las marcas de hoy.
 * El tope de escalera lo emite `syncTopeAlerts` (session-service).
 */
export async function evaluateAfterSave(
  tx: Tx,
  ctx: TenantContext,
  mctx: MemberContext,
  saved: SavedSessionInfo,
  marksAfter: ReadonlyMap<string, MarkRow[]>,
): Promise<void> {
  await evaluatePain(tx, ctx, mctx, saved);
  await evaluateFalls(tx, ctx, mctx, saved, marksAfter);
  await evaluateLevelUp(tx, ctx, mctx, saved);
}

// ---------------------------------------------------- derivadas por tiempo

export type TimeAlertKind =
  | "inactivo"
  | "control_vencido"
  | "control_dia0_pendiente";

export interface TimeAlertInput {
  /** Desde cuándo cuenta el "inactivo" si el alumno nunca entrenó. */
  activationDate: string;
  lastSessionDate: string | null;
  /** Último control físico CON contenido. */
  lastCheckDate: string | null;
  /** ¿Tiene un control `dia0` con contenido? */
  hasDay0: boolean;
  day0Skipped: boolean;
  today: string;
}

/**
 * §5 y D-15: alertas que dependen del paso del tiempo. Se calculan al leer (sin
 * cron, AS-11), así que no se guardan ni hay nada que resolver: desaparecen
 * solas cuando el alumno entrena o se hace el control.
 */
export function deriveTimeAlerts(input: TimeAlertInput): TimeAlertKind[] {
  const kinds: TimeAlertKind[] = [];
  const since = input.lastSessionDate ?? input.activationDate;
  if (daysBetweenIso(since, input.today) >= INACTIVE_DAYS) {
    kinds.push("inactivo");
  }
  if (
    input.lastCheckDate !== null &&
    daysBetweenIso(input.lastCheckDate, input.today) > CHECK_OVERDUE_DAYS
  ) {
    kinds.push("control_vencido");
  }
  if (!input.hasDay0 && input.day0Skipped) {
    kinds.push("control_dia0_pendiente");
  }
  return kinds;
}

// ----------------------------------------------------------- estado

export type AlertStatus = "abierta" | "vista" | "resuelta";

function alertNotFound(): AppError {
  return new AppError(
    "No encontramos esa alerta",
    404,
    "CONQUER_ALERTA_NO_ENCONTRADA",
  );
}

/**
 * T-201-30 / T-201-32: el coach marca una alerta `vista` o `resuelta`. La busca
 * por id Y gimnasio (404 si es de otro). `resuelta` guarda quién y cuándo, y
 * desde ahí el sistema no la reabre. Una resuelta no vuelve a `vista` (409).
 * Devuelve `void`: la ruta responde con `getBoardAlert` (board-service).
 */
export async function updateAlertStatus(
  db: DbInstance,
  ctx: TenantContext,
  actor: { userId: number },
  alertId: number,
  status: "vista" | "resuelta",
): Promise<void> {
  const [current] = await db
    .select({ status: schema.conquerAlerts.status })
    .from(schema.conquerAlerts)
    .where(
      and(
        tenantWhere(schema.conquerAlerts, ctx),
        eq(schema.conquerAlerts.id, alertId),
      ),
    )
    .limit(1);
  if (!current) throw alertNotFound();

  if (current.status === "resuelta" && status === "vista") {
    throw new AppError(
      "Esa alerta ya está resuelta",
      409,
      "CONQUER_ALERTA_RESUELTA",
    );
  }
  if (current.status === status || current.status === "resuelta") return;
  await db
    .update(schema.conquerAlerts)
    .set(
      status === "resuelta"
        ? { status, resolvedBy: actor.userId, resolvedAt: sql`NOW()` }
        : { status },
    )
    .where(
      and(
        tenantWhere(schema.conquerAlerts, ctx),
        eq(schema.conquerAlerts.id, alertId),
      ),
    );
}

/**
 * Fase 201 §5.1 / §2.2 (T-201-38): el coach aceptó un recorte o confirmó el paso
 * de nivel, así que cierra las alertas que lo motivaron. Sirve dentro de la
 * transacción de la acción. Deja `resolved_by = actor` (NUNCA NULL: NULL
 * significa auto-resuelta y `upsertEventAlert` la reabriría). Solo toca las
 * `abierta` o `vista`; `alertId` limita a una alerta puntual.
 */
export async function resolveAlertsByCoach(
  db: DbInstance | Tx,
  ctx: TenantContext,
  actor: { userId: number },
  target: {
    userId: number;
    types: readonly EventAlertType[];
    alertId?: number;
  },
): Promise<void> {
  await db
    .update(schema.conquerAlerts)
    .set({
      status: "resuelta",
      resolvedBy: actor.userId,
      resolvedAt: sql`NOW()`,
    })
    .where(
      and(
        tenantWhere(schema.conquerAlerts, ctx),
        eq(schema.conquerAlerts.userId, target.userId),
        inArray(schema.conquerAlerts.type, [...target.types]),
        inArray(schema.conquerAlerts.status, ["abierta", "vista"]),
        target.alertId === undefined
          ? undefined
          : eq(schema.conquerAlerts.id, target.alertId),
      ),
    );
}

/**
 * T-201-37: la alerta `alertId` tiene que ser de ESE alumno y de uno de los
 * `types` (molestia o caída al aceptar un recorte). 404 si no, sin distinguir
 * "no existe" de "es de otro" para no filtrar nada.
 */
export async function assertAlertOfMember(
  db: DbInstance | Tx,
  ctx: TenantContext,
  userId: number,
  alertId: number,
  types: readonly EventAlertType[],
): Promise<void> {
  const [row] = await db
    .select({ id: schema.conquerAlerts.id })
    .from(schema.conquerAlerts)
    .where(
      and(
        tenantWhere(schema.conquerAlerts, ctx),
        eq(schema.conquerAlerts.id, alertId),
        eq(schema.conquerAlerts.userId, userId),
        inArray(schema.conquerAlerts.type, [...types]),
      ),
    )
    .limit(1);
  if (!row) throw alertNotFound();
}
