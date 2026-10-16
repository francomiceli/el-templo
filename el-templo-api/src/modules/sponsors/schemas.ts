import { HEX_COLOR_PATTERN } from "./contrast";

/**
 * JSON Schemas + interfaces tipadas de `modules/sponsors` (Fase 199). Mismo
 * patrón que `modules/communications/schemas.ts`: el schema de validación y la
 * interfaz que lo describe viven en el MISMO archivo.
 *
 * El JSON Schema es la PRIMERA barrera (forma, largos, patrones); las reglas de
 * negocio (contraste, límite por país, prefijo del logo, vigencia) las aplica
 * `SponsorsService` en el server (D-19, D-24).
 */

const COUNTRY_ENUM = ["AR", "ES"] as const;
const REDEEM_TYPE_ENUM = ["code", "carnet"] as const;
const EVENT_TYPE_ENUM = ["seen", "tapped", "redeem"] as const;
/** Formato `YYYY-MM-DD` (columnas `date` en modo string). */
const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

export type SponsorCountry = (typeof COUNTRY_ENUM)[number];
export type SponsorRedeemType = (typeof REDEEM_TYPE_ENUM)[number];
export type SponsorEventType = (typeof EVENT_TYPE_ENUM)[number];

/**
 * Prefijo de la carpeta R2 de los logos de patrocinadores. UNA sola fuente: lo
 * usan la ruta de subida (plan 03) y la validación de `logoUrl` del service.
 */
export const SPONSOR_LOGO_PREFIX = "sponsors/logos";

// ── Cuerpo de alta / edición ────────────────────────────────────────────────

const sponsorBodyProperties = {
  name: { type: "string", minLength: 1, maxLength: 60 },
  category: { type: "string", minLength: 1, maxLength: 60 },
  logoUrl: { type: ["string", "null"], maxLength: 500, pattern: "^https://" },
  icon: { type: ["string", "null"], pattern: "^[a-z0-9_]{1,40}$" },
  bgColor: { type: "string", pattern: HEX_COLOR_PATTERN },
  textColor: { type: "string", pattern: HEX_COLOR_PATTERN },
  benefit: { type: "string", minLength: 1, maxLength: 12 },
  detail: { type: "string", minLength: 1, maxLength: 80 },
  conditions: { type: ["string", "null"], maxLength: 600 },
  redeemType: { type: "string", enum: REDEEM_TYPE_ENUM },
  redeemCode: {
    type: ["string", "null"],
    pattern: "^[A-Za-z0-9_-]{1,40}$",
  },
  countries: {
    type: "array",
    items: { type: "string", enum: COUNTRY_ENUM },
    minItems: 1,
    uniqueItems: true,
  },
  startsOn: { type: ["string", "null"], pattern: DATE_PATTERN },
  endsOn: { type: ["string", "null"], pattern: DATE_PATTERN },
  isActive: { type: "boolean" },
  sortOrder: { type: "integer", minimum: 0 },
  partnerId: { type: ["integer", "null"] },
} as const;

export const createSponsorSchema = {
  body: {
    type: "object",
    required: [
      "name",
      "category",
      "bgColor",
      "textColor",
      "benefit",
      "detail",
      "redeemType",
      "countries",
    ],
    properties: sponsorBodyProperties,
    additionalProperties: false,
  },
};

export interface CreateSponsorBody {
  name: string;
  category: string;
  logoUrl?: string | null;
  icon?: string | null;
  bgColor: string;
  textColor: string;
  benefit: string;
  detail: string;
  conditions?: string | null;
  redeemType: SponsorRedeemType;
  redeemCode?: string | null;
  countries: SponsorCountry[];
  startsOn?: string | null;
  endsOn?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  partnerId?: number | null;
}

export const updateSponsorSchema = {
  body: {
    type: "object",
    properties: createSponsorSchema.body.properties,
    additionalProperties: false,
    minProperties: 1,
  },
};

export type UpdateSponsorBody = Partial<CreateSponsorBody>;

// ── Params, eventos, settings, subida de logo ───────────────────────────────

export const sponsorIdParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer", minimum: 1 },
    },
    additionalProperties: false,
  },
};

export const sponsorEventSchema = {
  body: {
    type: "object",
    required: ["type"],
    properties: {
      type: { type: "string", enum: EVENT_TYPE_ENUM },
    },
    additionalProperties: false,
  },
};

