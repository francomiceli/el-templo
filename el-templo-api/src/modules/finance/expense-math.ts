// Módulo: finance — fase 209 (Egresos)
//
// Toda la aritmética de Egresos, sin I/O y sin DB: reparto, estado del gasto,
// conversión por tipo de cambio, importes de un pago y prorrateos enteros.
// Cualquier cambio de criterio se hace acá y en su espejo del admin
// `src/utils/expenses.ts`.
//
// Plata en ENTEROS (D-23). El único decimal es `fxRate` (pesos por unidad de
// moneda extranjera, hasta 4 decimales): se usa SOLO para calcular una vez un
// entero con `Math.round`; nunca se suma ni se compara entre filas.
import { BadRequestError } from "../shared/errors";
import { currencyForCountry, type CountryCurrency } from "../shared/currency";
import type {
  ExpenseCountry,
  ExpenseCurrency,
  ExpensePaymentStatus,
  ExpenseAllocationInput,
  ReceiptLink,
} from "./expense-types";

/** Tope de un importe (`int` de MySQL con margen). */
export const MAX_MONEY = 2_000_000_000;

/** Monedas en que se puede cargar un gasto y abrir una cuenta de pago, por país (DI-03). */
export const EXPENSE_CURRENCIES_BY_COUNTRY: Record<
  ExpenseCountry,
  readonly ExpenseCurrency[]
> = {
  AR: ["ARS", "USD"],
  ES: ["EUR"],
};

/** Moneda del país (la de sus sedes). */
export function countryCurrencyOf(country: ExpenseCountry): CountryCurrency {
  return currencyForCountry(country);
}

const COUNTRY_NAMES: Record<ExpenseCountry, string> = {
  AR: "Argentina",
  ES: "España",
};

/** `YYYY-MM` con mes 01-12 y año 2000-2099. */
export function isValidImputationMonth(s: string): boolean {
  if (typeof s !== "string") return false;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return false;
  const year = Number(s.slice(0, 4));
  return year >= 2000 && year <= 2099;
}

/** Tipo de cambio: finito, > 0, hasta 99999999.9999 y como mucho 4 decimales. */
export function assertValidFxRate(fx: number): void {
  const scaled = fx * 10_000;
  const ok =
    typeof fx === "number" &&
    Number.isFinite(fx) &&
    fx > 0 &&
    fx <= 99_999_999.9999 &&
    Math.abs(scaled - Math.round(scaled)) < 1e-6;
  if (!ok) {
    throw new BadRequestError(
      "El tipo de cambio tiene que ser mayor a 0 y tener hasta 4 decimales",
    );
  }
}

/** Convierte un importe a la moneda del país: `Math.round(amount * fx)`. */
export function toCountryCurrency(amount: number, fxRate: number): number {
  const converted = Math.round(amount * fxRate);
  if (converted > MAX_MONEY) {
    throw new BadRequestError(
      "El importe convertido supera el máximo permitido",
    );
  }
  return converted;
}

/**
 * Costo del gasto en la moneda del país (DI-03). Solo AR con USD necesita el
 * tipo de cambio: sin él el costo se desconoce (null). En el resto la moneda
 * del gasto ya es la del país.
 */
export function expenseCostInCountryCurrency(params: {
  country: ExpenseCountry;
  currency: ExpenseCurrency;
  amount: number;
  fxRate: number | null;
}): number | null {
  const { country, currency, amount, fxRate } = params;
  if (country === "AR" && currency === "USD") {
    return fxRate === null ? null : toCountryCurrency(amount, fxRate);
  }
  return amount;
}

/**
 * Estado de pago del gasto (DI-11): el ÚNICO lugar que lo decide.
 * `paid` es la suma de lo aplicado por los pagos vigentes, en la moneda del gasto.
 */
export function expenseStatusOf(
  amount: number,
  paid: number,
): { status: ExpensePaymentStatus; pending: number; overpaid: boolean } {
  const status: ExpensePaymentStatus =
    paid <= 0 ? "pendiente" : paid >= amount ? "pagado" : "parcial";
  return {
    status,
    pending: Math.max(amount - paid, 0),
    overpaid: paid > amount,
  };
}

/**
 * Partes iguales: `floor(total / n)` para todas y el resto a la última (DI-08).
 * `n = 0` devuelve `[]`.
 */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const parts = new Array<number>(n).fill(base);
  parts[n - 1] = total - base * (n - 1);
  return parts;
}

