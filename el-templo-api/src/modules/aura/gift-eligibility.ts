// Module: aura — elegibilidad del regalo (fase 215)
//
// Lecturas compartidas por el regalo del alumno y el del profe: quién puede
// regalar, a quién se le puede regalar y cuánto cupo semanal queda. Una sola
// definición para que la lista de caras, el alta del regalo y el tope no
// puedan diferir.
//
// - D-02: un regalo de alumno por asistencia registrada de quien da. La clase
//   es una `attendance` con horario (`schedule_id` NOT NULL): una asistencia sin
//   horario no es una clase y no da regalo ni aparece como compañero.
// - D-04: reciben quienes tienen asistencia en la MISMA clase (horario y fecha),
//   visibles, que no son staff, no son de prueba, no están borrados y no son
//   quien da. Wellhub entra como cualquiera.
// - D-05: tope de 2 regalos por persona por semana de lunes a domingo (de la
//   fecha de la clase). Cuenta solo regalos vigentes de alumno.
// - D-07: da quien ve la lista de anotados (plan en vigor y visible) y no es
//   staff: el staff que entrena como alumno no regala desde la app.
// - D-08: lo que se ve de cada compañero es solo nombre de pila e inicial del
//   apellido. Nunca se selecciona el apellido completo, el teléfono ni el email.
// - D-12: la ventana de regalo es el día de la clase y el siguiente.
// - D-14: la oferta del alumno existe desde la hora de fin del horario.
//
// Decisiones del plan 04 (anotadas en 215-DECISIONES-AUTONOMAS.md):
// - Quien tiene CUALQUIER reserva de prueba para esa clase y fecha no aparece
//   entre las caras, aunque esté cancelada (la opción más conservadora).
// - El orden de las caras es el de reserva (`bookings.booked_at` de su reserva
//   vigente); sin reserva vigente cuenta la hora del check-in.
//
// Todas las lecturas llevan `tenantWhere` literal en cada `where` y en cada
// `join`: `aura_gifts` es strict.

import {
  and,
  asc,
  eq,
  gte,
  isNotNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import {
  buildClassDateTime,
  DEFAULT_TENANT_TIMEZONE,
  addDays,
  todayInTz,
} from "../shared/date-utils";
import { ALL_STAFF_ROLES } from "../shared/permissions";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  effectiveVisible,
  listAccess,
} from "../scheduling/community-visibility";
import { getViewerCommunityState } from "../scheduling/community-service";
import { giftWeekRange, isWithinGiftWindow } from "./gift-rules";
import type { AuraTx } from "./service";

type DbInstance = MySql2Database<typeof schema>;
type DbOrTx = DbInstance | AuraTx;

/** Estados de una reserva que cuenta como vigente (igual que los anotados). */
const VIGENT_BOOKING_STATUSES = [
  "reservado",
  "qr_escaneado",
  "confirmado",
] as const;

/** Una asistencia a una clase (con horario), con lo que hace falta para regalar. */
export interface ClassAttendance {
  attendanceId: number;
  memberId: number;
  branchId: number;
  scheduleId: number;
  /** Fecha local de la clase (`YYYY-MM-DD`). */
  sessionDate: string;
  startTime: string;
  endTime: string;
  activityName: string;
  /** Zona de la sede de la asistencia. */
  timezone: string;
}

/** Un compañero al que se le puede regalar: solo lo que la pantalla muestra. */
export interface Classmate {
  userId: number;
  attendanceId: number;
  firstName: string;
  lastInitial: string | null;
}

/** Columnas comunes de la lectura de una asistencia con su clase. */
const classAttendanceColumns = {
  attendanceId: schema.attendance.id,
  memberId: schema.attendance.memberId,
  branchId: schema.attendance.branchId,
  scheduleId: schema.attendance.scheduleId,
  sessionDate: schema.attendance.sessionDate,
  startTime: schema.schedules.startTime,
  endTime: schema.schedules.endTime,
  activityName: schema.activities.name,
  timezone: schema.branches.timezone,
};

interface ClassAttendanceRow {
  attendanceId: number;
  memberId: number;
  branchId: number;
  scheduleId: number | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  activityName: string;
  timezone: string | null;
}

function toClassAttendance(row: ClassAttendanceRow): ClassAttendance | null {
  if (row.scheduleId === null) return null;
  return {
    attendanceId: row.attendanceId,
    memberId: row.memberId,
    branchId: row.branchId,
    scheduleId: row.scheduleId,
    sessionDate: row.sessionDate,
    startTime: row.startTime,
    endTime: row.endTime,
    activityName: row.activityName,
    timezone: row.timezone ?? DEFAULT_TENANT_TIMEZONE,
  };
}

/**
 * La asistencia con su horario, su actividad y la zona de la sede. Devuelve
 * `null` si no existe o no tiene horario (no es una clase).
 */
