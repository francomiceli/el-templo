/**
 * Normalize a phone string to "last 10 digits" — AR mobile convention.
 * Strips all non-digits, then keeps the trailing 10. Empty input → empty string.
 *
 * Mirrors el-templo-api/src/modules/shared/phone.ts (kept in sync manually
 * since admin and api are separate apps without a shared TS package).
 * If you change one, change the other.
 */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '').slice(-10);
}
