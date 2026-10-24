/**
 * Pieza pura de la cantidad del ejercicio en el player: el desarme de la dosis compacta para el
 * número grande del pie del video (`StoryFooter`). Sin Vue, así se testea sin montar nada.
 */

const UNIT_SUFFIX = /\s+(REPS|SEG)$/

/** Marca de segundos de la cantidad (doble prima: 30″). */
export const SECONDS_MARK = '″'

/**
 * Lo que va como cantidad grande del pie del video, a partir de la dosis compacta ("8 REPS", "30 SEG",
 * "10 · 12 REPS", "8 - 10 - ...", "PAUSA"): solo el número, como en la TV. Las repeticiones van sin
 * unidad y los segundos con ″ (Franco, 2026-10-23).
 */
export function plateValue(quickDose: string): string {
  const text = quickDose.trim()
  const match = UNIT_SUFFIX.exec(text)
  if (!match) return text
  const value = text.slice(0, match.index)
  return match[1] === 'SEG' ? `${value}${SECONDS_MARK}` : value
}
