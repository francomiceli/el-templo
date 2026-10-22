// Módulo: conquer — tablero del coach con semáforo (Fase 201 §5, §7.2, S12-7)
//
// UNA request, un número FIJO de queries (4), sin N+1 (T-201-31):
//   1. alumnos activos ⨝ users ⟕ branches (zona horaria de cada sede)
//   2. alertas abiertas/vistas de esos alumnos
//   3. última sesión por alumno (GROUP BY)
//   4. resumen de controles por alumno (último control y si tiene día 0),
//      contando SOLO controles con contenido (`body-check-content.ts`)
// El resto (alertas derivadas por tiempo, recortes y semáforo) se calcula en
// memoria al leer: no hay cron (AS-11). Dato de salud (molestia): la ruta solo
// la abre `canManageConquer` (T-201-29).
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { DEFAULT_TENANT_TIMEZONE, todayInTz } from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { alertText } from "./alert-text";
import { daysBetweenIso } from "./calendar";
import {
  deriveTimeAlerts,
  type AlertStatus,
  type TimeAlertKind,
} from "./alerts-service";
import { checkHasContentSql } from "./body-check-content";
import {
  ALERT_LABELS,
  ALERT_SEVERITY,
  cutProposal,
  worstLight,
  type AlertKind,
  type CutProposal,
  type Level,
  type Light,
} from "./rules";

type DbInstance = MySql2Database<typeof schema>;

/** Alerta tal como la ve el coach. `id` null = derivada por tiempo. */
export interface BoardAlert {
  id: number | null;
  kind: AlertKind;
  severity: "rojo" | "amarillo" | "verde";
  label: string;
  /**
   * Fase 201 DA-13 / anexo §8: la frase de la alerta con sus datos ("Molestia
   * 6/10 en Plancha el 21/10"). El admin la pinta tal cual.
   */
  text: string;
  /** `null` = derivada. `resuelta` solo sale de `PATCH /alerts/:id`. */
  status: AlertStatus | null;
  createdAt: string | null;
  detail: Record<string, unknown>;
  /** Solo molestia y caída: se calcula al leer con `cutProposal` (§5.1). */
  proposal: CutProposal | null;
}

export type AlertRow = typeof schema.conquerAlerts.$inferSelect;

/** Fila de `conquer_alerts` -> `BoardAlert` (la propuesta de recorte se calcula acá). */
export function toBoardAlert(
  row: AlertRow,
  member: { level: Level; cutStage: number; firstName: string | null },
): BoardAlert {
  const hasProposal = row.type === "molestia" || row.type === "caida";
  return {
    id: row.id,
    kind: row.type,
    severity: ALERT_SEVERITY[row.type],
    label: ALERT_LABELS[row.type],
    text: alertText(row.type, row.detail, member.firstName ?? ""),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    detail: row.detail,
    proposal: hasProposal ? cutProposal(member.level, member.cutStage) : null,
  };
}

export interface BoardMember {
  userId: number;
  firstName: string;
  lastName: string;
  level: Level;
  daysCount: number;
  cutStage: number;
  lastSessionDate: string | null;
  light: Light;
  alerts: BoardAlert[];
}

export interface BoardResponse {
  counts: Record<Light, number> & { total: number };
  members: BoardMember[];
}

export interface BoardRow {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  level: Level;
  daysCount: number;
  cutStage: number;
  activationDate: string | null;
  day0Skipped: boolean;
  timezone: string | null;
}

/** Orden del tablero: el peor semáforo primero (§7.2). */
const LIGHT_ORDER: Record<Light, number> = {
  rojo: 0,
  amarillo: 1,
  verde: 2,
  ok: 3,
};

/**
 * Query 1: alumnos `activo` del gimnasio, con la zona horaria de su sede.
 * `userIds` limita a esos alumnos (la ficha del coach pide uno solo, 201-11).
 */
