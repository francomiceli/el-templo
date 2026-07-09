/**
 * Validación de IBAN para la sección de domiciliación bancaria (España).
 * Espejo del validador server-side (el-templo-api/src/modules/shared/iban.ts):
 * estructura + checksum mod-97 (ISO 13616). El backend re-valida siempre —
 * esto solo da feedback inmediato en el form.
 */

/** Quita espacios/guiones y pasa a mayúsculas. */
export function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** true si el IBAN pasa estructura + checksum mod-97. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= 'A' ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}
