/**
 * IBAN helpers para la domiciliación bancaria (SEPA) de sedes de España.
 *
 * Validación estructural + checksum mod-97 (ISO 13616). No valida el BBAN
 * por país (longitudes específicas) más allá del rango total 15–34: el banco
 * rechaza igual un IBAN de longitud incorrecta, y acá lo que importa es
 * frenar tipeos antes de que lleguen al archivo mensual del banco.
 */

/** Quita espacios/guiones y pasa a mayúsculas — forma canónica de guardado. */
export function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** true si el IBAN (crudo o normalizado) pasa estructura + checksum mod-97. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  // 2 letras de país + 2 dígitos de control + BBAN alfanumérico (total 15–34).
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;

  // Mod-97: mover los primeros 4 caracteres al final, mapear letras A=10..Z=35
  // y calcular el resto incrementalmente (el número excede Number.MAX_SAFE_INTEGER).
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}
