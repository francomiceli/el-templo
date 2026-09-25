import type { BlockRole } from './types/session'

/**
 * Mapea cada `BlockRole` al ítem correspondiente de la sección "Bloques" de
 * la Guía (`/training/guia`) — fuente única para el link "¿Qué es X?" que
 * las tarjetas de bloque (`BlockCard.vue`/`BlockChoiceCard.vue`) muestran
 * (SPEC "Empezá acá" A1).
 *
 * Solo los roles que la Guía documenta HOY tienen entrada: Initium, Nucleus,
 * Deuteros (1 y 2 apuntan al mismo ítem — es una sola elección con dos
 * opciones) y Athlos/Epikos (comparten el mismo ítem combinado, igual que en
 * `GuiaPage.vue`). Los roles ROM_x, COMBOS_x, TECNICA_x y STRETCHING no
 * tienen un ítem propio en esa sección — devolvemos `null` para ellos en vez
 * de inventar un destino que no existe.
 */
export interface GuiaLinkTarget {
  seccion: 'bloques'
  item: string
  /** Texto del link/tooltip, p.ej. "¿Qué es Nucleus?" */
  question: string
}

const GUIA_ROLE_MAP: Partial<Record<BlockRole, GuiaLinkTarget>> = {
  INITIUM: { seccion: 'bloques', item: 'initium', question: '¿Qué es Initium?' },
  NUCLEUS: { seccion: 'bloques', item: 'nucleus', question: '¿Qué es Nucleus?' },
  DEUTEROS_1: { seccion: 'bloques', item: 'deuteros', question: '¿Qué es Deuteros?' },
  DEUTEROS_2: { seccion: 'bloques', item: 'deuteros', question: '¿Qué es Deuteros?' },
  ATHLOS: { seccion: 'bloques', item: 'athlos-epikos', question: '¿Qué es Athlos?' },
  EPIKOS: { seccion: 'bloques', item: 'athlos-epikos', question: '¿Qué es Epikos?' },
}

/**
 * Devuelve el destino de Guía para un rol de bloque, o `null` si ese rol no
 * tiene un ítem documentado (ver docblock de arriba).
 */
export function getGuiaLinkForRole(role: BlockRole | string): GuiaLinkTarget | null {
  return (GUIA_ROLE_MAP as Record<string, GuiaLinkTarget>)[role] ?? null
}
