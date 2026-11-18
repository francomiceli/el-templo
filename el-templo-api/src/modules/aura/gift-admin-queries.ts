// Module: aura — lecturas del staff sobre los regalos (fase 215, plan 10)
//
// Dos lecturas para la página "Regalos de Aura" del admin:
//   - `listAdminGifts`: los regalos del período, con quién dio, quién recibió,
//     motivo, puntos, estado y quién anuló (D-20).
//   - `weeklyGiftUsage`: la medición de las últimas 4 semanas (D-21).
//
// Reglas:
// - D-20: el staff ve nombre y apellido completos de quien dio y de quien
//   recibió (ya los ve en el resto del admin). Los anulados solo salen si se
//   piden.
// - D-21: la medición cuenta SOLO regalos vigentes. Semanas de lunes a domingo
//   (`giftWeekRange`), la actual primero. "Alumnos que asistieron" = personas
//   que no son staff con asistencia por QR o manual en la semana y las sedes
//   filtradas (Wellhub no entra: no puede regalar). "Regalaron" = dadores
//   distintos de regalos vigentes de alumno en esa semana. El porcentaje nunca
//   pasa de 100.
// - Alcance: `branchIds` undefined = todo el gimnasio; un arreglo acota por
//   sede y uno vacío (admin_sede sin sedes) no devuelve nada sin consultar.
// - Tope de la lista: 500 filas (el período máximo es de 90 días).
//
// Todas las lecturas llevan `tenantWhere` literal en cada `where` y en cada
// `join`: `aura_gifts` es strict. Una consulta para la lista y una por métrica,
// agrupadas por semana (sin N+1).

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias, type AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { addDays } from "../shared/date-utils";
import { ALL_STAFF_ROLES } from "../shared/permissions";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { AuraGiftVoidCause } from "../../db/schema/aura-gifts";
import {
  giftWeekRange,
  giversPct,
  type GiftGiverKind,
  type GiftReason,
} from "./gift-rules";

type DbInstance = MySql2Database<typeof schema>;

/** Tope de filas de la lista (el período máximo es de 90 días). */
export const ADMIN_GIFTS_LIMIT = 500;

/** Cantidad de semanas de la medición (la actual y las 3 anteriores). */
export const GIFT_USAGE_WEEKS = 4;

export interface AdminGiftFilters {
  branchIds: readonly number[] | undefined;
  days: 7 | 30 | 90;
  includeVoided: boolean;
  /** Hoy en la zona de la sede filtrada (o la del gimnasio). */
  todayLocal: string;
}

export interface AdminGiftItem {
  id: number;
  sessionDate: string;
  /** NULL si el horario se borró. */
  startTime: string | null;
  giverName: string;
  giverKind: GiftGiverKind;
  receiverName: string;
  reason: GiftReason;
  amount: number;
  status: "vigente" | "anulado";
  voidCause: AuraGiftVoidCause | null;
  voidedByName: string | null;
}

export interface WeeklyGiftUsage {
  /** Lunes de la semana (`YYYY-MM-DD`). */
  weekStart: string;
  studentGifts: number;
  coachGifts: number;
  attendees: number;
  giversPct: number;
}

function fullName(
  firstName: string | null,
  lastName: string | null,
  fallback: string,
): string {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return name === "" ? fallback : name;
}

/**
 * Regalos del período (`days` días terminando hoy), del más reciente al más
 * viejo. Con `includeVoided` falso solo salen los vigentes.
 */
