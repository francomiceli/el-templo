// Module: sessions
/**
 * Regla de tiempo de Aura de la sesión (fase 214, D-20).
 *
 * Entrenar en la app o cerrar un día del plan a medida acredita Aura solo si:
 *  - están todos los bloques que el alumno juega,
 *  - la duración medida por el servidor es al menos el 80 % del tiempo propuesto total,
 *  - el alumno no tiene ese día local una asistencia que acreditó Aura (D-64),
 *  - la otra fuente de la app no acreditó ya ese día (D-64).
 *
 * La regla condiciona SOLO el Aura: la sesión se guarda y la racha y el programa
 * avanzan igual. Franco eligió "solo tiempo total": no se manda tiempo por bloque.
 * La regla estricta (inicio registrado por el servidor, tiempo por bloque) está diferida.
 *
 * Decisiones de implementación:
 *  - Los bloques alternativos (`ALTERNATIVE_BLOCK_ROLES`) son para que el profe elija en
 *    la TV y la app no los muestra: no cuentan como bloque requerido ni como tiempo.
 *  - Bloques por repeticiones: por ejercicio `seconds > 0 ? seconds : reps x 3 s`, más el
 *    descanso, por `rounds` (o `totalRounds`), con mínimo de 60 s por bloque (copia de
 *    `blockMeta.ts` de la app).
 *  - Formatos con tope opcional: `min(estimación, tope)` (terminar rápido es legítimo).
 *  - `format_params` lo carga el staff sin validar: toda lectura es defensiva.
 *
 * Todo es puro: sin base de datos.
 */
import type { FormatParams } from "../admin/format-params";
import { toTimerSpec } from "../tv/timer-spec";
import { ALTERNATIVE_BLOCK_ROLES, type BlockPlan } from "./types";

/** Fracción mínima del tiempo propuesto que tiene que durar la sesión. */
export const AURA_TIME_RATIO = 0.8;
/** Segundos que se asumen por repetición cuando el ejercicio no declara tiempo. */
export const SECONDS_PER_REP = 3;
/** Piso del tiempo propuesto de un bloque. */
export const MIN_BLOCK_SECONDS = 60;
/** Un inicio de hace más que esto no es creíble. */
export const MAX_START_AGE_SEC = 12 * 3600;
/** Desfase de reloj tolerado hacia el futuro. */
export const MAX_START_FUTURE_SEC = 300;

/** Marcador que ningún `blocksCompleted` contiene: "no eligió ningún Deuteros". */
const DEUTEROS_MARKER = "DEUTEROS";

/** Formatos cuyo tope de tiempo es opcional: `toTimerSpec` los colapsa a `countdown` o `countup`. */
const OPTIONAL_CAP_TYPES: ReadonlySet<string> = new Set([
  "for_time",
  "for_max_reps",
  "for_max_distancia",
  "death_by",
  "death_by_unbroken",
  "rounds_for_time",
]);

function positiveNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** Lee un campo suelto de un JSON sin validar. */
function rawField(params: FormatParams | null, key: string): unknown {
  if (!params) return undefined;
  const record: Readonly<Record<string, unknown>> =
    params as unknown as Readonly<Record<string, unknown>>;
  return record[key];
}

/** Estimación por repeticiones de UNA pasada por rondas (copia de `estimatedMinutes` de la app, en segundos). */
function estimatedSeconds(
  exercises: BlockPlan["exercises"],
  params: FormatParams | null,
): number {
  let seconds = 0;
  for (const exercise of exercises) {
    const work =
      exercise.seconds > 0 ? exercise.seconds : exercise.reps * SECONDS_PER_REP;
    seconds += work + (exercise.rest > 0 ? exercise.rest : 0);
  }
  const rounds =
    positiveNumber(rawField(params, "rounds")) ??
    positiveNumber(rawField(params, "totalRounds"));
  return seconds * (rounds ?? 1);
}

/** Tiempo propuesto de un bloque en segundos (mínimo 60). */
export function proposedSecondsForBlock(
  block: Pick<BlockPlan, "exercises" | "formatParams">,
): number {
  const params: FormatParams | null = block.formatParams;
  const estimate = estimatedSeconds(block.exercises, params);
  let seconds: number;

  if (params && OPTIONAL_CAP_TYPES.has(params.type)) {
    const capMinutes = positiveNumber(rawField(params, "timeCapMinutes"));
    seconds =
      capMinutes !== null ? Math.min(estimate, capMinutes * 60) : estimate;
  } else {
    const spec = toTimerSpec(params, block.exercises.length);
    switch (spec.kind) {
      case "countdown":
        seconds = spec.totalMs / 1000;
        break;
      case "work_rest":
        seconds = ((spec.workMs + spec.restMs) * spec.rounds) / 1000;
        break;
      case "interval":
        seconds = (spec.intervalMs * spec.rounds) / 1000;
        break;
      case "countup":
        seconds = estimate;
        break;
    }
  }
  return Math.max(MIN_BLOCK_SECONDS, Math.round(seconds));
}

