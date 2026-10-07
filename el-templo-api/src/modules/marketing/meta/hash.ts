/**
 * Meta CAPI — hashing y normalización de datos de usuario (fase 195, plan 08).
 *
 * Meta pide SHA-256 hex de valores normalizados (minúsculas, trim; teléfono
 * solo dígitos con código de país; país ISO-2 en minúscula). IP, user agent,
 * `fbc` y `fbp` NO se hashean. Solo `node:crypto`: sin SDK de Meta.
 */

import { createHash } from "node:crypto";
import { normalizePhoneE164 } from "../../shared/phone";

export type MetaCountry = "AR" | "ES";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Minúsculas + trim. Vacío → null (no se manda un hash de la nada). */
export function normalizeEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/** Minúsculas + trim, para nombre y apellido. */
export function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Teléfono en el formato de Meta: solo dígitos con código de país, sin `+`
 * (`5492235820521`, `34680774331`). Reusa `normalizePhoneE164` (fail-closed: un
 * formato ambiguo da `null`, no se adivina) y agrega el rango E.164 (8 a 15
 * dígitos).
 */
export function normalizePhoneForMeta(
  raw: string | null | undefined,
  country: MetaCountry,
): string | null {
  if (!raw) return null;
  const e164 = normalizePhoneE164(raw, country);
  if (e164 === null) return null;
  const digits = e164.replace(/^\+/, "").replace(/^0+/, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export interface HashedUserDataInput {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country: MetaCountry;
  tenantId: number;
  userId: number;
  fbc?: string | null;
  fbp?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  /** IP y user agent solo viajan en el registro web (website los exige). */
  includeClientContext?: boolean;
}

export interface MetaUserData {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  country: string[];
  external_id: string[];
  fbc?: string;
  fbp?: string;
  client_ip_address?: string;
  client_user_agent?: string;
}

/**
 * `user_data` de un evento. Los campos ausentes se OMITEN (un teléfono `null`
 * deja el evento sin `ph`: viaja con email + external_id + country). Siempre
 * lleva `external_id` (`tenant:user` hasheado) y `country`.
 */
export function hashedUserData(input: HashedUserDataInput): MetaUserData {
  const email = normalizeEmail(input.email);
  const phone = normalizePhoneForMeta(input.phone, input.country);
  const firstName = normalizeName(input.firstName);
  const lastName = normalizeName(input.lastName);

  const data: MetaUserData = {
    country: [sha256Hex(input.country.toLowerCase())],
    external_id: [sha256Hex(`${input.tenantId}:${input.userId}`)],
  };
  if (email !== null) data.em = [sha256Hex(email)];
  if (phone !== null) data.ph = [sha256Hex(phone)];
  if (firstName !== null) data.fn = [sha256Hex(firstName)];
  if (lastName !== null) data.ln = [sha256Hex(lastName)];
  if (input.fbc) data.fbc = input.fbc;
  if (input.fbp) data.fbp = input.fbp;
  if (input.includeClientContext) {
    if (input.clientIp) data.client_ip_address = input.clientIp;
    if (input.userAgent) data.client_user_agent = input.userAgent;
  }
  return data;
}
