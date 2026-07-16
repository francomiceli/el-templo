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
