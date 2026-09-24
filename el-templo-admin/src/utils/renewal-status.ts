/**
 * Metadatos visuales del estado derivado de Renovaciones — un único lugar
 * para no repetir el mapeo estado→color/label/tooltip entre la tabla y el
 * diálogo del socio (DRY).
 *
 * Paleta: colores de marca ya declarados en `quasar.variables.scss`
 * (positive=verde cálido, negative=rojo cálido, warning=dorado oscuro,
 * info=Olive Stone). Ninguno es azul — 'pausada' usa `info` a propósito
 * (SPEC: "gris/azul-gris; NO azul de marca").
 */
import type { RenewalStatus } from 'src/types/renewals';

export interface RenewalStatusMeta {
  label: string;
  color: string;
  /** Tooltip adicional — hoy solo 'volvio_tarde' lo necesita (regla no obvia). */
  tooltip?: string;
}

const STATUS_META: Record<RenewalStatus, RenewalStatusMeta> = {
  renovo: { label: 'Renovó', color: 'positive' },
  volvio_tarde: {
    label: 'Volvió tarde',
    color: 'warning',
    tooltip: 'Renovó después de la ventana de 5 días: cuenta como no renovación en el %',
  },
  pausada: { label: 'Pausada', color: 'info' },
  no_renovo: { label: 'No renovó', color: 'negative' },
  en_proceso: { label: 'En proceso', color: 'grey-7' },
};

export function renewalStatusMeta(status: RenewalStatus): RenewalStatusMeta {
  return STATUS_META[status];
}

/** "dd/MM", vía mediodía local para evitar drift de huso en fechas "YYYY-MM-DD". */
export function formatDayMonth(dateStr: string): string {
  const normalized = dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/** Label completo a mostrar en el badge — "Pausada hasta dd/MM" para pausada (SPEC). */
export function renewalStatusLabel(row: { status: RenewalStatus; pauseEndDate: string | null }): string {
  if (row.status === 'pausada' && row.pauseEndDate) {
    return `Pausada hasta ${formatDayMonth(row.pauseEndDate)}`;
  }
  return renewalStatusMeta(row.status).label;
}
