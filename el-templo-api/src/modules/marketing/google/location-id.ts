/**
 * Google Business Profile — id de ficha (fase 195, plan 09).
 *
 * Módulo mínimo y sin dependencias a propósito: lo usan el servicio de sync y
 * los scripts locales (`scripts/gbp-list-locations.ts`) sin arrastrar el schema
 * ni Fastify.
 */

/**
 * `locations/123` o `123` → `123`; cualquier otra cosa → null. El id viaja en la
 * RUTA del PATCH, así que solo se aceptan dígitos (nada de `..` ni `/`).
 */
export function normalizeLocationId(raw: string): string | null {
  const id = raw.trim().replace(/^locations\//, "");
  return /^[0-9]{1,30}$/.test(id) ? id : null;
}
