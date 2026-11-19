// deploy: 2026-10-13 — el push del fix de tests tras CI rojo tiene que redeployar el admin.
/**
 * Metadatos visuales de las invitaciones (Fase 194): un único lugar para el mapeo
 * estado/etapa -> label/color entre la pestaña "Invitaciones" de la ficha y el
 * bloque "Lo invitó" del lead (DRY). Los estados y etapas los DERIVA el servidor
 * (invitation-states.ts): el cliente solo los rotula, nunca los recalcula.
 *
 * Paleta de marca (quasar.variables.scss), sin azul.
 */
import type { InviteeState, LeadStage } from 'src/types/member';
import type { InvitationEndReason, InvitationFollowStatus } from 'src/types/report';

interface ChipMeta {
  label: string;
  color: string;
  /** Aclaración opcional para las etiquetas con una regla poco obvia. */
  tooltip?: string;
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

/**
 * Estado de seguimiento de la lista de invitados (Reportes ▸ Invitaciones). Lo deriva el
 * servidor; `con_accesos` no tiene etiqueta propia: reusa la de la etapa (Invitado / Entrenando).
 */
const FOLLOW_STATUS_META: Record<Exclude<InvitationFollowStatus, 'con_accesos'>, ChipMeta> = {
  para_contactar: { label: 'Para contactar', color: 'primary' },
  compro: { label: 'Compró', color: 'positive' },
  compro_tarde: {
    label: 'Compró tarde',
    color: 'warning',
    tooltip: 'Compró después del plazo del descuento por invitación',
  },
  no_sigue: { label: 'No sigue', color: 'negative' },
};

export function followStatusMeta(row: {
  followStatus: InvitationFollowStatus;
  stage: LeadStage;
}): ChipMeta {
  return row.followStatus === 'con_accesos'
    ? LEAD_STAGE_META[row.stage]
    : FOLLOW_STATUS_META[row.followStatus];
}

/** Ya compró un plan (a tiempo o tarde): no hay nada que seguir ni vender. */
export function hasPurchased(row: { followStatus: InvitationFollowStatus }): boolean {
  return row.followStatus === 'compro' || row.followStatus === 'compro_tarde';
}

/** Opciones del filtro "Estado" de la lista de seguimiento (`value: null` = todos). */
export const FOLLOW_STATUS_FILTER_OPTIONS: Array<{
  label: string;
  value: InvitationFollowStatus | null;
}> = [
  { label: 'Todos', value: null },
  { label: 'Para contactar', value: 'para_contactar' },
  { label: 'Con accesos', value: 'con_accesos' },
  { label: 'Compró', value: 'compro' },
  { label: 'Compró tarde', value: 'compro_tarde' },
  { label: 'No sigue', value: 'no_sigue' },
];

/** Valida el `?estado=` de la URL: devuelve el estado o null si no es uno válido. */
export function parseFollowStatus(raw: unknown): InvitationFollowStatus | null {
  return (
    FOLLOW_STATUS_FILTER_OPTIONS.find((o) => o.value !== null && o.value === raw)?.value ?? null
  );
}

/** Por qué terminó el acceso: línea chica debajo de la fecha de fin. */
export const END_REASON_LABEL: Record<InvitationEndReason, string> = {
  agotados: 'Agotó los accesos',
  plazo: 'Se venció el plazo',
};

/** "2/3 accesos"; sin accesos (vínculo heredado) devuelve null. N viene del servidor. */
export function accessesLabel(used: number | null, budget: number | null): string | null {
  if (used === null || budget === null) return null;
  return `${used}/${budget} accesos`;
}

/**
 * "3 accesos" / "accesos ilimitados" (plan sin tope de clases: `classesBudget` null).
 * Evita imprimir "null accesos" en los avisos de activación.
 */
export function accessesCountLabel(budget: number | null): string {
  return budget === null ? 'accesos ilimitados' : `${budget} accesos`;
}
