/**
 * Fase 194-18 (D-22) — `reconstructRenewalBase`: la base que hereda una renovación
 * devuelve TODA promo del período anterior (referido, partner y AURA).
 * Funciones puras: tabla de casos + barrido exhaustivo de la inversión del AURA.
 */
import { describe, it, expect, vi } from "vitest";
import { reconstructRenewalBase } from "../../src/modules/subscriptions/renewal-base";

const noPromo = {
  referralDiscountAmount: null,
  partnerDiscountAmount: null,
  auraDiscountPercent: null,
};

describe("reconstructRenewalBase (D-22)", () => {
  it("sin promo: la base es el pricePaid", () => {
    expect(reconstructRenewalBase({ pricePaid: 70000, ...noPromo })).toBe(
      70000,
    );
  });

  it("solo referido (comportamiento de hoy intacto): 90000 + 10000 = 100000", () => {
    expect(
      reconstructRenewalBase({
        pricePaid: 90000,
        ...noPromo,
        referralDiscountAmount: 10000,
      }),
    ).toBe(100000);
  });

  it("AURA 10% sola: pricePaid 90000 -> 100000", () => {
    expect(
      reconstructRenewalBase({
        pricePaid: 90000,
        ...noPromo,
        auraDiscountPercent: 10,
      }),
    ).toBe(100000);
  });

  it("alta histórica compuesta AURA 10% + referido (81000 + 9000) -> 100000", () => {
    expect(
      reconstructRenewalBase({
        pricePaid: 81000,
        referralDiscountAmount: 9000,
        partnerDiscountAmount: null,
        auraDiscountPercent: 10,
      }),
    ).toBe(100000);
  });

  it("partner 15% (85000 + 15000) -> 100000", () => {
    expect(
      reconstructRenewalBase({
        pricePaid: 85000,
        referralDiscountAmount: null,
        partnerDiscountAmount: 15000,
        auraDiscountPercent: null,
      }),
    ).toBe(100000);
  });

  it("compuesto partner + referido sin AURA suma ambos montos", () => {
    expect(
      reconstructRenewalBase({
        pricePaid: 72000,
        referralDiscountAmount: 8000,
        partnerDiscountAmount: 20000,
        auraDiscountPercent: null,
      }),
    ).toBe(100000);
  });

  it("AURA 30% sola (la del caso (i2) de la caracterización): 70000 -> 100000", () => {
    expect(
      reconstructRenewalBase({
        pricePaid: 70000,
        ...noPromo,
        auraDiscountPercent: 30,
      }),
    ).toBe(100000);
  });

  it("montos con floor no exactos: la inversión reproduce SIEMPRE el neto (99999 con AURA 10%)", () => {
    // 99999 - floor(9999.9) = 90000: el neto es el mismo que el de lista 100000. Se
    // devuelve la MAYOR de las dos bases posibles (la de las listas redondas).
    const base = reconstructRenewalBase({
      pricePaid: 90000,
      ...noPromo,
      auraDiscountPercent: 10,
    });
    expect(base).toBe(100000);
    expect(base - Math.floor((base * 10) / 100)).toBe(90000);
  });

  it("barrido: para todo neto y % válidos, base - floor(base*pct/100) === neto y es la mayor solución", () => {
    for (const pct of [5, 10, 15, 20, 25, 30, 33, 40, 50]) {
      for (let neto = 0; neto <= 3000; neto += 7) {
        const base = reconstructRenewalBase({
          pricePaid: neto,
          ...noPromo,
          auraDiscountPercent: pct,
        });
        expect(base - Math.floor((base * pct) / 100)).toBe(neto);
        // La base inmediatamente MAYOR ya no reproduce el neto: se eligió la mayor.
        const next = base + 1;
        expect(next - Math.floor((next * pct) / 100)).not.toBe(neto);
      }
    }
  });

  it("% AURA fuera de rango (>= 100): fail-safe, devuelve el neto sin sumar AURA y avisa", () => {
    const warn = vi.fn();
    const base = reconstructRenewalBase(
      { pricePaid: 5000, ...noPromo, auraDiscountPercent: 100 },
      warn,
    );
    expect(base).toBe(5000);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("sin AURA no avisa", () => {
    const warn = vi.fn();
    reconstructRenewalBase({ pricePaid: 5000, ...noPromo }, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it("pricePaid 0 con AURA: base 0 (una renovación gratis heredada no inventa precio)", () => {
    expect(
      reconstructRenewalBase({
        pricePaid: 0,
        ...noPromo,
        auraDiscountPercent: 10,
      }),
    ).toBe(0);
  });
});
