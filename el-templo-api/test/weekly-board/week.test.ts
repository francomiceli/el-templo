/**
 * Unit tests (sin DB) del calendario del Tablero semanal (206-02).
 *
 * Son funciones puras: se prueban con fechas fijas y `now` inyectado, sin fake
 * timers, así que el resultado no depende del día en que corre CI.
 *
 * Semana de referencia: lunes 2026-11-02 (W). W-1 = 2026-10-26, W-2 = 2026-10-19.
 */
import { describe, it, expect } from "vitest";
import {
  BOARD_TZ,
  LATE_MARGIN_DAYS,
  currentWeekStart,
  weekRange,
  isMonday,
  lateFreezeDate,
  dueClosures,
  resolveBlockState,
  isCapturedLate,
  isLeadsEditableWeek,
  instantAtAr,
} from "../../src/modules/weekly-board/week";
import { currencyForCountry } from "../../src/modules/shared/currency";

const W = "2026-11-02";
const W1 = "2026-10-26";
const W2 = "2026-10-19";
const W3 = "2026-10-12";

describe("constantes", () => {
  it("la zona del tablero es Buenos Aires y el margen tardío es de 4 días", () => {
    expect(BOARD_TZ).toBe("America/Argentina/Buenos_Aires");
    expect(LATE_MARGIN_DAYS).toBe(4);
  });
});

describe("currentWeekStart", () => {
  it("el domingo 23:59 AR todavía es la semana que termina", () => {
    expect(currentWeekStart(new Date("2026-11-02T02:59:00Z"))).toBe(W1);
  });

  it("el lunes 00:05 AR ya es la semana nueva", () => {
    expect(currentWeekStart(new Date("2026-11-02T03:05:00Z"))).toBe(W);
  });

  it("un miércoles cualquiera devuelve el lunes de esa semana", () => {
    expect(currentWeekStart(new Date("2026-11-04T15:00:00Z"))).toBe(W);
  });
});

describe("weekRange", () => {
  it("devuelve lunes a domingo", () => {
    expect(weekRange(W)).toEqual({
      dateFrom: "2026-11-02",
      dateTo: "2026-11-08",
    });
  });

  it("cruza el fin de mes", () => {
    expect(weekRange("2026-10-26")).toEqual({
      dateFrom: "2026-10-26",
      dateTo: "2026-11-01",
    });
  });
});

describe("isMonday", () => {
  it("acepta solo lunes", () => {
    expect(isMonday("2026-11-02")).toBe(true);
    expect(isMonday("2026-11-03")).toBe(false);
    expect(isMonday("2026-11-08")).toBe(false);
  });

  it("rechaza formatos inválidos y fechas inexistentes", () => {
    expect(isMonday("")).toBe(false);
    expect(isMonday("02/11/2026")).toBe(false);
    expect(isMonday("2026-11-2")).toBe(false);
    expect(isMonday("2026-02-30")).toBe(false);
    expect(isMonday("no-es-fecha")).toBe(false);
  });
});

describe("lateFreezeDate", () => {
  it("es el viernes de la semana siguiente (primer día congelado)", () => {
    expect(lateFreezeDate(W1)).toBe("2026-11-06");
    expect(lateFreezeDate(W2)).toBe("2026-10-30");
  });
});

describe("dueClosures", () => {
  it.each([
    ["lunes", "2026-11-02"],
    ["martes", "2026-11-03"],
    ["miércoles", "2026-11-04"],
    ["jueves", "2026-11-05"],
  ])("%s (%s): principal W-1, tardío solo W-2", (_dia, hoy) => {
    expect(dueClosures(hoy)).toEqual({ main: [W1], late: [W2] });
  });

  it.each([
    ["viernes", "2026-11-06"],
    ["sábado", "2026-11-07"],
    ["domingo", "2026-11-08"],
  ])(
    "%s (%s): principal W-1, tardío W-2 y W-1 (más vieja primero)",
    (_dia, hoy) => {
      expect(dueClosures(hoy)).toEqual({ main: [W1], late: [W2, W1] });
    },
  );

  it("el lunes siguiente ya mira otra semana", () => {
    expect(dueClosures("2026-11-09")).toEqual({ main: [W], late: [W1] });
  });
});

