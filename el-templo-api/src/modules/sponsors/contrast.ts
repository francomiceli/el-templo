// Module: sponsors — contraste WCAG 2.x (Fase 199, D-19).
//
// Espejo de el-templo-admin/src/utils/contrast.ts (plan 08) — mantener
// idénticos. El server revalida lo que el editor ya muestra, para que ninguna
// marca se guarde con texto ilegible aunque se llame a la API directo.

/** Contraste mínimo WCAG AA para texto normal. */
export const MIN_TEXT_CONTRAST = 4.5;

/** Color `#rrggbb` (sin alfa, sin forma corta). */
export const HEX_COLOR_PATTERN = "^#[0-9a-fA-F]{6}$";

const HEX_COLOR_REGEX = new RegExp(HEX_COLOR_PATTERN);

function relativeLuminance(hex: string): number {
  if (!HEX_COLOR_REGEX.test(hex)) {
    throw new Error(`Color hexadecimal inválido: ${hex}`);
  }
  const channels = [1, 3, 5].map((start) => {
    const c = parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Ratio de contraste WCAG entre dos colores `#rrggbb` (1..21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
