/**
 * Fase 197: cómo arranca el player al entrar (sin pantalla intermedia de bienvenida).
 * Pura: la decisión no depende del reloj ni del DOM, así se testea sin montar la página.
 */

export interface PlayerStartInput {
  /** Hay progreso previo guardado (tiempo corrido o bloques hechos) y el día no está completado */
  hasPriorProgress: boolean
  /** El socio todavía tiene que elegir Deuteros (el selector va antes que el 3-2-1) */
  needsDeuterosChoice: boolean
}

/**
 * - `resume`: retoma donde quedó, sin 3-2-1.
 * - `countdown`: arranque nuevo, va directo al 3-2-1.
 * - `deuteros`: arranque nuevo pero falta elegir Deuteros; el 3-2-1 llega al elegir.
 */
export type PlayerStartMode = 'resume' | 'countdown' | 'deuteros'

export function resolvePlayerStart(i: PlayerStartInput): PlayerStartMode {
  if (i.hasPriorProgress) return 'resume'
  return i.needsDeuterosChoice ? 'deuteros' : 'countdown'
}
