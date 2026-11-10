/**
 * Helper único de plata (fase 207, DI-01, DI-02, DI-04).
 *
 * Unidad: pesos/euros con 2 decimales (DECIMAL(14,2) en la base), NO centavos
 * enteros. Los centavos enteros (`toCents`) son solo una representación
 * intermedia para sumar y comparar sin error de coma flotante.
 *
 * Por qué NO `multipleOf: 0.01` de Ajv: con floats rechaza importes válidos
 * (1.15 / 0.01 = 114.99999999999999, 0.07 / 0.01 = 7.000000000000001,
 * 77570.82 / 0.01 = 7757082.000000001). La prueba exacta es
 * `Number(n.toFixed(2)) === n` (keyword `moneyTwoDecimals`).
 *
 * Por qué NO `decimalNumbers: true` en el pool de mysql2: es global, cambiaría
 * a number toda columna DECIMAL y todo SUM/AVG de la app (gasto de Meta,
 * Search Console, medidas de Conquer). Las columnas de plata usan
 * `decimal(..., { mode: "number" })` (Drizzle mapea con `Number()` al leer) y
 * toda lectura/agregado en SQL crudo se envuelve en `Number()`.
 *
 * Reglas: nunca `===` entre importes calculados (usar `moneyEquals`), nunca
 * acumular importes sin `sumMoney`.
 */
import { BadRequestError } from "./errors";

/** Tope de DECIMAL(14,2). */
export const MONEY_MAX = 999_999_999_999.99;

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

/** Redondea a 2 decimales (DI-02). */
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

/** ¿Es un number finito con como máximo 2 decimales? */
export function isTwoDecimalAmount(n: unknown): n is number {
  return (
    typeof n === "number" && Number.isFinite(n) && Number(n.toFixed(2)) === n
  );
}

export interface AssertMoneyOptions {
  label: string;
  allowZero?: boolean;
  allowNegative?: boolean;
}

/** Valida un importe a nivel servicio. Devuelve el número o lanza 400. */
export function assertMoneyAmount(
  n: unknown,
  opts: AssertMoneyOptions,
): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new BadRequestError(`${opts.label} debe ser un importe válido`);
  }
  if (!isTwoDecimalAmount(n)) {
    throw new BadRequestError(
      `${opts.label} puede tener como máximo 2 decimales`,
    );
  }
  if (n < 0 && !opts.allowNegative) {
    throw new BadRequestError(`${opts.label} no puede ser negativo`);
  }
  if (n === 0 && !opts.allowZero) {
    throw new BadRequestError(`${opts.label} debe ser mayor a cero`);
  }
  if (Math.abs(n) > MONEY_MAX) {
    throw new BadRequestError(`${opts.label} supera el máximo permitido`);
  }
  return n;
}

/** Importe >= 0 con 2 decimales como máximo (body de rutas). */
export const MONEY_NON_NEGATIVE_SCHEMA = {
  type: "number",
  minimum: 0,
  maximum: MONEY_MAX,
  moneyTwoDecimals: true,
} as const;

/** Importe > 0 con 2 decimales como máximo (body de rutas). */
export const MONEY_POSITIVE_SCHEMA = {
  type: "number",
  exclusiveMinimum: 0,
  maximum: MONEY_MAX,
  moneyTwoDecimals: true,
} as const;

/** Importe en respuestas: siempre number, nunca string. */
export const MONEY_RESPONSE_SCHEMA = { type: "number" } as const;

interface MoneyKeywordError {
  keyword: string;
  message: string;
  params: Record<string, never>;
}

interface MoneyKeywordDefinition {
  keyword: string;
  type: string;
  schemaType: string;
  errors: boolean;
  validate: MoneyKeywordValidate;
}

interface MoneyKeywordValidate {
  (schema: boolean, data: unknown): boolean;
  errors?: MoneyKeywordError[];
}

/**
 * Interfaz estructural mínima de Ajv: `ajv` no es dependencia directa del API
 * (pnpm estricto), así que no se importan sus tipos. `addKeyword` recibe
 * `unknown` para que la firma real de Ajv (`string | KeywordDefinition`) sea
 * asignable: tipar la definición acá la volvería incompatible con
 * `Fastify({ ajv: { plugins } })`.
 */
export interface AjvKeywordHost {
  addKeyword(def: unknown): unknown;
}

/**
 * Plugin Ajv: registra la keyword `moneyTwoDecimals`. NO llamarlo
 * `formatsPlugin`: la ajv-compiler de Fastify dejaría de cargar ajv-formats.
 */
export function ajvMoneyPlugin<T extends AjvKeywordHost>(ajv: T): T {
  const validate: MoneyKeywordValidate = (schema, data) => {
    if (!schema) return true;
    const ok = isTwoDecimalAmount(data);
    validate.errors = ok
      ? undefined
      : [
          {
            keyword: "moneyTwoDecimals",
            message: "debe tener como máximo 2 decimales",
            params: {},
          },
        ];
    return ok;
  };
  const definition: MoneyKeywordDefinition = {
    keyword: "moneyTwoDecimals",
    type: "number",
    schemaType: "boolean",
    errors: true,
    validate,
  };
  ajv.addKeyword(definition);
  // Los plugins de Ajv devuelven la instancia.
  return ajv;
}
