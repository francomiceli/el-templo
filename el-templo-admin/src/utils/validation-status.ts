/**
 * Validation-status label/color map (Phase 152, D-04). Schema enum:
 * pendiente | observado | corregido | validado. Extracted from MovEgresosTab so
 * the Historial de cobros chip (MovimientosTab) reuses the exact same rendering
 * (DRY — the map was inlined in a single tab before).
 */

const VALIDATION_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  observado: 'Observado',
  corregido: 'Corregido',
  validado: 'Validado',
};

export function validationLabel(status: string): string {
  return VALIDATION_LABELS[status] ?? status;
}

export function validationColor(status: string): string {
  if (status === 'validado') return 'positive';
  if (status === 'pendiente') return 'warning';
  if (status === 'observado') return 'info';
  return 'grey-6'; // corregido
}
