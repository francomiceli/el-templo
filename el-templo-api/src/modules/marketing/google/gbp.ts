/**
 * Google Business Profile (fase 195, plan 09, D-21.3 y D-08).
 *
 * Mantiene las fichas de Google consistentes con `branches`: horarios,
 * teléfono, dirección y web. Los horarios salen de `computeOpeningHours` (a
 * través de `WebPublicService.getPublishedBranchesWithHours`): web, schema.org
 * y ficha dicen lo mismo, sin duplicar la lógica.
 *
 * Dos partes:
 *   - Pura: `buildLocationPatch` y `patchHash`, sin red ni DB.
 *   - `GbpSyncService`: detrás de `GBP_SYNC_MODE` (off por defecto). En
 *     `dry-run` valida con `validateOnly=true` y no guarda nada. En `apply` solo
 *     hace PATCH si cambió el hash del patch (editar seguido arriesga revisiones
 *     y suspensión de la ficha).
 */
import { createHash } from "node:crypto";
import type { WebCountry, WebSede } from "../../web-public/types";

const WEB_ORIGIN = "https://eltemplo.org";

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export interface GbpTimeOfDay {
  hours: number;
  minutes: number;
}

export interface GbpPeriod {
  openDay: (typeof DAYS)[number];
  openTime: GbpTimeOfDay;
  closeDay: (typeof DAYS)[number];
  closeTime: GbpTimeOfDay;
}

export interface GbpStorefrontAddress {
  regionCode: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  addressLines: string[];
}

/**
 * Cuerpo del PATCH. Cada clave presente entra en el `updateMask`: una clave
 * AUSENTE no se toca en Google (con el mask completo y la clave ausente Google
 * borraría el dato de la ficha).
 */
export interface GbpLocationPatch {
  regularHours?: { periods: GbpPeriod[] };
  phoneNumbers?: { primaryPhone: string };
  storefrontAddress?: GbpStorefrontAddress;
  websiteUri: string;
}

/** Lo mínimo de una sede publicada que necesita el patch. */
export type GbpSedeInput = Pick<
  WebSede,
  "slug" | "country" | "phone" | "address" | "openingHours"
>;

function parseTime(value: string): GbpTimeOfDay {
  return {
    hours: Number(value.slice(0, 2)),
    minutes: Number(value.slice(3, 5)),
  };
}

/** `https://eltemplo.org[/es]/sedes/<slug>?utm...` — la web de cada sede. */
export function buildWebsiteUri(slug: string, country: WebCountry): string {
  const base = country === "ES" ? `${WEB_ORIGIN}/es` : WEB_ORIGIN;
  return (
    `${base}/sedes/${slug}` +
    `?utm_source=google&utm_medium=organic&utm_campaign=gbp-${slug}`
  );
}

function trimOrNull(value: string | null): string | null {
  const t = value?.trim() ?? "";
  return t.length > 0 ? t : null;
}

/**
 * Arma el patch de una ficha a partir de la sede publicada.
 *
 * Omisiones deliberadas (se omiten del patch y del `updateMask`, o sea NO se
 * tocan en Google): sede sin horarios publicados (Moreno, solo Yoga especial:
 * mandar `periods: []` borraría los horarios de la ficha), sin teléfono propio
 * ni WhatsApp de ventas, o sin calle.
 */
export function buildLocationPatch(
  sede: GbpSedeInput,
  salesWhatsapp: string | null,
): GbpLocationPatch {
  const patch: GbpLocationPatch = {
    websiteUri: buildWebsiteUri(sede.slug, sede.country),
  };

  const periods: GbpPeriod[] = [...sede.openingHours]
    .filter((h) => h.dayOfWeek >= 1 && h.dayOfWeek <= 7)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opens.localeCompare(b.opens))
    .map((h) => ({
      openDay: DAYS[h.dayOfWeek - 1],
      openTime: parseTime(h.opens),
      closeDay: DAYS[h.dayOfWeek - 1],
      closeTime: parseTime(h.closes),
    }));
  if (periods.length > 0) patch.regularHours = { periods };

  const ownPhone = trimOrNull(sede.phone);
  const whatsapp = trimOrNull(salesWhatsapp);
  const primaryPhone =
    ownPhone ?? (whatsapp !== null ? `+${whatsapp.replace(/^\+/, "")}` : null);
  if (primaryPhone !== null) patch.phoneNumbers = { primaryPhone };

  const street = trimOrNull(sede.address.street);
  if (street !== null) {
    const locality = trimOrNull(sede.address.locality);
    const region = trimOrNull(sede.address.region);
    const postalCode = trimOrNull(sede.address.postalCode);
    patch.storefrontAddress = {
      regionCode: sede.country,
      ...(locality !== null ? { locality } : {}),
      ...(region !== null ? { administrativeArea: region } : {}),
      ...(postalCode !== null ? { postalCode } : {}),
      addressLines: [street],
    };
  }

  return patch;
}

/** `updateMask` = las claves presentes en el patch, en orden fijo. */
export function updateMaskFor(patch: GbpLocationPatch): string {
  return (
    ["regularHours", "phoneNumbers", "storefrontAddress", "websiteUri"] as const
  )
    .filter((key) => patch[key] !== undefined)
    .join(",");
}

/** JSON con las claves ordenadas recursivamente (hash independiente del orden). */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 hex (64 caracteres) del patch: cabe en `branches.gbp_synced_hash`. */
export function patchHash(patch: GbpLocationPatch): string {
  return createHash("sha256").update(canonicalJson(patch)).digest("hex");
}
