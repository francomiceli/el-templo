/**
 * Metadatos visuales de las invitaciones (Fase 194): un único lugar para el mapeo
 * estado/etapa -> label/color entre la pestaña "Invitaciones" de la ficha y el
 * bloque "Lo invitó" del lead (DRY). Los estados y etapas los DERIVA el servidor
 * (invitation-states.ts): el cliente solo los rotula, nunca los recalcula.
 *
 * Paleta de marca (quasar.variables.scss), sin azul.
 */
import type { InviteeState, LeadStage } from 'src/types/member';

interface ChipMeta {
  label: string;
  color: string;
}

export const INVITEE_STATE_META: Record<InviteeState, ChipMeta> = {
  invitado: { label: 'Invitado', color: 'info' },
  entrenando: { label: 'Entrenando', color: 'secondary' },
  vencido: { label: 'Vencido', color: 'warning' },
  socio_activo: { label: 'Socio activo', color: 'positive' },
  inactivo: { label: 'Inactivo', color: 'grey-7' },
};

export const LEAD_STAGE_META: Record<LeadStage, ChipMeta> = {
  invitado: { label: 'Invitado', color: 'info' },
  entrenando: { label: 'Entrenando', color: 'secondary' },
  vencido: { label: 'Vencido', color: 'warning' },
  convertido: { label: 'Convertido', color: 'positive' },
};

/** "2/3 accesos"; sin accesos (vínculo heredado) devuelve null. N viene del servidor. */
export function accessesLabel(used: number | null, budget: number | null): string | null {
  if (used === null || budget === null) return null;
  return `${used}/${budget} accesos`;
}
