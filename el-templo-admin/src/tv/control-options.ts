/**
 * Botonera de bloques y niveles del TV — compartida entre el control del profe
 * (`TvControlPage.vue`, fase 164) y la vista previa "Planis" (2026-09).
 *
 * Las dos páginas eligen un (bloque, nivel) sobre el MISMO roster que publica
 * el API (`TvBlockSummary[]` + `levels`), así que colapsar DEUTEROS_1/2 en un
 * botón, rotular los pares de nivel y recortar el formato del título viven acá
 * una sola vez. Nada de esto toca la red ni Vue: son funciones puras.
 */

/** Tipo mínimo de un bloque del roster para armar la botonera. */
export interface RosterBlockLike {
  role: string;
  title: string;
}

/** Sesión de semana vs. sábado ROM (D-23) vs. días técnica/combos. */
export type TvModeLike = 'regular' | 'rom' | 'combos' | 'tecnica';

/**
 * En sesión ROM (sábado) no existe la escalera alfa/delta/sigma: son dos
 * tiers rotulados BÁSICO / AVANZADO (D-23).
 */
export const ROM_LEVEL_LABELS: Record<string, string> = {
  alfa: 'BÁSICO',
  delta: 'AVANZADO',
};

/**
 * Pares de nivel del TV (rediseño fase 164 — el control elige el nivel por
 * PARES, no por nivel individual). Espejo a propósito de `LEVEL_PAIRS` en
 * `el-templo-api/src/modules/tv/roster.ts`: cambiar uno REQUIERE el cambio
 * espejo en el otro.
 */
export const LEVEL_PAIRS: readonly (readonly [string, string])[] = [
  ['alfa', 'delta'],
  ['sigma', 'kairos'],
  ['omega', 'spartan'],
];

/** Nombre completo de cada nivel (sesión regular), para el label del par. */
export const LEVEL_NAME_LABELS: Record<string, string> = {
  alfa: 'ALFA',
  delta: 'DELTA',
  sigma: 'SIGMA',
  kairos: 'KAIROS',
  omega: 'OMEGA',
  spartan: 'SPARTAN',
};

/** Un botón de la tira de bloques: a qué rol apunta el tap y cómo se rotula. */
export interface BlockButton {
  role: string;
  label: string;
}

/** Un botón de par de nivel: a qué nivel apunta el tap y cómo se rotula. */
export interface LevelPairOption {
  levels: readonly string[];
  label: string;
  /** Primer nivel del par presente ese día — el que manda el tap. */
  targetLevel: string;
  /** Si el par tiene al menos un nivel planificado (si no, el botón se ve pero va deshabilitado). */
  present: boolean;
}

/**
 * Solo el NOMBRE del bloque, sin el formato: el `title` del API viene como
 * "NOMBRE · FORMATO" (ej. "NUCLEUS · AMRAP 10'"), y el botón muestra
 * únicamente la parte anterior al separador. Un bloque con customTitle (INITIUM)
 * no trae separador, así que se muestra entero.
 */
export function blockName(block: RosterBlockLike): string {
  const sep = ' · ';
  const i = block.title.indexOf(sep);
  return i >= 0 ? block.title.slice(0, i) : block.title;
}

/**
 * Botones de bloque. El roster real trae DEUTEROS_1 y DEUTEROS_2 por
 * separado, pero en pantalla entran juntos (grilla 2×2), así que se colapsan en
 * UN solo botón "DEUTEROS" (representa a DEUTEROS_1). El resto de los bloques
 * —incluido el alternativo navegable de combos/técnica— conserva su botón propio.
 */
export function buildBlockButtons(blocks: readonly RosterBlockLike[]): BlockButton[] {
  const out: BlockButton[] = [];
  let deuterosDone = false;
  for (const b of blocks) {
    if (b.role === 'DEUTEROS_1' || b.role === 'DEUTEROS_2') {
      if (deuterosDone) continue;
      deuterosDone = true;
      out.push({ role: 'DEUTEROS_1', label: 'DEUTEROS' });
    } else {
      out.push({ role: b.role, label: blockName(b) });
    }
  }
  return out;
}

/** Un botón de la tira "es" el rol dado (DEUTEROS colapsa sus dos caminos). */
export function buttonMatchesRole(buttonRole: string, role: string): boolean {
  if (buttonRole === role) return true;
  return buttonRole === 'DEUTEROS_1' && (role === 'DEUTEROS_1' || role === 'DEUTEROS_2');
}

/**
 * Los tres pares de nivel, SIEMPRE (fila completa): un par sin ningún nivel
 * planificado ese día va deshabilitado en vez de esconderse. El label junta los
 * DOS nombres del par completo, presente o no, unidos por " Y "; el tap manda
 * el primer nivel del par que sí está presente. En ROM (sábado) los tiers se
 * rotulan BÁSICO/AVANZADO.
 */
export function buildLevelPairs(
  levels: readonly string[],
  mode: TvModeLike | string
): LevelPairOption[] {
  return LEVEL_PAIRS.map((pair) => {
    const present = pair.filter((lvl) => levels.includes(lvl));
    const names = pair.map((lvl) =>
      mode === 'rom'
        ? (ROM_LEVEL_LABELS[lvl] ?? lvl.toUpperCase())
        : (LEVEL_NAME_LABELS[lvl] ?? lvl.toUpperCase())
    );
    return {
      levels: pair,
      label: names.join(' Y '),
      targetLevel: present[0] ?? pair[0],
      present: present.length > 0,
    };
  });
}
