/**
 * Cálculo puro del rango lunes–domingo para el filtro de Renovaciones.
 *
 * SPEC (Admin): "Semana en curso por default (lunes a domingo, calculada en
 * hora local de Argentina) + atajos Semana pasada / Esta semana / Semana que
 * viene." La hora de Argentina es fija a propósito (regla de negocio del
 * equipo que opera la pantalla), independiente de la sede/país que esté
 * mirando el admin — reusa `getMondayInTz` de `src/utils/tz.ts` (mismo
 * mecanismo DST-aware que ya usan Horarios/TV para "hoy" por sede).
 */
import { getMondayInTz } from './tz';

export const RENEWALS_TZ = 'America/Argentina/Buenos_Aires';

export interface WeekRange {
  dateFrom: string;
  dateTo: string;
}

/** Suma/resta días a una fecha "YYYY-MM-DD", vía mediodía UTC (evita drift de huso). */
function addDaysToIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Rango lunes–domingo de la semana actual desplazada `offsetWeeks` semanas
 * (0 = esta semana, -1 = semana pasada, 1 = semana que viene), en hora local
 * de Argentina.
 */
export function getWeekRange(offsetWeeks = 0, now: Date = new Date()): WeekRange {
  const monday = getMondayInTz(RENEWALS_TZ, now);
  const dateFrom = addDaysToIsoDate(monday, offsetWeeks * 7);
  const dateTo = addDaysToIsoDate(dateFrom, 6);
  return { dateFrom, dateTo };
}