export async function listAdminGifts(
  db: DbInstance,
  ctx: TenantContext,
  filters: AdminGiftFilters,
): Promise<AdminGiftItem[]> {
  const { branchIds, days, includeVoided, todayLocal } = filters;
  if (branchIds !== undefined && branchIds.length === 0) return [];

  const giver = alias(schema.users, "gift_giver");
  const receiver = alias(schema.users, "gift_receiver");
  const voider = alias(schema.users, "gift_voider");
  const since = addDays(todayLocal, -(days - 1));

  // Condiciones opcionales; el `tenantWhere` va literal en el `.where(...)`.
  const extra: SQL[] = [];
  if (branchIds !== undefined) {
    extra.push(inArray(schema.auraGifts.branchId, [...branchIds]));
  }
  if (!includeVoided) {
    extra.push(eq(schema.auraGifts.status, "vigente"));
  }

  const rows = await db
    .select({
      id: schema.auraGifts.id,
      sessionDate: schema.auraGifts.sessionDate,
      startTime: schema.schedules.startTime,
      giverKind: schema.auraGifts.giverKind,
      giverUserId: schema.auraGifts.giverUserId,
      giverFirstName: giver.firstName,
      giverLastName: giver.lastName,
      receiverUserId: schema.auraGifts.receiverUserId,
      receiverFirstName: receiver.firstName,
      receiverLastName: receiver.lastName,
      reason: schema.auraGifts.reason,
      amount: schema.auraGifts.amount,
      status: schema.auraGifts.status,
      voidCause: schema.auraGifts.voidCause,
      voidedByUserId: schema.auraGifts.voidedByUserId,
      voiderFirstName: voider.firstName,
      voiderLastName: voider.lastName,
    })
    .from(schema.auraGifts)
    .innerJoin(
      giver,
      and(tenantWhere(giver, ctx), eq(giver.id, schema.auraGifts.giverUserId)),
    )
    .innerJoin(
      receiver,
      and(
        tenantWhere(receiver, ctx),
        eq(receiver.id, schema.auraGifts.receiverUserId),
      ),
    )
    .leftJoin(
      voider,
      and(
        tenantWhere(voider, ctx),
        eq(voider.id, schema.auraGifts.voidedByUserId),
      ),
    )
    .leftJoin(
      schema.schedules,
      and(
        tenantWhere(schema.schedules, ctx),
        eq(schema.schedules.id, schema.auraGifts.scheduleId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.auraGifts, ctx),
        gte(schema.auraGifts.sessionDate, since),
        ...extra,
      ),
    )
    .orderBy(
      desc(schema.auraGifts.sessionDate),
      desc(schema.schedules.startTime),
      desc(schema.auraGifts.id),
    )
    .limit(ADMIN_GIFTS_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    sessionDate: row.sessionDate,
    startTime: row.startTime ?? null,
    giverName: fullName(
      row.giverFirstName,
      row.giverLastName,
      `Usuario #${row.giverUserId}`,
    ),
    giverKind: row.giverKind,
    receiverName: fullName(
      row.receiverFirstName,
      row.receiverLastName,
      `Usuario #${row.receiverUserId}`,
    ),
    reason: row.reason,
    amount: row.amount,
    status: row.status,
    voidCause: row.voidCause ?? null,
    voidedByName:
      row.voidedByUserId === null
        ? null
        : fullName(
            row.voiderFirstName,
            row.voiderLastName,
            `Usuario #${row.voidedByUserId}`,
          ),
  }));
}

const STAFF_ROLES: ReadonlyArray<(typeof ALL_STAFF_ROLES)[number]> =
  ALL_STAFF_ROLES;

/**
 * Lunes de la semana de una fecha, calculado en SQL (`WEEKDAY` da 0 para el
 * lunes), para agrupar sin traer filas. `DATE_FORMAT` evita que el driver
 * devuelva un `Date`.
 */
function weekStartSql(column: AnyMySqlColumn) {
  return sql<string>`DATE_FORMAT(DATE_SUB(${column}, INTERVAL WEEKDAY(${column}) DAY), '%Y-%m-%d')`;
}

/**
 * Medición de las últimas 4 semanas (D-21): regalos vigentes de alumnos y de
 * profes, alumnos que asistieron y porcentaje de ellos que regaló. La semana
 * más reciente primero; las semanas sin datos salen en 0.
 */
