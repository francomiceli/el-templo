/**
 * Canonical block roster of the branch TV (phase 164).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUPLICACION ACEPTADA A PROPOSITO — espejo de
 * `el-templo-admin/src/utils/pdf/session-data-transformer.ts`.
 *
 * El orden canonico de roles, la fuente determinista del INITIUM
 * (`INITIUM_SOURCE_ORDER`) y el alias EPIKOS/ATHLOS viven tambien en ese
 * archivo, que corre en el browser del admin y NO puede importar modulos del
 * server. Todo cambio de orden/alias alla REQUIERE el cambio espejo aca (y al
 * reves). Es la unica copia tolerada: cualquier tercera garantiza divergencia.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Por que vive en el API y no en el kiosco: el bundle ES2015 del televisor no
 * tiene test runner. Toda decision derivable (que bloques hay, en que orden y
 * como se rotulan) se resuelve aca, donde vitest la cubre.
 *
 * Pitfall 1: el bloque se identifica SIEMPRE por su rol canonico, nunca por un
 * indice. Dos niveles del mismo dia pueden tener rosters de largo distinto, asi
 * que un indice guardado saltaria a otro bloque al cambiar de nivel.
 */
import { formatParamsLabel, type FormatParams } from "../admin/format-params";
import { TRAINING_LEVELS } from "../shared/training-constants";
import type { TvBlockSummary, TvClassMode } from "./types";

/** Orden canonico de un dia habil. */
export const REGULAR_ROLES = [
  "INITIUM",
  "NUCLEUS",
  "DEUTEROS_1",
  "DEUTEROS_2",
  "EPIKOS",
] as const;

/**
 * Orden canonico de un dia ROM (sabado, D-23). No hay NUCLEUS/DEUTEROS/EPIKOS:
 * el dia se estructura por zona del cuerpo y solo existen dos tiers.
 */
export const ROM_ROLES = [
  "INITIUM",
  "ROM_LOWER",
  "ROM_CORE",
  "ROM_UPPER",
] as const;

/**
 * El INITIUM es la lista compartida del dia: se muestra UNA vez para todos los
 * niveles. Desde el fix de generacion post-v5.1 sale identico en todas las
 * sesiones, pero semanas viejas o ediciones manuales pueden divergir — por eso
 * la fuente se elige con orden determinista (alfa = canonico) en vez de tomar
 * la primera sesion que llegue de la DB (orden de filesort, no garantizado).
 */
export const INITIUM_SOURCE_ORDER = ["alfa", "delta", "sigma", "kairos"];

/**
 * Etiqueta visible de cada rol.
 *
 * INITIUM se rotula PYROS (decision v8 del UI-SPEC): es "un bloque mas", no una
 * pagina especial, y jamas se lo nombra con el termino generico de entrada en
 * calor. Las etiquetas ROM son las mismas que imprime el PDF.
 */
const ROLE_LABELS: Record<string, string> = {
  INITIUM: "PYROS",
  NUCLEUS: "NUCLEUS",
  DEUTEROS_1: "DEUTEROS I",
  DEUTEROS_2: "DEUTEROS II",
  EPIKOS: "EPIKOS",
  ATHLOS: "ATHLOS",
  ROM_LOWER: "TREN INFERIOR",
  ROM_CORE: "ZONA MEDIA",
  ROM_UPPER: "TREN SUPERIOR",
};

/**
 * Forma minima de un bloque que el roster necesita. `class-day.ts` devuelve
 * filas de `session_blocks` hidratadas, que son asignables a esto de manera
 * estructural: el roster no depende de drizzle.
 */
export interface RosterBlock {
  role: string;
  formatName: string;
  formatParams: FormatParams | null;
  customTitle: string | null;
}

export interface RosterSession<TBlock extends RosterBlock = RosterBlock> {
  memberLevel: string;
  blocks: TBlock[];
}

export interface RosterClassDay<TBlock extends RosterBlock = RosterBlock> {
  mode: TvClassMode;
  sessions: RosterSession<TBlock>[];
}

