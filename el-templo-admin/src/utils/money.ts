/**
 * Utilidades de plata del admin (fase 207, DI-02, DI-05).
 *
 * Duplicado DELIBERADO de `el-templo-api/src/modules/shared/money.ts` (no hay
 * workspace compartido, igual que `formatPrice`): `toCents`, `fromCents`,
 * `roundMoney`, `sumMoney`, `moneyEquals` y `compareMoney` tienen la misma
 * semántica que en el API (redondeo simétrico, sin `-0`). Mantener ambos en
 * sincronía.
 *
 * Unidad: pesos/euros con hasta 2 decimales. Los centavos enteros son solo una
 * representación intermedia para sumar y comparar sin error de coma flotante.
 * Nunca usar `===` entre importes calculados ni acumular importes sin
 * `sumMoney`.
 *
 * Formato es-AR: miles con punto, decimales con coma. Los decimales se
 * muestran SOLO si el importe no es entero (0 ó 2 dígitos, nunca 1), para no
 * cambiar las pantallas con importes enteros.
 *
 * Parser (`parseMoneyInput`) — reglas:
 * - Se ignoran espacios y los símbolos `$` y `€`.
 * - Vacío -> `empty`. Negativos, letras o formas raras -> `invalid`.
 * - Con coma: es el separador decimal, debe haber UNA sola; lo de antes puede
 *   llevar puntos de miles bien agrupados (`77.570,82`, `77570,82`); después
 *   de la coma van 0 a 2 dígitos (3 o más -> `too_many_decimals`).
 * - Sin coma: `77570.82` / `1.5` (punto + 1-2 dígitos) es decimal;
 *   `1.500` / `1.500.000` (grupos de 3) son miles; solo dígitos es entero.
 * - Ambigüedad documentada: "1.500" es mil quinientos (convención es-AR) y
 *   "1.50" es uno con cincuenta. Con 4 o más dígitos tras el punto
 *   (`10.5555`) -> `too_many_decimals`; con 3 dígitos que no agrupan miles
 *   (`1234.567`) -> `invalid`.
 */

/**
 * Entero de centavos. Redondeo simétrico (signo aparte) para que -0.005 y
 * 0.005 redondeen igual en valor absoluto, y sin `-0`.
 */
export function toCents(n: number): number {
  const cents = Math.sign(n) * Math.round(Math.abs(n) * 100);
  return cents === 0 ? 0 : cents;
}

export function fromCents(c: number): number {
  return c / 100;
}

/** Redondea a 2 decimales. */
export function roundMoney(n: number): number {
  return fromCents(toCents(n));
}

/** Suma en centavos enteros y divide al final. */
export function sumMoney(values: Iterable<number>): number {
  let cents = 0;
  for (const v of values) cents += toCents(v);
  return fromCents(cents);
}

export function moneyEquals(a: number, b: number): boolean {
  return toCents(a) === toCents(b);
}

export function compareMoney(a: number, b: number): -1 | 0 | 1 {
  const ca = toCents(a);
  const cb = toCents(b);
  if (ca < cb) return -1;
  if (ca > cb) return 1;
  return 0;
}

/**
 * Decimales a mostrar: 0 si el importe (redondeado a centavos) es entero,
 * 2 si tiene centavos. Decide sobre el importe redondeado, no sobre el float
 * crudo: 1500.0000000001 (residuo de una suma) es entero.
 */
export function fractionDigitsFor(amount: number): 0 | 2 {
  return toCents(amount) % 100 === 0 ? 0 : 2;
}

/** Número es-AR sin símbolo, con la regla de decimales ("77.570,82", "1.500"). */
export function formatMoneyNumber(amount: number): string {
  const digits = fractionDigitsFor(amount);
  return roundMoney(amount).toLocaleString('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export type MoneyParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'invalid' | 'too_many_decimals' };

export const MONEY_PARSE_MESSAGES: Record<'invalid' | 'too_many_decimals', string> = {
  invalid: 'Importe inválido',
  too_many_decimals: 'Máximo 2 decimales',
};

const INT_RE = /^\d+$/;
const THOUSANDS_RE = /^\d{1,3}(\.\d{3})+$/;
const DOT_DECIMAL_RE = /^\d+\.\d{1,2}$/;
const DOT_MANY_DECIMALS_RE = /^\d+\.\d{4,}$/;

function ok(value: number): MoneyParseResult {
  return { ok: true, value: roundMoney(value) };
}

/** Parte entera (con puntos de miles opcionales) a number, o null si es inválida. */
function parseIntegerPart(text: string): number | null {
  if (INT_RE.test(text)) return Number(text);
  if (THOUSANDS_RE.test(text)) return Number(text.replace(/\./g, ''));
  return null;
}

export function parseMoneyInput(text: string): MoneyParseResult {
  const clean = text.replace(/[\s$€]/g, '');
  if (clean === '') return { ok: false, reason: 'empty' };

  if (clean.includes(',')) {
    const parts = clean.split(',');
    if (parts.length !== 2) return { ok: false, reason: 'invalid' };
    const [intText, decText] = parts as [string, string];
    const intPart = parseIntegerPart(intText);
    if (intPart === null || !/^\d*$/.test(decText)) return { ok: false, reason: 'invalid' };
    if (decText.length > 2) return { ok: false, reason: 'too_many_decimals' };
    return ok(Number(`${intPart}.${decText === '' ? '0' : decText}`));
  }

  if (INT_RE.test(clean)) return ok(Number(clean));
  if (THOUSANDS_RE.test(clean)) return ok(Number(clean.replace(/\./g, '')));
  if (DOT_DECIMAL_RE.test(clean)) return ok(Number(clean));
  if (DOT_MANY_DECIMALS_RE.test(clean)) return { ok: false, reason: 'too_many_decimals' };
  return { ok: false, reason: 'invalid' };
}
