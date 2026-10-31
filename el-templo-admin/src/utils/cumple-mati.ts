/**
 * Festejo de cumpleaños de Mati Mamana (31/10/2026) en el TV de la sede
 * Alberti. La pantalla vive en '/pantalla-cumple-mati' (TvCumpleMatiPage) y se
 * abre con un botón de TV control, al lado de "Mostrar plani en el TV".
 *
 * El botón se apaga solo pasada la ventana del festejo; la ruta sigue
 * accesible por URL hasta que se retire la página.
 */

export const CUMPLE_MATI_PATH = '/pantalla-cumple-mati';

/** Último día (inclusive, hora local del navegador) en que se ve el botón. */
export const CUMPLE_MATI_ULTIMO_DIA = '2026-11-03';

function fechaLocal(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isCumpleMatiVisible(now: Date = new Date()): boolean {
  return fechaLocal(now) <= CUMPLE_MATI_ULTIMO_DIA;
}
