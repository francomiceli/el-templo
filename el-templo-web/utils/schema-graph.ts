/**
 * Grafo JSON-LD propio de la web (fase 195, D-02/D-03).
 *
 * Funciones puras: reciben los datos del build (`data/generated/web-data.json`)
 * y devuelven nodos schema.org. Reemplazan a `nuxt-schema-org`, cuya `identity`
 * colapsaba todas las entidades en un solo nodo.
 *
 * - Un solo `Organization` raiz con `@id` fijo (`ORG_ID`), referenciado por el
 *   resto de los nodos.
 * - Un `ExerciseGym` por sede con clases (`@id` propio, `parentOrganization`).
 * - Los espacios de comunidad (El Templo Park) son `Place`, NUNCA `ExerciseGym`.
 * - `geo` solo con coordenadas exactas (>= 5 decimales): las aproximadas del
 *   seed sirven para mapas, no se publican en el schema (T-195-15).
 */
import type { WebData, WebSede } from "~/data/web-data.types";

export type JsonLdNode = Record<string, unknown>;

export const SITE_URL = "https://eltemplo.org";
export const ORG_ID = `${SITE_URL}/#organization`;
const LOGO_URL = `${SITE_URL}/favicon-192x192.png`;
const SAME_AS = [
  "https://www.instagram.com/eltemplomdp/",
  "https://www.youtube.com/@ElTemplomdp/",
  "https://www.facebook.com/eltemplomdp/",
];

/** `dayOfWeek` 1 (lunes) .. 7 (domingo) -> nombre schema.org. */
export const DAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/** Ruta relativa de la pagina de la sede: AR en `/sedes`, ES en `/es/sedes`. */
export function sedePath(sede: Pick<WebSede, "slug" | "country">): string {
  return sede.country === "ES"
    ? `/es/sedes/${sede.slug}`
    : `/sedes/${sede.slug}`;
}

/** URL absoluta (canonica) de la pagina de la sede. */
export function sedeUrl(sede: Pick<WebSede, "slug" | "country">): string {
  return `${SITE_URL}${sedePath(sede)}`;
}

function decimals(value: number): number {
  const m = /\.(\d+)$/.exec(String(value));
  return m?.[1]?.length ?? 0;
}

/**
 * true si latitud Y longitud traen al menos 5 decimales (precision ~1 m).
 * El seed de 0271 carga coordenadas de <= 4 decimales: no cuentan.
 */
export function hasExactGeo(sede: Pick<WebSede, "geo">): boolean {
  const geo = sede.geo;
  if (!geo) return false;
  return decimals(geo.lat) >= 5 && decimals(geo.lng) >= 5;
}

/** Cantidad de sedes con clases (derivada de los datos, nunca literal). */
function gymCount(data: WebData): number {
  return data.sedes.filter((s) => s.kind === "gym").length;
}

export function organizationNode(data: WebData): JsonLdNode {
  const contactPoint = (["AR", "ES"] as const)
    .filter((country) => data.countries[country]?.salesWhatsapp)
    .map((country) => ({
      "@type": "ContactPoint",
      telephone: `+${data.countries[country].salesWhatsapp}`,
      contactType: "sales",
      areaServed: country,
      availableLanguage: "Spanish",
    }));
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: data.brand.name,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: LOGO_URL,
    },
    description: `Escuela de movimiento y calistenia. Método propio, 6 niveles de entrenamiento con peso corporal, ${gymCount(data)} sedes en Mar del Plata y Barcelona.`,
    sameAs: SAME_AS,
    contactPoint,
  };
}

function postalAddress(sede: WebSede): JsonLdNode {
  const a = sede.address;
  return {
    "@type": "PostalAddress",
    ...(a.street ? { streetAddress: a.street } : {}),
    ...(a.locality ? { addressLocality: a.locality } : {}),
    ...(a.region ? { addressRegion: a.region } : {}),
    ...(a.postalCode ? { postalCode: a.postalCode } : {}),
    addressCountry: a.country,
  };
}

function absoluteUrl(url: string): string {
  return /^https?:\/\//.test(url)
    ? url
    : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function gymNode(sede: WebSede, data: WebData): JsonLdNode {
  const salesNumber = data.countries[sede.country]?.salesWhatsapp;
  const telephone = sede.phone ?? (salesNumber ? `+${salesNumber}` : undefined);
  const exactGeo = sede.geo !== null && hasExactGeo(sede);
  return {
    "@type": "ExerciseGym",
    "@id": `${sedeUrl(sede)}#gym`,
    name: `${data.brand.name} — ${sede.publicName}`,
    url: sedeUrl(sede),
    parentOrganization: { "@id": ORG_ID },
    telephone,
    address: postalAddress(sede),
    ...(exactGeo && sede.geo
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: sede.geo.lat,
            longitude: sede.geo.lng,
          },
          hasMap: sede.mapsUrl,
        }
      : {}),
    openingHoursSpecification: sede.openingHours.length
      ? sede.openingHours.map((h) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: `https://schema.org/${DAY_NAMES[h.dayOfWeek]}`,
          opens: h.opens,
          closes: h.closes,
        }))
      : undefined,
    image: sede.photoUrl ? absoluteUrl(sede.photoUrl) : undefined,
  };
}

export function communitySpaceNode(sede: WebSede, data: WebData): JsonLdNode {
  return {
    "@type": "Place",
    "@id": `${sedeUrl(sede)}#place`,
    name: sede.publicName,
    url: sedeUrl(sede),
    description: `Espacio de comunidad de ${data.brand.name} en el Parque Primavesi`,
    containedInPlace: { "@type": "Park", name: "Parque Primavesi" },
    address: postalAddress(sede),
  };
}

/** `ItemList` de las sedes con clases (hub `/sedes`). */
export function sedeListNode(sedes: WebSede[]): JsonLdNode {
  return {
    "@type": "ItemList",
    itemListElement: sedes.map((sede, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: sedeUrl(sede),
    })),
  };
}

export interface ArticleInput {
  title: string;
  excerpt: string;
  slug: string;
  coverImage: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

export function articleNode(
  post: ArticleInput,
  author: JsonLdNode,
): JsonLdNode {
  return {
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage ?? undefined,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt ?? post.publishedAt ?? undefined,
    author,
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  };
}

export function breadcrumbNode(
  items: Array<{ name: string; url?: string }>,
): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * JSON seguro para embeber en un <script>: escapa `<` (un nombre de sede con
 * `</script>` no puede cerrar el bloque) y los separadores de linea U+2028/9.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Entrada de `useHead({ script: [...] })` con el grafo completo. */
export function jsonLdScript(
  nodes: JsonLdNode[],
  key = "jsonld-graph",
): { type: string; key: string; innerHTML: string } {
  return {
    type: "application/ld+json",
    key,
    innerHTML: safeJson({ "@context": "https://schema.org", "@graph": nodes }),
  };
}
