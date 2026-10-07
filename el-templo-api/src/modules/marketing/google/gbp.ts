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
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../../db/schema";
import { getSalesNumber } from "../../communications/sales-number";
// Path directo, NUNCA por el barrel `shared/index.ts` (fase 169).
import { tenantWhere, type TenantContext } from "../../shared/tenant";
import { WebPublicService } from "../../web-public/service";
import type { WebCountry, WebSede } from "../../web-public/types";
import { GoogleApiError, refreshTokenAccessToken } from "./auth";
import type { GbpConfig } from "./config";

type Db = MySql2Database<typeof schema>;

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

// ─── Servicio ───────────────────────────────────────────────────────────────

const BUSINESS_INFO_ORIGIN =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const PATCH_TIMEOUT_MS = 20_000;
const MAX_DETAIL_LENGTH = 300;

export interface GbpSyncSummary {
  mode: GbpConfig["mode"];
  /** Sedes publicadas con ficha mapeada que se evaluaron. */
  evaluated: number;
  /** PATCH exitosos (validateOnly en dry-run, aplicados en apply). */
  patched: number;
  /** apply: sin cambios desde el último sync, no se llamó a Google. */
  unchanged: number;
  /** Sedes con `gbp_location_id` que no están publicadas o con id inválido. */
  skipped: number;
  failed: number;
}

/** `locations/123` o `123` → `123`; cualquier otra cosa → null (va en la ruta). */
export function normalizeLocationId(raw: string): string | null {
  const id = raw.trim().replace(/^locations\//, "");
  return /^[0-9]{1,30}$/.test(id) ? id : null;
}

/** Mensaje de error de Google (`error.message`) recortado, sin credenciales. */
function googleErrorDetail(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const err = (parsed as { error?: unknown }).error;
      if (err && typeof err === "object" && "message" in err) {
        const message = (err as { message?: unknown }).message;
        if (typeof message === "string") {
          return message.slice(0, MAX_DETAIL_LENGTH);
        }
      }
    }
  } catch {
    // Cuerpo que no es JSON: sin detalle.
  }
  return "";
}

export class GbpSyncService {
  constructor(
    private readonly db: Db,
    private readonly log: FastifyBaseLogger,
  ) {}

  async sync(ctx: TenantContext, config: GbpConfig): Promise<GbpSyncSummary> {
    const summary: GbpSyncSummary = {
      mode: config.mode,
      evaluated: 0,
      patched: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
    };

    const mapped = await this.db
      .select({
        id: schema.branches.id,
        gbpLocationId: schema.branches.gbpLocationId,
        gbpSyncedHash: schema.branches.gbpSyncedHash,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          isNotNull(schema.branches.gbpLocationId),
        ),
      )
      .orderBy(asc(schema.branches.id));
    if (mapped.length === 0) return summary;

    // Los horarios salen de la MISMA función que publica la web (D-08).
    const sedes = await new WebPublicService(
      this.db,
      this.log,
    ).getPublishedBranchesWithHours(ctx);
    const sedeById = new Map(sedes.map((s) => [s.id, s]));

    // El access token se pide recién ante el primer PATCH: una corrida de
    // `apply` sin cambios no toca a Google (ni siquiera el token endpoint).
    let token: string | null = null;
    let tokenFailed = false;
    const accessToken = async (): Promise<string | null> => {
      if (token !== null || tokenFailed) return token;
      try {
        token = await refreshTokenAccessToken(config);
      } catch (err: unknown) {
        tokenFailed = true;
        this.log.error(
          {
            tenantId: ctx.tenantId,
            status: err instanceof GoogleApiError ? err.status : undefined,
            err: err instanceof Error ? err.message : "Error desconocido",
          },
          "GBP: no se pudo obtener el access token (refresh token vencido o revocado)",
        );
      }
      return token;
    };

    const whatsappByCountry = new Map<WebCountry, string | null>();

    for (const branch of mapped) {
      const sede = sedeById.get(branch.id);
      const locationId =
        branch.gbpLocationId === null
          ? null
          : normalizeLocationId(branch.gbpLocationId);
      if (!sede || locationId === null) {
        summary.skipped += 1;
        this.log.info(
          { branchId: branch.id, published: sede !== undefined },
          "GBP: sede salteada (no publicada o id de ficha inválido)",
        );
        continue;
      }
      summary.evaluated += 1;

      try {
        if (!whatsappByCountry.has(sede.country)) {
          whatsappByCountry.set(
            sede.country,
            await getSalesNumber(this.db, ctx, sede.country),
          );
        }
        const patch = buildLocationPatch(
          sede,
          whatsappByCountry.get(sede.country) ?? null,
        );
        const hash = patchHash(patch);

        if (config.mode === "apply" && hash === branch.gbpSyncedHash) {
          summary.unchanged += 1;
          continue;
        }

        const bearer = await accessToken();
        if (bearer === null) {
          summary.failed += 1;
          continue;
        }
        await this.patchLocation(
          bearer,
          locationId,
          patch,
          config.mode === "dry-run",
        );
        summary.patched += 1;

        if (config.mode === "apply") {
          await this.db
            .update(schema.branches)
            .set({ gbpSyncedHash: hash, gbpSyncedAt: new Date() })
            .where(
              and(
                tenantWhere(schema.branches, ctx),
                eq(schema.branches.id, branch.id),
              ),
            );
        }
      } catch (err: unknown) {
        summary.failed += 1;
        this.log.warn(
          {
            tenantId: ctx.tenantId,
            branchId: branch.id,
            status: err instanceof GoogleApiError ? err.status : undefined,
            err: err instanceof Error ? err.message : "Error desconocido",
          },
          "GBP: no se pudo sincronizar una ficha",
        );
      }
    }
    return summary;
  }

  private async patchLocation(
    token: string,
    locationId: string,
    patch: GbpLocationPatch,
    validateOnly: boolean,
  ): Promise<void> {
    const url =
      `${BUSINESS_INFO_ORIGIN}/locations/${locationId}` +
      `?updateMask=${encodeURIComponent(updateMaskFor(patch))}` +
      `&validateOnly=${validateOnly ? "true" : "false"}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(patch),
        signal: AbortSignal.timeout(PATCH_TIMEOUT_MS),
      });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "Error";
      throw new GoogleApiError(`Error de red llamando a GBP (${name})`, 0);
    }
    if (!response.ok) {
      const detail = googleErrorDetail(await response.text());
      throw new GoogleApiError(
        `GBP respondió ${response.status}${detail ? `: ${detail}` : ""}`,
        response.status,
      );
    }
  }
}
