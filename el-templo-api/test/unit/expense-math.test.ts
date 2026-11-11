/**
 * Fase 209 Plan 02: aritmética pura de Egresos (reparto, estado, tipo de
 * cambio, importes de un pago, prorrateos). Sin DB.
 *
 * Los resultados esperados están escritos a mano, nunca recalculados con la
 * función bajo prueba.
 */
import { describe, it, expect } from "vitest";
import {
  EXPENSE_CURRENCIES_BY_COUNTRY,
  MAX_MONEY,
  assertValidFxRate,
  computePaymentAmounts,
  countryCurrencyOf,
  expenseCostInCountryCurrency,
  expenseStatusOf,
  isValidImputationMonth,
  normalizeReceiptLinks,
  prorateByWeights,
  prorateCapped,
  splitEvenly,
  toCountryCurrency,
  validateAllocations,
} from "../../src/modules/finance/expense-math";
import { BadRequestError } from "../../src/modules/shared/errors";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("splitEvenly", () => {
  it.each<[number, number, number[]]>([
    [100, 3, [33, 33, 34]],
    [150000, 6, [25000, 25000, 25000, 25000, 25000, 25000]],
    [7, 1, [7]],
    [2, 3, [0, 0, 2]],
    [10, 0, []],
  ])("splitEvenly(%i, %i) = %j", (total, n, esperado) => {
    expect(splitEvenly(total, n)).toEqual(esperado);
  });
});

describe("prorateByWeights", () => {
  it("936000 entre 6 pesos iguales = 156000 cada uno", () => {
    expect(prorateByWeights(936000, [100, 100, 100, 100, 100, 100])).toEqual([
      156000, 156000, 156000, 156000, 156000, 156000,
    ]);
  });

  it("10 entre [1,1,1] = [3,3,4] (resto al último)", () => {
    expect(prorateByWeights(10, [1, 1, 1])).toEqual([3, 3, 4]);
  });

  it("proporcional a pesos distintos: 100 entre [1,3] = [25,75]", () => {
    expect(prorateByWeights(100, [1, 3])).toEqual([25, 75]);
  });

  it("importes grandes: suma exacta sin pérdida de precisión (BigInt)", () => {
    const parts = prorateByWeights(1_999_999_999, [1_999_999_998, 1]);
    // 1999999999 * 1999999998 / 1999999999 = 1999999998 exacto; el resto es 1.
    expect(parts).toEqual([1_999_999_998, 1]);
    expect(sum(parts)).toBe(1_999_999_999);
  });

  it("un solo destino recibe todo", () => {
    expect(prorateByWeights(5, [9])).toEqual([5]);
  });

  it("sin pesos devuelve []", () => {
    expect(prorateByWeights(5, [])).toEqual([]);
  });

  it("total 0 reparte ceros", () => {
    expect(prorateByWeights(0, [2, 3])).toEqual([0, 0]);
  });

  it.each([[[0, 1]], [[-1, 2]], [[1.5, 2]]])(
    "pesos inválidos %j lanzan Error de programación",
    (pesos) => {
      expect(() => prorateByWeights(10, pesos)).toThrow(Error);
    },
  );
});

describe("prorateCapped", () => {
  it("2 entre topes [1,1,1]: suma 2 y cada parte entre 0 y su tope", () => {
    const parts = prorateCapped(2, [1, 1, 1]);
    expect(sum(parts)).toBe(2);
    parts.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
    // El exceso de la última (2 > 1) se corre hacia atrás.
    expect(parts).toEqual([0, 1, 1]);
  });

  it("5 entre [1,1,3] = [1,1,3] (lleno)", () => {
    expect(prorateCapped(5, [1, 1, 3])).toEqual([1, 1, 3]);
  });

  it("topes en 0 reciben 0 y no pesan", () => {
    expect(prorateCapped(4, [0, 2, 0, 2])).toEqual([0, 2, 0, 2]);
    expect(prorateCapped(2, [0, 5, 0])).toEqual([0, 2, 0]);
  });

  it("total 0 devuelve ceros", () => {
    expect(prorateCapped(0, [3, 0, 4])).toEqual([0, 0, 0]);
  });

  it("todos los topes en 0 con total 0", () => {
    expect(prorateCapped(0, [0, 0])).toEqual([0, 0]);
  });

  it("total lleno con topes grandes suma exacto y respeta cada tope", () => {
    const caps = [1_000_000_001, 999_999_999];
    const parts = prorateCapped(2_000_000_000, caps);
    expect(parts).toEqual([1_000_000_001, 999_999_999]);
  });

  it("pendiente parcial sobre costos: nunca supera el tope ni baja de 0", () => {
    const caps = [100, 3, 250, 7];
    const parts = prorateCapped(333, caps);
    expect(sum(parts)).toBe(333);
    parts.forEach((p, i) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(caps[i]);
    });
  });

  it("el total mayor a la suma de topes es error de programación", () => {
    expect(() => prorateCapped(4, [1, 1, 1])).toThrow(Error);
  });
});

