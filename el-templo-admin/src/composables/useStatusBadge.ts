/**
 * Phase 103 (R10): shared status -> { color, label } mapping for the
 * 5-state user lifecycle badge (freemium / prueba / activo / inactivo / wellhub).
 *
 * Used by AlumnosPage row chip and AlumnoDetailPage header chip so the
 * visual language stays in lockstep across the admin app.
 *
 * Colors per CONTEXT D-10:
 *   - freemium -> info    (blue/cyan)
 *   - prueba   -> warning (orange/yellow)
 *   - activo   -> positive (green)
 *   - inactivo -> grey
 *   - wellhub  -> secondary (Clay, cálido, sin azul; Fase 204 D-01)
 *
 * Defensive null/undefined branch returns grey + em-dash. Member rows
 * always have a status post Plan 103-04, but staff rows are NULL by
 * design (see migration 0100), so the null guard keeps the composable
 * safe for any user shape we might pass through it later.
 */

import type { UserStatus } from 'src/types/member';
import { memberStatusLabel } from 'src/utils/wellhub-label';

const STATUS_COLOR: Record<UserStatus, string> = {
  freemium: 'info',
  prueba: 'warning',
  activo: 'positive',
  inactivo: 'grey',
  wellhub: 'secondary',
};

// Los rótulos viven en un único mapa (`STATUS_LABEL` en utils/wellhub-label.ts,
// que incluye `wellhub: 'Wellhub'`) para que haya una sola regla de rótulo.

export function useStatusBadge() {
  const getColor = (status: UserStatus | null | undefined): string =>
    status ? STATUS_COLOR[status] : 'grey';

  // Fase 204 (D-02): `showWellhubLabel` (lo calcula el API) agrega " · Wellhub".
  const getLabel = (
    status: UserStatus | null | undefined,
    hasUsedTrial?: boolean,
    showWellhubLabel?: boolean
  ): string => memberStatusLabel(status, { hasUsedTrial, showWellhubLabel });

  return { getColor, getLabel };
}
