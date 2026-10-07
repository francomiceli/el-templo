/**
 * Sedes de El Templo — adapter tipado sobre `data/generated/web-data.json`
 * (fase 195, D-10).
 *
 * El JSON lo escribe `scripts/fetch-web-data.mjs` en cada build a partir de
 * `GET /api/web/site-data` (tabla `branches`): direcciones, slugs, coordenadas,
 * marca y WhatsApp de ventas viven ahi, nunca en este archivo.
 *
 * Mar del Plata = sedes `gym` de Argentina. Barcelona = sedes `gym` de Espana.
 * El Templo Park NO es una sede: es un espacio de comunidad (`communitySpaces`).
 * Los conteos se DERIVAN (`sedesCount`), nunca se escriben como numero literal
 * en copy.
 */
import rawData from "./generated/web-data.json";
import type { WebData, WebSede } from "./web-data.types";
import { sedePath } from "~/utils/schema-graph";
import { DEFAULT_TRIAL_TEXT, salesWhatsappUrl } from "~/utils/whatsapp";

export interface Sede {
  id: string;
  name: string;
  address: string;
  city: "Mar del Plata" | "Barcelona";
  /** "gym" = sede con clases. "community_space" = espacio de comunidad. */
  kind?: "gym" | "community_space";
  /** Ruta de la pagina de la sede (`/sedes/<slug>` o `/es/sedes/<slug>`). */
  path: string;
  mapsUrl: string;
  whatsappUrl: string;
  badge?: {
    text: string;
    variant: "outdoor" | "special" | "intl";
  };
  /** Photo path in public/images/photos/ (when available) */
  photo?: string;
  lat?: number;
  lng?: number;
}

export const webData = rawData as unknown as WebData;

/** Nombre canonico de la marca (D-02), configurable en la API. */
export const brandName = webData.brand.name;

/** Array crudo del endpoint (slug, horarios, geo...) para paginas y schema. */
export const webSedes: WebSede[] = webData.sedes;

export function findWebSede(slug: string): WebSede | undefined {
  return webSedes.find((s) => s.slug === slug);
}

function toSede(s: WebSede): Sede {
  return {
    id: s.slug,
    name: s.publicName,
    address: s.address.street ?? "",
    city: s.country === "ES" ? "Barcelona" : "Mar del Plata",
    kind: s.kind,
    path: sedePath(s),
    mapsUrl: s.mapsUrl,
    whatsappUrl: salesWhatsappUrl(s.country, DEFAULT_TRIAL_TEXT),
    photo: s.photoUrl ?? undefined,
    lat: s.geo?.lat,
    lng: s.geo?.lng,
  };
}

/** Sedes con clases, Argentina primero. */
export const sedes: Sede[] = [
  ...webSedes.filter((s) => s.kind === "gym" && s.country === "AR"),
  ...webSedes.filter((s) => s.kind === "gym" && s.country === "ES"),
].map(toSede);

/**
 * Espacios de comunidad: lugares donde El Templo entrena pero que NO son una
 * sede (sin ficha de gimnasio ni ExerciseGym en el schema).
 */
export const communitySpaces: Sede[] = webSedes
  .filter((s) => s.kind === "community_space")
  .map(toSede);

/** Sedes grouped by city for rendering */
export const sedesByCity = {
  mdp: sedes.filter((s) => s.city === "Mar del Plata"),
  bcn: sedes.filter((s) => s.city === "Barcelona"),
} as const;

/** Conteos derivados de `sedes`: nunca escribir 6/7 como literal en copy. */
export const sedesCount = {
  mdp: sedesByCity.mdp.length,
  bcn: sedesByCity.bcn.length,
  total: sedes.length,
};
