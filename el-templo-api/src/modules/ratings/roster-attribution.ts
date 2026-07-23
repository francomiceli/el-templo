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
