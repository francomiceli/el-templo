/**
 * Fase 207 Plan 01 (DI-02, DI-04): helper unico de plata y keyword Ajv de
 * 2 decimales. Sin DB ni servidor: corre con `vitest.config.unit.ts`.
 */
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { BadRequestError } from "../../src/modules/shared/errors";
import {
  MONEY_MAX,
  MONEY_NON_NEGATIVE_SCHEMA,
  MONEY_POSITIVE_SCHEMA,
  MONEY_RESPONSE_SCHEMA,
  ajvMoneyPlugin,
  assertMoneyAmount,
  compareMoney,
  fromCents,
  isTwoDecimalAmount,
  moneyEquals,
  roundMoney,
  sumMoney,
  toCents,
} from "../../src/modules/shared/money";

describe("roundMoney", () => {
  it("corrige el error de coma flotante (0.1 + 0.2 = 0.3)", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("es simetrico: -0.005 y 0.005 redondean al mismo valor absoluto", () => {
    expect(roundMoney(-0.005)).toBe(-0.01);
    expect(roundMoney(0.005)).toBe(0.01);
  });

  it("nunca devuelve -0", () => {
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
    expect(Object.is(toCents(-0.001), 0)).toBe(true);
  });
});

describe("sumMoney", () => {
  it("3 x 33,33 + 0,01 = 100,00 exacto", () => {
    expect(sumMoney([33.33, 33.33, 33.33, 0.01])).toBe(100);
  });

  it("lista vacia = 0 y 0.1 + 0.2 = 0.3", () => {
    expect(sumMoney([])).toBe(0);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });

  it("acepta cualquier Iterable", () => {
    expect(sumMoney(new Set([1.1, 2.2]))).toBe(3.3);
  });
});

describe("toCents / fromCents", () => {
  it("convierte a centavos enteros sin error de float", () => {
    expect(toCents(77570.82)).toBe(7757082);
    expect(toCents(MONEY_MAX)).toBe(99999999999999);
    expect(toCents(1.15)).toBe(115);
    expect(toCents(-12.5)).toBe(-1250);
  });

  it("fromCents invierte toCents", () => {
    expect(fromCents(7757082)).toBe(77570.82);
  });
});

describe("moneyEquals / compareMoney", () => {
  it("compara sobre centavos, no sobre floats", () => {
    expect(0.1 + 0.2 === 0.3).toBe(false);
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true);
    expect(moneyEquals(1, 1.01)).toBe(false);
  });

  it("compareMoney devuelve -1, 0 o 1", () => {
    expect(compareMoney(100.005 - 0.005, 100)).toBe(0);
    expect(compareMoney(99.99, 100)).toBe(-1);
    expect(compareMoney(100.01, 100)).toBe(1);
  });
});

describe("isTwoDecimalAmount", () => {
  it.each([77570.82, 0.07, 1.15, 100, 0, -12.5, 999999999999.99])(
    "acepta %s",
    (n) => {
      expect(isTwoDecimalAmount(n)).toBe(true);
    },
  );

  it.each([
    [1.155],
    [1.000001],
    [0.1 + 0.2],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    ["100"],
    [null],
  ])("rechaza %s", (n) => {
    expect(isTwoDecimalAmount(n)).toBe(false);
  });
});

describe("assertMoneyAmount", () => {
  const label = "El monto";

  it("devuelve el numero cuando es valido", () => {
    expect(assertMoneyAmount(77570.82, { label })).toBe(77570.82);
  });

  it("rechaza 3 decimales con mensaje en espanol", () => {
    expect(() => assertMoneyAmount(1.155, { label })).toThrow(BadRequestError);
    expect(() => assertMoneyAmount(1.155, { label })).toThrow(/2 decimales/);
  });

  it("rechaza negativos salvo allowNegative", () => {
    expect(() => assertMoneyAmount(-1, { label })).toThrow(/negativo/);
    expect(assertMoneyAmount(-1, { label, allowNegative: true })).toBe(-1);
  });

  it("rechaza cero salvo allowZero", () => {
    expect(() => assertMoneyAmount(0, { label })).toThrow(/mayor a cero/);
    expect(assertMoneyAmount(0, { label, allowZero: true })).toBe(0);
  });

  it("rechaza no numeros y NaN", () => {
    expect(() => assertMoneyAmount("100", { label })).toThrow(/importe válido/);
    expect(() => assertMoneyAmount(Number.NaN, { label })).toThrow(
      /importe válido/,
    );
  });

  it("rechaza lo que supera el maximo del DECIMAL(14,2)", () => {
    expect(() => assertMoneyAmount(1_000_000_000_000, { label })).toThrow(
      /supera el máximo/,
    );
    expect(() =>
      assertMoneyAmount(-1_000_000_000_000, { label, allowNegative: true }),
    ).toThrow(/supera el máximo/);
  });
});

describe("keyword Ajv moneyTwoDecimals", () => {
  async function buildTestApp() {
    const app = Fastify({ ajv: { plugins: [ajvMoneyPlugin] } });
    app.post(
      "/positive",
      {
        schema: {
          body: {
            type: "object",
            required: ["amount"],
            properties: { amount: MONEY_POSITIVE_SCHEMA },
          },
          response: {
            200: {
              type: "object",
              properties: { amount: MONEY_RESPONSE_SCHEMA },
            },
          },
        },
      },
      async (req) => req.body,
    );
    app.post(
      "/non-negative",
      {
        schema: {
          body: {
            type: "object",
            required: ["amount"],
            properties: { amount: MONEY_NON_NEGATIVE_SCHEMA },
          },
        },
      },
      async () => ({ ok: true }),
    );
    app.post(
      "/date",
      {
        schema: {
          body: {
            type: "object",
            required: ["day"],
            properties: { day: { type: "string", format: "date" } },
          },
        },
      },
      async () => ({ ok: true }),
    );
    await app.ready();
    return app;
  }

  it.each([77570.82, 0.07, 1.15, 15000])("acepta %s", async (amount) => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/positive",
      payload: { amount },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ amount });
    await app.close();
  });

  it.each([1.155, 0, -5, 1_000_000_000_000])("rechaza %s", async (amount) => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/positive",
      payload: { amount },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("el mensaje de 3 decimales es el propio de la keyword", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/positive",
      payload: { amount: 1.155 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("2 decimales");
    await app.close();
  });

  it("MONEY_NON_NEGATIVE_SCHEMA acepta 0 y rechaza negativos", async () => {
    const app = await buildTestApp();
    const ok = await app.inject({
      method: "POST",
      url: "/non-negative",
      payload: { amount: 0 },
    });
    const bad = await app.inject({
      method: "POST",
      url: "/non-negative",
      payload: { amount: -0.01 },
    });
    expect(ok.statusCode).toBe(200);
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it("ajv-formats sigue cargado: format date valida fechas", async () => {
    const app = await buildTestApp();
    const ok = await app.inject({
      method: "POST",
      url: "/date",
      payload: { day: "2026-11-10" },
    });
    const bad = await app.inject({
      method: "POST",
      url: "/date",
      payload: { day: "no-es-fecha" },
    });
    expect(ok.statusCode).toBe(200);
    expect(bad.statusCode).toBe(400);
    await app.close();
  });
});
