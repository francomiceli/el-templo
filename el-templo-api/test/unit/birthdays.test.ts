/**
 * Cumpleaños — lógica pura (shared/birthdays.ts).
 */
import { describe, it, expect } from "vitest";
import {
  isBirthdayOn,
  ageOnBirthday,
  birthdayLabelOn,
} from "../../src/modules/shared/birthdays";

describe("isBirthdayOn", () => {
  it("coincide cuando mes y día son iguales, en cualquier año posterior", () => {
    expect(isBirthdayOn("1994-09-17", "2026-09-17")).toBe(true);
    expect(isBirthdayOn("1994-09-17", "1994-09-17")).toBe(true);
  });

  it("no coincide en otro día ni en otro mes", () => {
    expect(isBirthdayOn("1994-09-17", "2026-09-16")).toBe(false);
    expect(isBirthdayOn("1994-09-17", "2026-10-17")).toBe(false);
  });

  it("no coincide antes del año de nacimiento", () => {
    expect(isBirthdayOn("1994-09-17", "1990-09-17")).toBe(false);
  });

  it("29 de febrero: cumple el 28 en años no bisiestos y el 29 en bisiestos", () => {
    expect(isBirthdayOn("2000-02-29", "2026-02-28")).toBe(true);
    expect(isBirthdayOn("2000-02-29", "2026-03-01")).toBe(false);
    expect(isBirthdayOn("2000-02-29", "2028-02-29")).toBe(true);
    expect(isBirthdayOn("2000-02-29", "2028-02-28")).toBe(false);
  });

  it("nacidos el 28 de febrero no se duplican con los del 29", () => {
    expect(isBirthdayOn("2000-02-28", "2028-02-29")).toBe(false);
    expect(isBirthdayOn("2000-02-28", "2028-02-28")).toBe(true);
  });

  it("tolera fechas con hora y rechaza nulos o basura", () => {
    expect(isBirthdayOn("1994-09-17T00:00:00.000Z", "2026-09-17")).toBe(true);
    expect(isBirthdayOn(null, "2026-09-17")).toBe(false);
    expect(isBirthdayOn(undefined, "2026-09-17")).toBe(false);
    expect(isBirthdayOn("", "2026-09-17")).toBe(false);
    expect(isBirthdayOn("17/09/1994", "2026-09-17")).toBe(false);
    expect(isBirthdayOn("1994-09-17", "hoy")).toBe(false);
  });
});

describe("ageOnBirthday", () => {
  it("devuelve la edad que cumple ese día", () => {
    expect(ageOnBirthday("1994-09-17", "2026-09-17")).toBe(32);
    expect(ageOnBirthday("2000-02-29", "2026-02-28")).toBe(26);
  });

  it("devuelve null si no es su cumpleaños", () => {
    expect(ageOnBirthday("1994-09-17", "2026-09-18")).toBeNull();
    expect(ageOnBirthday(null, "2026-09-18")).toBeNull();
  });
});

describe("birthdayLabelOn", () => {
  it("arma la frase con la edad", () => {
    expect(birthdayLabelOn("1994-09-17", "2026-09-17")).toBe("Cumple 32 años");
    expect(birthdayLabelOn("2025-09-17", "2026-09-17")).toBe("Cumple 1 año");
  });

  it("null cuando no cumple", () => {
    expect(birthdayLabelOn("1994-09-17", "2026-09-18")).toBeNull();
  });
});
