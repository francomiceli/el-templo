/**
 * Wellhub — criterio ÚNICO de qué horarios debe publicar el sync.
 *
 * Lo comparten `WellhubSyncService.syncSlots` (que publica/limpia slots) y el
 * detector de Oficina "clases de mañana sin publicar" (Fase 205, D-24): si los
 * dos miraran criterios distintos, el detector avisaría de clases que el sync
 * a propósito no publica (o callaría las que sí debería). Cualquier cambio de
 * elegibilidad se hace ACÁ.
 *
 * Un (horario, fecha) es publicable si el horario está activo, su actividad
 * está activa, marcada `wellhub_enabled` y no es especial, y para esa fecha no
 * tiene `schedule_exceptions` ni cae en un feriado del país de la sede.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";

type Db = MySql2Database<typeof schema>;

/**
 * Actividades que se publican en Wellhub: activas, marcadas wellhub_enabled
 * y no especiales. Única fuente del filtro para classes y slots, así una
 * actividad que se desmarca deja de tener slots válidos y la limpieza de
 * syncSlots los despublica.
 */
export const publishableActivity = and(
  eq(schema.activities.isActive, true),
  eq(schema.activities.wellhubEnabled, true),
  eq(schema.activities.isSpecial, false),
);

export interface PublishableSchedule {
  id: number;
  activityId: number;
  activityName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  activityCapacity: number | null;
  /** Reloj del DB (defaultNow). */
  createdAt: Date;
}

/** Horarios activos publicables de una sede. */
export async function loadPublishableSchedules(
  db: Db,
  ctx: TenantContext,
  branchId: number,
): Promise<PublishableSchedule[]> {
  return db
    .select({
      id: schema.schedules.id,
      activityId: schema.schedules.activityId,
      activityName: schema.activities.name,
      dayOfWeek: schema.schedules.dayOfWeek,
      startTime: schema.schedules.startTime,
      endTime: schema.schedules.endTime,
      activityCapacity: schema.activities.maxCapacity,
      createdAt: schema.schedules.createdAt,
    })
    .from(schema.schedules)
    .innerJoin(
      schema.activities,
      and(
        tenantWhere(schema.activities, ctx),
        eq(schema.schedules.activityId, schema.activities.id),
      ),
    )
    .where(
      and(
        tenantWhere(schema.schedules, ctx),
        eq(schema.schedules.branchId, branchId),
        eq(schema.schedules.isActive, true),
        publishableActivity,
      ),
    );
}

export interface SkippedDates {
  /** `<scheduleId>:<YYYY-MM-DD>` con excepción puntual (clase cancelada). */
  exceptionKeys: Set<string>;
  /** Fechas feriado del país de la sede. */
  holidayDates: Set<string>;
}

/** Excepciones de horario y feriados del país entre `from` y `to` (inclusive). */
export async function loadSkippedDates(
  db: Db,
  ctx: TenantContext,
  scheduleIds: number[],
  country: string,
  from: string,
  to: string,
): Promise<SkippedDates> {
  const exceptions = scheduleIds.length
    ? await db
        .select({
          scheduleId: schema.scheduleExceptions.scheduleId,
          exceptionDate: schema.scheduleExceptions.exceptionDate,
        })
        .from(schema.scheduleExceptions)
        .where(
          and(
            tenantWhere(schema.scheduleExceptions, ctx),
            inArray(schema.scheduleExceptions.scheduleId, scheduleIds),
            gte(schema.scheduleExceptions.exceptionDate, from),
            lte(schema.scheduleExceptions.exceptionDate, to),
          ),
        )
    : [];
  const holidays = await db
    .select({ date: schema.holidays.date })
    .from(schema.holidays)
    .where(
      and(
        tenantWhere(schema.holidays, ctx),
        eq(schema.holidays.country, country),
        gte(schema.holidays.date, from),
        lte(schema.holidays.date, to),
      ),
    );
  return {
    exceptionKeys: new Set(
      exceptions.map((e) => `${e.scheduleId}:${e.exceptionDate}`),
    ),
    holidayDates: new Set(holidays.map((h) => h.date)),
  };
}
