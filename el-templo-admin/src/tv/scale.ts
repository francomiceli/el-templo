/**
 * Escalado del marco del kiosco: 16:9 exacto + tamaño de fuente raiz derivado del ancho.
 *
 * Reemplaza dos features de CSS que el piso de compatibilidad (Chromium 53 — D-20) no
 * tiene, y que el mockup v8 usaba (RESEARCH Pattern 7 / Pitfall 4):
 *
 *   container-type: size + unidades de contenedor  ->  html { font-size: anchoDelTv / 100 }
 *   relacion de aspecto 16/9 en CSS                ->  width/height en px sobre #tv
 *
 * Con eso, 1rem vale exactamente lo que valia 1% del ancho del marco en el mockup: la
 * conversion del CSS fue mecanica (medida X -> X rem) y las proporciones son las mismas
 * a cualquier tamaño de ventana. Se usa rem y NO em porque los em se componen en cascada
 * y el layout anida hasta 4 niveles.
 *
 * Se llama desde `main.ts` al arrancar y en cada evento `resize` de la ventana. NUNCA con
 * el observer de redimension del DOM (Chromium 64, mas nuevo que el piso): en un TV de
 * sede eso seria pantalla en blanco sin error visible.
 */

/** Proporcion del marco: el PDF de planis se genera a 3840x2160. */
const TV_ASPECT = 16 / 9;

/**
 * Ancho del marco 16:9 mas grande que entra en la ventana actual.
 * Exportado porque `?diag=1` lo imprime (es el numero que explica un layout raro).
 */
export function tvWidth(): number {
  const byWidth = window.innerWidth;
  const byHeight = window.innerHeight * TV_ASPECT;
  const w = byWidth < byHeight ? byWidth : byHeight;
  // Guard: algunos browsers de TV reportan 0 durante el arranque o con la pestaña oculta.
  return w > 0 ? w : 0;
}

/**
 * Ajusta el marco y la escala tipografica al tamaño disponible.
 * Idempotente y barata: se puede llamar en cada `resize` sin acumular nada (Pitfall 13).
 */
export function scaleTv(): void {
  const el = document.getElementById('tv');
  if (!el) {
    // Modo diag/selftest o markup distinto: no hay marco que escalar.
    return;
  }
  const w = tvWidth();
  if (w <= 0) {
    return;
  }
  el.style.width = w + 'px';
  el.style.height = w / TV_ASPECT + 'px';
  document.documentElement.style.fontSize = w / 100 + 'px';
}

/**
 * Dos digitos con cero a la izquierda.
 *
 * A mano y no con el metodo de relleno del string: ese es ES2017 / Chromium 57 y revienta
 * en webOS 4.x con un TypeError que en un televisor nadie puede leer (Pitfall 5). El
 * tsconfig del kiosco ya lo rechaza en compilacion; este helper es el reemplazo oficial
 * para todo `src/tv/` (reloj, timer, logger).
 */
export function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}
