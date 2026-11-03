/**
 * Textos, formato y reglas de color del Tablero semanal de gerencia (fase 206-08).
 *
 * Todo lo que es etiqueta, nota, formato de número, delta ▲▼ o selector de semana
 * vive acá, sin Vue: la pantalla (206-09) solo dibuja. Los números ya vienen
 * calculados del API (totales, porcentajes, variación); acá solo se muestran.
 */

import { formatPrice } from 'src/utils/format-price';
import { RENEWALS_TZ, getWeekRange } from 'src/utils/renewals-week';
import { dowInTz } from 'src/utils/tz';
import type {
  BoardBlockState,
  BoardCell,
  BoardMetricBlock,
  BoardMetricKey,
  BoardMetricUnit,
  CountryCurrency,
} from 'src/types/weekly-board';

export const METRIC_LABELS: Record<BoardMetricKey, string> = {
  leads: 'Leads',
  reservas: 'Reservas',
  asistieron: 'Asistieron',
  compraron: 'Compraron',
  pctReserva: '% Reserva',
  pctAsistencia: '% Asistencia',
  pctCierre: '% Cierre',
  pctConversion: '% Conversión total',
  vencimientos: 'Vencimientos',
  renovaron: 'Renovaron',
  noRenueva: 'No renueva',
  volvioTarde: 'Volvió tarde',
  sinContactar: 'Sin contactar',
  pctRenovacion: '% Renovación',
  vencenSemanaSiguiente: 'Vencen la semana que viene',
  cobrado: 'Cobrado en la semana',
  deudaCobrable: 'Deuda cobrable',
  deudaMas10: 'Deuda de más de 10 días',
  deudaIncobrable: 'Incobrable',
  activos: 'Alumnos activos',
  variacionActivos: 'Variación de activos',
};

export const BLOCK_LABELS: Record<BoardMetricBlock, string> = {
  embudo: 'Embudo',
  renovaciones: 'Renovaciones',
  caja: 'Caja',
  alumnos: 'Alumnos',
};

/** Tooltip de la fila para las métricas con regla de sede especial (D-05, D-13, D-14, D-20, D-21, D-25, D-26, D-29). */
export const METRIC_NOTES: Partial<Record<BoardMetricKey, string>> = {
  leads: 'Carga manual por sede. Sin leads, % Reserva queda en —.',
  reservas: 'Cuenta en la sede de la clase de prueba, igual que Sesiones de prueba.',
  pctCierre: 'Compraron con asistencia sobre asistieron, igual que Sesiones de prueba.',
  vencimientos: 'Por sede del alumno: puede diferir de Renovaciones filtrada por sede.',
  sinContactar: 'Tiene que estar en 0.',
  cobrado:
    'Por sede del alumno: no coincide con Caja por sede. Total de sedes físicas, sin Online.',
  deudaCobrable:
    'Foto del momento: la de hoy en la semana en curso, la del cierre en las cerradas.',
  activos: 'Foto del momento, igual que Analíticas.',
  variacionActivos: 'Contra la foto de la semana anterior.',
};

/**
 * ¿Subir es bueno? `true` = sí, `false` = no (deuda y no renueva suben = malo),
 * `null` = neutro (no es ni bueno ni malo, ej. cuántos vencen).
 */
export const HIGHER_IS_BETTER: Record<BoardMetricKey, boolean | null> = {
  leads: true,
  reservas: true,
  asistieron: true,
  compraron: true,
  pctReserva: true,
  pctAsistencia: true,
  pctCierre: true,
  pctConversion: true,
  vencimientos: null,
  renovaron: true,
  noRenueva: false,
  volvioTarde: false,
  sinContactar: false,
  pctRenovacion: true,
  vencenSemanaSiguiente: null,
  cobrado: true,
  deudaCobrable: false,
  deudaMas10: false,
  deudaIncobrable: false,
  activos: true,
  variacionActivos: true,
};

