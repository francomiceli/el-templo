import type { BlockRole } from '../types/session'

/**
 * El Templo Brand Colors for blocks
 *
 * Uses brand palette with opacity variations:
 * - Terracotta (#c07a56) - primary brand color
 * - Aged Gold (#b89b5e) - secondary/accent color
 * - Deep Charcoal (#3d3732) - text color
 */

// Brand color constants
const BRAND_TERRACOTTA = '#c07a56'
const BRAND_AGED_GOLD = '#b89b5e'

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
  }
  return opacityMap[role] || 'block-bg--default'
}

/**
 * Get accent color name based on block role
 *
 * All blocks use brand colors (primary terracotta or secondary aged gold)
 * instead of non-brand colors like cyan, purple, etc.
 *
 * @param role - Block role
 * @returns Quasar color name ('primary' or 'secondary')
 */
export function getBlockAccentColor(role: BlockRole): string {
  // Use primary (terracotta) for main blocks, secondary (aged gold) for variants
  const colorMap: Record<BlockRole, string> = {
    INITIUM: 'secondary', // Aged Gold - warm start
    NUCLEUS: 'primary', // Terracotta - core block
    DEUTEROS_1: 'primary', // Terracotta - accessory option 1
    DEUTEROS_2: 'secondary', // Aged Gold - accessory option 2
    ATHLOS: 'secondary', // Aged Gold - challenge
    EPIKOS: 'secondary', // Aged Gold - epic challenge
  }
  return colorMap[role] || 'primary'
}

/**
 * Get CSS hex color based on block role
 *
 * Returns brand hex color values (terracotta or aged gold) for CSS inline styles.
 *
 * @param role - Block role
 * @returns Hex color string (terracotta or aged gold)
 */
export function getBlockCSSColor(role: BlockRole): string {
  const colorMap: Record<BlockRole, string> = {
    INITIUM: BRAND_AGED_GOLD, // Aged Gold - warm start
    NUCLEUS: BRAND_TERRACOTTA, // Terracotta - core block
    DEUTEROS_1: BRAND_TERRACOTTA, // Terracotta - accessory option 1
    DEUTEROS_2: BRAND_AGED_GOLD, // Aged Gold - accessory option 2
    ATHLOS: BRAND_AGED_GOLD, // Aged Gold - challenge
    EPIKOS: BRAND_AGED_GOLD, // Aged Gold - epic challenge
  }
  return colorMap[role] || BRAND_TERRACOTTA
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
  const isTerracotta = role === 'NUCLEUS' || role === 'DEUTEROS_1'
  if (isTerracotta) {
    return 'linear-gradient(135deg, #c07a56 0%, #d08b67 100%)'
  }
  return 'linear-gradient(135deg, #b89b5e 0%, #c9ac6f 100%)'
}