export async function loadBoardRows(
  db: DbInstance,
  ctx: TenantContext,
  userIds?: number[],
): Promise<BoardRow[]> {
  const rows = await db
    .select({
      userId: schema.conquerMembers.userId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      level: schema.conquerMembers.level,
      daysCount: schema.conquerMembers.daysCount,
      cutStage: schema.conquerMembers.cutStage,
      activationDate: schema.conquerMembers.activationDate,
      day0SkippedAt: schema.conquerMembers.day0SkippedAt,
      timezone: schema.branches.timezone,
    })
    .from(schema.conquerMembers)
    .innerJoin(
      schema.users,
      and(
        eq(schema.users.id, schema.conquerMembers.userId),
        tenantWhere(schema.users, ctx),
      ),
    )
    .leftJoin(
      schema.branches,
      and(
        eq(schema.branches.id, schema.users.branchId),
        tenantWhere(schema.branches, ctx),
      ),
    )
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.status, "activo"),
        isNotNull(schema.conquerMembers.level),
        isNotNull(schema.conquerMembers.daysCount),
        // `and` descarta el `undefined`: sin `userIds` son todos los alumnos.
        userIds === undefined
          ? undefined
          : inArray(schema.conquerMembers.userId, userIds),
      ),
    );
  const board: BoardRow[] = [];
  for (const r of rows) {
    if (r.level === null || r.daysCount === null) continue;
    board.push({
      userId: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      level: r.level,
      daysCount: r.daysCount,
      cutStage: r.cutStage,
      activationDate: r.activationDate,
      day0Skipped: r.day0SkippedAt !== null,
      timezone: r.timezone,
    });
  }
  return board;
}

/** Query 2: alertas guardadas que siguen pendientes, agrupadas por alumno. */
async function loadOpenAlerts(
  db: DbInstance,
  ctx: TenantContext,
  userIds: number[],
): Promise<Map<number, AlertRow[]>> {
  const rows = await db
    .select()
    .from(schema.conquerAlerts)
    .where(
      and(
        tenantWhere(schema.conquerAlerts, ctx),
        inArray(schema.conquerAlerts.userId, userIds),
        inArray(schema.conquerAlerts.status, ["abierta", "vista"]),
      ),
    )
    .orderBy(schema.conquerAlerts.createdAt, schema.conquerAlerts.id);
  const byUser = new Map<number, (typeof rows)[number][]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  return byUser;
}

/** Query 3: fecha de la última sesión por alumno. */
async function loadLastSessions(
  db: DbInstance,
  ctx: TenantContext,
  userIds: number[],
): Promise<Map<number, string>> {
  const rows = await db
    .select({
      userId: schema.conquerSessions.userId,
      lastDate: sql<string>`DATE_FORMAT(MAX(${schema.conquerSessions.sessionDate}), '%Y-%m-%d')`,
    })
    .from(schema.conquerSessions)
    .where(
      and(
        tenantWhere(schema.conquerSessions, ctx),
        inArray(schema.conquerSessions.userId, userIds),
      ),
    )
    .groupBy(schema.conquerSessions.userId);
  return new Map(rows.map((r) => [r.userId, String(r.lastDate)]));
}

interface CheckSummary {
  lastCheckDate: string | null;
  hasDay0: boolean;
}

/** Query 4: último control y si hay día 0, solo con controles con contenido (§6). */
async function loadCheckSummaries(
  db: DbInstance,
  ctx: TenantContext,
  userIds: number[],
): Promise<Map<number, CheckSummary>> {
  const rows = await db
    .select({
      userId: schema.conquerBodyChecks.userId,
      lastDate: sql<string>`DATE_FORMAT(MAX(${schema.conquerBodyChecks.checkDate}), '%Y-%m-%d')`,
      day0: sql<number>`MAX(CASE WHEN ${schema.conquerBodyChecks.kind} = 'dia0' THEN 1 ELSE 0 END)`,
    })
    .from(schema.conquerBodyChecks)
    .where(
      and(
        tenantWhere(schema.conquerBodyChecks, ctx),
        inArray(schema.conquerBodyChecks.userId, userIds),
        checkHasContentSql(),
      ),
    )
    .groupBy(schema.conquerBodyChecks.userId);
  return new Map(
    rows.map((r) => [
      r.userId,
      { lastCheckDate: String(r.lastDate), hasDay0: Number(r.day0) === 1 },
    ]),
  );
}

