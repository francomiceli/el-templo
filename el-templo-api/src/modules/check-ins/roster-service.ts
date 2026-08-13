/**
 * Registros del día para el staff operativo (card de Horarios).
 *
 * Lista, de un pantallazo, cómo llegaron a entrenar los alumnos que asisten HOY
 * a una sede: su registro diario más reciente (energía, sueño, molestias). Es el
 * espejo de la cartelera de aniversarios (`AnniversaryService`), pero sobre los
 * check-ins en vez de la antigüedad. Superficie de sólo lectura para que el profe
 * ajuste la clase sin abrir socio por socio.
 *
 * Audiencia: coaches + admin/dueño (NO recepción/gestión) — decisión de Franco
 * 2026-08-13, más acotada que la vista admin de Feedback pero coherente con que
 * el profe es quien tiene la clase enfrente. Ver `CHECKIN_ROSTER_ROLES`.
 */
import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { CheckInService } from "./service";
import type {
  CheckInRosterEntry,
  CheckInRosterResult,
  DayCheckIn,
} from "./types";

/**
 * Cuánto "preocupa" un registro: energía baja, mal sueño y molestia moderada
 * pesan más. Ordena la lista para que el profe vea primero a quién cuidar.
 */
function concernScore(c: DayCheckIn): number {
  let s = 0;
  if (c.energy === "bajo") s += 2;
  if (c.sleep === "mal") s += 2;
  if (c.soreness === "moderada") s += 2;
  else if (c.soreness === "leve") s += 1;
  return s;
}

export class CheckInRosterService {
  private readonly checkInService: CheckInService;

  constructor(private readonly db: MySql2Database<typeof schema>) {
    this.checkInService = new CheckInService(db);
  }

  /**
   * Registros del día de los alumnos que asisten a `branchId` en `date`.
   * `date` es "YYYY-MM-DD" ya resuelto en la zona de la sede. Sólo devuelve a los
   * asistentes CON un registro reciente (ventana de `windowDays`, default 7);
   * `attendeeCount` es el total de asistentes para dar contexto ("8 de 20").
   */
  async getDayRoster(
    ctx: TenantContext,
    branchId: number,
    date: string,
    windowDays = 7,
  ): Promise<CheckInRosterResult> {
    // Asistentes del día = reservas activas + asistencias registradas en la sede.
    const bookingRows = await this.db
      .select({
        memberId: schema.bookings.memberId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.bookings.memberId))
      .where(
        and(
          tenantWhere(schema.bookings, ctx),
          tenantWhere(schema.schedules, ctx),
          tenantWhere(schema.users, ctx),
          eq(schema.schedules.branchId, branchId),
          eq(schema.bookings.bookingDate, date),
          sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado', 'lista_espera')`,
        ),
      );

    const attendanceRows = await this.db
      .select({
        memberId: schema.attendance.memberId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.attendance)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendance.memberId))
      .where(
        and(
          tenantWhere(schema.attendance, ctx),
          tenantWhere(schema.users, ctx),
          eq(schema.attendance.branchId, branchId),
          eq(schema.attendance.sessionDate, date),
        ),
      );

    const nameById = new Map<number, string>();
    for (const r of [...bookingRows, ...attendanceRows]) {
      if (!nameById.has(r.memberId)) {
        nameById.set(
          r.memberId,
          [r.firstName, r.lastName].filter(Boolean).join(" "),
        );
      }
    }

    const userIds = Array.from(nameById.keys());
    const checkIns = await this.checkInService.getRecentForUsers(
      userIds,
      date,
      windowDays,
    );

    const entries: CheckInRosterEntry[] = [];
    for (const [memberId, checkIn] of checkIns) {
      entries.push({
        memberId,
        memberName: nameById.get(memberId) ?? "",
        checkIn,
      });
    }

    // Primero los más preocupantes; a igual preocupación, el registro más
    // fresco arriba; luego alfabético para un orden estable.
    entries.sort(
      (a, b) =>
        concernScore(b.checkIn) - concernScore(a.checkIn) ||
        a.checkIn.daysAgo - b.checkIn.daysAgo ||
        a.memberName.localeCompare(b.memberName),
    );

    return { entries, attendeeCount: userIds.length };
  }
}
