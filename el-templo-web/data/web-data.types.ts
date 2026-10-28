/**
 * Contrato del archivo `data/generated/web-data.json` (fase 195, D-10).
 *
 * Lo escribe `scripts/fetch-web-data.mjs` en cada build a partir de
 * `GET /api/web/site-data` (mismos nombres de campo que
 * `el-templo-api/src/modules/web-public/types.ts`) mas los slugs del blog.
 * Es la unica fuente de sedes, marca y WhatsApp de ventas de la web.
 */

export type WebCountry = "AR" | "ES";

export type WebSedeKind = "gym" | "community_space";

export interface WebCountryContact {
  /** Solo digitos (8-15), listo para `https://wa.me/<n>`. null = sin configurar. */
  salesWhatsapp: string | null;
}

export interface WebSedeAddress {
  street: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  country: WebCountry;
}

export interface WebActivity {
  name: string;
  slug: string;
  isSpecial: boolean;
}

/** `dayOfWeek`: 1 = lunes .. 7 = domingo. `opens`/`closes`: HH:MM. */
export interface WebOpeningHours {
  dayOfWeek: number;
  opens: string;
  closes: string;
}

export interface WebScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  activity: string;
}

export interface WebSede {
  /** branches.id (lo usa el link `/register?branchId=`). */
  id: number;
  code: string;
  slug: string;
  publicName: string;
  kind: WebSedeKind;
  country: WebCountry;
  timezone: string;
  address: WebSedeAddress;
  geo: { lat: number; lng: number } | null;
  placeId: string | null;
  mapsUrl: string;
  phone: string | null;
  photoUrl: string | null;
  /** Actividades activas con horario activo (incluye especiales). */
  activities: WebActivity[];
  /** Franjas de apertura fusionadas por dia, SOLO clases regulares. Puede ser []. */
  openingHours: WebOpeningHours[];
  /** Grilla de clases regulares, ordenada por dia y hora. Puede ser []. */
  schedule: WebScheduleSlot[];
}

export interface WebSiteData {
  /** ISO 8601. */
  generatedAt: string;
  brand: { name: string };
  countries: Record<WebCountry, WebCountryContact>;
  sedes: WebSede[];
}

export interface WebBlogPost {
  slug: string;
  /**
   * `updatedAt` del post o, si la API publica no lo expone (hoy solo devuelve
   * `publishedAt`), su `publishedAt`. null si no hay ninguna de las dos.
   */
  updatedAt: string | null;
}

export interface WebBlogTag {
  slug: string;
}

/** Lo que realmente se escribe en `data/generated/web-data.json`. */
export interface WebData extends WebSiteData {
  /** "api" = datos reales del endpoint. "fixture" = SOLO CI/dev, no publicar. */
  source: "api" | "fixture";
  blog: {
    posts: WebBlogPost[];
    tags: WebBlogTag[];
  };
}