/** Alerta derivada por tiempo: sin id ni estado, con el dato que la explica. */
function derivedAlert(
  kind: TimeAlertKind,
  detail: Record<string, unknown>,
  firstName: string,
): BoardAlert {
  return {
    id: null,
    kind,
    severity: ALERT_SEVERITY[kind],
    label: ALERT_LABELS[kind],
    text: alertText(kind, detail, firstName),
    status: null,
    createdAt: null,
    detail,
    proposal: null,
  };
}

interface MemberFacts {
  row: BoardRow;
  today: string;
  lastSessionDate: string | null;
  checks: CheckSummary;
}

function derivedAlertsOf(facts: MemberFacts): BoardAlert[] {
  const { row, today, lastSessionDate, checks } = facts;
  const firstName = row.firstName ?? "";
  const kinds = deriveTimeAlerts({
    activationDate: row.activationDate ?? today,
    lastSessionDate,
    lastCheckDate: checks.lastCheckDate,
    hasDay0: checks.hasDay0,
    day0Skipped: row.day0Skipped,
    today,
  });
  return kinds.map((kind) => {
    if (kind === "inactivo") {
      const since = lastSessionDate ?? row.activationDate ?? today;
      return derivedAlert(
        kind,
        { lastSessionDate, days: daysBetweenIso(since, today) },
        firstName,
      );
    }
    if (kind === "control_vencido" && checks.lastCheckDate !== null) {
      return derivedAlert(
        kind,
        {
          lastCheckDate: checks.lastCheckDate,
          days: daysBetweenIso(checks.lastCheckDate, today),
        },
        firstName,
      );
    }
    return derivedAlert(kind, {}, firstName);
  });
}

function compareMembers(a: BoardMember, b: BoardMember): number {
  return (
    LIGHT_ORDER[a.light] - LIGHT_ORDER[b.light] ||
    a.lastName.localeCompare(b.lastName, "es") ||
    a.firstName.localeCompare(b.firstName, "es") ||
    a.userId - b.userId
  );
}

/**
 * Queries 2 a 4 y armado en memoria: de las filas de `loadBoardRows` a los
 * alumnos con sus alertas (guardadas + derivadas) y su semáforo. Sin orden.
 */
export async function buildBoardMembers(
  db: DbInstance,
  ctx: TenantContext,
  rows: BoardRow[],
): Promise<BoardMember[]> {
  if (rows.length === 0) return [];
  const userIds = rows.map((r) => r.userId);
  const [stored, lastSessions, checks] = await Promise.all([
    loadOpenAlerts(db, ctx, userIds),
    loadLastSessions(db, ctx, userIds),
    loadCheckSummaries(db, ctx, userIds),
  ]);

  return rows.map((row) => {
    const today = todayInTz(row.timezone || DEFAULT_TENANT_TIMEZONE);
    const lastSessionDate = lastSessions.get(row.userId) ?? null;
    const alerts: BoardAlert[] = [
      ...(stored.get(row.userId) ?? []).map((a) => toBoardAlert(a, row)),
      ...derivedAlertsOf({
        row,
        today,
        lastSessionDate,
        checks: checks.get(row.userId) ?? {
          lastCheckDate: null,
          hasDay0: false,
        },
      }),
    ];
    return {
      userId: row.userId,
      firstName: row.firstName ?? "",
      lastName: row.lastName ?? "",
      level: row.level,
      daysCount: row.daysCount,
      cutStage: row.cutStage,
      lastSessionDate,
      light: worstLight(alerts.map((a) => a.kind)),
      alerts,
    };
  });
}

/**
 * S12-7: todos los alumnos activos del gimnasio ordenados por semáforo (rojo,
 * amarillo, verde, ok y después apellido), en 4 queries fijas.
 */
export async function buildBoard(
  db: DbInstance,
  ctx: TenantContext,
): Promise<BoardResponse> {
  const rows = await loadBoardRows(db, ctx);
  const members = await buildBoardMembers(db, ctx, rows);
  members.sort(compareMembers);
  const counts = { rojo: 0, amarillo: 0, verde: 0, ok: 0, total: 0 };
  for (const m of members) counts[m.light] += 1;
  counts.total = members.length;
  return { counts, members };
}
