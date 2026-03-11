/**
 * Shared chart color constants for analytics components.
 * Used by MiembrosTab, AsistenciaTab, and FinanzasTab.
 */

export const COLORS = {
  primary: '#c07a56',
  secondary: '#b89b5e',
  positive: '#5a9a6b',
  negative: '#b34a4a',
  warning: '#d4a843',
  accent: '#3d3732',
  info: '#8a8472',
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
