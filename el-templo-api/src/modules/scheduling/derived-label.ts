/**
 * Derived Class Label
 *
 * Phase 159-06 (D-15/D-16/D-17): fuente unica de la derivacion de nombre de
 * clase. La fila `activities` de la actividad generica quedo fija en
 * "General" (migracion 0204); combos/tecnica se derivan en tiempo de
 * LECTURA a partir del `sessions.sessionMode` de la sesion aprobada de esa
 * semana/dia (regular plan, goal_plan_type IS NULL). Un dia sin sesion
 * combos/tecnica (regular, rom, o sin sesion aun) conserva el nombre
 * original de la actividad.
 *
 * Una actividad `isSpecial` NUNCA se renombra, aunque el dia tenga
 * combos/tecnica aprobado (D-17: la derivacion no toca reservas/cupos/
 * gating, solo la etiqueta visible de la actividad generica).
 *
 * Consumido por:
 * - scheduling/service.ts::getWeeklyGrid (admin/horarios, 159-06)
 * - scheduling/booking-service.ts::getMyBookings (reservas del socio, 160-06)
 * - scheduling/booking-service.ts::getMyWeeklyAttendance (asistencia del
 *   socio, 160-06 — segunda fuente de ReservasPage, linea "Asististe")
 * - scheduling/service.ts::getWeeklyGrid, junto con label-descriptions.ts
 *   (180-10, D-23): el resultado de esta función decide si `activityDescription`
 *   del slot viene del modo derivado o de `activities.description` real —
 *   ver Pitfall 9 del research de la fase 180.
 */
export const DERIVED_CLASS_LABEL: Record<string, string> = {
  combos: "Combos",
  tecnica: "Técnica",
};

/**
 * Deriva el nombre de clase visible: "Combos"/"Tecnica" si la actividad es
 * la generica ("General") no-especial y el dia tiene ese modo aprobado;
 * de lo contrario conserva `activityName` tal cual.
 */
export function deriveActivityLabel(
  activityName: string,
  isSpecial: boolean,
  dayMode: string | undefined,
): string {
  const isGenericActivity = activityName === "General" && !isSpecial;
  if (!isGenericActivity) return activityName;
  return DERIVED_CLASS_LABEL[dayMode ?? ""] ?? activityName;
}
