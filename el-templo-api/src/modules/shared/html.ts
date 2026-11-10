/**
 * Escape a string for safe interpolation into HTML text or attribute context.
 *
 * Una sola copia para los mails (`email/templates.ts`, `campaigns/templates.ts`):
 * cualquier dato que viene de un usuario o de la DB (nombre, clave temporal,
 * headline, direcciones) se pasa por acá antes de entrar a un template HTML.
 * Escapa `& < > " '` (el `&` primero, para no doble-escapar las entidades).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
