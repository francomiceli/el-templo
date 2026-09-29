import type { WeeklySlotView } from 'src/types/scheduling'

/**
 * Profe único del turno para el encabezado de la grilla de Reservas.
 *
 * Se muestra solo si TODOS los slots del turno comparten el mismo
 * coachFirstName no nulo — un turno con horarios de distintas actividades
 * dando clase con profes distintos no tiene un "el profe de este turno"
 * único que anunciar.
 *
 * 2026-09-29: los slots con `coachOverride` (profe propio del horario, ej. la
 * profe de yoga dentro del turno de otro profe) NO participan: su profe se
 * muestra en la tarjeta del horario y no debe mezclarse con el del turno. Si
 * no queda ningún slot sin override, no hay profe de turno que anunciar.
 */
export function turnoCoachName(
  slots: readonly Pick<WeeklySlotView, 'coachFirstName' | 'coachOverride'>[],
): string | null {
  const turnoSlots = slots.filter((s) => !s.coachOverride)
  const first = turnoSlots[0]?.coachFirstName ?? null
  if (!first) return null
  return turnoSlots.every((s) => s.coachFirstName === first) ? first : null
}
