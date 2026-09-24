/**
 * Atribución de profe a una clase — FUENTE ÚNICA de la regla.
 *
 * El roster (class_coach_assignments) es effective-dated: cada fila es un
 * change-point, y una clase hereda el profe del change-point más reciente cuya
 * semana sea <= la semana de la clase, para su (sucursal, día ISO, turno). Un
 * cambio posterior nunca reescribe la atribución de una clase pasada.
 *
 * Vive acá y no adentro de RatingsService porque hay dos consumidores con
 * formas de acceso distintas: RatingsService resuelve UNA clase con un query
 * puntual, y el export de sesiones de prueba resuelve miles de filas de una
 * (trae los change-points de las sucursales involucradas y matchea en memoria).
 * Si la regla se reescribiera del lado del reporte, el "Profe" del Excel podría
 * discrepar del profe al que se le atribuyen las puntuaciones.
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import type * as schema from "../../db/schema";
import type { TenantContext } from "../shared/tenant";
import type { ClassSlot } from "./types";
import { getWeekRange } from "../shared/date-utils";

/**
 * Día ISO (1=Lun .. 7=Dom) de un "YYYY-MM-DD". Mediodía UTC para no correrse
 * por DST/borde de día (misma convención que date-utils). El roster usa 1..6
 * (Lun-Sáb); el domingo (7) no tiene turnos.
 */
export function isoDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=Dom .. 6=Sáb
  return dow === 0 ? 7 : dow;
}

/** Lunes (ISO) de la semana que contiene el "YYYY-MM-DD" dado. */
export function isoWeekStart(dateStr: string): string {
  return getWeekRange(new Date(dateStr + "T12:00:00Z")).monday;
}

/** Turno derivado del startTime "HH:MM" del schedule: <12:00 = morning (D-A1). */
export function slotFromStartTime(startTime: string): ClassSlot {
  return startTime < "12:00" ? "morning" : "afternoon";
}

/** Un change-point del roster, con el profe ya resuelto a nombre. */
export interface RosterChangePoint {
  branchId: number;
  weekStartDate: string; // YYYY-MM-DD (lunes ISO)
  dayOfWeek: number;
  slot: ClassSlot;
  coachId: number;
  coachName: string;
}

/**
 * Índice de change-points para resolver muchas clases sin volver a la base.
 * Agrupa por (sucursal, día, turno) y ordena por semana DESC, que es el orden
 * en que se busca: el primer change-point con semana <= la de la clase gana.
 */
export class RosterAttributionIndex {
  private readonly bySlot = new Map<string, RosterChangePoint[]>();

  constructor(changePoints: RosterChangePoint[]) {
    for (const cp of changePoints) {
      const key = slotKey(cp.branchId, cp.dayOfWeek, cp.slot);
      const list = this.bySlot.get(key);
      if (list) {
        list.push(cp);
      } else {
        this.bySlot.set(key, [cp]);
      }
    }
    for (const list of this.bySlot.values()) {
      list.sort((a, b) => (a.weekStartDate < b.weekStartDate ? 1 : -1));
    }
  }

  /**
   * Profe atribuido a la clase, o null cuando ningún change-point aplica en o
   * antes de esa semana (no-orphan, D-Q3) — p.ej. clases anteriores a que la
   * sucursal empezara a cargar roster.
   */
  resolve(params: {
    branchId: number;
    sessionDate: string; // YYYY-MM-DD
    startTime: string; // HH:MM
  }): RosterChangePoint | null {
    const weekStartDate = isoWeekStart(params.sessionDate);
    const dayOfWeek = isoDayOfWeek(params.sessionDate);
    const slot = slotFromStartTime(params.startTime);

    const candidates = this.bySlot.get(
      slotKey(params.branchId, dayOfWeek, slot),
    );
    if (!candidates) return null;

    // Ordenados por semana DESC: el primero que no sea futuro es el vigente.
    return candidates.find((cp) => cp.weekStartDate <= weekStartDate) ?? null;
  }
}

function slotKey(branchId: number, dayOfWeek: number, slot: ClassSlot): string {
  return `${branchId}|${dayOfWeek}|${slot}`;
}

/** One (day, slot) cell of the effective roster, as of a given week. */
export interface EffectiveRosterCell {
  id: number;
  dayOfWeek: number;
  slot: ClassSlot;
  coachId: number;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Efectivo profe por (día, turno) para una sucursal, "a la fecha" de
 * `weekStartDate` — la proyección "quién da clase esta semana" compartida por
 * la grilla de roster del admin (RatingsService.getRosterWeek) y la grilla de
 * reservas del socio (SchedulingService.getWeeklyGrid, App 1.7.9). Devuelve
 * una fila por (día, turno) con al menos un change-point <= weekStartDate; la
 * window function elige el más reciente (mismo criterio effective-dated que
 * documenta el encabezado de este archivo). Una sola query — sin N+1 — para
 * los 6 días × 2 turnos de la sucursal.
 *
 * Vive acá, y no duplicada en cada consumidor, porque esta es la FUENTE ÚNICA
 * de la regla de vigencia (ver docstring del archivo).
 */
export async function getEffectiveRosterCells(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  branchId: number,
  weekStartDate: string,
): Promise<EffectiveRosterCell[]> {
  /* tenant-safe: class_coach_assignments se filtra por branch_id (ancla del
     modulo, ver docstring) y el JOIN a users ya exige u.tenant_id =
     ctx.tenantId — mismo patron ya usado en esta consulta cuando vivia en
     ratings/service.ts (RatingsService.getRosterWeek) */
  const result = await db.execute(sql`
    SELECT t.id AS id,
           t.day_of_week AS dayOfWeek,
           t.slot AS slot,
           t.coach_id AS coachId,
           u.first_name AS firstName,
           u.last_name AS lastName
    FROM (
      SELECT id, day_of_week, slot, coach_id,
             ROW_NUMBER() OVER (
               PARTITION BY day_of_week, slot
               ORDER BY week_start_date DESC
             ) AS rn
      FROM class_coach_assignments
      WHERE branch_id = ${branchId}
        AND week_start_date <= ${weekStartDate}
    ) t
    JOIN users u ON u.id = t.coach_id AND u.tenant_id = ${ctx.tenantId}
    WHERE t.rn = 1
  `);

  const rows = result[0] as unknown as Array<{
    id: number;
    dayOfWeek: number;
    slot: string;
    coachId: number;
    firstName: string | null;
    lastName: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    dayOfWeek: r.dayOfWeek,
    slot: r.slot as ClassSlot,
    coachId: r.coachId,
    firstName: r.firstName,
    lastName: r.lastName,
  }));
}
