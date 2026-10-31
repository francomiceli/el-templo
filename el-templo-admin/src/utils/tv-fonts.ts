/**
 * Fuentes del TV (Cinzel + NunitoSans) embebidas desde pdf-assets, sin CDN.
 * Para las placas fullscreen autocontenidas (inauguración, cumpleaños): cada
 * página instala un <style> con su propio id al montar y lo saca al salir.
 */

import {
  CINZEL_REGULAR_BASE64,
  CINZEL_BOLD_BASE64,
  NUNITO_SANS_REGULAR_BASE64,
  NUNITO_SANS_BOLD_BASE64,
} from 'src/utils/pdf/pdf-assets';

function fontFace(family: string, base64: string, weight: number): string {
  return (
    "@font-face{font-family:'" +
    family +
    "';font-weight:" +
    weight +
    ';font-style:normal;font-display:block;' +
    'src:url(data:font/truetype;charset=utf-8;base64,' +
    base64 +
    ") format('truetype');}"
  );
}

export function installTvFonts(styleId: string): void {
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent =
    fontFace('Cinzel', CINZEL_REGULAR_BASE64, 400) +
    fontFace('Cinzel', CINZEL_BOLD_BASE64, 700) +
    fontFace('NunitoSans', NUNITO_SANS_REGULAR_BASE64, 400) +
    fontFace('NunitoSans', NUNITO_SANS_BOLD_BASE64, 700);
  document.head.appendChild(style);
}

export function removeTvFonts(styleId: string): void {
  document.getElementById(styleId)?.remove();
}
