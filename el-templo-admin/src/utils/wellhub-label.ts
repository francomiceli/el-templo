/**
 * Fase 204 (D-01/D-02/D-03): regla única del rótulo de estado del alumno y de
 * la fuente de una visita Wellhub. Funciones puras (sin Vue) para poder
 * testearlas con vitest.
 *
 * - Un visitante Wellhub nuevo tiene estado `wellhub` -> "Wellhub".
 * - Un ex-alumno vinculado a Wellhub muestra "Inactivo · Wellhub": el sufijo
 *   sale de `showWellhubLabel`, que calcula el API (nunca se deduce acá).
 * - Un socio activo muestra solo "Activo" (D-03), aunque el API mande la marca.
 */

import type { UserStatus } from 'src/types/member';

/** Color Quasar del badge Wellhub: `secondary` (Clay #7d5d42, cálido, sin azul). */
export const WELLHUB_COLOR = 'secondary';

export const WELLHUB_LABEL = 'Wellhub';

/** Único mapa de rótulos de estado del admin (lo reusa useStatusBadge). */
export const STATUS_LABEL: Record<UserStatus, string> = {
  freemium: 'Freemium',
  prueba: 'En Prueba',
  activo: 'Activo',
  inactivo: 'Inactivo',
  wellhub: WELLHUB_LABEL,
};

export interface MemberStatusLabelOptions {
  hasUsedTrial?: boolean;
  showWellhubLabel?: boolean;
}

export function memberStatusLabel(
  status: UserStatus | null | undefined,
  opts: MemberStatusLabelOptions = {}
): string {
  if (!status) return '—';
  if (status === 'prueba') {
    return `${STATUS_LABEL.prueba} (${opts.hasUsedTrial ? '1/1' : '0/1'})`;
  }
  const base = STATUS_LABEL[status];
  if (opts.showWellhubLabel && status !== 'wellhub' && status !== 'activo') {
    return `${base} · ${WELLHUB_LABEL}`;
  }
  return base;
}

/** True si la fuente de una asistencia es Wellhub (validada o a mano). */
export function isWellhubSource(source: string | null | undefined): boolean {
  return source === 'wellhub' || source === 'wellhub_manual';
}
