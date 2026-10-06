// Módulo: referrals — parámetros del programa de Invitaciones (Fase 194,
// D-09 / D-10c / D-11 / D-12 / D-13 / D-15)
//
// DÓNDE VIVE CADA PARÁMETRO
// -------------------------
// Parámetros NUEVOS de la fase: `tenant_settings` (regla v6.1 "todo parámetro
// en tenant_settings", precedente `communications/sales-number.ts`), con default
// en código cuando no hay fila. Key = INVITATION_SETTINGS_PREFIX + sufijo:
//
//   monthly_quota               cupo de invitaciones por mes y socio (default 2)
//   access_business_days        vigencia de los accesos, en días hábiles (10)
//   reinvite_window_days        ventana de reinvitación a la misma persona (90)
//   ex_member_inactivity_months meses sin membresía para que un ex socio sea
//                               invitable (6)
//   late_purchase_window_days   días tras vencer los accesos en que una compra
//                               todavía da el descuento (30)
//   invitee_percent             % de descuento del invitado que compra (10)
//   discount_cap_amount.AR/.ES  tope EN DINERO por país (D-10c). SIN fila = sin
//                               tope. Gestión lo carga cuando quiera.
//
// Parámetros EXISTENTES que NO se mudan (D-09 "se mantiene") y acá solo se
// exponen de LECTURA, vía `ReferralService.getReferralConfig()`:
//   - % por invitado activo: `aura_config['referral'].default_amount`
//   - tope %: `system_settings['referral.max_percent_cap']` (40)
// Son globales (no por gimnasio): escribirlos desde un tenant sería
// cross-tenant, por eso esta API no los edita (T-194-24).
//
// VALIDACIÓN (T-194-22)
// ---------------------
// Corre en escritura (el patch COMPLETO se valida antes de tocar la base: o se
// escribe todo o nada) Y en lectura (un valor corrupto en la base cae al default
// o a "sin tope": fail-closed, mismo criterio que `getSalesNumber`).
//
// AISLAMIENTO (T-194-23)
// ----------------------
// Toda query pasa por `tenantWhere` / `tenantValues`.
import { and, eq, like } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { tenantSettings } from "../../db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import type { CountryCode } from "../shared/country-scope";
import { BadRequestError } from "../shared/errors";
import { ReferralService } from "./service";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Prefijo de las keys en `tenant_settings`. NO re-declarar este literal en
 * ningún otro archivo: usar {@link invitationSettingKey} y
 * {@link discountCapKey}.
 */
export const INVITATION_SETTINGS_PREFIX = "invitations.";

/** Sufijo de la key del tope en dinero; se le agrega `.AR` / `.ES`. */
const DISCOUNT_CAP_SUFFIX = "discount_cap_amount.";

/** Tope superior sano del tope en dinero (evita valores absurdos / overflow). */
const DISCOUNT_CAP_MAX = 100_000_000;

/** Países con tope en dinero configurable. */
export const INVITATION_CAP_COUNTRIES = ["AR", "ES"] as const;

/** Parámetros enteros con default y rango inclusivo. */
const INT_SETTINGS = {
  monthlyQuota: { suffix: "monthly_quota", def: 2, min: 1, max: 10 },
  accessBusinessDays: {
    suffix: "access_business_days",
    def: 10,
    min: 1,
    max: 30,
  },
  reinviteWindowDays: {
    suffix: "reinvite_window_days",
    def: 90,
    min: 0,
    max: 365,
  },
  exMemberInactivityMonths: {
    suffix: "ex_member_inactivity_months",
    def: 6,
    min: 0,
    max: 36,
  },
  latePurchaseWindowDays: {
    suffix: "late_purchase_window_days",
    def: 30,
    min: 0,
    max: 180,
  },
  inviteePercent: { suffix: "invitee_percent", def: 10, min: 0, max: 50 },
} as const;

export type InvitationIntSettingName = keyof typeof INT_SETTINGS;

/** Defaults en código (cuando no hay fila). Exportado para tests y consumidores. */
export const INVITATION_SETTING_DEFAULTS: Readonly<
  Record<InvitationIntSettingName, number>
