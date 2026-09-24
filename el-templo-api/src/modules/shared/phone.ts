/**
 * Normalize a phone string to "last 10 digits" — AR mobile convention.
 * Strips all non-digit characters, then keeps the trailing 10. Empty input → empty string.
 *
 * Used by:
 *  - admin /admin/members/check-duplicates (members/service.ts checkDuplicates)
 *  - autorregistro /auth/register phone duplicate block
 *
 * Mirrored 1:1 in el-templo-admin/src/utils/phone.ts (manual sync — no shared TS package).
 */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "").slice(-10);
}

/**
 * Fase 165 (WR-02): sanitize a phone for STORAGE on the trial write paths
 * (self-service reserve + admin convert-to-trial) WITHOUT the AR "last 10"
 * truncation that `normalizePhone` applies. Keeps the full national+country
 * number so ES/Barcelona leads (`+34 612 345 678`) and AR mobiles
 * (`+54 9 11 2233-4455`) are persisted intact and remain wa.me-resolvable:
 *
 *   "+34 612 345 678"      → "+34612345678"
 *   "+54 9 11 2233-4455"   → "+5491122334455"
 *   "11 2233 4455"         → "1122334455"
 *   "abc" / "()" / "n/a"   → ""  (no digits → caller rejects)
 *
 * Strips everything except digits and a single leading `+`, capped at the
 * column width (varchar(30)). Returns "" when the input has no digits, so
 * the mandatory-phone guards can reject garbage instead of dropping it.
 *
 * This is deliberately SEPARATE from `normalizePhone` (whose "last 10"
 * semantics other callers — duplicate checks, autorregistro — depend on).
 */
export function sanitizePhoneForStorage(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  const hasPlus = input.trimStart().startsWith("+");
  return (hasPlus ? "+" + digits : digits).slice(0, 30);
}

/**
 * Módulo de Renovaciones (2026-09-24): normaliza un teléfono a E.164
 * (`+<código de país><número>`) para el botón de WhatsApp del admin, o
 * `null` si no se puede normalizar con confianza.
 *
 * Reglas (mismo espíritu que `whatsappUrl` en
 * `el-templo-admin/src/utils/whatsapp.ts`, pero explícitas por país de la
 * SEDE en vez de asumir siempre Argentina, y con un `null` fail-closed en
 * vez de "usar tal cual" — acá el resultado viaja como dato estructurado,
 * no como texto libre de un link):
 *   - Si el input YA trae un `+` explícito: se respeta tal cual (solo se le
 *     sacan los caracteres que no son dígito, conservando el `+`).
 *   - Si el input YA trae el código de país argentino sin `+` (`54`/`549`,
 *     más largo que un número nacional de 10 dígitos — para no confundir un
 *     número español que arranque casualmente con "54"): se respeta,
 *     anteponiendo solo el `+`.
 *   - Si no, se interpreta como número NACIONAL de la sede:
 *     - AR: exactamente 10 dígitos → `+549` + número (móvil AR).
 *     - ES: exactamente 9 dígitos → `+34` + número.
 *   - Cualquier otro largo → `null` (no se adivina).
 *
 * `null` de entrada (sin teléfono cargado) → `null`.
 */
export function normalizePhoneE164(
  phone: string | null,
  branchCountry: "AR" | "ES",
): string | null {
  if (phone === null) return null;
  const trimmed = phone.trim();
  if (trimmed.length === 0) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (hasPlus) return `+${digits}`;

  // Ya trae el código de país AR sin '+' — más largo que un número nacional
  // de 10 dígitos, así que no puede ser un 9/10-dígitos español que arranque
  // "coincidentemente" con 54.
  if (
    digits.length > 10 &&
    (digits.startsWith("549") || digits.startsWith("54"))
  ) {
    return `+${digits}`;
  }

  if (branchCountry === "AR") {
    // Prefijo troncal "0" del formato nacional ("(011) 2345-6789",
    // "0223 555-3487"): se descarta antes de contar los 10 dígitos. Un "15"
    // sin característica ("15 5622097") no alcanza para saber la ciudad:
    // queda null y la pantalla pide revisarlo en la ficha.
    const national = digits.startsWith("0") ? digits.slice(1) : digits;
    return national.length === 10 ? `+549${national}` : null;
  }
  return digits.length === 9 ? `+34${digits}` : null;
}