/** `null` = "—" (sin dato, nunca 0). Plata en la moneda del grupo; % sin decimales. */
export function formatBoardValue(
  value: number | null,
  unit: BoardMetricUnit,
  currency: CountryCurrency
): string {
  if (value === null) return '—';
  if (unit === 'money') return formatPrice(value, currency);
  if (unit === 'pct') return `${Math.round(value)} %`;
  return value.toLocaleString('es-AR');
}

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface BoardDelta {
  diff: number | null;
  direction: DeltaDirection | null;
  label: string;
}

function signOf(n: number): '+' | '−' | '' {
  if (n > 0) return '+';
  if (n < 0) return '−';
  return '';
}

/**
 * Diferencia contra la semana anterior. Si falta uno de los dos lados no hay
 * flecha ni texto. En porcentajes la diferencia es en puntos porcentuales y la
 * dirección sale del valor redondeado (para que no haya ▲ con "+0 pp").
 */
export function boardDelta(
  cell: BoardCell,
  unit: BoardMetricUnit,
  currency: CountryCurrency
): BoardDelta {
  if (cell.value === null || cell.previous === null) {
    return { diff: null, direction: null, label: '' };
  }
  const diff = cell.value - cell.previous;

  if (unit === 'pct') {
    const rounded = Math.round(diff);
    return {
      diff,
      direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
      label: `${signOf(rounded)}${Math.abs(rounded)} pp`,
    };
  }

  const direction: DeltaDirection = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const abs = Math.abs(diff);
  const body = unit === 'money' ? formatPrice(abs, currency) : abs.toLocaleString('es-AR');
  return { diff, direction, label: `${signOf(diff)}${body}` };
}

/** Color del ▲▼ según si subir es bueno o malo para esa métrica. */
export function deltaTone(
  key: BoardMetricKey,
  direction: DeltaDirection | null
): 'positive' | 'negative' | 'neutral' {
  const higherIsBetter = HIGHER_IS_BETTER[key];
  if (higherIsBetter === null || direction === null || direction === 'flat') return 'neutral';
  const isGood = (direction === 'up') === higherIsBetter;
  return isGood ? 'positive' : 'negative';
}

/** La pantalla reemplaza `{fecha}` con `freezesOn` (D-09). */
export const BLOCK_STATE_LABELS: Record<BoardBlockState, { label: string; tooltip: string }> = {
  en_curso: { label: 'En curso', tooltip: 'Se calcula en vivo.' },
  provisorio: {
    label: 'Provisorio',
    tooltip: 'Todavía puede cambiar: se congela el {fecha}.',
  },
  congelado: { label: 'Cerrada', tooltip: 'Foto del cierre, no cambia más.' },
  sin_foto: {
    label: 'Sin foto',
    tooltip:
      'Semana anterior al Tablero: deuda y alumnos sin historia; el resto se calcula en vivo.',
  },
};

/** "YYYY-MM-DD" -> "dd/mm", partiendo el string (sin Date local, sin corrimiento de huso). */
function ddmm(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Opciones del selector: la semana en curso primero, después las anteriores
 * (lunes a domingo, hora de Argentina, D-06/D-07). `value` = lunes (YYYY-MM-DD).
 *
 * Ojo: `getWeekRange` (vía `getMondayInTz`) trata el domingo como el comienzo de
 * la semana siguiente (convención Lun–Sáb de Horarios). El Tablero es Lun–Dom y
 * el API pediría una semana futura (400), así que el domingo se ancla al sábado
 * anterior, que cae en la misma semana lunes a domingo.
 */
export function weekOptions(
  count = 12,
  now: Date = new Date()
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const anchor = dowInTz(RENEWALS_TZ, now) === 7 ? new Date(now.getTime() - DAY_MS) : now;
  for (let i = 0; i < count; i++) {
    const { dateFrom, dateTo } = getWeekRange(-i, anchor);
    const from = ddmm(dateFrom);
    const to = ddmm(dateTo);
    let label: string;
    if (i === 0) label = `Esta semana (${from} – ${to})`;
    else if (i === 1) label = `Semana pasada (${from} – ${to})`;
    else label = `Semana del ${from} al ${to}`;
    options.push({ value: dateFrom, label });
  }
  return options;
}