describe("expenseStatusOf", () => {
  it.each<
    [number, number, "pendiente" | "parcial" | "pagado", number, boolean]
  >([
    [1000, 0, "pendiente", 1000, false],
    [1000, 400, "parcial", 600, false],
    [1000, 1000, "pagado", 0, false],
    [1000, 1200, "pagado", 0, true],
  ])("amount %i paid %i = %s", (amount, paid, status, pending, overpaid) => {
    expect(expenseStatusOf(amount, paid)).toEqual({
      status,
      pending,
      overpaid,
    });
  });
});

describe("validateAllocations", () => {
  const validos = new Set([1, 2, 3]);
  const base = { amount: 1000, validBranchIds: validos, allowCasaMatriz: true };

  it("suma exacta con sedes y Casa Matriz es válida", () => {
    expect(() =>
      validateAllocations({
        ...base,
        allocations: [
          { branchId: 1, amount: 400 },
          { branchId: 2, amount: 400 },
          { branchId: null, amount: 200 },
        ],
      }),
    ).not.toThrow();
  });

  const falla = (
    allocations: Array<{ branchId: number | null; amount: number }>,
    mensaje: RegExp,
    over: Partial<typeof base> = {},
  ) => {
    let error: unknown;
    try {
      validateAllocations({ ...base, ...over, allocations });
    } catch (err: unknown) {
      error = err;
    }
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).statusCode).toBe(400);
    expect((error as Error).message).toMatch(mensaje);
  };

  it("sin destinos", () => {
    falla([], /al menos un destino/);
  });

  it("suma distinta: el mensaje trae los dos números", () => {
    falla(
      [
        { branchId: 1, amount: 400 },
        { branchId: 2, amount: 500 },
      ],
      /suma 900 y el gasto es de 1000/,
    );
  });

  it("sede repetida", () => {
    falla(
      [
        { branchId: 1, amount: 500 },
        { branchId: 1, amount: 500 },
      ],
      /Una sede aparece más de una vez/,
    );
  });

  it("dos Casa Matriz", () => {
    falla(
      [
        { branchId: null, amount: 500 },
        { branchId: null, amount: 500 },
      ],
      /Casa Matriz aparece más de una vez/,
    );
  });

  it("Casa Matriz con allowCasaMatriz false", () => {
    falla([{ branchId: null, amount: 1000 }], /solo para gastos de Argentina/, {
      allowCasaMatriz: false,
    });
  });

  it("sede fuera del set válido", () => {
    falla(
      [
        { branchId: 1, amount: 500 },
        { branchId: 99, amount: 500 },
      ],
      /no es un destino válido/,
    );
  });

  it.each([[0], [-100], [10.5]])("parte %d inválida", (parte) => {
    falla(
      [
        { branchId: 1, amount: 1000 - parte },
        { branchId: 2, amount: parte },
      ],
      /importe entero mayor a 0/,
    );
  });
});