/**
 * Buscar un bloque por rol dentro de una sesion.
 *
 * "EPIKOS" matchea tambien "ATHLOS": son el mismo slot final del dia con dos
 * nombres historicos. Sin este alias el ultimo bloque simplemente desaparece
 * del TV en todas las sesiones que usan ATHLOS.
 */
export function findBlock<TBlock extends RosterBlock>(
  blocks: TBlock[],
  role: string,
): TBlock | undefined {
  if (role === "EPIKOS") {
    return blocks.find((b) => b.role === "EPIKOS" || b.role === "ATHLOS");
  }
  return blocks.find((b) => b.role === role);
}

/** El INITIUM canonico: primer nivel de INITIUM_SOURCE_ORDER que tenga uno. */
export function findInitiumBlock<TBlock extends RosterBlock>(
  sessions: RosterSession<TBlock>[],
): TBlock | undefined {
  const byLevel = new Map(sessions.map((s) => [s.memberLevel, s]));
  for (const level of INITIUM_SOURCE_ORDER) {
    const block = byLevel.get(level)?.blocks.find((b) => b.role === "INITIUM");
    if (block) return block;
  }
  // Fallback: cualquier sesion con INITIUM (cubre niveles fuera de la lista).
  for (const s of sessions) {
    const block = s.blocks.find((b) => b.role === "INITIUM");
    if (block) return block;
  }
  return undefined;
}

/**
 * El bloque canonico de un rol NO compartido: el del primer nivel presente en
 * el orden canonico de niveles (kairos-first), que es el que muestra el editor
 * de sesiones. El formato se guarda por nivel y un intercambio de bloque toca
 * uno solo, asi que sin una fuente determinista el titulo del TV podria
 * contradecir lo que el profe ve en el editor.
 */
function findCanonicalBlock<TBlock extends RosterBlock>(
  role: string,
  sessions: RosterSession<TBlock>[],
): TBlock | undefined {
  const byLevel = new Map(sessions.map((s) => [s.memberLevel, s]));
  for (const level of TRAINING_LEVELS) {
    const session = byLevel.get(level);
    if (!session) continue;
    const block = findBlock(session.blocks, role);
    if (block) return block;
  }
  // Fallback: niveles fuera del orden canonico (datos viejos).
  for (const s of sessions) {
    const block = findBlock(s.blocks, role);
    if (block) return block;
  }
  return undefined;
}

/**
 * Titulo del bloque: `ETIQUETA · FORMATO`.
 *
 * Fase 100: un INITIUM con `customTitle` (formato de juegos) manda su propio
 * titulo tal cual, igual que en el PDF. Cuando el bloque es ATHLOS se rotula
 * con su propio nombre aunque su rol canonico sea EPIKOS.
 */
export function blockTitle(role: string, block: RosterBlock): string {
  if (role === "INITIUM" && block.customTitle) return block.customTitle;
  const label = ROLE_LABELS[block.role] ?? ROLE_LABELS[role] ?? role;
  const format = block.formatParams
    ? formatParamsLabel(block.formatParams)
    : block.formatName;
  return `${label} · ${format}`;
}

/**
 * Roster de bloques del dia, en orden canonico por ROL.
 *
 * Solo entran los roles efectivamente presentes en alguna sesion: una sesion
 * sin DEUTEROS_2 produce un roster de 4 bloques, y los dots "BLOQUE n / M" del
 * TV cuentan sobre ese largo real.
 *
 * `shared: true` solo en INITIUM — es la lista comun a todos los niveles, y es
 * lo que deshabilita el selector de nivel en el control del profe.
 */
export function buildRoster<TBlock extends RosterBlock>(
  classDay: RosterClassDay<TBlock>,
): TvBlockSummary[] {
  const roles: readonly string[] =
    classDay.mode === "rom" ? ROM_ROLES : REGULAR_ROLES;
  const roster: TvBlockSummary[] = [];

  for (const role of roles) {
    const block =
      role === "INITIUM"
        ? findInitiumBlock(classDay.sessions)
        : findCanonicalBlock(role, classDay.sessions);
    if (!block) continue;
    roster.push({
      role,
      title: blockTitle(role, block),
      shared: role === "INITIUM",
    });
  }

  return roster;
}