export interface SponsorEventBody {
  type: SponsorEventType;
}

export const sponsorsSettingsSchema = {
  body: {
    type: "object",
    required: ["maxActivePerCountry"],
    properties: {
      maxActivePerCountry: { type: "integer", minimum: 1, maximum: 50 },
    },
    additionalProperties: false,
  },
};

export interface SponsorsSettingsBody {
  maxActivePerCountry: number;
}

export const logoUploadSchema = {
  body: {
    type: "object",
    required: ["filename"],
    properties: {
      filename: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        // `(?i)` no está soportado: se expande a mano cada letra.
        pattern:
          "\\.([jJ][pP][eE]?[gG]|[pP][nN][gG]|[wW][eE][bB][pP]|[aA][vV][iI][fF])$",
      },
    },
    additionalProperties: false,
  },
};

export interface LogoUploadBody {
  filename: string;
}

// ── Respuestas ──────────────────────────────────────────────────────────────

const sponsorCommonResponseProperties = {
  id: { type: "integer" },
  name: { type: "string" },
  category: { type: "string" },
  logoUrl: { type: ["string", "null"] },
  icon: { type: ["string", "null"] },
  bgColor: { type: "string" },
  textColor: { type: "string" },
  benefit: { type: "string" },
  detail: { type: "string" },
  conditions: { type: ["string", "null"] },
  redeemType: { type: "string", enum: REDEEM_TYPE_ENUM },
  redeemCode: { type: ["string", "null"] },
} as const;

export const sponsorAdminItemSchema = {
  type: "object",
  properties: {
    ...sponsorCommonResponseProperties,
    countries: {
      type: "array",
      items: { type: "string", enum: COUNTRY_ENUM },
    },
    startsOn: { type: ["string", "null"] },
    endsOn: { type: ["string", "null"] },
    isActive: { type: "boolean" },
    sortOrder: { type: "integer" },
    partnerId: { type: ["integer", "null"] },
    views: { type: "integer" },
    taps: { type: "integer" },
    redeems: { type: "integer" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
};

export const listSponsorsResponseSchema = {
  200: {
    type: "object",
    properties: {
      sponsors: { type: "array", items: sponsorAdminItemSchema },
      maxActivePerCountry: { type: "integer" },
    },
  },
};

export const sponsorWriteResponseSchema = {
  200: {
    type: "object",
    properties: { sponsor: sponsorAdminItemSchema },
  },
  201: {
    type: "object",
    properties: { sponsor: sponsorAdminItemSchema },
  },
};

export const memberSponsorItemSchema = {
  type: "object",
  properties: sponsorCommonResponseProperties,
};

export const memberSponsorsResponseSchema = {
  200: {
    type: "object",
    properties: {
      sponsors: { type: "array", items: memberSponsorItemSchema },
      canRedeem: { type: "boolean" },
    },
  },
};

export const sponsorsSettingsResponseSchema = {
  200: {
    type: "object",
    properties: { maxActivePerCountry: { type: "integer" } },
  },
};

export const logoUploadResponseSchema = {
  200: {
    type: "object",
    properties: {
      uploadUrl: { type: "string" },
      publicUrl: { type: "string" },
    },
  },
};

export const successResponseSchema = {
  200: {
    type: "object",
    properties: { success: { type: "boolean" } },
  },
};

// ── Interfaces espejo de las respuestas ─────────────────────────────────────

/** Campos comunes a la vista del socio y a la del admin. */
interface SponsorCommonFields {
  id: number;
  name: string;
  category: string;
  logoUrl: string | null;
  icon: string | null;
  bgColor: string;
  textColor: string;
  benefit: string;
  detail: string;
  conditions: string | null;
  redeemType: SponsorRedeemType;
  redeemCode: string | null;
}

export interface SponsorAdminItem extends SponsorCommonFields {
  countries: SponsorCountry[];
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
  sortOrder: number;
  partnerId: number | null;
  views: number;
  taps: number;
  redeems: number;
  createdAt: string;
  updatedAt: string;
}

/** Lo que recibe el socio: `redeemCode` solo viaja con plan activo (D-21). */
export type SponsorMemberItem = SponsorCommonFields;

export interface MemberSponsorsResult {
  sponsors: SponsorMemberItem[];
  canRedeem: boolean;
}