describe("computePaymentAmounts", () => {
  it("AR: cuenta ARS / gasto ARS", () => {
    expect(
      computePaymentAmounts({
        country: "AR",
        expenseCurrency: "ARS",
        accountCurrency: "ARS",
        amount: 1000,
      }),
    ).toEqual({ appliedAmount: 1000, amountArs: 1000, fxRate: null });
  });

  it("AR: cuenta ARS / gasto USD, 156000 con tc 1560 = 100 USD", () => {
    expect(
      computePaymentAmounts({
        country: "AR",
        expenseCurrency: "USD",
        accountCurrency: "ARS",
        amount: 156000,
        fxRate: 1560,
      }),
    ).toEqual({ appliedAmount: 100, amountArs: 156000, fxRate: 1560 });
  });

  it("AR: cuenta USD / gasto USD, 100 con tc 1560", () => {
    expect(
      computePaymentAmounts({
        country: "AR",
        expenseCurrency: "USD",
        accountCurrency: "USD",
        amount: 100,
        fxRate: 1560,
      }),
    ).toEqual({ appliedAmount: 100, amountArs: 156000, fxRate: 1560 });
  });

  it("AR: cuenta USD / gasto ARS, 100 con tc 1560 = 156000", () => {
    expect(
      computePaymentAmounts({
        country: "AR",
        expenseCurrency: "ARS",
        accountCurrency: "USD",
        amount: 100,
        fxRate: 1560,
      }),
    ).toEqual({ appliedAmount: 156000, amountArs: 156000, fxRate: 1560 });
  });

  it("ES: EUR / EUR, sin pesos", () => {
    expect(
      computePaymentAmounts({
        country: "ES",
        expenseCurrency: "EUR",
        accountCurrency: "EUR",
        amount: 500,
      }),
    ).toEqual({ appliedAmount: 500, amountArs: null, fxRate: null });
  });

  const falla = (
    params: Parameters<typeof computePaymentAmounts>[0],
    mensaje: RegExp,
  ) => {
    let error: unknown;
    try {
      computePaymentAmounts(params);
    } catch (err: unknown) {
      error = err;
    }
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as Error).message).toMatch(mensaje);
  };

  it("cuenta ARS / gasto USD sin tc: pide el tipo de cambio", () => {
    falla(
      {
        country: "AR",
        expenseCurrency: "USD",
        accountCurrency: "ARS",
        amount: 156000,
      },
      /necesita el tipo de cambio: la cuenta está en ARS y el gasto en USD/,
    );
  });

  it("cuenta USD / gasto USD sin tc: pide el tipo de cambio para los pesos", () => {
    falla(
      {
        country: "AR",
        expenseCurrency: "USD",
        accountCurrency: "USD",
        amount: 100,
      },
      /cuentas en USD necesitan el tipo de cambio para expresarlos en pesos/,
    );
  });

  it("ARS / ARS con tc: no lleva tipo de cambio", () => {
    falla(
      {
        country: "AR",
        expenseCurrency: "ARS",
        accountCurrency: "ARS",
        amount: 1000,
        fxRate: 1560,
      },
      /no lleva tipo de cambio/,
    );
  });

  it("ES EUR / EUR con tc: no lleva tipo de cambio", () => {
    falla(
      {
        country: "ES",
        expenseCurrency: "EUR",
        accountCurrency: "EUR",
        amount: 1000,
        fxRate: 1.1,
      },
      /no lleva tipo de cambio/,
    );
  });

  it("applied que redondea a 0: demasiado chico", () => {
    falla(
      {
        country: "AR",
        expenseCurrency: "USD",
        accountCurrency: "ARS",
        amount: 500,
        fxRate: 1560,
      },
      /demasiado chico para ese tipo de cambio/,
    );
  });

  it("cuenta EUR para un gasto de Argentina", () => {
    falla(
      {
        country: "AR",
        expenseCurrency: "ARS",
        accountCurrency: "EUR",
        amount: 100,
        fxRate: 1700,
      },
      /La cuenta está en EUR: no sirve para pagar gastos de Argentina/,
    );
  });

  it("cuenta ARS para un gasto de España", () => {
    falla(
      {
        country: "ES",
        expenseCurrency: "EUR",
        accountCurrency: "ARS",
        amount: 100,
        fxRate: 1,
      },
      /La cuenta está en ARS: no sirve para pagar gastos de España/,
    );
  });

  it("tipo de cambio inválido", () => {
    falla(
      {
        country: "AR",
        expenseCurrency: "USD",
        accountCurrency: "USD",
        amount: 100,
        fxRate: 0,
      },
      /mayor a 0 y tener hasta 4 decimales/,
    );
  });

  it.each([[0], [-5], [10.5]])("importe del pago %d inválido", (importe) => {
    falla(
      {
        country: "AR",
        expenseCurrency: "ARS",
        accountCurrency: "ARS",
        amount: importe,
      },
      /entero mayor a 0/,
    );
  });
});