/**
 * Prorrateo entero por pesos. Resto al último destino (DI-12); BigInt porque
 * importe × peso puede pasar 2^53 y el `Math.floor` en punto flotante perdería
 * precisión. La suma de las partes es EXACTAMENTE `total`.
 */
export function prorateByWeights(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error("prorateByWeights: el total tiene que ser un entero >= 0");
  }
  if (weights.length === 0) return [];
  if (weights.some((w) => !Number.isInteger(w) || w <= 0)) {
    throw new Error("prorateByWeights: los pesos tienen que ser enteros > 0");
  }
  const sumW = weights.reduce((acc, w) => acc + BigInt(w), 0n);
  const bigTotal = BigInt(total);
  const parts: number[] = [];
  let assigned = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    const part = Number((bigTotal * BigInt(weights[i])) / sumW);
    parts.push(part);
    assigned += part;
  }
  parts.push(total - assigned);
  return parts;
}

/**
 * Prorrateo con tope por parte (requisito: `total <= Σ caps`). Se usa para
 * prorratear lo PENDIENTE sobre el costo de cada destino: así "pagado de ese
 * costo = costo − pendiente" nunca da negativo por sede (interpretación de
 * DI-12). Los topes en 0 reciben 0 y no pesan. Si la última parte supera su
 * tope, el exceso se reparte hacia atrás (de la anteúltima a la primera) en lo
 * que entre de cada tope. Garantiza `0 <= parte <= tope` y suma exacta.
 */
export function prorateCapped(total: number, caps: number[]): number[] {
  if (caps.some((c) => !Number.isInteger(c) || c < 0)) {
    throw new Error("prorateCapped: los topes tienen que ser enteros >= 0");
  }
  const capSum = caps.reduce((acc, c) => acc + c, 0);
  if (!Number.isInteger(total) || total < 0 || total > capSum) {
    throw new Error("prorateCapped: el total supera la suma de los topes");
  }
  const result = new Array<number>(caps.length).fill(0);
  const idx: number[] = [];
  caps.forEach((c, i) => {
    if (c > 0) idx.push(i);
  });
  if (idx.length === 0) return result;

  const parts = prorateByWeights(
    total,
    idx.map((i) => caps[i]),
  );
  const last = parts.length - 1;
  const lastCap = caps[idx[last]];
  if (parts[last] > lastCap) {
    let excess = parts[last] - lastCap;
    parts[last] = lastCap;
    for (let k = last - 1; k >= 0 && excess > 0; k--) {
      const room = caps[idx[k]] - parts[k];
      const add = Math.min(room, excess);
      parts[k] += add;
      excess -= add;
    }
  }
  idx.forEach((i, k) => {
    result[i] = parts[k];
  });
  return result;
}

/**
 * Valida el reparto de un gasto (DI-08): al menos un destino, partes enteras
 * > 0, Casa Matriz solo si el país lo permite y una sola vez, sedes sin repetir
 * y dentro del set válido, y suma EXACTA igual al importe.
 */
export function validateAllocations(params: {
  amount: number;
  allocations: ExpenseAllocationInput[];
  validBranchIds: ReadonlySet<number>;
  allowCasaMatriz: boolean;
}): void {
  const { amount, allocations, validBranchIds, allowCasaMatriz } = params;
  if (allocations.length === 0) {
    throw new BadRequestError("El reparto necesita al menos un destino");
  }
  for (const a of allocations) {
    if (!Number.isInteger(a.amount) || a.amount <= 0) {
      throw new BadRequestError(
        "Cada parte del reparto tiene que ser un importe entero mayor a 0",
      );
    }
  }
  const seen = new Set<number>();
  let casaMatrizCount = 0;
  for (const a of allocations) {
    if (a.branchId === null) {
      if (!allowCasaMatriz) {
        throw new BadRequestError(
          "Casa Matriz es un destino solo para gastos de Argentina",
        );
      }
      casaMatrizCount += 1;
      if (casaMatrizCount > 1) {
        throw new BadRequestError(
          "Casa Matriz aparece más de una vez en el reparto",
        );
      }
      continue;
    }
    if (seen.has(a.branchId)) {
      throw new BadRequestError(
        "Una sede aparece más de una vez en el reparto",
      );
    }
    seen.add(a.branchId);
    if (!validBranchIds.has(a.branchId)) {
      throw new BadRequestError(
        "Hay una sede en el reparto que no es un destino válido: tiene que ser una sede activa del país del gasto",
      );
    }
  }
  const sum = allocations.reduce((acc, a) => acc + a.amount, 0);
  if (sum !== amount) {
    throw new BadRequestError(
      `El reparto suma ${sum} y el gasto es de ${amount}: tienen que ser iguales`,
    );
  }
}

