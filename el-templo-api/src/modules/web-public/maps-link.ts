/**
 * Parser de links de Google Maps (fase 195, plan 14, D-08).
 *
 * Funciones PURAS (sin red, sin base de datos): sacan latitud, longitud y
 * Place ID de un link de Google Maps. Las usa el script
 * `scripts/sedes-maps-a-migracion.ts`, que se encarga de seguir los links
 * cortos (`maps.app.goo.gl`) antes de llamar acá.
 *
 * Solo se aceptan links de Google Maps (lista cerrada de hosts): un link a
 * cualquier otro sitio devuelve null aunque tenga números parecidos a
 * coordenadas.
 */

export interface ParsedMapsLink {
  lat: number | null;
  lng: number | null;
  placeId: string | null;
}

/** Hosts de Google Maps aceptados como destino final de un link. */
export function isGoogleMapsUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "maps.google.com") return true;
  if (host === "www.google.com" || host === "google.com") {
    return url.pathname === "/maps" || url.pathname.startsWith("/maps/");
  }
  return false;
}

/**
 * Links cortos de Google Maps. NUNCA son un destino final válido: solo se
 * aceptan como salto intermedio hasta llegar a un host de `isGoogleMapsUrl`.
 */
export function isShortMapsUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return true;
  if (host === "goo.gl") {
    return url.pathname === "/maps" || url.pathname.startsWith("/maps/");
  }
  return false;
}

const NUMBER = String.raw`-?\d+(?:\.\d+)?`;
/** `!3d<lat>!4d<lng>`: el punto del lugar dentro del parámetro `data=`. */
const DATA_POINT = new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`);
/** `@<lat>,<lng>`: el centro de la vista del mapa (menos preciso). */
const AT_CENTER = new RegExp(`@(${NUMBER}),(${NUMBER})`);
/** `/maps/place/<lat>,<lng>`: coordenadas pegadas directamente en la ruta. */
const PATH_POINT = new RegExp(
  `^/maps/(?:place|search)/(${NUMBER}),\\s*(${NUMBER})(?:/|$)`,
);
/** Valor de `q=`, `query=` o `ll=` que es solo `<lat>,<lng>`. */
const QUERY_POINT = new RegExp(`^\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*$`);
const PLACE_ID = /^[A-Za-z0-9_-]+$/;

function toCoords(
  latText: string | undefined,
  lngText: string | undefined,
): { lat: number; lng: number } | "invalid" {
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "invalid";
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "invalid";
  // 0,0 es el valor de relleno de Google cuando no hay punto: no es una sede.
  if (lat === 0 && lng === 0) return "invalid";
  return { lat, lng };
}

/** Primer candidato de coordenadas, en orden de confianza. */
function findCoords(url: URL): { lat: number; lng: number } | "invalid" | null {
  const raw = url.href;
  const data = DATA_POINT.exec(raw);
  if (data) return toCoords(data[1], data[2]);

  const at = AT_CENTER.exec(url.pathname);
  if (at) return toCoords(at[1], at[2]);

  const inPath = PATH_POINT.exec(url.pathname);
  if (inPath) return toCoords(inPath[1], inPath[2]);

  for (const key of ["q", "query", "ll"]) {
    const value = url.searchParams.get(key);
    if (value === null) continue;
    const point = QUERY_POINT.exec(value);
    if (point) return toCoords(point[1], point[2]);
  }
  return null;
}

function findPlaceId(url: URL): string | null {
  const candidates: string[] = [];
  const fromParam = url.searchParams.get("query_place_id");
  if (fromParam !== null) candidates.push(fromParam);
  const fromPlaceParam = url.searchParams.get("place_id");
  if (fromPlaceParam !== null) candidates.push(fromPlaceParam);
  for (const key of ["q", "query"]) {
    const value = url.searchParams.get(key);
    if (value !== null && value.startsWith("place_id:")) {
      candidates.push(value.slice("place_id:".length));
    }
  }
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (PLACE_ID.test(trimmed)) return trimmed;
  }
  return null;
}

/**
 * Lee un link LARGO de Google Maps. Devuelve null si no es de Google Maps, si
 * las coordenadas están fuera de rango o si no trae ni coordenadas ni Place ID.
 * Prioridad de coordenadas: `!3d/!4d` (el punto del lugar), `@` (el centro de la
 * vista), coordenadas en la ruta y `q`/`query`/`ll`.
 */
export function parseMapsLink(link: string): ParsedMapsLink | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (!isGoogleMapsUrl(url)) return null;

  const found = findCoords(url);
  if (found === "invalid") return null;
  const placeId = findPlaceId(url);
  if (found === null && placeId === null) return null;
  return {
    lat: found === null ? null : found.lat,
    lng: found === null ? null : found.lng,
    placeId,
  };
}

/**
 * ¿La coordenada tiene al menos 5 decimales (D-03)? Con 4 decimales el error
 * llega a ~11 m: la web no publica `geo` en el schema por debajo de 5.
 * Los ceros finales no cuentan (se pierden al convertir el texto a número).
 */
export function precisionOk(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const text = value.toFixed(10).replace(/0+$/, "");
  const decimals = text.split(".")[1]?.length ?? 0;
  return decimals >= 5;
}
