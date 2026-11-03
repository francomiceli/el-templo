/**
 * Calendario del Tablero semanal de gerencia (fase 206): funciones puras.
 *
 * Qué semana es "hoy" en Argentina, qué cierres corresponden un día dado, qué
 * etiqueta lleva cada bloque, si una foto se sacó tarde y qué semanas aceptan
 * leads. Todo recibe `now`/fechas por parámetro (sin leer el reloj ni la DB),
 * así se prueba con fechas fijas los 7 días de la semana.
 *
 * Fechas siempre `YYYY-MM-DD`. La aritmética usa `addDays`/`mondayOf` (mediodía
 * UTC / reloj local consistente), nunca `toISOString().slice(0, 10)` de "hoy".
 */
import { addDays, todayInTz } from "../shared/date-utils";
import { mondayOf } from "../shared/week-dates";

/**
 * Zona horaria del Tablero: Argentina, fija, sin importar la sede que se mire.
 * Espejo de `RENEWALS_TZ` del admin (`utils/renewals-week.ts`): la semana es de
 * lunes a domingo, igual que Renovaciones y Sesiones de prueba (D-06). NO son
 * las semanas ISO de Analíticas.
 */
export const BOARD_TZ = "America/Argentina/Buenos_Aires";

/**
 * Días de margen para el bloque "tardío" (Renovaciones y Embudo de la semana W).
 *
 * Decisión de Franco, 2026-11-03: "si se te vence el domingo, renovaciones
 * estaría cerrada para el jueves". El bloque tardío de W se congela al terminar
 * el jueves de W+1 (corrida del viernes 00:05 AR). Dato de prod (n=1812
 * vencimientos): de los que vuelven dentro de 90 días, el 79 % ya volvió al día
 * 3 y el 85 % al día 5. Se acepta la diferencia con la ventana "renovó" de 5
 * días de Renovaciones (D-09).
 */
export const LATE_MARGIN_DAYS = 4;

/** Bloque que se congela: el principal (lunes de W+1) o el tardío (viernes de W+1). */
export type BoardFreezeBlock = "main" | "late";

/** Etiqueta de un bloque en la pantalla. La decide la foto; la fecha solo elige la etiqueta. */
export type BoardBlockState =
  | "en_curso"
  | "provisorio"
  | "congelado"
  | "sin_foto";

/** Lunes de la semana (YYYY-MM-DD) que contiene el instante `now`, en hora de Argentina. */
export function currentWeekStart(now: Date = new Date()): string {
  return mondayOf(todayInTz(BOARD_TZ, now));
}

/** Rango lunes a domingo de la semana que empieza en `weekStart`. */
export function weekRange(weekStart: string): {
  dateFrom: string;
  dateTo: string;
} {
  return { dateFrom: weekStart, dateTo: addDays(weekStart, 6) };
}

/**
 * `true` si `date` es una fecha `YYYY-MM-DD` real y cae lunes. Lo usan las rutas
 * para rechazar con 400 semanas mal formadas (T-206-04).
 */
export function isMonday(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  // Round-trip por addDays: "2026-02-30" se desliza a marzo y deja de coincidir.
  if (addDays(date, 0) !== date) return false;
  return mondayOf(date) === date;
}

/**
 * Primer día en que el bloque tardío de la semana `weekStart` está congelado:
 * el viernes de W+1 (lunes + 7 + 4 días).
 */
export function lateFreezeDate(weekStart: string): string {
  return addDays(weekStart, 7 + LATE_MARGIN_DAYS);
}

/**
 * Cierres que corresponden el día `todayAr` (YYYY-MM-DD, hora de Argentina).
 *
 * - `main`: solo la semana inmediata anterior. Las más viejas NO se completan:
 *   una foto de deuda o activos sacada tarde mentiría (D-11).
 * - `late`: las semanas `W-2` y `W-1` cuyo viernes de cierre ya llegó, de la más
 *   vieja a la más nueva. Incluye W-2 para recuperar un viernes que el job no
 *   corrió (reintento el lunes siguiente).
 */
export function dueClosures(todayAr: string): {
  main: string[];
  late: string[];
} {
  const lastWeek = addDays(mondayOf(todayAr), -7);
  const candidates = [addDays(lastWeek, -7), lastWeek];
  return {
    main: [lastWeek],
    late: candidates.filter((w) => todayAr >= lateFreezeDate(w)),
  };
}

/**
 * Etiqueta de un bloque. La foto manda: si existe, es `congelado`. Sin foto, la
 * fecha solo elige la etiqueta:
 * - semana en curso → `en_curso`;
 * - principal de W-1 → `provisorio` (el job del lunes todavía puede cerrarlo);
 * - tardío de W-1 o W-2 → `provisorio` (el job del viernes todavía puede cerrarlo);
 * - el resto → `sin_foto` (semanas anteriores al deploy o cierre perdido).
 *
 * @throws RangeError si la semana es posterior a la semana en curso.
 */
export function resolveBlockState(input: {
  block: BoardFreezeBlock;
  weekStart: string;
  currentWeekStart: string;
  hasPhoto: boolean;
}): BoardBlockState {
  const { block, weekStart, currentWeekStart: current, hasPhoto } = input;
  if (weekStart > current) {
    throw new RangeError(`Semana futura: ${weekStart} > ${current}`);
  }
  if (weekStart === current) return "en_curso";
  if (hasPhoto) return "congelado";
  const prev = addDays(current, -7);
  if (weekStart === prev) return "provisorio";
  if (block === "late" && weekStart === addDays(current, -14)) {
    return "provisorio";
  }
  return "sin_foto";
}

/**
 * `true` si la foto se sacó después del día esperado: lunes de W+1 para el
 * bloque principal, viernes de W+1 (`lateFreezeDate`) para el tardío. Compara
 * el día en hora de Argentina de `capturedAt`, estrictamente posterior.
 */
export function isCapturedLate(
  block: BoardFreezeBlock,
  weekStart: string,
  capturedAt: Date,
): boolean {
  const expected =
    block === "main" ? addDays(weekStart, 7) : lateFreezeDate(weekStart);
  return todayInTz(BOARD_TZ, capturedAt) > expected;
}

/**
 * Los leads se editan en la semana en curso y en la anterior, nada más (D-24):
 * Nacho los carga en la reunión del lunes, después del cierre de las 00:05.
 */
export function isLeadsEditableWeek(
  weekStart: string,
  currentWeekStart: string,
): boolean {
  return (
    weekStart === currentWeekStart ||
    weekStart === addDays(currentWeekStart, -7)
  );
}

/**
 * Instante UTC de una hora de pared en Argentina (`date` YYYY-MM-DD, `hhmm`
 * HH:MM). Offset fijo -03:00: Argentina no tiene horario de verano desde 2009.
 * Pensado para armar `now` en tests.
 */
export function instantAtAr(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00-03:00`);
}