function isAlternative(block: Pick<BlockPlan, "role">): boolean {
  return ALTERNATIVE_BLOCK_ROLES.has(block.role);
}

/**
 * Roles de bloque que el alumno tenía que completar (copia de `playableBlocks` de
 * `useSessionPlayer.ts`). Con Deuteros en la sesión: INITIUM, NUCLEUS, el Deuteros
 * elegido y ATHLOS o EPIKOS; sin Deuteros: todos. Si hay Deuteros y `blocksCompleted`
 * no trae ninguno, se agrega el marcador "DEUTEROS" para que `blocksOk` dé false.
 */
export function requiredBlockRoles(
  blocks: readonly BlockPlan[],
  blocksCompleted: readonly string[],
): string[] {
  const visible = blocks.filter((b) => !isAlternative(b));
  const deuterosBlocks = visible.filter(
    (b) => b.role === "DEUTEROS_1" || b.role === "DEUTEROS_2",
  );
  if (deuterosBlocks.length === 0) return visible.map((b) => b.role);

  const roles: string[] = [];
  const initium = visible.find((b) => b.role === "INITIUM");
  const nucleus = visible.find((b) => b.role === "NUCLEUS");
  const finalBlock = visible.find(
    (b) => b.role === "ATHLOS" || b.role === "EPIKOS",
  );
  if (initium) roles.push(initium.role);
  if (nucleus) roles.push(nucleus.role);

  // Entre dos Deuteros completos se pide el de menor tiempo propuesto.
  const done = new Set(blocksCompleted);
  const chosen = deuterosBlocks
    .filter((b) => done.has(b.role))
    .sort((a, b) => proposedSecondsForBlock(a) - proposedSecondsForBlock(b))[0];
  roles.push(chosen ? chosen.role : DEUTEROS_MARKER);

  if (finalBlock) roles.push(finalBlock.role);
  return roles;
}

/** Tiempo propuesto total de los bloques requeridos (sin los alternativos). */
export function proposedSecondsForSession(
  blocks: readonly BlockPlan[],
  blocksCompleted: readonly string[],
): number {
  const required = new Set(requiredBlockRoles(blocks, blocksCompleted));
  let total = 0;
  for (const b of blocks) {
    if (isAlternative(b) || !required.has(b.role)) continue;
    total += proposedSecondsForBlock(b);
  }
  return total;
}

export type TrainingAuraReason =
  | "ok"
  | "sin_bloques"
  | "bloques_incompletos"
  | "inicio_invalido"
  | "tiempo_insuficiente"
  | "asistio_hoy"
  | "ya_sumo_hoy";

export interface TrainingAuraInput {
  blocks: readonly BlockPlan[];
  blocksCompleted: readonly string[];
  startedAt: Date;
  completedAt: Date;
  /** Hay una asistencia que acreditó Aura ese día local (D-64). */
  attendedToday: boolean;
  /** La otra fuente de la app (app o plan a medida) ya acreditó ese día (D-64). */
  otherAppAuraToday: boolean;
}

export interface TrainingAuraResult {
  awarded: boolean;
  reason: TrainingAuraReason;
  proposedSec: number;
  durationSec: number;
  ratio: number;
  blocksOk: boolean;
}

/** Decide si el cierre acredita Aura. Orden de chequeo fijo: ver `TrainingAuraReason`. */
export function evaluateTrainingAura(
  input: TrainingAuraInput,
): TrainingAuraResult {
  const { blocks, blocksCompleted, startedAt, completedAt } = input;
  const startMs = startedAt.getTime();
  const endMs = completedAt.getTime();

  const hasVisibleBlocks = blocks.some((b) => !isAlternative(b));
  const proposedSec = proposedSecondsForSession(blocks, blocksCompleted);
  const done = new Set(blocksCompleted);
  const blocksOk = requiredBlockRoles(blocks, blocksCompleted).every((role) =>
    done.has(role),
  );

  const startValid =
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    startMs - endMs <= MAX_START_FUTURE_SEC * 1000 &&
    endMs - startMs <= MAX_START_AGE_SEC * 1000;
  const durationSec =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(0, Math.floor((endMs - startMs) / 1000))
      : 0;
  const ratio =
    proposedSec > 0 ? Math.round((durationSec / proposedSec) * 100) / 100 : 0;

  let reason: TrainingAuraReason;
  if (!hasVisibleBlocks) reason = "sin_bloques";
  else if (!startValid) reason = "inicio_invalido";
  else if (!blocksOk) reason = "bloques_incompletos";
  else if (input.attendedToday) reason = "asistio_hoy";
  else if (input.otherAppAuraToday) reason = "ya_sumo_hoy";
  else if (durationSec < AURA_TIME_RATIO * proposedSec)
    reason = "tiempo_insuficiente";
  else reason = "ok";

  return {
    awarded: reason === "ok",
    reason,
    proposedSec,
    durationSec,
    ratio,
    blocksOk,
  };
}