/**
 * Importes de un pago (DI-03). `fxRate` = pesos por unidad de la otra moneda.
 *
 * | país | cuenta | gasto | applied (moneda del gasto) | amountArs |
 * |------|--------|-------|----------------------------|-----------|
 * | AR   | ARS    | ARS   | amount                     | amount    |
 * | AR   | ARS    | USD   | round(amount / fx)         | amount    |
 * | AR   | USD    | USD   | amount                     | round(amount * fx) |
 * | AR   | USD    | ARS   | round(amount * fx)         | round(amount * fx) |
 * | ES   | EUR    | EUR   | amount                     | null      |
 */
export function computePaymentAmounts(params: {
  country: ExpenseCountry;
  expenseCurrency: ExpenseCurrency;
  accountCurrency: string;
  amount: number;
  fxRate?: number | null;
}): { appliedAmount: number; amountArs: number | null; fxRate: number | null } {
  const { country, expenseCurrency, accountCurrency, amount } = params;
  const fx = params.fxRate ?? null;

  if (
    !(EXPENSE_CURRENCIES_BY_COUNTRY[country] as readonly string[]).includes(
      accountCurrency,
    )
  ) {
    throw new BadRequestError(
      `La cuenta está en ${accountCurrency}: no sirve para pagar gastos de ${COUNTRY_NAMES[country]}`,
    );
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_MONEY) {
    throw new BadRequestError(
      "El importe del pago tiene que ser un entero mayor a 0",
    );
  }

  const currenciesDiffer = accountCurrency !== expenseCurrency;
  const needsFx =
    currenciesDiffer || (country === "AR" && accountCurrency !== "ARS");
  if (!needsFx) {
    if (fx !== null) {
      throw new BadRequestError("Este pago no lleva tipo de cambio");
    }
    return {
      appliedAmount: amount,
      amountArs: country === "AR" ? amount : null,
      fxRate: null,
    };
  }
  if (fx === null) {
    throw new BadRequestError(
      currenciesDiffer
        ? `Este pago necesita el tipo de cambio: la cuenta está en ${accountCurrency} y el gasto en ${expenseCurrency}`
        : `Los pagos desde cuentas en ${accountCurrency} necesitan el tipo de cambio para expresarlos en pesos`,
    );
  }
  assertValidFxRate(fx);

  let appliedAmount: number;
  let amountArs: number;
  if (accountCurrency === "ARS") {
    // Cuenta en pesos, gasto en USD.
    appliedAmount = Math.round(amount / fx);
    amountArs = amount;
  } else if (expenseCurrency === "USD") {
    // Cuenta en USD, gasto en USD.
    appliedAmount = amount;
    amountArs = toCountryCurrency(amount, fx);
  } else {
    // Cuenta en USD, gasto en ARS.
    amountArs = toCountryCurrency(amount, fx);
    appliedAmount = amountArs;
  }
  if (appliedAmount < 1) {
    throw new BadRequestError(
      "El importe del pago es demasiado chico para ese tipo de cambio",
    );
  }
  return { appliedAmount, amountArs, fxRate: fx };
}

/** `http://` o `https://` con una URL parseable. */
export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normaliza los links de comprobante (D-10): hasta 10, `url` recortada, no
 * vacía, <= 500 caracteres y `http(s)://`; `label` recortado <= 80 (vacío
 * permitido).
 */
export function normalizeReceiptLinks(
  links: ReceiptLink[] | null | undefined,
): ReceiptLink[] {
  if (!links) return [];
  if (links.length > 10) {
    throw new BadRequestError("Hasta 10 links de comprobante por gasto");
  }
  return links.map((link, i) => {
    const url = (link.url ?? "").trim();
    const label = (link.label ?? "").trim();
    if (url.length === 0 || url.length > 500 || !isHttpUrl(url)) {
      throw new BadRequestError(
        `El link de comprobante ${i + 1} no es una URL válida (tiene que empezar con http:// o https://)`,
      );
    }
    if (label.length > 80) {
      throw new BadRequestError(
        `El nombre del link de comprobante ${i + 1} tiene más de 80 caracteres`,
      );
    }
    return { label, url };
  });
}