export async function weeklyGiftUsage(
  db: DbInstance,
  ctx: TenantContext,
  filters: Pick<AdminGiftFilters, "branchIds" | "todayLocal">,
): Promise<WeeklyGiftUsage[]> {
  const { branchIds, todayLocal } = filters;

  const currentStart = giftWeekRange(todayLocal).start;
  const weekStarts: string[] = [];
  for (let i = 0; i < GIFT_USAGE_WEEKS; i += 1) {
    weekStarts.push(addDays(currentStart, -7 * i));
  }
  const rangeStart = weekStarts[weekStarts.length - 1];
  const rangeEnd = giftWeekRange(todayLocal).end;

  const empty = weekStarts.map<WeeklyGiftUsage>((weekStart) => ({
    weekStart,
    studentGifts: 0,
    coachGifts: 0,
    attendees: 0,
    giversPct: 0,
  }));
  if (branchIds !== undefined && branchIds.length === 0) return empty;

  // Filtro opcional por sede; el `tenantWhere` va literal en cada `.where(...)`.
  const giftBranch: SQL[] =
    branchIds !== undefined
      ? [inArray(schema.auraGifts.branchId, [...branchIds])]
      : [];
  const attendanceBranch: SQL[] =
    branchIds !== undefined
      ? [inArray(schema.attendance.branchId, [...branchIds])]
      : [];

  const giftWeek = weekStartSql(schema.auraGifts.sessionDate);
  const giftRows = await db
    .select({
      weekStart: giftWeek,
      studentGifts: sql<number>`COALESCE(SUM(${schema.auraGifts.giverKind} = 'alumno'), 0)`,
      coachGifts: sql<number>`COALESCE(SUM(${schema.auraGifts.giverKind} = 'profe'), 0)`,
      givers: sql<number>`COUNT(DISTINCT CASE WHEN ${schema.auraGifts.giverKind} = 'alumno' THEN ${schema.auraGifts.giverUserId} END)`,
    })
    .from(schema.auraGifts)
    .where(
      and(
        tenantWhere(schema.auraGifts, ctx),
        eq(schema.auraGifts.status, "vigente"),
        gte(schema.auraGifts.sessionDate, rangeStart),
        lte(schema.auraGifts.sessionDate, rangeEnd),
        ...giftBranch,
      ),
    )
    .groupBy(giftWeek);

  const attendanceWeek = weekStartSql(schema.attendance.sessionDate);
  const attendanceRows = await db
    .select({
      weekStart: attendanceWeek,
      attendees: sql<number>`COUNT(DISTINCT ${schema.attendance.memberId})`,
    })
    .from(schema.attendance)
    .innerJoin(
      schema.users,
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, schema.attendance.memberId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.attendance, ctx),
        inArray(schema.attendance.source, ["qr", "manual"]),
        gte(schema.attendance.sessionDate, rangeStart),
        lte(schema.attendance.sessionDate, rangeEnd),
        notInArray(schema.users.role, [...STAFF_ROLES]),
        ...attendanceBranch,
      ),
    )
    .groupBy(attendanceWeek);

  const giftsByWeek = new Map(giftRows.map((row) => [row.weekStart, row]));
  const attendeesByWeek = new Map(
    attendanceRows.map((row) => [row.weekStart, Number(row.attendees)]),
  );

  return weekStarts.map((weekStart) => {
    const gifts = giftsByWeek.get(weekStart);
    const attendees = attendeesByWeek.get(weekStart) ?? 0;
    const givers = Math.min(Number(gifts?.givers ?? 0), attendees);
    return {
      weekStart,
      studentGifts: Number(gifts?.studentGifts ?? 0),
      coachGifts: Number(gifts?.coachGifts ?? 0),
      attendees,
      giversPct: giversPct(givers, attendees),
    };
  });
}