> = {
  monthlyQuota: INT_SETTINGS.monthlyQuota.def,
  accessBusinessDays: INT_SETTINGS.accessBusinessDays.def,
  reinviteWindowDays: INT_SETTINGS.reinviteWindowDays.def,
  exMemberInactivityMonths: INT_SETTINGS.exMemberInactivityMonths.def,
  latePurchaseWindowDays: INT_SETTINGS.latePurchaseWindowDays.def,
  inviteePercent: INT_SETTINGS.inviteePercent.def,
};

export interface InvitationSettings
  extends Record<InvitationIntSettingName, number> {
  /** Tope en dinero por país (D-10c). `null` = sin tope. */
  discountCapAmount: Record<CountryCode, number | null>;
  /** Solo lectura: % por invitado activo (`aura_config['referral']`). */
  perLinkPercent: number;
  /** Solo lectura: tope % acumulable (`system_settings`, D-09). */
  maxPercentCap: number;
}

export type InvitationSettingsPatch = Partial<
  Record<InvitationIntSettingName, number>
> & {
  /** `null` borra la fila del país (vuelve a "sin tope"). */
  discountCapAmount?: Partial<Record<CountryCode, number | null>>;
};

/** `invitations.monthly_quota`, etc. */
export function invitationSettingKey(name: InvitationIntSettingName): string {
  return `${INVITATION_SETTINGS_PREFIX}${INT_SETTINGS[name].suffix}`;
}

/** `invitations.discount_cap_amount.AR` / `.ES`. */
export function discountCapKey(country: CountryCode): string {
  return `${INVITATION_SETTINGS_PREFIX}${DISCOUNT_CAP_SUFFIX}${country}`;
}

const INT_PATTERN = /^[0-9]{1,9}$/;

/** Parsea un entero no negativo de la base; `null` si no es un entero limpio. */
function parseStoredInt(raw: string): number | null {
  return INT_PATTERN.test(raw) ? Number.parseInt(raw, 10) : null;
}

function isValidCap(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= DISCOUNT_CAP_MAX
  );
}

/**
 * Lee todos los parámetros del programa para el tenant de `ctx`. Una sola
 * query sobre `tenant_settings` (prefijo) + la lectura de las dos fuentes
 * existentes. Sin fila (o valor corrupto / fuera de rango) = default; el tope en
 * dinero sin fila o inválido = `null` (sin tope).
 */
export async function getInvitationSettings(
  db: DbInstance,
  ctx: TenantContext,
  log: FastifyBaseLogger,
): Promise<InvitationSettings> {
  const rows = await db
    .select({
      settingKey: tenantSettings.settingKey,
      settingValue: tenantSettings.settingValue,
    })
    .from(tenantSettings)
    .where(
      and(
        tenantWhere(tenantSettings, ctx),
        like(tenantSettings.settingKey, `${INVITATION_SETTINGS_PREFIX}%`),
      ),
    );
  const byKey = new Map(rows.map((r) => [r.settingKey, r.settingValue]));

  const result: Record<InvitationIntSettingName, number> = {
    ...INVITATION_SETTING_DEFAULTS,
  };
  for (const name of Object.keys(INT_SETTINGS) as InvitationIntSettingName[]) {
    const raw = byKey.get(invitationSettingKey(name));
    if (raw === undefined) continue;
    const parsed = parseStoredInt(raw);
    const { min, max } = INT_SETTINGS[name];
    // Fail-closed: valor corrupto o fuera de rango -> default.
    if (parsed !== null && parsed >= min && parsed <= max) {
      result[name] = parsed;
    }
  }

  const caps: Record<CountryCode, number | null> = { AR: null, ES: null };
  for (const country of INVITATION_CAP_COUNTRIES) {
    caps[country] = parseCap(byKey.get(discountCapKey(country)));
  }

  const referralConfig = await new ReferralService(db, log).getReferralConfig();

  return {
    ...result,
    discountCapAmount: caps,
    perLinkPercent: referralConfig.percentPerLink,
    maxPercentCap: referralConfig.maxPercentCap,
  };
}

