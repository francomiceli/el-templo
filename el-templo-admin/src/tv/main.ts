/**
 * Entry unico del bundle del kiosco (`/tv/`).
 *
 * Todo lo que corre en el televisor entra por aca: `scripts/build-tv.mjs` bundlea este
 * archivo con esbuild (IIFE, target es2015) y lo inlinea dentro de public/tv/index.html.
 *
 * Despacha por query string:
 *   /tv/?selftest=1 → corre los vectores dorados del timer en el hardware real (164-07)
 *   /tv/?diag=1     → pantalla de diagnostico: user agent, feature-detects, version (164-06)
 *   /tv/            → el kiosco (164-11)
 *
 * Las QUOTES del PDF se importan ACA y bajan por parametro a `boot`: el kiosco tiene un
 * unico punto de entrada de las frases (D-06/D-08) y no una segunda copia como la que se
 * evito a proposito en el contrato del API (164-02).
 */

import { QUOTES } from '../utils/pdf/quotes';
import { boot } from './boot';
import { renderDiag } from './diag';
import { scaleTv } from './scale';
import { runSelfTest } from './selftest';

declare global {
  interface Window {
    /** Version del build, inyectada por scripts/build-tv.mjs. Igual a /tv/version.txt (D-22). */
    __TV_VERSION__?: string;
    /**
     * Origen del API (sin el sufijo `/api`), inyectado por scripts/build-tv.mjs desde
     * VITE_API_URL. El kiosco no pasa por Vite, asi que no hereda esa env como el SPA.
     * Cadena vacia = no vino en el build y `tvApiBase()` cae al host que sirve la pagina.
     */
    __TV_API_BASE__?: string;
  }
}

/** `URLSearchParams` es Chromium 49 y el piso es 53, pero un indexOf no puede fallar. */
function hasFlag(name: string): boolean {
  return window.location.search.indexOf(name + '=1') >= 0;
}

// El marco 16:9 y el tamaño de fuente se calculan por JS (nada de container queries):
// una sola vez al arrancar y en cada resize. NO ResizeObserver (Chromium 64+).
scaleTv();
window.addEventListener('resize', scaleTv);

if (hasFlag('selftest')) {
  runSelfTest();
} else if (hasFlag('diag')) {
  renderDiag();
} else {
  boot(QUOTES);
}
