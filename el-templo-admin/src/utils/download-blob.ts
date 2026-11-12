/**
 * Dispara la descarga de un `Blob` en el navegador con el nombre dado
 * (ancla temporal + object URL, que se libera al terminar).
 *
 * Los exports más viejos (Reportes, Deudas, Frecuencia, Sesiones de prueba)
 * tienen cada uno su copia local de esta función — lo nuevo usa esta.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
