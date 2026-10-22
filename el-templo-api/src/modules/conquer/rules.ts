/**
 * Fase 201: reglas de niveles, recortes y alertas de Conquer (puro).
 *
 * Cita: §2 (niveles), §2.2 y A13 (paso de nivel), §3.2 y A11 (combos y semana
 * del bloque), §5 y D-15 (alertas), §5.1 y A12 (recortes), §8.2 y D-14 (arranque
 * por nivel), A14 (niveles y dias).
 *
 * CERO imports: corre con node por type-stripping (ver test/conquer/oracle-check.mjs).
 * Sin enum, sin namespace, sin clases ni parameter properties.
 */

// ------------------------------------------------------------------ niveles

export const LEVELS = ["ternero", "novillo", "toro"] as const;
export type Level = (typeof LEVELS)[number];

/** A14: dias por semana validos para cada nivel (el sabado de Toro no cuenta). */
export const LEVEL_DAYS: Record<Level, readonly number[]> = {
  ternero: [2, 3],
  novillo: [3, 4],
  toro: [4],
};

export function isValidLevelDays(level: Level, days: number): boolean {
  return LEVEL_DAYS[level].includes(days);
}

/** §2: solo Toro tiene combos (y sabado). */
export function levelHasCombos(level: Level): boolean {
  return level === "toro";
}

/** ternero -> novillo -> toro -> null. */
export function nextLevel(level: Level): Level | null {
  const index = LEVELS.indexOf(level);
  return LEVELS[index + 1] ?? null;
}

// ----------------------------------------------------------------- umbrales

/** §5: molestia reportada desde este valor dispara la alerta roja. */
export const PAIN_ALERT_MIN = 4;
/** §5: dias sin entrenar para la alerta de inactivo. */
export const INACTIVE_DAYS = 7;
/** §6: cada cuantos dias se repite el control fisico. */
export const CHECK_INTERVAL_DAYS = 28;
/** §6: a los 42 dias sin control la alerta es "vencido". */
export const CHECK_OVERDUE_DAYS = 42;
/** §2.2: semanas seguidas con el plan completo para pasar de nivel. */
export const LEVEL_UP_WEEKS = 4;
/** D-14: semanas seguidas con el objetivo para ofrecer Subir en el combo (editable). */
export const DEFAULT_COMBO_WEEKS_N = 2;
/** §3.2: series del combo de apertura hasta la semana 2. */
export const OPENING_BASE = 3;
/** §3.2 / A11: series del combo de apertura desde la semana 3. */
export const OPENING_FROM_WEEK3 = 4;

// ---------------------------------------------------------- arranque (§8.2)

/** §8.2 / D-14: peldanos mas faciles que Toro con los que arranca cada nivel (editable). */
export const DEFAULT_START_OFFSET: Record<Level, number> = {
  ternero: 2,
  novillo: 1,
  toro: 0,
};

/**
 * Mueve `offset` peldanos activos hacia lo mas facil (posiciones mayores)
 * saltando los inactivos, sin pasarse del mas facil activo. `activePositions`
 * son solo las posiciones activas de la escalera, en cualquier orden.
 */
export function shiftStartPosition(
  toroPosition: number,
  offset: number,
  activePositions: readonly number[],
): number {
  if (offset <= 0) return toroPosition;
  const easier = activePositions
    .filter((p) => p > toroPosition)
    .sort((a, b) => a - b);
  if (easier.length === 0) return toroPosition;
  return easier[Math.min(offset, easier.length) - 1];
}

// ------------------------------------------------------------ recortes (§5.1)

/** §5.1 / A12: ultima etapa de recorte propia de Toro. */
export const MAX_TORO_CUT_STAGE = 5;

export const CUT_STAGE_LABELS: Record<number, string> = {
  1: "Sábado: drops de 10 a 6",
  2: "Sábado: series máximas de 3 a 2",
  3: "Sábado: se saca",
  4: "Combo de apertura: de 4 a 3",
  5: "Combo de apertura: se saca",
};

export type CutProposal =
  | { kind: "etapa"; stage: number; label: string }
  | { kind: "bajar_escalon"; label: string };

/**
 * A12: el orden de recorte se propone de a un paso. Toro recorre las etapas 1 a
 * 5 y despues baja un escalon. Ternero y Novillo solo bajan un escalon.
 */
export function cutProposal(level: Level, cutStage: number): CutProposal {
  if (level === "toro" && cutStage < MAX_TORO_CUT_STAGE) {
    const stage = cutStage + 1;
    return { kind: "etapa", stage, label: CUT_STAGE_LABELS[stage] };
  }
  return {
    kind: "bajar_escalon",
    label: "Bajar una progresión el escalón que dispara la molestia",
  };
}

/**
 * §3.2 / A11: series objetivo del combo de apertura. Solo Toro. 3 hasta la
 * semana 2 y 4 desde la 3. La etapa 4 lo baja a 3 y la 5 lo saca (`null`).
 */
export function openingTarget(
  level: Level,
  blockWeek: number,
  cutStage: number,
): number | null {
  if (!levelHasCombos(level)) return null;
  if (cutStage >= 5) return null;
  const base = blockWeek >= 3 ? OPENING_FROM_WEEK3 : OPENING_BASE;
  return cutStage >= 4 ? Math.min(base, OPENING_BASE) : base;
}

/**
 * §3.2 / §5.1: sabado de Toro = series maximas + drops. 3 + 10 = 13, y los
 * recortes 1 y 2 lo bajan a 9 y 8. La etapa 3 lo saca (`null`).
 */
export function saturdayPlan(
  level: Level,
  cutStage: number,
): { maxSeries: number; drops: number; target: number } | null {
  if (!levelHasCombos(level) || cutStage >= 3) return null;
  const drops = cutStage >= 1 ? 6 : 10;
  const maxSeries = cutStage >= 2 ? 2 : 3;
  return { maxSeries, drops, target: maxSeries + drops };
}

// ------------------------------------------------------------ alertas (§5)

export type AlertKind =
  | "molestia"
  | "caida"
  | "tope_escalera"
  | "paso_nivel"
  | "inactivo"
  | "control_vencido"
  | "control_dia0_pendiente";

export type Light = "rojo" | "amarillo" | "verde" | "ok";

/** §5 y D-15: severidad de cada alerta. */
export const ALERT_SEVERITY: Record<AlertKind, Exclude<Light, "ok">> = {
  molestia: "rojo",
  caida: "rojo",
  tope_escalera: "amarillo",
  inactivo: "amarillo",
  control_vencido: "amarillo",
  control_dia0_pendiente: "amarillo",
  paso_nivel: "verde",
};

export const ALERT_LABELS: Record<AlertKind, string> = {
  molestia: "Molestia",
  caida: "Caída",
  tope_escalera: "Tope de escalera",
  paso_nivel: "Paso de nivel",
  inactivo: "Inactivo",
  control_vencido: "Control físico vencido",
  control_dia0_pendiente: "Control día 0 pendiente",
};

const LIGHT_RANK: Record<Light, number> = {
  ok: 0,
  verde: 1,
  amarillo: 2,
  rojo: 3,
};

/** Semaforo del alumno: rojo > amarillo > verde > ok (sin alertas). */
export function worstLight(kinds: readonly AlertKind[]): Light {
  let worst: Light = "ok";
  for (const kind of kinds) {
    const light = ALERT_SEVERITY[kind];
    if (LIGHT_RANK[light] > LIGHT_RANK[worst]) worst = light;
  }
  return worst;
}
