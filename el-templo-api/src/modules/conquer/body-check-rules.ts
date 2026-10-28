// Módulo: conquer — reglas puras del control físico (Fase 201 §6, D-15)
//
// Copiado y adaptado de la 196 (D-04): 4 perímetros fijos (brazo, pecho,
// hombros, cintura) más el peso, sin tipos de medida configurables.
// Sin base, sin reloj y sin I/O: reciben fechas `YYYY-MM-DD` ya calculadas en
// la zona de la sede del alumno.
import { addDaysIso, daysBetweenIso } from "./calendar";
import { CHECK_INTERVAL_DAYS, CHECK_OVERDUE_DAYS } from "./rules";

export interface CheckDueResult {
  /** Último control con contenido + 28 días; null si todavía no hay ninguno. */
  nextDueDate: string | null;
  /** `today >= nextDueDate`. Saltearlo no bloquea nada (§6). */
  due: boolean;
  /** Más de 42 días desde el último control con contenido. */
  overdue: boolean;
}

/**
 * §6: el control se repite cada 4 semanas y a los 42 días sin control es
 * "vencido". Sin ningún control no hay "vencimiento": lo cubre el aviso del día 0
 * (`mustPromptDay0` / `day0Pending`).
 */
export function checkDue(input: {
  lastCheckDate: string | null;
  today: string;
}): CheckDueResult {
  if (input.lastCheckDate === null) {
    return { nextDueDate: null, due: false, overdue: false };
  }
  const nextDueDate = addDaysIso(input.lastCheckDate, CHECK_INTERVAL_DAYS);
  return {
    nextDueDate,
    due: input.today >= nextDueDate,
    overdue:
      daysBetweenIso(input.lastCheckDate, input.today) > CHECK_OVERDUE_DAYS,
  };
}

/** Las 5 medidas de un control, en el orden en que el comparador las muestra. */
export const MEASURE_KEYS = [
  "arm",
  "chest",
  "shoulders",
  "waist",
  "weight",
] as const;
export type MeasureKey = (typeof MEASURE_KEYS)[number];

const MEASURE_LABELS: Record<MeasureKey, string> = {
  arm: "Brazo",
  chest: "Pecho",
  shoulders: "Hombros",
  waist: "Cintura",
  weight: "Peso",
};

/** Lo que el comparador necesita de un control (números ya convertidos). */
export interface ComparableCheck {
  id: number;
  checkDate: string;
  armCm: number | null;
  chestCm: number | null;
  shouldersCm: number | null;
  waistCm: number | null;
  weightKg: number | null;
}

export interface MeasureComparison {
  key: MeasureKey;
  label: string;
  from: number | null;
  to: number | null;
  /** `to - from` con 1 decimal; null si falta alguna de las dos marcas. */
  diff: number | null;
}

export interface CheckComparison {
  from: { id: number; checkDate: string };
  to: { id: number; checkDate: string };
  /** Semanas enteras entre los dos controles (valor absoluto). */
  weeks: number;
  measures: MeasureComparison[];
}

function measureOf(check: ComparableCheck, key: MeasureKey): number | null {
  switch (key) {
    case "arm":
      return check.armCm;
    case "chest":
      return check.chestCm;
    case "shoulders":
      return check.shouldersCm;
    case "waist":
      return check.waistCm;
    case "weight":
      return check.weightKg;
  }
}

/** Décimas enteras: evita que 80.4 - 82.0 dé -1.5999999999999943. */
function tenths(value: number): number {
  return Math.round(value * 10);
}

/**
 * §6: compara dos controles. Siempre devuelve las 5 medidas (para que el app
 * pinte la fila aunque falte un dato); `diff` es `to - from` con 1 decimal y
 * null si alguna de las dos no se cargó.
 */
export function compareChecks(
  from: ComparableCheck,
  to: ComparableCheck,
): CheckComparison {
  const measures = MEASURE_KEYS.map((key): MeasureComparison => {
    const a = measureOf(from, key);
    const b = measureOf(to, key);
    return {
      key,
      label: MEASURE_LABELS[key],
      from: a,
      to: b,
      diff: a === null || b === null ? null : (tenths(b) - tenths(a)) / 10,
    };
  });
  return {
    from: { id: from.id, checkDate: from.checkDate },
    to: { id: to.id, checkDate: to.checkDate },
    weeks: Math.floor(
      Math.abs(daysBetweenIso(from.checkDate, to.checkDate)) / 7,
    ),
    measures,
  };
}

/** Orden cronológico estable: por fecha y, a igual fecha, por id. */
function byDateThenId(
  a: { checkDate: string; id: number },
  b: { checkDate: string; id: number },
): number {
  if (a.checkDate !== b.checkDate) return a.checkDate < b.checkDate ? -1 : 1;
  return a.id - b.id;
}

/**
 * §6: el comparador abre en "día 0 vs. el más reciente". Recibe SOLO controles
 * con contenido. Menos de 2: null.
 */
export function defaultComparePair<T extends { id: number; checkDate: string }>(
  checks: readonly T[],
): [T, T] | null {
  if (checks.length < 2) return null;
  const sorted = [...checks].sort(byDateThenId);
  return [sorted[0], sorted[sorted.length - 1]];
}
