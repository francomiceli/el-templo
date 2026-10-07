/**
 * Sede data — 7 El Templo locations (fase 195, D-07).
 *
 * Grouped by city: Mar del Plata (6), Barcelona (1). El Templo Park NO es una
 * sede: es un espacio de comunidad en el Parque Primavesi y vive aparte en
 * `communitySpaces`. la sede de Los Lobos ya no existe. Los conteos se DERIVAN de este
 * archivo (`sedesCount`), nunca se escriben como numero literal en copy.
 *
 * Each sede carries the WhatsApp number for its country (AR for Mar del Plata,
 * ES for Barcelona) until the build lee los numeros desde la API (plan 195-03).
 */

// Deploy 2026-09-04: el build de la web (rename Sur→Mario Bravo) quedó sin
// publicar por un test roto en la API (paths-filter usa event.before).
export interface Sede {
  id: string;
  name: string;
  address: string;
  city: "Mar del Plata" | "Barcelona";
  /** "gym" = sede con clases. "community_space" = espacio de comunidad. */
  kind?: "gym" | "community_space";
  mapsUrl: string;
  whatsappUrl: string;
  badge?: {
    text: string;
    variant: "outdoor" | "special" | "intl";
  };
  /** Photo path in public/images/photos/ (when available) */
  photo?: string;
  /** Approximate latitude for structured data (exact values in Phase 38) */
  lat?: number;
  /** Approximate longitude for structured data (exact values in Phase 38) */
  lng?: number;
}

// Argentine support line, used by all Mar del Plata sedes.
const WHATSAPP_URL_AR =
  "https://wa.me/5492235820521?text=Hola%21%20Quiero%20reservar%20mi%20primera%20sesi%C3%B3n%20de%20prueba";

// Spain support line, used by Barcelona sede.
const WHATSAPP_URL_ES =
  "https://wa.me/34680774331?text=Hola%21%20Quiero%20reservar%20mi%20primera%20sesi%C3%B3n%20de%20prueba";

export const sedes: Sede[] = [
  {
    id: "constitucion",
    name: "Constituci\u00F3n",
    address: "Av. Constituci\u00F3n 6745",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Av+Constitucion+6745+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL_AR,
    lat: -37.9566,
    lng: -57.571,
  },
  {
    id: "jujuy",
    name: "Jujuy",
    address: "Jujuy 3761",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Jujuy+3761+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL_AR,
    lat: -38.0117,
    lng: -57.5684,
  },
  {
    id: "moreno",
    name: "Moreno",
    address: "Moreno 3751",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Moreno+3751+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL_AR,
    lat: -37.9958,
    lng: -57.5605,
  },
  {
    id: "juan-b-justo",
    name: "Juan B. Justo",
    address: "Juan B. Justo 1018",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Juan+B.+Justo+1018+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL_AR,
    lat: -38.0335,
    lng: -57.5522,
  },
  {
    id: "alberti",
    name: "Alberti",
    address: "Alberti 2024",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Alberti+2024+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL_AR,
    badge: {
      text: "Nueva",
      variant: "special",
    },
    lat: -38.0019,
    lng: -57.546,
  },
  {
    id: "mogotes",
    name: "Mario Bravo",
    address: "Mario Bravo 618",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Mario+Bravo+618+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL_AR,
    lat: -38.0797,
    lng: -57.5468,
  },
  {
    id: "barcelona",
    name: "Barcelona (Eixample)",
    address: "Av. Diagonal 368",
    city: "Barcelona",
    mapsUrl: "https://maps.google.com/?q=Av+Diagonal+368+Barcelona",
    whatsappUrl: WHATSAPP_URL_ES,
    lat: 41.3996,
    lng: 2.1709,
  },
];

/**
 * Espacios de comunidad: lugares donde El Templo entrena pero que NO son una
 * sede (sin ficha de gimnasio ni ExerciseGym en el schema). Hoy solo el Parque
 * Primavesi.
 */
export const communitySpaces: Sede[] = [
  {
    id: "parque-primavesi",
    name: "El Templo Park",
    address: "Parque Primavesi",
    city: "Mar del Plata",
    kind: "community_space",
    mapsUrl: "https://maps.google.com/?q=Parque+Primavesi+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL_AR,
    photo: "/images/photos/sede-park.webp",
    lat: -38.0287,
    lng: -57.5424,
  },
];

/** Sedes grouped by city for rendering */
export const sedesByCity = {
  mdp: sedes.filter((s) => s.city === "Mar del Plata"),
  bcn: sedes.filter((s) => s.city === "Barcelona"),
} as const;

/** Conteos derivados de `sedes` (D-07): nunca escribir 6/7 como literal en copy. */
export const sedesCount = {
  mdp: sedesByCity.mdp.length,
  bcn: sedesByCity.bcn.length,
  total: sedes.length,
};
