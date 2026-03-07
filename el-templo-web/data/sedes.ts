/**
 * Sede data — 8 physical El Templo locations.
 *
 * Grouped by city: Mar del Plata (7), Barcelona (1).
 * Shared WhatsApp link for all "Reservar sesion" CTAs until
 * individual sede numbers are available.
 */

export interface Sede {
  id: string;
  name: string;
  address: string;
  city: "Mar del Plata" | "Barcelona";
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

const WHATSAPP_URL =
  "https://wa.me/5492235820521?text=Hola%21%20Quiero%20reservar%20mi%20primera%20sesi%C3%B3n%20de%20prueba";

export const sedes: Sede[] = [
  {
    id: "constitucion",
    name: "Constituci\u00F3n",
    address: "Av. Constituci\u00F3n 6745",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Av+Constitucion+6745+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
    lat: -38.005,
    lng: -57.545,
  },
  {
    id: "jujuy",
    name: "Jujuy",
    address: "Jujuy 3761",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Jujuy+3761+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
    lat: -38.008,
    lng: -57.553,
  },
  {
    id: "moreno",
    name: "Moreno",
    address: "Moreno 3751",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Moreno+3751+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
    lat: -38.007,
    lng: -57.552,
  },
  {
    id: "alem",
    name: "Alem",
    address: "Alem 3958",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Alem+3958+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
    lat: -38.004,
    lng: -57.548,
  },
  {
    id: "mogotes",
    name: "Mogotes",
    address: "Mario Bravo 618",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Mario+Bravo+618+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
    lat: -38.01,
    lng: -57.555,
  },
  {
    id: "park",
    name: "Park",
    address: "Parque Primavesi",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Parque+Primavesi+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
    photo: "/images/photos/sede-park.webp",
    lat: -38.015,
    lng: -57.56,
  },
  {
    id: "chapadmalal",
    name: "Chapadmalal",
    address: "Los Lobos, Chapadmalal",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Los+Lobos+Chapadmalal+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
    lat: -38.18,
    lng: -57.7,
  },
  {
    id: "barcelona",
    name: "Eixample",
    address: "Av. Diagonal 368",
    city: "Barcelona",
    mapsUrl: "https://maps.google.com/?q=Av+Diagonal+368+Barcelona",
    whatsappUrl: WHATSAPP_URL,
    lat: 41.393,
    lng: 2.163,
  },
];

/** Sedes grouped by city for rendering */
export const sedesByCity = {
  mdp: sedes.filter((s) => s.city === "Mar del Plata"),
  bcn: sedes.filter((s) => s.city === "Barcelona"),
} as const;