export async function loadClassAttendance(
  db: DbOrTx,
  ctx: TenantContext,
  attendanceId: number,
): Promise<ClassAttendance | null> {
  const [row] = await db
    .select(classAttendanceColumns)
    .from(schema.attendance)
    .innerJoin(
      schema.schedules,
      and(
        tenantWhere(schema.schedules, ctx),
        eq(schema.schedules.id, schema.attendance.scheduleId),
      ),
    )
    .innerJoin(
      schema.activities,
      and(
        tenantWhere(schema.activities, ctx),
        eq(schema.activities.id, schema.schedules.activityId),
      ),
    )
    .innerJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.id, schema.attendance.branchId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.attendance, ctx),
        eq(schema.attendance.id, attendanceId),
        isNotNull(schema.attendance.scheduleId),
      ),
    )
    .limit(1);
  return row ? toClassAttendance(row) : null;
}

/**
 * Clases del usuario que todavía están dentro de la ventana de regalo (D-12),
 * medida con el día local de la sede de cada asistencia. Orden: la que vence
 * antes primero (fecha y hora de inicio ascendentes).
 */
export async function listRecentClassAttendances(
  db: DbOrTx,
  ctx: TenantContext,
  userId: number,
  now: Date,
): Promise<ClassAttendance[]> {
  // Cota gruesa en SQL (la zona más atrasada está a un día de la de default);
  // el filtro fino se hace por fila con la zona de cada sede.
  const since = addDays(todayInTz(DEFAULT_TENANT_TIMEZONE, now), -2);
  const rows = await db
    .select(classAttendanceColumns)
    .from(schema.attendance)
    .innerJoin(
      schema.schedules,
      and(
        tenantWhere(schema.schedules, ctx),
        eq(schema.schedules.id, schema.attendance.scheduleId),
      ),
    )
    .innerJoin(
      schema.activities,
      and(
        tenantWhere(schema.activities, ctx),
        eq(schema.activities.id, schema.schedules.activityId),
      ),
    )
    .innerJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.id, schema.attendance.branchId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.attendance, ctx),
        eq(schema.attendance.memberId, userId),
        isNotNull(schema.attendance.scheduleId),
        gte(schema.attendance.sessionDate, since),
      ),
    )
    .orderBy(
      asc(schema.attendance.sessionDate),
      asc(schema.schedules.startTime),
      asc(schema.attendance.id),
    );

  const result: ClassAttendance[] = [];
  for (const row of rows) {
    const cls = toClassAttendance(row);
    if (!cls) continue;
    if (isWithinGiftWindow(cls.sessionDate, todayInTz(cls.timezone, now))) {
      result.push(cls);
    }
  }
  return result;
}

/** D-14: la clase terminó cuando pasó la hora de fin del horario en la sede. */
export function classHasEnded(cls: ClassAttendance, now: Date): boolean {
  return (
    buildClassDateTime(cls.sessionDate, cls.endTime, cls.timezone).getTime() <=
    now.getTime()
  );
}

/**
 * D-07: puede regalar como alumno quien ve la lista de anotados (plan en vigor
 * y visible) y no es staff. Wellhub sin plan y freemium quedan afuera por
 * `hasPlanInEffect`; el oculto, por `viewerVisible`.
 */
