// Módulo: web-public — contrato de GET /api/web/site-data (Fase 195, D-10).
//
// Lo consume tal cual el build de la web (eltemplo.org). NO cambiar nombres de
// campo sin actualizar `el-templo-web` (plan 195-03). Todo lo que figura acá es
// información pública: nada de profes, emails ni ids de usuarios.

export type WebCountry = "AR" | "ES";

export type WebSedeKind = "gym" | "community_space";

export interface WebCountryContact {
  /** Solo dígitos (8-15), listo para `https://wa.me/<n>`. null = sin configurar. */
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
  /** branches.id — lo usa el link `/register?branchId=`. */
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
  /** Todas las actividades activas con horario activo (incluye especiales). */
  activities: WebActivity[];
  /** Franjas de apertura fusionadas por día, SOLO clases regulares. */
  openingHours: WebOpeningHours[];
  /** Grilla de clases regulares, ordenada por día y hora. */
  schedule: WebScheduleSlot[];
}

export interface WebSiteData {
  /** ISO 8601. */
  generatedAt: string;
  brand: { name: string };
  countries: Record<WebCountry, WebCountryContact>;
  sedes: WebSede[];
}
