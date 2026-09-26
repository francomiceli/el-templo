/**
 * Metadatos visuales del estado DERIVADO de una sesión de prueba (cadencia de
 * mensajes, brief Nacho 2026-09-26) — un único lugar para no repetir el mapeo
 * estado→color/label entre la tabla y cualquier otro consumidor futuro (DRY,
 * mismo patrón que `renewal-status.ts`).
 *
 * `TrialSessionStatus` reemplaza, como ÚNICA fuente visible en la tabla, al
 * viejo chip de `leadStatusEffective` + la columna "Asistió": ambos quedan
 * subsumidos acá (agendada/asistio/no_asistio/reagendada ya reflejan
 * asistencia; ganada/perdida ya reflejan `users.lead_status`).
 *
 * Paleta: colores semánticos de Quasar ya usados en el resto del admin para
 * chips de estado (positive/negative/warning/info/grey-7) — ninguno es azul
 * de marca (reference_brand_palette: "cálida, SIN azul").
 */
import type { TrialSessionStatus } from 'src/composables/useReportsApi';

export interface TrialSessionStatusMeta {
  label: string;
  color: string;
}

const STATUS_META: Record<TrialSessionStatus, TrialSessionStatusMeta> = {
  agendada: { label: 'Agendada', color: 'grey-7' },
  asistio: { label: 'Asistió', color: 'positive' },
  no_asistio: { label: 'No asistió', color: 'warning' },
  reagendada: { label: 'Reagendada', color: 'info' },
  ganada: { label: 'Ganada', color: 'positive' },
  perdida: { label: 'Perdida', color: 'negative' },
};

export function trialSessionStatusMeta(status: TrialSessionStatus): TrialSessionStatusMeta {
  return STATUS_META[status];
}

/** Estados "en juego" — admiten acciones de mensaje (mismo criterio que el guardrail SESSION_CLOSED del server). */
export function isTrialSessionOpen(status: TrialSessionStatus): boolean {
  return status === 'agendada' || status === 'asistio' || status === 'no_asistio';
}