export async function giverAccess(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<{ canGive: boolean }> {
  const state = await getViewerCommunityState(db, ctx, userId);
  const access = listAccess({
    isStaff: state.isStaff,
    hasPlanInEffect: state.hasPlanInEffect,
    viewerVisible: state.visible,
  });
  return { canGive: access.canSeeList && !state.isStaff };
}

const STAFF_ROLES: ReadonlyArray<(typeof ALL_STAFF_ROLES)[number]> =
  ALL_STAFF_ROLES;

/**
 * Compañeros de una clase a los que se les puede regalar (D-04), en orden de
 * reserva. `excludeUserId` es quien da (`null` cuando regala el profe).
 * `todayLocal` es el día local de la sede de la clase, para la regla de
 * visibilidad por edad (D-47 de la 214).
 */
export async function listEligibleClassmates(
  db: DbOrTx,
  ctx: TenantContext,
  input: {
    scheduleId: number;
    sessionDate: string;
    excludeUserId: number | null;
    todayLocal: string;
  },
): Promise<Classmate[]> {
  const { scheduleId, sessionDate, excludeUserId, todayLocal } = input;

  // Solo se seleccionan los campos que la pantalla necesita: el apellido
  // completo, el teléfono y el email nunca se leen.
  const rows = await db
    .select({
      userId: schema.users.id,
      attendanceId: schema.attendance.id,
      checkedInAt: schema.attendance.checkedInAt,
      firstName: schema.users.firstName,
      lastInitial: sql<string | null>`LEFT(${schema.users.lastName}, 1)`,
      dateOfBirth: schema.users.dateOfBirth,
      branchCountry: schema.branches.country,
      preference: schema.memberProfiles.communityVisible,
    })
    .from(schema.attendance)
    .innerJoin(
      schema.users,
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, schema.attendance.memberId),
      ),
    )
    .innerJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.id, schema.users.branchId),
      ),
    )
    .leftJoin(
      schema.memberProfiles,
      and(
        tenantWhere(schema.memberProfiles, ctx),
        eq(schema.memberProfiles.userId, schema.users.id),
      ),
    )
    .where(
      and(
        tenantWhere(schema.attendance, ctx),
        eq(schema.attendance.scheduleId, scheduleId),
        eq(schema.attendance.sessionDate, sessionDate),
        sql`${schema.users.deletedAt} IS NULL`,
        notInArray(schema.users.role, [...STAFF_ROLES]),
        excludeUserId === null
          ? undefined
          : ne(schema.attendance.memberId, excludeUserId),
      ),
    )
    .orderBy(asc(schema.attendance.id));

  if (rows.length === 0) return [];

  // Reservas de esa clase: las de prueba sacan a la persona de las caras, las
  // vigentes dan el orden de reserva.
  const bookingRows = await db
    .select({
      memberId: schema.bookings.memberId,
      isTrial: schema.bookings.isTrial,
      status: schema.bookings.status,
      bookedAt: schema.bookings.bookedAt,
    })
    .from(schema.bookings)
    .where(
      and(
        tenantWhere(schema.bookings, ctx),
        eq(schema.bookings.scheduleId, scheduleId),
        eq(schema.bookings.bookingDate, sessionDate),
      ),
    );

  const trialMembers = new Set<number>();
  const bookedAtByMember = new Map<number, number>();
  for (const booking of bookingRows) {
    if (booking.isTrial) {
      trialMembers.add(booking.memberId);
      continue;
    }
    if (
      !(VIGENT_BOOKING_STATUSES as readonly string[]).includes(booking.status)
    ) {
      continue;
    }
    const at = booking.bookedAt.getTime();
    const previous = bookedAtByMember.get(booking.memberId);
    if (previous === undefined || at < previous) {
      bookedAtByMember.set(booking.memberId, at);
    }
  }

  // Una persona puede tener más de una asistencia ese día en el mismo horario
  // (check-in forzado): se queda la primera.
  const seen = new Set<number>();
  const eligible: Array<{ classmate: Classmate; orderKey: number }> = [];
  for (const row of rows) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    if (trialMembers.has(row.userId)) continue;
    const visible = effectiveVisible({
      preference: row.preference ?? null,
      dateOfBirth: row.dateOfBirth,
      branchCountry: row.branchCountry,
      todayLocal,
    });
    if (!visible) continue;
    eligible.push({
      classmate: {
        userId: row.userId,
        attendanceId: row.attendanceId,
        firstName: row.firstName ?? "",
        lastInitial: row.lastInitial || null,
      },
      orderKey: bookedAtByMember.get(row.userId) ?? row.checkedInAt.getTime(),
    });
  }

  return eligible
    .sort(
      (a, b) =>
        a.orderKey - b.orderKey ||
        a.classmate.attendanceId - b.classmate.attendanceId,
    )
    .map((item) => item.classmate);
}

/**
 * D-05: cuántos regalos de alumno le dio `giverUserId` a cada persona en la
 * semana (lunes a domingo) de `sessionDate`. Solo cuentan las personas con al
 * menos uno.
 *
 * Cuentan los vigentes y los anulados por el staff (ME-02): anular un abuso no
 * puede devolver el cupo semanal. Los anulados porque se deshizo la asistencia
 * no cuentan: ahí el regalo nunca debió existir.
 */
export async function weeklyGiftCountsByReceiver(
  db: DbOrTx,
  ctx: TenantContext,
  giverUserId: number,
  sessionDate: string,
): Promise<Map<number, number>> {
  const { start, end } = giftWeekRange(sessionDate);
  const rows = await db
    .select({
      receiverUserId: schema.auraGifts.receiverUserId,
      total: sql<number>`COUNT(*)`,
    })
    .from(schema.auraGifts)
    .where(
      and(
        tenantWhere(schema.auraGifts, ctx),
        eq(schema.auraGifts.giverUserId, giverUserId),
        eq(schema.auraGifts.giverKind, "alumno"),
        or(
          eq(schema.auraGifts.status, "vigente"),
          eq(schema.auraGifts.voidCause, "staff"),
        ),
        sql`${schema.auraGifts.sessionDate} BETWEEN ${start} AND ${end}`,
      ),
    )
    .groupBy(schema.auraGifts.receiverUserId);

  return new Map(rows.map((row) => [row.receiverUserId, Number(row.total)]));
}
