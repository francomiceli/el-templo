/**
 * Fase 208 Plan 01: regla única medio ↔ cuenta (DI-04) y monedas de cuenta
 * (DI-02). Funciones puras: corre sin DB.
 */
import { describe, it, expect } from "vitest";
import {
  METHOD_ACCOUNT_RULE,
  assertMethodAllowedForAccount,
  isMethodAllowedForAccount,
  type AccountType,
} from "../../src/modules/finance/payment-method-rules";
import type { PaymentMethod } from "../../src/modules/finance/types";
import {
  ACCOUNT_CURRENCY_SCHEMA,
  SUPPORTED_ACCOUNT_CURRENCIES,
  isSupportedAccountCurrency,
} from "../../src/modules/shared/currency";
import { BadRequestError } from "../../src/modules/shared/errors";
import { SHARED_PAYMENT_METHOD_ENUM } from "../../src/modules/finance/schemas";

// Resultado esperado escrito a mano (no recalculado desde la regla).
const MATRIZ: Array<[PaymentMethod, AccountType, boolean]> = [
  ["cash", "efectivo", true],
  ["cash", "banco", false],
  ["transfer", "efectivo", false],
  ["transfer", "banco", true],
  ["card", "efectivo", false],
  ["card", "banco", true],
  ["cheque", "efectivo", false],
  ["cheque", "banco", true],
  ["direct_debit", "efectivo", false],
  ["direct_debit", "banco", true],
  ["internal", "efectivo", true],
  ["internal", "banco", true],
  ["aura_credit", "efectivo", true],
  ["aura_credit", "banco", true],
];

describe("isMethodAllowedForAccount", () => {
  it.each(MATRIZ)("%s con cuenta %s => %s", (method, tipo, esperado) => {
    expect(isMethodAllowedForAccount(method, tipo)).toBe(esperado);
  });

  it("METHOD_ACCOUNT_RULE tiene exactamente los 7 medios", () => {
    expect(Object.keys(METHOD_ACCOUNT_RULE).sort()).toEqual(
      [
        "aura_credit",
        "card",
        "cash",
        "cheque",
        "direct_debit",
        "internal",
        "transfer",
      ].sort(),
    );
  });

  it("la matriz cubre cada medio con las dos cuentas", () => {
    for (const method of Object.keys(METHOD_ACCOUNT_RULE)) {
      const tipos = MATRIZ.filter(([m]) => m === method).map(([, t]) => t);
      expect(tipos.sort(), method).toEqual(["banco", "efectivo"]);
    }
  });
});

describe("assertMethodAllowedForAccount", () => {
  it("efectivo contra una cuenta banco lanza BadRequestError nombrando cuenta y medio", () => {
    let error: unknown;
    try {
      assertMethodAllowedForAccount("cash", { type: "banco", name: "Galicia" });
    } catch (err: unknown) {
      error = err;
    }
    expect(error).toBeInstanceOf(BadRequestError);
    const msg = (error as BadRequestError).message;
    expect(msg).toContain("Efectivo");
    expect(msg).toContain("cuenta banco Galicia");
  });

  it("transferencia contra caja de efectivo nombra la caja", () => {
    expect(() =>
      assertMethodAllowedForAccount("transfer", {
        type: "efectivo",
        name: "Moreno",
      }),
    ).toThrow(/Transferencia no corresponde a la caja de efectivo Moreno/);
  });

  it("un cheque contra efectivo sin nombre igual rechaza", () => {
    expect(() =>
      assertMethodAllowedForAccount("cheque", { type: "efectivo" }),
    ).toThrow(BadRequestError);
  });

  it("los pares permitidos y los exentos no lanzan", () => {
    expect(() =>
      assertMethodAllowedForAccount("cash", { type: "efectivo", name: "X" }),
    ).not.toThrow();
    expect(() =>
      assertMethodAllowedForAccount("cheque", { type: "banco" }),
    ).not.toThrow();
    expect(() =>
      assertMethodAllowedForAccount("internal", { type: "banco" }),
    ).not.toThrow();
    expect(() =>
      assertMethodAllowedForAccount("aura_credit", { type: "efectivo" }),
    ).not.toThrow();
  });
});

describe("monedas de cuenta", () => {
  it("la lista es ARS, EUR, USD", () => {
    expect([...SUPPORTED_ACCOUNT_CURRENCIES]).toEqual(["ARS", "EUR", "USD"]);
  });

  it("isSupportedAccountCurrency distingue soportadas, desconocidas y minúsculas", () => {
    expect(isSupportedAccountCurrency("USD")).toBe(true);
    expect(isSupportedAccountCurrency("ARS")).toBe(true);
    expect(isSupportedAccountCurrency("EUR")).toBe(true);
    expect(isSupportedAccountCurrency("XYZ")).toBe(false);
    expect(isSupportedAccountCurrency("usd")).toBe(false);
  });

  it("ACCOUNT_CURRENCY_SCHEMA es un enum Ajv sobre la lista", () => {
    expect(ACCOUNT_CURRENCY_SCHEMA).toEqual({
      type: "string",
      enum: SUPPORTED_ACCOUNT_CURRENCIES,
    });
  });
});

describe("cobros sin cheque (T-208-02)", () => {
  it("el enum de medios de los cobros NO contiene 'cheque'", () => {
    expect(SHARED_PAYMENT_METHOD_ENUM as readonly string[]).not.toContain(
      "cheque",
    );
    expect(SHARED_PAYMENT_METHOD_ENUM).toHaveLength(6);
  });
});
