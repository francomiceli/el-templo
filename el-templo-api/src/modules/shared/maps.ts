/**
 * Google Maps "Cómo llegar" link builder (Fase 180, D-17).
 *
 * Fuente ÚNICA de construcción del link de Maps en toda la API. Lo consumen:
 * - `GET /api/members/scheduling/branches` (selector de sede en la app)
 * - `sedeRow` en `campaigns/templates.ts` (email de campaña)
 * - La confirmación de prueba (`trials-service.ts`, vía `branchAddress`)
 *
 * No requiere API key: usa el endpoint público de búsqueda de Google Maps
 * (`https://www.google.com/maps/search/?api=1&query=...`), que resuelve la
 * dirección como si el usuario la hubiera tipeado en el buscador de Maps.
 */

/**
 * Construye la URL de "Cómo llegar" a partir de una dirección de sede.
 *
 * Devuelve `null` cuando no hay dirección utilizable (ausente, `null`,
 * `undefined` o solo espacios en blanco) para no producir un link a una
 * búsqueda vacía.
 */
export function buildMapsUrl(address: string | null | undefined): string | null {
  const trimmed = address?.trim();
  if (!trimmed) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}
