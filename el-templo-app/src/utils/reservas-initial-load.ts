/**
 * Decide si hay que pedir la grilla de Reservas a mano después de asignar la sede.
 *
 * `watch(selectedBranchId)` de ReservasPage ya pide la grilla cuando el valor cambia.
 * Llamar `loadGrid()` además de eso duplica `/members/scheduling/weekly`. Por eso solo
 * se pide a mano cuando la asignación NO cambió el valor (el watch no dispara):
 * `prev === next`. Si cambió, el watch pide una vez; si no, se pide una vez a mano.
 * Fase 203, R-1.
 */
export function needsExplicitGridLoad(prev: number | null, next: number | null): boolean {
  return prev === next
}
