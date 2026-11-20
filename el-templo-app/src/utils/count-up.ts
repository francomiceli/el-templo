/**
 * Pasos del conteo del total de Aura en la celebración de asistencia (fase 214, D-56).
 *
 * Devuelve los valores enteros por los que pasa el número, de `from` (exclusive) a `to` (inclusive):
 * crecientes, terminan siempre en `to` y son como mucho `floor(maxMs / stepMs)`. Si la diferencia es
 * mayor que los pasos disponibles se salta de a más de uno. Sin diferencia (o con `to` menor que
 * `from`) devuelve solo `[to]`: no hay nada que contar.
 */
export function countUpSteps(from: number, to: number, stepMs: number, maxMs: number): number[] {
  if (!(to > from)) return [to]
  const maxSteps = Math.max(1, Math.floor(maxMs / stepMs))
  const diff = to - from
  const count = Math.min(diff, maxSteps)
  const steps: number[] = []
  for (let i = 1; i <= count; i++) {
    steps.push(i === count ? to : from + Math.round((diff * i) / count))
  }
  return steps
}
