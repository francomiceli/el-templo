/**
 * Level-related constants shared across admin components.
 */

/** Ordered member levels from lowest to highest */
// Phase 129 (KAIROS-01): kairos is the new lowest tier, added first.
export const LEVEL_ORDER: string[] = ['kairos', 'alfa', 'delta', 'sigma', 'omega', 'spartan'];

/**
 * Quasar color token for a member level badge.
 * Single source of truth (Phase 133 DRY extraction — was duplicated verbatim in
 * AlumnosPage, AlumnoDetailPage, SessionsPage and EditableBlockCard).
 */
export function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'kairos':
      return 'amber-6';
    case 'alfa':
      return 'amber-8';
    case 'delta':
      return 'deep-orange-7';
    case 'sigma':
      return 'brown-8';
    case 'omega':
      return 'red-9';
    case 'spartan':
      return 'grey-9';
    default:
      return 'grey';
  }
}

/**
 * Difficulty-band mapping for the exercise tree (R2-BANDS).
 *
 * Mapeo de UI deliberado y LOCKED (tree-quality-research.md §4.3):
 * kairos 1-2 / alfa 3 / delta 4-6 / sigma 7-8 / omega 9-10 / spartan 11-12.
 *
 * NO coincide con LEVEL_LINEAR_MIN del API (allá alfa arranca en dl 1) y
 * NO debe "corregirse" para derivarlo de ese mapeo.
 */
export const DL_BANDS = [
  { level: 'kairos', min: 1, max: 2, color: 'amber-6' },
  { level: 'alfa', min: 3, max: 3, color: 'amber-8' },
  { level: 'delta', min: 4, max: 6, color: 'deep-orange-7' },
  { level: 'sigma', min: 7, max: 8, color: 'brown-8' },
  { level: 'omega', min: 9, max: 10, color: 'red-9' },
  { level: 'spartan', min: 11, max: 12, color: 'grey-9' },
] as const;

export type DlBand = (typeof DL_BANDS)[number];

/**
 * Resolve the difficulty band for a dl value.
 * Returns null when dl is null/undefined or outside the 1-12 range.
 */
export function dlBand(dl: number | null | undefined): DlBand | null {
  if (dl == null) return null;
  return DL_BANDS.find((band) => dl >= band.min && dl <= band.max) ?? null;
}

/**
 * Text class for content rendered on top of a band color.
 * Amber bands (kairos/alfa) need charcoal text — white fails contrast on amber.
 */
export function bandTextClass(band: DlBand): string {
  return band.level === 'kairos' || band.level === 'alfa' ? 'text-grey-10' : 'text-white';
}
