import type { BlockRole } from './types/session'

/**
 * Mapea cada `BlockRole` al slide de la Guía (`/training/guia`, ruta con
 * nombre `guia`) que explica ese bloque — fuente única para el link "¿Qué es
 * X?" que las tarjetas de bloque (`BlockCard.vue`/`BlockChoiceCard.vue`)
 * muestran (SPEC "Empezá acá" A1).
 *
 * SPEC "La Guía pasa a ser las historias" (2026-09-24): ya no hay glosario
 * con ítems separados por bloque — la Guía ES la historia de "Empezá acá", y
 * los 4 bloques (Initium/Nucleus/Deuteros/Athlos-Epikos) viven juntos en UN
 * solo slide, `'clase'` ("Cada clase", ver `empeza-aca-content.ts`). Por eso
 * todo rol documentado apunta al MISMO `slide` — índice por id de slide, no
 * por número mágico, para no romper el link si el orden de slides cambia.
 *
 * Solo los roles que ese slide documenta HOY tienen entrada: Initium,
 * Nucleus, Deuteros (1 y 2 apuntan al mismo slide — es una sola elección con
 * dos opciones) y Athlos/Epikos (comparten el mismo slide combinado). Los
 * roles ROM_x, COMBOS_x, TECNICA_x y STRETCHING no tienen slide propio —
 * devolvemos `null` para ellos en vez de inventar un destino que no existe.
 */
export interface GuiaLinkTarget {
  /** Id del slide de la Guía al que salta este rol (`EmpezaAcaSlide.id`). */
  slide: string
  /** Texto del link/tooltip, p.ej. "¿Qué es Nucleus?" */
  question: string
}

const GUIA_ROLE_MAP: Partial<Record<BlockRole, GuiaLinkTarget>> = {
  INITIUM: { slide: 'clase', question: '¿Qué es Initium?' },
  NUCLEUS: { slide: 'clase', question: '¿Qué es Nucleus?' },
  DEUTEROS_1: { slide: 'clase', question: '¿Qué es Deuteros?' },
  DEUTEROS_2: { slide: 'clase', question: '¿Qué es Deuteros?' },
  ATHLOS: { slide: 'clase', question: '¿Qué es Athlos?' },
  EPIKOS: { slide: 'clase', question: '¿Qué es Epikos?' },
}

/**
 * Devuelve el destino de Guía para un rol de bloque, o `null` si ese rol no
 * tiene un slide documentado (ver docblock de arriba).
 */
export function getGuiaLinkForRole(role: BlockRole | string): GuiaLinkTarget | null {
  return (GUIA_ROLE_MAP as Record<string, GuiaLinkTarget>)[role] ?? null
}
