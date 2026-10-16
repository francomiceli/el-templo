/**
 * Contraste WCAG 2.x (Fase 199, D-19).
 *
 * Espejo de el-templo-api/src/modules/sponsors/contrast.ts — mantener
 * idénticos (D-19: contraste >= 4.5 validado en el editor Y en el server).
 * Mismos umbrales, misma fórmula y misma excepción ante un hex inválido, así
 * el admin no deja guardar algo que el API rechaza ni al revés.
 */

/** Contraste mínimo WCAG AA para texto normal. */
export const MIN_TEXT_CONTRAST = 4.5;

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/** Color `#rrggbb` (sin alfa, sin forma corta). */
export function isHexColor(value: string): boolean {
  return HEX_COLOR_REGEX.test(value);
}

function relativeLuminance(hex: string): number {
  if (!isHexColor(hex)) {
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

/**
 * Texto del ratio para mostrar, ej. `"5.62:1"`. Trunca (no redondea) a 2
 * decimales: un 4.496 que el server rechaza no puede mostrarse como "4.50:1".
 */
export function formatRatio(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}
