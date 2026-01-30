import type { BlockRole } from '../types/session';

/**
 * El Templo Brand Colors for blocks
 *
 * Uses brand palette with opacity variations:
 * - Navy (#2c3e5c) - primary brand color
 * - Bronze (#b8956c) - secondary/accent color
 * - Cream (#f5f0e8) - background color
 */

// Brand color constants
const BRAND_NAVY = '#2c3e5c';
const BRAND_BRONZE = '#b8956c';

/**
 * Get background color class based on block role
 *
 * Uses cream background with brand-colored borders/accents instead of
 * non-brand colors. All blocks use consistent brand palette.
 *
 * @param role - Block role
 * @returns CSS class for background styling
 */
export function getBlockColorClass(role: BlockRole): string {
  // All blocks use cream background with role-specific opacity accents
  const opacityMap: Record<BlockRole, string> = {
    INITIUM: 'block-bg--initium',
    NUCLEUS: 'block-bg--nucleus',
    DEUTEROS_1: 'block-bg--deuteros-1',
    DEUTEROS_2: 'block-bg--deuteros-2',
    ATHLOS: 'block-bg--athlos',
    EPIKOS: 'block-bg--athlos',
  };
  return opacityMap[role] || 'block-bg--default';
}

/**
 * Get accent color name based on block role
 *
 * All blocks use brand colors (primary navy or secondary bronze)
 * instead of non-brand colors like cyan, purple, etc.
 *
 * @param role - Block role
 * @returns Quasar color name ('primary' or 'secondary')
 */
export function getBlockAccentColor(role: BlockRole): string {
  // Use primary (navy) for main blocks, secondary (bronze) for variants
  const colorMap: Record<BlockRole, string> = {
    INITIUM: 'secondary',     // Bronze - warm start
    NUCLEUS: 'primary',       // Navy - core block
    DEUTEROS_1: 'primary',    // Navy - accessory option 1
    DEUTEROS_2: 'secondary',  // Bronze - accessory option 2
    ATHLOS: 'secondary',      // Bronze - challenge
    EPIKOS: 'secondary',      // Bronze - epic challenge
  };
  return colorMap[role] || 'primary';
}

/**
 * Get CSS hex color based on block role
 *
 * Returns brand hex color values (navy or bronze) for CSS inline styles.
 *
 * @param role - Block role
 * @returns Hex color string (navy or bronze)
 */
export function getBlockCSSColor(role: BlockRole): string {
  const colorMap: Record<BlockRole, string> = {
    INITIUM: BRAND_BRONZE,    // Bronze - warm start
    NUCLEUS: BRAND_NAVY,      // Navy - core block
    DEUTEROS_1: BRAND_NAVY,   // Navy - accessory option 1
    DEUTEROS_2: BRAND_BRONZE, // Bronze - accessory option 2
    ATHLOS: BRAND_BRONZE,     // Bronze - challenge
    EPIKOS: BRAND_BRONZE,     // Bronze - epic challenge
  };
  return colorMap[role] || BRAND_NAVY;
}

/**
 * Get block header gradient based on role
 *
 * Returns CSS gradient string for block headers with brand colors.
 *
 * @param role - Block role
 * @returns CSS gradient string
 */
export function getBlockHeaderGradient(role: BlockRole): string {
  const isNavy = role === 'NUCLEUS' || role === 'DEUTEROS_1';
  if (isNavy) {
    return 'linear-gradient(135deg, #2c3e5c 0%, #3d5275 100%)';
  }
  return 'linear-gradient(135deg, #b8956c 0%, #c9a77d 100%)';
}
