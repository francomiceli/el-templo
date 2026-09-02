/**
 * Formato compartido entre las pestañas de Comunicaciones que listan avisos
 * (AvisosTab.vue, plan 11; TarjetasTab.vue, plan 14) — evita duplicar la
 * lógica de vigencia/estado entre las dos tablas (DRY, CLAUDE.md). Las
 * fechas individuales reusan `formatDate` (src/utils/format-date.ts), el
 * formateador canónico del admin — antes de este archivo `AvisosTab.vue`
 * tenía su propio parser DD/MM/YYYY inline, una segunda fuente de verdad
 * para lo mismo.
 */
import { formatDate } from './format-date';
import type { AvisoStatus } from 'src/composables/useCommunicationsApi';

export interface AvisoVigenciaRow {
  startsOn: string | null;
  endsOn: string | null;
}

export function vigenciaLabel(row: AvisoVigenciaRow): string {
  if (row.startsOn && row.endsOn) {
    return `${formatDate(row.startsOn)} - ${formatDate(row.endsOn)}`;
  }
  if (row.startsOn) return `Desde ${formatDate(row.startsOn)}`;
  if (row.endsOn) return `Hasta ${formatDate(row.endsOn)}`;
  return 'Sin límite';
}

export function avisoStatusColor(status: AvisoStatus): string {
  if (status === 'active') return 'positive';
  if (status === 'paused') return 'warning';
  return 'grey';
}

export function avisoStatusLabel(status: AvisoStatus): string {
  if (status === 'active') return 'Activo';
  if (status === 'paused') return 'Pausado';
  return 'Borrador';
}
