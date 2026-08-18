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
 *
 * Las etiquetas visibles (`ROLE_LABELS`) NO viven mas aca: fase 160 (SEM-11,
 * D160-03) las centralizo en `../shared/role-labels.ts`, la fuente unica de
 * labels del API (consumida tambien por el badge de `admin/service.ts`).
 */
import { formatNameWithParams, type FormatParams } from "../admin/format-params";
import { ROLE_LABELS } from "../shared/role-labels";
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
 * Orden canonico de un dia COMBOS (fase 160, SEM-15; cierre FB UAT
 * 2026-08-18). El cierre es el circuito full-body con la alternancia del
 * pipeline regular (ATHLOS semanas impares / EPIKOS pares) — ambos roles van
 * en la lista y `buildRoster` saltea el ausente. Dias combos viejos (pre-FB)
 * cerraban con STRETCHING: se mantiene al final para que sigan rendereando.
 */
export const COMBOS_ROLES = [
  "INITIUM",
  "COMBOS_I",
  "COMBOS_II",
  "ATHLOS",
  "EPIKOS",
  "STRETCHING",
] as const;

/**
 * Orden canonico de un dia TECNICA (fase 160, SEM-15). STRETCHING es la lista
 * de cierre compartida por los 6 niveles (D160-04), tratada como shared igual
 * que INITIUM.
 */
export const TECNICA_ROLES = [
  "INITIUM",
  "TECNICA_I",
  "TECNICA_II",
  "STRETCHING",
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
 * Pares de nivel del TV (fase 164 rediseño — dos columnas lado a lado). Espejo
 * a propósito de `levelPairs` en
 * `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` (`buildDeuterosSplitPages`,
 * ~línea 847), con el tercer par agregado: el PDF nunca imprime omega/spartan
 * porque no se planifican por día (`REGULAR_LEVEL_ORDER` en `class-day.ts`),
 * pero el TV deriva sus columnas de `pairFor` sin asumir cuáles pares tienen
 * datos — mantener el tercero acá es más simple que dos listas distintas.
 */
export const LEVEL_PAIRS: readonly (readonly [string, string])[] = [
  ["alfa", "delta"],
  ["sigma", "kairos"],
  ["omega", "spartan"],
];

/**
 * El par que contiene `level`, en el orden del par (no el orden de llegada).
 *
 * Defensivo: un nivel que no está en ningún par (dato futuro, o un ROM
 * "alfa"/"delta" — que SÍ están acá, correctamente) devuelve `[level]` solo,
 * para que el caller nunca se quede sin columna.
 */
export function pairFor(level: string): readonly string[] {
  for (const pair of LEVEL_PAIRS) {
    if (pair.includes(level)) return pair;
  }
  return [level];
}

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
 * Clave de "bloque visual": DEUTEROS_1 y DEUTEROS_2 son dos CAMINOS del mismo
 * bloque (el profe elige uno u otro para la clase), no dos bloques distintos.
 * Colapsan a la misma clave para que los puntitos "BLOQUE n / M" cuenten 4 y
 * no 5, y para decidir si cambiar de rol reinicia el cronometro (pasar de un
 * camino al otro NO deberia, es el mismo bloque). El resto de los roles es su
 * propia clave — no hay mas grupos que colapsar hoy.
 */
export function visualGroupOf(role: string): string {
  return role === "DEUTEROS_1" || role === "DEUTEROS_2" ? "DEUTEROS" : role;
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
 *
 * El FORMATO usa `formatNameWithParams`, que es un espejo a proposito de
 * `formatNameWithParams` en
 * `el-templo-admin/src/utils/pdf/session-data-transformer.ts` — la etiqueta
 * del bloque en la TV tiene que ser identica a la del PDF de planis.
 */
export function blockTitle(role: string, block: RosterBlock): string {
  if (role === "INITIUM" && block.customTitle) return block.customTitle;
  const label = ROLE_LABELS[block.role] ?? ROLE_LABELS[role] ?? role;
  const format = formatNameWithParams(block.formatName, block.formatParams);
  return `${label} · ${format}`;
}

/**
 * Roster de bloques del dia, en orden canonico por ROL.
 *
 * Solo entran los roles efectivamente presentes en alguna sesion: una sesion
 * sin DEUTEROS_2 produce un roster de 4 bloques, y los dots "BLOQUE n / M" del
 * TV cuentan sobre ese largo real.
 *
 * `shared: true` en INITIUM y STRETCHING — son las listas comunes a todos los
 * niveles (INITIUM siempre; STRETCHING por D-11/Pitfall 1, identico en los 6
 * niveles del dia), y es lo que deshabilita el selector de nivel en el
 * control del profe y colapsa las columnas a una sola.
 */
function rolesForMode(mode: TvClassMode): readonly string[] {
  switch (mode) {
    case "rom":
      return ROM_ROLES;
    case "combos":
      return COMBOS_ROLES;
    case "tecnica":
      return TECNICA_ROLES;
    default:
      return REGULAR_ROLES;
  }
}

export function buildRoster<TBlock extends RosterBlock>(
  classDay: RosterClassDay<TBlock>,
): TvBlockSummary[] {
  const roles: readonly string[] = rolesForMode(classDay.mode);
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
      shared: role === "INITIUM" || role === "STRETCHING",
    });
  }

  return roster;
}
