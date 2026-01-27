import type { BlockRole } from '../types/session';

/**
 * Get background color class based on block role
 *
 * Returns Quasar color classes for card backgrounds (light variant).
 *
 * @param role - Block role
 * @returns Quasar background color class
 */
export function getBlockColorClass(role: BlockRole): string {
  const colorMap: Record<BlockRole, string> = {
    INITIUM: 'bg-light-blue-1',
    NUCLEUS: 'bg-purple-1',
    DEUTEROS_1: 'bg-cyan-1',
    DEUTEROS_2: 'bg-deep-purple-1',
    ATHLOS_EPIKOS: 'bg-amber-1',
  };
  return colorMap[role] || 'bg-grey-1';
}

/**
 * Get accent color name based on block role
 *
 * Returns Quasar color names for buttons, text, and interactive elements.
 * These are the primary (non-light) variants for emphasis.
 *
 * @param role - Block role
 * @returns Quasar color name (e.g., 'light-blue', 'purple')
 */
export function getBlockAccentColor(role: BlockRole): string {
  const colorMap: Record<BlockRole, string> = {
    INITIUM: 'light-blue',
    NUCLEUS: 'purple',
    DEUTEROS_1: 'cyan',
    DEUTEROS_2: 'deep-purple',
    ATHLOS_EPIKOS: 'amber',
  };
  return colorMap[role] || 'grey';
}

/**
 * Get CSS hex color based on block role
 *
 * Returns hex color values for CSS custom properties and inline styles.
 * These match the Quasar color palette.
 *
 * @param role - Block role
 * @returns Hex color string (e.g., '#03A9F4')
 */
export function getBlockCSSColor(role: BlockRole): string {
  const colorMap: Record<BlockRole, string> = {
    INITIUM: '#03A9F4',      // Light Blue
    NUCLEUS: '#9C27B0',      // Purple
    DEUTEROS_1: '#00BCD4',   // Cyan
    DEUTEROS_2: '#673AB7',   // Deep Purple
    ATHLOS_EPIKOS: '#FFC107', // Amber
  };
  return colorMap[role] || '#9E9E9E'; // Grey fallback
}
