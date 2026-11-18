/**
 * Unit tests de las reglas puras del regalo de Aura (fase 215).
 *
 * Todo es puro, sin DB: ventana (D-12), semana del tope (D-05), motivos (D-16),
 * montos (D-10, D-11) y porcentaje de la medición (D-21).
 */

import { describe, it, expect } from "vitest";
import {
  COACH_GIFT_AMOUNT,
  GIFT_REASONS,
  GIFT_REFERENCE,
  GIFT_WEEKLY_CAP,
  giftExpiresOn,
  giftReasonLabel,
  giftWeekRange,
  giversPct,
  isGiftReason,
  isValidCoachGiftAmount,
  isWithinGiftWindow,
} from "../../src/modules/aura/gift-rules";

describe("motivos del regalo (D-16)", () => {
  it("son exactamente 4, en este orden y con su texto", () => {
    expect(GIFT_REASONS).toEqual([
      { code: "tecnica", label: "Buena técnica" },
      { code: "constancia", label: "Constancia" },
      { code: "energia", label: "Buena energía" },
      { code: "ayudo", label: "Me ayudó" },
    ]);
  });

  it("isGiftReason acepta solo los 4 códigos", () => {
    expect(isGiftReason("energia")).toBe(true);
    expect(isGiftReason("tecnica")).toBe(true);
    expect(isGiftReason("otro")).toBe(false);
    expect(isGiftReason("")).toBe(false);
    expect(isGiftReason(null)).toBe(false);
    expect(isGiftReason(3)).toBe(false);
  });

  it("giftReasonLabel devuelve el texto del motivo", () => {
    expect(giftReasonLabel("ayudo")).toBe("Me ayudó");
    expect(giftReasonLabel("tecnica")).toBe("Buena técnica");
  });
});

describe("ventana para regalar (D-12)", () => {
  it("el mismo día y el día anterior valen", () => {
    expect(isWithinGiftWindow("2026-11-17", "2026-11-17")).toBe(true);
    expect(isWithinGiftWindow("2026-11-16", "2026-11-17")).toBe(true);
  });

  it("antes de ayer no vale", () => {
    expect(isWithinGiftWindow("2026-11-15", "2026-11-17")).toBe(false);
  });

  it("una fecha futura no vale", () => {
    expect(isWithinGiftWindow("2026-11-18", "2026-11-17")).toBe(false);
  });

  it("cruza el fin de mes y el de año", () => {
    expect(isWithinGiftWindow("2026-10-31", "2026-11-01")).toBe(true);
    expect(isWithinGiftWindow("2026-12-31", "2027-01-01")).toBe(true);
    expect(isWithinGiftWindow("2026-10-30", "2026-11-01")).toBe(false);
  });

  it("giftExpiresOn es el día siguiente a la clase", () => {
    expect(giftExpiresOn("2026-11-30")).toBe("2026-12-01");
    expect(giftExpiresOn("2026-12-31")).toBe("2027-01-01");
  });
});

describe("semana del tope (D-05)", () => {
  it("un miércoles cae en la semana de lunes a domingo", () => {
    expect(giftWeekRange("2026-11-18")).toEqual({
      start: "2026-11-16",
      end: "2026-11-22",
    });
  });

  it("el lunes y el domingo dan la misma semana", () => {
    const monday = giftWeekRange("2026-11-16");
    const sunday = giftWeekRange("2026-11-22");
    expect(monday).toEqual(sunday);
    expect(monday).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });

  it("el lunes siguiente abre otra semana", () => {
    expect(giftWeekRange("2026-11-23")).toEqual({
      start: "2026-11-23",
      end: "2026-11-29",
    });
  });

  it("el tope es 2 por persona y semana", () => {
    expect(GIFT_WEEKLY_CAP).toBe(2);
  });
});

describe("valor del regalo del profe (D-11)", () => {
  it("arranca en 2 y va de 1 a 10", () => {
    expect(COACH_GIFT_AMOUNT).toEqual({ default: 2, min: 1, max: 10 });
  });

  it("acepta solo enteros del 1 al 10", () => {
    expect(isValidCoachGiftAmount(1)).toBe(true);
    expect(isValidCoachGiftAmount(2)).toBe(true);
    expect(isValidCoachGiftAmount(10)).toBe(true);
    expect(isValidCoachGiftAmount(0)).toBe(false);
    expect(isValidCoachGiftAmount(11)).toBe(false);
    expect(isValidCoachGiftAmount(-1)).toBe(false);
    expect(isValidCoachGiftAmount(2.5)).toBe(false);
    expect(isValidCoachGiftAmount(NaN)).toBe(false);
    expect(isValidCoachGiftAmount(Infinity)).toBe(false);
  });

  it("rechaza lo que no es número", () => {
    expect(isValidCoachGiftAmount("2")).toBe(false);
    expect(isValidCoachGiftAmount(null)).toBe(false);
    expect(isValidCoachGiftAmount(undefined)).toBe(false);
  });
});

describe("referencias del ledger", () => {
  it("el regalo y su anulación tienen su referencia", () => {
    expect(GIFT_REFERENCE).toEqual({
      gift: "aura_gift",
      void: "aura_gift_void",
    });
  });
});

describe("porcentaje de quienes regalaron (D-21)", () => {
  it("redondea al entero más cercano", () => {
    expect(giversPct(3, 12)).toBe(25);
    expect(giversPct(1, 3)).toBe(33);
    expect(giversPct(2, 3)).toBe(67);
  });

  it("sin base da 0", () => {
    expect(giversPct(0, 0)).toBe(0);
    expect(giversPct(5, 0)).toBe(0);
  });
});