describe("resolveBlockState", () => {
  const base = { currentWeekStart: W };

  it("con foto, cualquier semana pasada es congelado", () => {
    for (const block of ["main", "late"] as const) {
      for (const weekStart of [W1, W2, W3]) {
        expect(
          resolveBlockState({ ...base, block, weekStart, hasPhoto: true }),
        ).toBe("congelado");
      }
    }
  });

  it("la semana en curso es en_curso aunque no haya foto", () => {
    expect(
      resolveBlockState({
        ...base,
        block: "main",
        weekStart: W,
        hasPhoto: false,
      }),
    ).toBe("en_curso");
    expect(
      resolveBlockState({
        ...base,
        block: "late",
        weekStart: W,
        hasPhoto: false,
      }),
    ).toBe("en_curso");
  });

  it("bloque principal sin foto: W-1 provisorio, más viejo sin_foto", () => {
    expect(
      resolveBlockState({
        ...base,
        block: "main",
        weekStart: W1,
        hasPhoto: false,
      }),
    ).toBe("provisorio");
    expect(
      resolveBlockState({
        ...base,
        block: "main",
        weekStart: W2,
        hasPhoto: false,
      }),
    ).toBe("sin_foto");
  });

  it("bloque tardío sin foto: W-1 y W-2 provisorio, más viejo sin_foto", () => {
    expect(
      resolveBlockState({
        ...base,
        block: "late",
        weekStart: W1,
        hasPhoto: false,
      }),
    ).toBe("provisorio");
    expect(
      resolveBlockState({
        ...base,
        block: "late",
        weekStart: W2,
        hasPhoto: false,
      }),
    ).toBe("provisorio");
    expect(
      resolveBlockState({
        ...base,
        block: "late",
        weekStart: W3,
        hasPhoto: false,
      }),
    ).toBe("sin_foto");
  });

  it("una semana futura lanza RangeError", () => {
    expect(() =>
      resolveBlockState({
        ...base,
        block: "main",
        weekStart: "2026-11-09",
        hasPhoto: false,
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveBlockState({
        ...base,
        block: "late",
        weekStart: "2026-11-09",
        hasPhoto: true,
      }),
    ).toThrow(RangeError);
  });
});

describe("instantAtAr", () => {
  it("convierte hora de Argentina (UTC-3) a instante UTC", () => {
    expect(instantAtAr("2026-11-02", "00:05").toISOString()).toBe(
      "2026-11-02T03:05:00.000Z",
    );
    expect(instantAtAr("2026-11-01", "23:59").toISOString()).toBe(
      "2026-11-02T02:59:00.000Z",
    );
  });
});

describe("isCapturedLate", () => {
  it("principal: el lunes de W+1 es a tiempo, el miércoles es tarde", () => {
    expect(isCapturedLate("main", W1, instantAtAr("2026-11-02", "00:05"))).toBe(
      false,
    );
    expect(isCapturedLate("main", W1, instantAtAr("2026-11-04", "10:00"))).toBe(
      true,
    );
  });

  it("principal: el lunes a las 23:59 AR todavía es a tiempo", () => {
    expect(isCapturedLate("main", W1, instantAtAr("2026-11-02", "23:59"))).toBe(
      false,
    );
  });

  it("tardío: el viernes de W+1 es a tiempo, el sábado es tarde", () => {
    expect(isCapturedLate("late", W1, instantAtAr("2026-11-06", "00:05"))).toBe(
      false,
    );
    expect(isCapturedLate("late", W1, instantAtAr("2026-11-07", "00:05"))).toBe(
      true,
    );
  });
});

describe("isLeadsEditableWeek", () => {
  it("se editan la semana en curso y la anterior, nada más", () => {
    expect(isLeadsEditableWeek(W, W)).toBe(true);
    expect(isLeadsEditableWeek(W1, W)).toBe(true);
    expect(isLeadsEditableWeek(W2, W)).toBe(false);
    expect(isLeadsEditableWeek("2026-11-09", W)).toBe(false);
  });
});

describe("currencyForCountry", () => {
  it("ES es EUR y el resto cae en ARS", () => {
    expect(currencyForCountry("ES")).toBe("EUR");
    expect(currencyForCountry("AR")).toBe("ARS");
    expect(currencyForCountry("UY")).toBe("ARS");
  });
});
