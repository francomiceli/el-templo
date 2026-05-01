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
