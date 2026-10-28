/**
 * Fase 201: combos fijos de Toro (puro).
 *
 * Cita: §3.4 (los seis combos, sin armador), §3.2 (sábado de combos) y A17
 * (Vertical termina en "Hold de plancha": manda la síntesis, no el prototipo).
 * Los textos son los de `CMB` del oráculo (`ref/conquer-app.html`).
 *
 * CERO imports: corre con node por type-stripping (ver test/conquer/oracle-check.mjs).
 * Sin enum, sin namespace, sin clases ni parameter properties.
 */

/** Cuatro combos de apertura (uno por día del plan) y los dos del sábado. */
export const COMBO_KEYS = [
  "plancha",
  "front",
  "vertical",
  "dominadas",
  "push",
  "pull",
] as const;
export type ComboKey = (typeof COMBO_KEYS)[number];

export interface ComboDef {
  label: string;
  /** Press (sube y baja). */
  press: string;
  /** Push o pull del medio. */
  push: string;
  /** Hold final. */
  hold: string;
}

/** §3.4: Press -> Push/Pull -> Hold, tal cual el oráculo. */
export const COMBOS: Record<ComboKey, ComboDef> = {
  plancha: {
    label: "Plancha",
    press: "Press de plancha",
    push: "Push-up en plancha",
    hold: "Hold de plancha",
  },
  front: {
    label: "Front",
    press: "Press a front lever",
    push: "Pull-up en front lever",
    hold: "Hold de front lever",
  },
  vertical: {
    label: "Vertical",
    press: "90° press",
    push: "HSPU",
    hold: "Hold de plancha",
  },
  dominadas: {
    label: "Dominadas",
    press: "Press a front lever",
    push: "Muscle-up",
    hold: "Hold de front lever",
  },
  push: {
    label: "Push",
    press: "Press de plancha",
    push: "HSPU",
    hold: "Hold de plancha",
  },
  pull: {
    label: "Pull",
    press: "Press a front lever",
    push: "Muscle-up",
    hold: "Hold de front lever",
  },
};

/** §3.3: la progresión de arranque de todos los combos es un peldaño de Palanca. */
export const COMBO_LADDER_CODE = "palanca";

/** Default del oráculo (`comboProg`, `progPush`, `progPull`). */
export const DEFAULT_COMBO_RUNG_CODE = "straddle";

/** Clave y rótulo del sábado dentro del plan de la semana (solo Toro). */
export const SATURDAY_DAY_KEY = "sabado";
export const SATURDAY_LABEL = "Sábado";

/** §3.2 / anexo §9 (`sabado_calor`, byte a byte): entrada en calor del sábado. Fase 201 DA-14. */
export const SATURDAY_WARMUP =
  "10 a 15 min. Movilidad, escapulares y dos vueltas suaves del combo, lejos del fallo.";

export function isComboKey(value: unknown): value is ComboKey {
  return (COMBO_KEYS as readonly unknown[]).includes(value);
}
