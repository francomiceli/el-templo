/**
 * Texto de "Qué trabajás ahora" en el player (sketch 027 D). Las rutas traen hasta 13 músculos por
 * grupo y en la hoja no entran: se muestran los primeros (el API los ordena motor → sinergista, así
 * quedan los que más trabajan) y el resto como "+N". La figura sigue pintando todos.
 */

/** Cuántos nombres se muestran por grupo */
export const MAX_FUERTE = 3
export const MAX_SOSTIENE = 2

const SEPARADOR = ' · '

/** "Dorsal ancho · Trapecio inferior · Redondo mayor +5" */
export function musculosResumidos(nombres: readonly string[], max: number): string {
  const visibles = nombres.slice(0, max).join(SEPARADOR)
  const resto = nombres.length - max
  return resto > 0 ? `${visibles} +${resto}` : visibles
}
