/**
 * Fase 201 (Conquer): helpers de texto y fecha compartidos por el tablero, los pedidos y (201-22/23)
 * la ficha. Puros: sin Vue, sin red.
 */

import type {
  AlertKind,
  AlertSeverity,
  BodyCheckView,
  CutProposal,
  Estado,
  Mode,
  Pose,
  Unit,
} from 'src/types/conquer';

const DAY_MS = 86_400_000;

/** Número de día (desde 1970) en calendario local, para restar fechas sin lío de horas. */
function localDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

/**
 * Días enteros desde `value` hasta `now`. Acepta `YYYY-MM-DD` (fecha sin hora) o un ISO-8601.
 * Nunca negativo. `null` si el valor no se puede leer.
 */
export function daysSince(value: string | null, now: Date = new Date()): number | null {
  if (value === null) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  let thenDay: number;
  if (dateOnly) {
    thenDay = Math.floor(
      Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) / DAY_MS
    );
  } else {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    thenDay = localDayNumber(parsed);
  }
  return Math.max(0, localDayNumber(now) - thenDay);
}

/** "hoy", "ayer" o "hace N días". */
export function agoText(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

/** Nombre completo para listas; vacío si el alumno no tiene ni nombre ni apellido. */
export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/** Etiquetas del estado que calcula el motor (mismo copy que ve el alumno). */
export const ESTADO_LABELS: Record<Estado, string> = {
  subir: 'Subir de progresión',
  techo1: 'Techo 1 de 2',
  bajo: 'Bajo el piso',
  rango: 'En rango',
  sin_datos: 'Sin datos',
};

export const MODE_LABELS: Record<Mode, string> = {
  completa: 'Completa',
  negativa: 'Negativa',
  hold: 'Hold',
};

export const POSE_LABELS: Record<Pose, string> = {
  frente: 'Frente',
  perfil: 'Perfil',
  espalda: 'Espalda',
};

export const POSES: Pose[] = ['frente', 'perfil', 'espalda'];

/** "8 reps", "1 rep", "12 s", "6 por lado". `null` = todavía sin marca. */
export function markText(value: number | null, unit: Unit, unilateral: boolean): string {
  if (value === null) return '—';
  if (unit === 's') return unilateral ? `${value} s por lado` : `${value} s`;
  if (unilateral) return `${value} por lado`;
  return value === 1 ? '1 rep' : `${value} reps`;
}

/** Diferencia con signo para la tabla de medidas: "+2 cm", "-1,5 kg", "sin cambio". */
export function diffText(diff: number | null, unit: 'cm' | 'kg'): string {
  if (diff === null) return '—';
  if (diff === 0) return 'sin cambio';
  const sign = diff > 0 ? '+' : '-';
  return `${sign}${String(Math.abs(diff)).replace('.', ',')} ${unit}`;
}

/** Medida con unidad, o "—" si falta. */
export function measureText(value: number | null, unit: 'cm' | 'kg'): string {
  return value === null ? '—' : `${String(value).replace('.', ',')} ${unit}`;
}

/** Semanas entre dos controles: "1 semana" / "N semanas". */
export function weeksText(weeks: number): string {
  return weeks === 1 ? '1 semana' : `${weeks} semanas`;
}

/** Color de Quasar del chip de una alerta según su severidad (tokens cálidos del admin). */
export const SEVERITY_CHIP_COLOR: Record<AlertSeverity, string> = {
  rojo: 'negative',
  amarillo: 'warning',
  verde: 'positive',
};

/** Qué puede hacer el coach con una alerta desde la ficha (§5, §5.1, §2.2). */
export type AlertActionKind =
  | 'aceptar_etapa'
  | 'bajar_escalon'
  | 'sin_recorte'
  | 'extender_escalera'
  | 'confirmar_nivel'
  | 'aviso';

/** Anexo §8 (201-26 DA-12): Toro después de la etapa 5 no tiene propuesta de recorte. */
export const NO_CUT_TEXT = 'Toro no tiene más pasos de recorte: escribile';

/**
 * Acción principal de una alerta. Molestia y caída proponen el recorte vigente del alumno (una
 * etapa del sábado/combo o bajar un escalón); con `cutKind === null` (Toro tras la etapa 5) no hay
 * recorte y la acción es escribirle al alumno; el tope de escalera se resuelve en el Catálogo; el
 * paso de nivel se confirma solo si hay un nivel siguiente; el resto son avisos por tiempo.
 */
export function alertActionKind(
  kind: AlertKind,
  cutKind: CutProposal['kind'] | null,
  hasNextLevel: boolean
): AlertActionKind {
  if (kind === 'molestia' || kind === 'caida') {
    if (cutKind === null) return 'sin_recorte';
    return cutKind === 'etapa' ? 'aceptar_etapa' : 'bajar_escalon';
  }
  if (kind === 'tope_escalera') return 'extender_escalera';
  if (kind === 'paso_nivel' && hasNextLevel) return 'confirmar_nivel';
  return 'aviso';
}

/** Lo que propone §5 para las alertas que no tienen botón propio. */
export const ALERT_HINTS: Partial<Record<AlertKind, string>> = {
  inactivo: 'Escribirle al alumno',
  control_vencido: 'Recordarle el control físico',
  control_dia0_pendiente: 'Recordarle el control del día 0',
  tope_escalera: 'Extendé la escalera desde Catálogo',
};

/** Un control "con contenido" tiene al menos una foto o una medida (el de hoy puede estar vacío). */
export function checkHasContent(check: BodyCheckView): boolean {
  const hasPhoto = POSES.some((p) => check.photos[p]);
  const hasMeasure = [
    check.armCm,
    check.chestCm,
    check.shouldersCm,
    check.waistCm,
    check.weightKg,
  ].some((v) => v !== null);
  return hasPhoto || hasMeasure;
}

/** Poses (en orden frente, perfil, espalda) con foto en al menos uno de los controles. */
export function posesWithPhotos(checks: (BodyCheckView | null)[]): Pose[] {
  return POSES.filter((p) => checks.some((c) => c !== null && c.photos[p]));
}

/** Pose que se muestra de un control en la galería: frente si hay, si no la primera con foto. */
export function galleryPose(check: BodyCheckView | null): Pose | null {
  return check === null ? null : (POSES.find((p) => check.photos[p]) ?? null);
}