function parseCap(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = parseStoredInt(raw);
  return parsed !== null && isValidCap(parsed) ? parsed : null;
}

/**
 * Tope en dinero del descuento de invitación para `country` (D-10c). `null` =
 * sin tope (sin fila, o valor corrupto: fail-closed hacia "sin tope" para no
 * inventar un monto).
 */
export async function getDiscountCapAmount(
  db: DbInstance,
  ctx: TenantContext,
  country: CountryCode,
): Promise<number | null> {
  const [row] = await db
    .select({ settingValue: tenantSettings.settingValue })
    .from(tenantSettings)
    .where(
      and(
        tenantWhere(tenantSettings, ctx),
        eq(tenantSettings.settingKey, discountCapKey(country)),
      ),
    )
    .limit(1);
  return parseCap(row?.settingValue);
}

/**
 * Valida el patch COMPLETO sin tocar la base. Lanza {@link BadRequestError} con
 * el primer problema encontrado (T-194-22).
 */
function validatePatch(patch: InvitationSettingsPatch): void {
  const allowed = new Set<string>([
    ...Object.keys(INT_SETTINGS),
    "discountCapAmount",
  ]);
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) {
      throw new BadRequestError(`Parámetro desconocido: ${key}`);
    }
  }

  for (const name of Object.keys(INT_SETTINGS) as InvitationIntSettingName[]) {
    const value = patch[name];
    if (value === undefined) continue;
    const { min, max } = INT_SETTINGS[name];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new BadRequestError(`${name} debe ser un número entero`);
    }
    if (value < min || value > max) {
      throw new BadRequestError(`${name} debe estar entre ${min} y ${max}`);
    }
  }

  const caps = patch.discountCapAmount;
  if (caps !== undefined) {
    if (caps === null || typeof caps !== "object") {
      throw new BadRequestError("discountCapAmount debe ser un objeto");
    }
    for (const [country, value] of Object.entries(caps)) {
      if (!(INVITATION_CAP_COUNTRIES as readonly string[]).includes(country)) {
        throw new BadRequestError(`País sin tope configurable: ${country}`);
      }
      if (value === null || value === undefined) continue;
      if (!isValidCap(value)) {
        throw new BadRequestError(
          `El tope de ${country} debe ser un entero mayor a 0 (o null para quitarlo)`,
        );
      }
    }
  }
}

/**
 * Escribe los parámetros presentes en `patch` para el tenant de `ctx`. Valida
 * TODO antes de escribir y aplica los upserts/borrados en una transacción.
 * `discountCapAmount.<PAÍS> = null` borra la fila (vuelve a "sin tope").
 */
export async function setInvitationSettings(
  db: DbInstance,
  ctx: TenantContext,
  patch: InvitationSettingsPatch,
): Promise<void> {
  validatePatch(patch);

  await db.transaction(async (tx) => {
    for (const name of Object.keys(
      INT_SETTINGS,
    ) as InvitationIntSettingName[]) {
      const value = patch[name];
      if (value === undefined) continue;
      await tx
        .insert(tenantSettings)
        .values(
          tenantValues(ctx, {
            settingKey: invitationSettingKey(name),
            settingValue: String(value),
          }),
        )
        .onDuplicateKeyUpdate({ set: { settingValue: String(value) } });
    }

    for (const country of INVITATION_CAP_COUNTRIES) {
      const value = patch.discountCapAmount?.[country];
      if (value === undefined) continue;
      if (value === null) {
        await tx
          .delete(tenantSettings)
          .where(
            and(
              tenantWhere(tenantSettings, ctx),
              eq(tenantSettings.settingKey, discountCapKey(country)),
            ),
          );
        continue;
      }
      await tx
        .insert(tenantSettings)
        .values(
          tenantValues(ctx, {
            settingKey: discountCapKey(country),
            settingValue: String(value),
          }),
        )
        .onDuplicateKeyUpdate({ set: { settingValue: String(value) } });
    }
  });
}