describe("expenseCostInCountryCurrency", () => {
  it.each<
    ["AR" | "ES", "ARS" | "USD" | "EUR", number, number | null, number | null]
  >([
    ["AR", "USD", 600, 1560, 936000],
    ["AR", "USD", 600, null, null],
    ["AR", "ARS", 50000, null, 50000],
    ["ES", "EUR", 300, null, 300],
  ])("%s %s %i fx %s = %s", (country, currency, amount, fxRate, esperado) => {
    expect(
      expenseCostInCountryCurrency({ country, currency, amount, fxRate }),
    ).toBe(esperado);
  });
});

describe("toCountryCurrency", () => {
  it("redondea una sola vez", () => {
    expect(toCountryCurrency(3, 1560.5)).toBe(4682);
  });

  it("pasa el tope: 400", () => {
    expect(() => toCountryCurrency(MAX_MONEY, 2)).toThrow(BadRequestError);
  });
});

describe("isValidImputationMonth", () => {
  it.each([
    ["2026-11", true],
    ["2000-01", true],
    ["2099-12", true],
    ["2026-13", false],
    ["2026-00", false],
    ["2026-1", false],
    ["26-11", false],
    ["2026/11", false],
    ["1999-12", false],
    ["2100-01", false],
  ])("%s = %s", (s, esperado) => {
    expect(isValidImputationMonth(s)).toBe(esperado);
  });
});

describe("assertValidFxRate", () => {
  it.each([[1560], [1560.1234], [0.0001], [99999999.9999]])(
    "%d es válido",
    (fx) => {
      expect(() => assertValidFxRate(fx)).not.toThrow();
    },
  );

  it.each([[0], [-1], [1.00001], [NaN], [Infinity], [100000000]])(
    "%d es 400",
    (fx) => {
      expect(() => assertValidFxRate(fx)).toThrow(BadRequestError);
    },
  );
});

describe("normalizeReceiptLinks", () => {
  it("recorta espacios y permite label vacío", () => {
    expect(
      normalizeReceiptLinks([
        { label: "  Factura  ", url: "  https://drive.google.com/x  " },
        { label: "", url: "http://a.com/b" },
      ]),
    ).toEqual([
      { label: "Factura", url: "https://drive.google.com/x" },
      { label: "", url: "http://a.com/b" },
    ]);
  });

  it("sin links devuelve []", () => {
    expect(normalizeReceiptLinks(undefined)).toEqual([]);
    expect(normalizeReceiptLinks([])).toEqual([]);
  });

  it.each([
    ["ftp://x", /link de comprobante 2 no es una URL válida/],
    ["drive.google.com/x", /link de comprobante 2 no es una URL válida/],
    ["   ", /link de comprobante 2 no es una URL válida/],
  ])("%j: 400 con el número de link", (url, mensaje) => {
    let error: unknown;
    try {
      normalizeReceiptLinks([
        { label: "ok", url: "https://ok.com" },
        { label: "mal", url },
      ]);
    } catch (err: unknown) {
      error = err;
    }
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as Error).message).toMatch(mensaje);
  });

  it("11 links: 400", () => {
    const links = Array.from({ length: 11 }, (_, i) => ({
      label: `L${i}`,
      url: `https://x.com/${i}`,
    }));
    expect(() => normalizeReceiptLinks(links)).toThrow(
      /Hasta 10 links de comprobante/,
    );
  });

  it("10 links: ok", () => {
    const links = Array.from({ length: 10 }, (_, i) => ({
      label: `L${i}`,
      url: `https://x.com/${i}`,
    }));
    expect(normalizeReceiptLinks(links)).toHaveLength(10);
  });

  it("url de más de 500 caracteres: 400", () => {
    expect(() =>
      normalizeReceiptLinks([
        { label: "", url: `https://x.com/${"a".repeat(500)}` },
      ]),
    ).toThrow(BadRequestError);
  });

  it("label de más de 80 caracteres: 400", () => {
    expect(() =>
      normalizeReceiptLinks([{ label: "a".repeat(81), url: "https://x.com" }]),
    ).toThrow(BadRequestError);
  });
});

describe("monedas por país", () => {
  it("AR admite ARS y USD, ES solo EUR", () => {
    expect(EXPENSE_CURRENCIES_BY_COUNTRY.AR).toEqual(["ARS", "USD"]);
    expect(EXPENSE_CURRENCIES_BY_COUNTRY.ES).toEqual(["EUR"]);
  });

  it("moneda del país", () => {
    expect(countryCurrencyOf("AR")).toBe("ARS");
    expect(countryCurrencyOf("ES")).toBe("EUR");
  });
});
