/**
 * Unit: marca y motivo de una fila del export de domiciliación (mig 0362).
 * Los bordes de mes se prueban acá con `currentMonth` fijo — el test de
 * integración usa meses lejanos (2020 / 2099) para no depender del reloj.
 */
import { describe, it, expect } from "vitest";
import {
  sepaExportFlags,
  sepaStopFromMonth,
} from "../../src/modules/members/service";

const COMPLETO = { iban: "ES9121000418450200051332", debtorName: "Titular" };

describe("sepaExportFlags", () => {
  it("datos completos y sin baja → sin rojo ni observación", () => {
    expect(
      sepaExportFlags({
        ...COMPLETO,
        stopFromMonth: null,
        currentMonth: "2026-11",
      }),
    ).toEqual({ observacion: "", enRojo: false });
  });

  it("baja desde el mes en curso → rojo (el borde cuenta como llegado)", () => {
    expect(
      sepaExportFlags({
        ...COMPLETO,
        stopFromMonth: "2026-12",
        currentMonth: "2026-12",
      }),
    ).toEqual({
      observacion: "No domiciliar desde diciembre 2026",
      enRojo: true,
    });
  });

  it("baja desde un mes pasado → rojo", () => {
    expect(
      sepaExportFlags({
        ...COMPLETO,
        stopFromMonth: "2026-12",
        currentMonth: "2027-01",
      }),
    ).toEqual({
      observacion: "No domiciliar desde diciembre 2026",
      enRojo: true,
    });
  });

  it("baja desde el mes siguiente → sin rojo, pero avisa", () => {
    expect(
      sepaExportFlags({
        ...COMPLETO,
        stopFromMonth: "2026-12",
        currentMonth: "2026-11",
      }),
    ).toEqual({
      observacion: "Deja de domiciliarse desde diciembre 2026",
      enRojo: false,
    });
  });

  it("cruce de año: baja desde enero con diciembre en curso → todavía no", () => {
    expect(
      sepaExportFlags({
        ...COMPLETO,
        stopFromMonth: "2027-01",
        currentMonth: "2026-12",
      }).enRojo,
    ).toBe(false);
  });

  it.each([
    [{ iban: null, debtorName: "Titular" }, "Falta IBAN"],
    [{ iban: "ES9121000418450200051332", debtorName: null }, "Falta titular"],
    [{ iban: "", debtorName: "" }, "Falta IBAN y titular"],
  ])("faltantes %j → rojo con '%s'", (datos, motivo) => {
    expect(
      sepaExportFlags({
        ...datos,
        stopFromMonth: null,
        currentMonth: "2026-11",
      }),
    ).toEqual({ observacion: motivo, enRojo: true });
  });

  it("faltante + baja futura → rojo por el faltante, con los dos motivos", () => {
    expect(
      sepaExportFlags({
        iban: null,
        debtorName: "Titular",
        stopFromMonth: "2026-12",
        currentMonth: "2026-11",
      }),
    ).toEqual({
      observacion: "Falta IBAN · Deja de domiciliarse desde diciembre 2026",
      enRojo: true,
    });
  });
});

describe("sepaStopFromMonth", () => {
  it("DATE guardado → mes", () => {
    expect(sepaStopFromMonth("2026-12-01")).toBe("2026-12");
  });
  it("null → null", () => {
    expect(sepaStopFromMonth(null)).toBeNull();
  });
});
