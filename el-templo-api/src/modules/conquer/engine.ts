/**
 * Fase 201 §4: motor de progresion puro de Conquer.
 *
 * Oraculo: next() de ref/conquer-app.html (copiado en
 * test/conquer/fixtures/conquer-app.html). Diferencias deliberadas con el
 * oraculo: A1 (dia del cambio), A2 (tope sin subida), A3 (un SUBIR por
 * ejercicio), A8 (acierto sobre todo el historial).
 *
 * CERO imports: corre con node por type-stripping (ver test/conquer/oracle-check.mjs).
 * Sin enum, sin namespace, sin clases ni parameter properties.
 *
 * El app NUNCA recalcula esto: pinta lo que manda el API.
 */

export type Unit = "reps" | "s";
export type StepKey = "e1" | "e2" | "e3" | "hold";
export type CountedStep = "e1" | "e2" | "e3";
export type Estado = "sin_datos" | "rango" | "techo1" | "bajo" | "subir";
export type Calibracion = "subir" | "quedarse" | "bajar";

/** §4.4: marca minima de la que parte un escalon sin historial. */
export const PISO = { reps: 3, s: 4 } as const;
/** §4.4: marca a partir de la cual se cuenta "techo". */
export const TECHO = { reps: 8, s: 12 } as const;
/** §4.4: incremento por defecto (editable por alumno). */
export const DEFAULT_INC = { reps: 1, s: 2 } as const;
/** A10: precarga del hold cuando no hay marcas. */
export const HOLD_PRELOAD_DEFAULT = 8;

/** Una marca de un escalon ya guardada. `date` es YYYY-MM-DD. */
export interface MarkRow {
  date: string;
  value: number;
  rungId: number;
  prevTarget: number | null;
}

/**
 * A1: marcas que cuentan desde el ultimo cambio de peldano.
 * Cuenta la fila si no hay cambio (`sinceDate === null`), si es posterior al
 * cambio, o si es del MISMO dia del cambio pero guardada con el peldano
 * actual (el alumno cambia el peldano antes de guardar hoy). La sesion que
 * dispara SUBIR, guardada con el peldano viejo, queda afuera.
 * Devuelve una copia ordenada por fecha ascendente.
 */
export function selectReales(
  rows: readonly MarkRow[],
  sinceDate: string | null,
  currentRungId: number,
): MarkRow[] {
  return rows
    .filter(
      (row) =>
        sinceDate === null ||
        row.date > sinceDate ||
        (row.date === sinceDate && row.rungId === currentRungId),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * §4.4: objetivo y estado de un escalon.
 * `values` = marcas cronologicas ya filtradas por `selectReales`.
 *  - sin marcas: piso / sin_datos
 *  - ultima y anteultima en el techo: piso / subir (S12-5: 6,7,8,8 -> 3)
 *  - ultima en el techo: techo / techo1
 *  - ultima bajo el piso: ultima + inc / bajo
 *  - resto: min(techo, ultima + inc) / rango
 */
export function nextTarget(
  values: readonly number[],
  unit: Unit,
  inc: number,
): { target: number; estado: Estado } {
  const piso = PISO[unit];
  const techo = TECHO[unit];
  if (values.length === 0) return { target: piso, estado: "sin_datos" };
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : 0;
  if (last >= techo && prev >= techo) return { target: piso, estado: "subir" };
  if (last >= techo) return { target: techo, estado: "techo1" };
  if (last < piso) return { target: last + inc, estado: "bajo" };
  return { target: Math.min(techo, last + inc), estado: "rango" };
}

/** A10: el hold no tiene objetivo ("al fallo"). Precarga = ultima marca o 8 s. */
export function holdPreload(values: readonly number[]): number {
  return values.length === 0 ? HOLD_PRELOAD_DEFAULT : values[values.length - 1];
}

/**
 * A2 / §4.5: siguiente peldano mas dificil (position 0 = mas dificil) entre
 * los activos. `null` si ya esta en el tope: no hay subida (el oraculo
 * entraba en un bucle infinito de SUBIR).
 */
export function harderPosition(
  activePositions: readonly number[],
  current: number,
): number | null {
  let best: number | null = null;
  for (const p of activePositions) {
    if (p < current && (best === null || p > best)) best = p;
  }
  return best;
}

/** Siguiente peldano mas facil entre los activos (el menor p > current), o `null`. */
export function easierPosition(
  activePositions: readonly number[],
  current: number,
): number | null {
  let best: number | null = null;
  for (const p of activePositions) {
    if (p > current && (best === null || p < best)) best = p;
  }
  return best;
}

/**
 * A3 / §4.5: por ejercicio solo ofrece SUBIR el primer escalon con estado
 * `subir`, en orden e1, e2, e3. El hold nunca sube.
 */
export function pickSubir(
  estados: Readonly<Record<CountedStep, Estado>>,
): CountedStep | null {
  const order: readonly CountedStep[] = ["e1", "e2", "e3"];
  for (const step of order) {
    if (estados[step] === "subir") return step;
  }
  return null;
}

/**
 * §4.3 / S12-4: calibracion de la primera sesion segun el E1.
 * reps: <3 bajar, 3..5 quedarse, >=6 subir. segundos: <4 bajar, 4..8 quedarse, >=9 subir.
 */
export function calibracion(e1: number, unit: Unit): Calibracion {
  const piso = unit === "reps" ? 3 : 4;
  const alto = unit === "reps" ? 6 : 9;
  if (e1 < piso) return "bajar";
  if (e1 >= alto) return "subir";
  return "quedarse";
}

/**
 * §5 / A6: caida del E1. Descarta la primera marca (calibracion) y exige al
 * menos tres restantes; true si las ultimas tres son estrictamente
 * decrecientes (a > b > c). `values` ya viene desde el ultimo cambio de peldano.
 */
export function caidaE1(values: readonly number[]): boolean {
  const rest = values.slice(1);
  if (rest.length < 3) return false;
  const a = rest[rest.length - 3];
  const b = rest[rest.length - 2];
  const c = rest[rest.length - 1];
  return a > b && b > c;
}

/**
 * §4.6 / A8: acierto sobre TODO el historial con prevTarget no nulo.
 * hits = value >= prevTarget. pct entero, delta = promedio de (value - prevTarget)
 * con 1 decimal. Sin pares validos: pct y delta null.
 */
export function accuracy(
  pairs: readonly { value: number; prevTarget: number | null }[],
): { n: number; hits: number; pct: number | null; delta: number | null } {
  let n = 0;
  let hits = 0;
  let sum = 0;
  for (const pair of pairs) {
    if (pair.prevTarget === null) continue;
    n += 1;
    if (pair.value >= pair.prevTarget) hits += 1;
    sum += pair.value - pair.prevTarget;
  }
  if (n === 0) return { n: 0, hits: 0, pct: null, delta: null };
  const delta = Math.round((sum / n) * 10) / 10;
  // Math.round(-0.3) da -0: se normaliza para no devolver un cero negativo.
  return {
    n,
    hits,
    pct: Math.round((100 * hits) / n),
    delta: delta === 0 ? 0 : delta,
  };
}
