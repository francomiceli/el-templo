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
}

const WHATSAPP_URL =
  "https://wa.me/5492235820521?text=Hola%21%20Quiero%20reservar%20mi%20primera%20sesi%C3%B3n%20de%20prueba";

export const sedes: Sede[] = [
  {
    id: "constitucion",
    name: "Constituci\u00F3n",
    address: "Constituci\u00F3n 6745",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Constitucion+6745+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
  },
  {
    id: "jujuy",
    name: "Jujuy",
    address: "Jujuy 3761",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Jujuy+3761+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
  },
  {
    id: "moreno",
    name: "Moreno",
    address: "Moreno 3751",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Moreno+3751+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
  },
  {
    id: "alem",
    name: "Alem",
    address: "Alem 3958",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Alem+3958+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
  },
  {
    id: "mario-bravo",
    name: "Mario Bravo",
    address: "Mario Bravo 618",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Mario+Bravo+618+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
  },
  {
    id: "park",
    name: "Park",
    address: "Parque Primavesi",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Parque+Primavesi+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
    badge: {
      text: "AL AIRE LIBRE",
      variant: "outdoor",
    },
  },
  {
    id: "chapadmalal",
    name: "Chapadmalal",
    address: "Los Lobos, Chapadmalal",
    city: "Mar del Plata",
    mapsUrl: "https://maps.google.com/?q=Los+Lobos+Chapadmalal+Mar+del+Plata",
    whatsappUrl: WHATSAPP_URL,
    badge: {
      text: "RETIRO",
      variant: "special",
    },
  },
  {
    id: "barcelona",
    name: "Barcelona",
    address: "Av. Diagonal 368",
    city: "Barcelona",
    mapsUrl: "https://maps.google.com/?q=Av+Diagonal+368+Barcelona",
    whatsappUrl: WHATSAPP_URL,
    badge: {
      text: "INTERNACIONAL",
      variant: "intl",
    },
  },
];

/** Sedes grouped by city for rendering */
export const sedesByCity = {
  mdp: sedes.filter((s) => s.city === "Mar del Plata"),
  bcn: sedes.filter((s) => s.city === "Barcelona"),
} as const;
