// Fase 197: extraído de sessions/routes.ts para que /weekly y la canasta compartan gate y forma
import { assembleVideoUrl } from "../shared/video-url";
import {
  gruposDeZonas,
  rutaSlugDe,
  zonaInputDe,
  zonasDelBloque,
} from "../anatomy/projection";
import { zoneHitsDelBloque } from "../anatomy/zone-hits";
import { toTimerSpec } from "../tv/timer-spec";
import type { BlockPlan, DaySession, ExercisePrescription } from "./types";
import { ALTERNATIVE_BLOCK_ROLES } from "./types";

/**
 * Convert a single block to its API response shape (shared by /daily, /weekly,
 * /:id and the free-block basket).
 */
export function blockToResponse(
  block: BlockPlan,
  idx: number,
  formatDescriptions: Map<string, string>,
) {
  // Separate main exercises from mobility
  const mainExercises = block.exercises.filter(
    (ex) => ex.exerciseType !== "mobility",
  );
  const mobilityEx = block.exercises.find(
    (ex) => ex.exerciseType === "mobility",
  );

  // Fase 197 D-10: zonas para la figura de Semana y la canasta; unión de los
  // main, ROM cae al fallback por rol, la movilidad no suma (igual que la TV).
  // Fase 200 D20: salen del modelo de anatomía (por ruta), un solo conversor.
  const insumos = mainExercises.map(zonaInputDe);
  const zones = zonasDelBloque(insumos, block.role);

  return {
    blockId: block.blockId,
    role: block.role,
    route: block.route,
    pattern: block.pattern,
    intensity: block.intensity,
    repsBudget: block.repsBudget,
    format: block.format?.name || block.format,
    formatParams: block.formatParams ?? null,
    // Reloj del bloque en el player: la misma normalización que la TV (fase 164),
    // así el app no conoce los ~50 formatos; solo pinta la fase (`phaseAt`).
    timerSpec: toTimerSpec(block.formatParams ?? null, mainExercises.length),
    formatDescription:
      formatDescriptions.get((block.format?.name || block.format) as string) ??
      null,
    sortOrder: idx,
    exercises: mainExercises.map((ex, exIdx) => ({
      exerciseId: ex.exerciseId,
      exerciseName: ex.name,
      contraction: ex.contraction,
      reps: ex.reps,
      repsMax: ex.repsMax ?? null,
      seconds: ex.seconds,
      secondsMax: ex.secondsMax ?? null,
      increment: ex.increment ?? null,
      rest: ex.rest,
      notes: ex.notes,
      videoUrl: assembleVideoUrl(ex.videoUrl),
      sortOrder: exIdx,
      // Player (sketch 027 D): la figura con los músculos del ejercicio de ahora
      rutaSlug: rutaSlugDe(ex),
    })),
    mobilityExercise: mobilityEx
      ? {
          exerciseId: mobilityEx.exerciseId,
          exerciseName: mobilityEx.name,
          contraction: mobilityEx.contraction,
          reps: mobilityEx.reps,
          repsMax: mobilityEx.repsMax ?? null,
          seconds: mobilityEx.seconds,
          secondsMax: mobilityEx.secondsMax ?? null,
          increment: mobilityEx.increment ?? null,
          rest: mobilityEx.rest,
          notes: mobilityEx.notes,
          videoUrl: assembleVideoUrl(mobilityEx.videoUrl),
          rutaSlug: rutaSlugDe(mobilityEx),
        }
      : null,
    zones,
    groups: gruposDeZonas(zones),
    // Fase 200 D17/D18: "Hoy en tu clase" (zona -> músculos por grupo de alumno)
    // calculado acá; el app solo lo pinta. Bloque sin ruta: INITIUM da {}, ROM
    // cae al mismo fallback por rol que las zonas (movilidad: true).
    zoneHits: zoneHitsDelBloque(insumos, block.role),
  };
}

export type SessionBlockResponse = ReturnType<typeof blockToResponse>;

/**
 * Convert DaySession to API response format
 */
export function sessionToResponse(
  session: DaySession,
  formatDescriptions: Map<string, string>,
  opts: { hideAlternativeBlocks?: boolean } = {},
) {
  // Rutas del alumno (/daily, /weekly): sin los bloques ALT de técnica/combos.
  // Se filtra antes de mapear para que blockCount y sortOrder queden contiguos.
  const blocks = opts.hideAlternativeBlocks
    ? session.blocks.filter((block) => !ALTERNATIVE_BLOCK_ROLES.has(block.role))
    : session.blocks;
  return {
    dayId: session.dayId,
    week: session.week,
    day: session.day,
    levelGroup: session.levelGroup,
    memberLevel: session.memberLevel,
    sessionMode: session.sessionMode || "regular",
    blockCount: blocks.length,
    blocks: blocks.map((block, idx) =>
      blockToResponse(block, idx, formatDescriptions),
    ),
  };
}
