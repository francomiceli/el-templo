/**
 * Shared chart color constants for analytics components.
 * Used by MiembrosTab, AsistenciaTab, and FinanzasTab.
 */

export const COLORS = {
  primary: '#96593a',
  secondary: '#7d5d42',
  positive: '#3b7249',
  negative: '#b34a4a',
  warning: '#7d6520',
  accent: '#3d3732',
  info: '#6b6459',
} as const;

export const chartColors = [
  COLORS.primary,
  COLORS.secondary,
  COLORS.positive,
  COLORS.negative,
  COLORS.warning,
  COLORS.accent,
  COLORS.info,
  '#7b68a8',
  '#4a90c2',
  '#c2694a',
] as const;
