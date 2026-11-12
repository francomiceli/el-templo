/**
 * Dosis de un estiramiento post-clase (fase 213, plan 14).
 *
 * Funcion pura: sin base ni reloj. La dosis sale de la plani del dia: si el
 * estiramiento esta prescrito ese dia se usa esa dosis, si no la dosis base,
 * que es la misma que usa el generador de movilidad (20 s si el ejercicio es
 * ISO, 10 repeticiones si no).
 *
 * El cruce es por NOMBRE normalizado (igual que la regla de seleccion) porque
 * `exercises` tiene varias filas por nombre.
 */
import { MOBILITY_DEFAULTS } from "./pipeline/utils/mobility-selection";
import { normalizarNombre } from "./stretch-selection";

/** Dosis base de un estiramiento ISO que no esta en la plani del dia. */
export const STRETCH_BASE_ISO_SECONDS = MOBILITY_DEFAULTS.ISO_SECONDS;

/** Dosis base (repeticiones) de un estiramiento no ISO fuera de la plani. */
export const STRETCH_BASE_REPS = MOBILITY_DEFAULTS.CON_REPS;

export interface StretchDose {
  unit: "seconds" | "reps";
  value: number;
  /** Tope del rango ("20 a 40 s"), o null si la dosis es un valor unico. */
  max: number | null;
}

/** Una prescripcion del dia, en el orden de la plani. */
export interface PrescripcionDelDia {
  nombre: string;
  reps: number | null;
  repsMax: number | null;
  seconds: number | null;
  secondsMax: number | null;
}

function tope(valor: number, max: number | null): number | null {
  return max !== null && max > valor ? max : null;
}

/**
 * La dosis que la plani del dia le da a `nombre`, o null si no esta prescrito
 * ese dia (o ninguna de sus filas trae dosis util). Gana la PRIMERA coincidencia
 * con dosis (segundos primero, despues repeticiones).
 */
export function dosisEnPlani(
  nombre: string,
  prescripciones: ReadonlyArray<PrescripcionDelDia>,
): StretchDose | null {
  const clave = normalizarNombre(nombre);
  for (const p of prescripciones) {
    if (normalizarNombre(p.nombre) !== clave) continue;
    const seconds = p.seconds ?? 0;
    if (seconds > 0) {
      return {
        unit: "seconds",
        value: seconds,
        max: tope(seconds, p.secondsMax),
      };
    }
    const reps = p.reps ?? 0;
    if (reps > 0) {
      return { unit: "reps", value: reps, max: tope(reps, p.repsMax) };
    }
  }
  return null;
}

/**
 * Decide la dosis de `nombre`: la de la plani del dia si esta prescrito, si no
 * la dosis base segun `baseEsIso`.
 */
export function dosisDeEstiramiento(
  nombre: string,
  prescripciones: ReadonlyArray<PrescripcionDelDia>,
  baseEsIso: boolean,
): StretchDose {
  const enPlani = dosisEnPlani(nombre, prescripciones);
  if (enPlani) return enPlani;
  return baseEsIso
    ? { unit: "seconds", value: STRETCH_BASE_ISO_SECONDS, max: null }
    : { unit: "reps", value: STRETCH_BASE_REPS, max: null };
}
