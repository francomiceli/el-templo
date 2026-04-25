/**
 * Phase 103 (R10): shared status -> { color, label } mapping for the
 * 4-state user lifecycle badge (freemium / prueba / activo / inactivo).
 *
 * Used by AlumnosPage row chip and AlumnoDetailPage header chip so the
 * visual language stays in lockstep across the admin app.
 *
 * Colors per CONTEXT D-10:
 *   - freemium -> info    (blue/cyan)
 *   - prueba   -> warning (orange/yellow)
 *   - activo   -> positive (green)
 *   - inactivo -> grey
 *
 * Defensive null/undefined branch returns grey + em-dash. Member rows
 * always have a status post Plan 103-04, but staff rows are NULL by
 * design (see migration 0100), so the null guard keeps the composable
 * safe for any user shape we might pass through it later.
 */

import type { UserStatus } from 'src/types/member';

const STATUS_COLOR: Record<UserStatus, string> = {
  freemium: 'info',
  prueba: 'warning',
  activo: 'positive',
  inactivo: 'grey',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  freemium: 'Freemium',
  prueba: 'En Prueba',
  activo: 'Activo',
  inactivo: 'Inactivo',
};

export function useStatusBadge() {
  const getColor = (status: UserStatus | null | undefined): string =>
    status ? STATUS_COLOR[status] : 'grey';

  const getLabel = (status: UserStatus | null | undefined): string =>
    status ? STATUS_LABEL[status] : '—';

  return { getColor, getLabel };
}
