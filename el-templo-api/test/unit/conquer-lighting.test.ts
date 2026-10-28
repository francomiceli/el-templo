/**
 * Fase 201 Plan 04: encendido del mapa muscular de Conquer (D-05, D-13).
 *
 * Regla: cada ejercicio con algun escalon E1-E3 mayor que 0 cuenta como las 3
 * series de la sesion. Una zona se enciende como principal con 2 o mas series
 * principales, y como secundaria con 4 o mas series secundarias (si no es
 * principal). El hold y el finisher no cuentan (ni entran al input).
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  CONQUER_ZONES,
  ZONE_LABELS,
  PRIMARY_MIN_SERIES,
  SECONDARY_MIN_SERIES,
  SERIES_PER_WORKED_EXERCISE,
  isConquerZone,
  exerciseWorked,
  lightZones,
} from "../../src/modules/conquer/lighting";

type Role = "principal" | "secundario";
const m = (zone: string, role: Role) => ({ zone, role });

describe("CONQUER_ZONES", () => {
  it("son las 15 zonas de la figura, en orden", () => {
    expect([...CONQUER_ZONES]).toEqual([
      "chest",
      "deltoids",
      "triceps",
      "biceps",
      "forearm",
      "trapezius",
      "upper-back",
      "lower-back",
      "abs",
      "obliques",
      "gluteal",
      "quadriceps",
      "hamstring",
      "adductors",
      "calves",
    ]);
  });

  it("todas tienen etiqueta en español", () => {
    for (const zone of CONQUER_ZONES) {
      expect(typeof ZONE_LABELS[zone]).toBe("string");
      expect(ZONE_LABELS[zone].length).toBeGreaterThan(0);
    }
    expect(Object.keys(ZONE_LABELS).sort()).toEqual([...CONQUER_ZONES].sort());
  });

  it.each([
    ["chest", true],
    ["upper-back", true],
    ["calves", true],
    ["tibialis", false], // la zona 16 de la 200 no entra en Conquer
    ["pecho", false],
    ["", false],
  ])("isConquerZone(%j) = %s", (slug, expected) => {
    expect(isConquerZone(slug)).toBe(expected);
  });
});

describe("umbrales de la regla (D-13)", () => {
  it("3 series por ejercicio trabajado, 2 principales, 4 secundarias", () => {
    expect(SERIES_PER_WORKED_EXERCISE).toBe(3);
    expect(PRIMARY_MIN_SERIES).toBe(2);
    expect(SECONDARY_MIN_SERIES).toBe(4);
  });
});

describe("exerciseWorked", () => {
  it.each([
    [{ e1: 0, e2: 0, e3: 0 }, false],
    [{ e1: 5, e2: 0, e3: 0 }, true],
    [{ e1: 0, e2: 6, e3: 0 }, true],
    [{ e1: 0, e2: 0, e3: 1 }, true],
    [{ e1: 8, e2: 8, e3: 8 }, true],
  ])("exerciseWorked(%j) = %s", (values, expected) => {
    expect(exerciseWorked(values)).toBe(expected);
  });
});

describe("lightZones", () => {
  it("un ejercicio trabajado enciende sus principales y NO sus secundarias", () => {
    const result = lightZones([
      {
        muscles: [m("chest", "principal"), m("triceps", "secundario")],
        worked: true,
      },
    ]);
    expect(result).toEqual({ primary: ["chest"], secondary: [] });
  });

  it("dos ejercicios con la misma secundaria la encienden", () => {
    const result = lightZones([
      {
        muscles: [m("chest", "principal"), m("triceps", "secundario")],
        worked: true,
      },
      {
        muscles: [m("deltoids", "principal"), m("triceps", "secundario")],
        worked: true,
      },
    ]);
    expect(result).toEqual({
      primary: ["chest", "deltoids"],
      secondary: ["triceps"],
    });
  });

  it("principal en un ejercicio y secundaria en otro -> solo principal", () => {
    const result = lightZones([
      { muscles: [m("biceps", "principal")], worked: true },
      { muscles: [m("biceps", "secundario")], worked: true },
      { muscles: [m("biceps", "secundario")], worked: true },
    ]);
    expect(result).toEqual({ primary: ["biceps"], secondary: [] });
  });

  it("un ejercicio no trabajado no suma", () => {
    const result = lightZones([
      { muscles: [m("chest", "principal")], worked: false },
      { muscles: [m("abs", "principal")], worked: true },
    ]);
    expect(result).toEqual({ primary: ["abs"], secondary: [] });
  });

  it("ningun ejercicio trabajado -> nada se enciende", () => {
    expect(
      lightZones([{ muscles: [m("chest", "principal")], worked: false }]),
    ).toEqual({ primary: [], secondary: [] });
    expect(lightZones([])).toEqual({ primary: [], secondary: [] });
  });

  it("una zona desconocida se ignora", () => {
    const result = lightZones([
      {
        muscles: [m("tibialis", "principal"), m("chest", "principal")],
        worked: true,
      },
    ]);
    expect(result).toEqual({ primary: ["chest"], secondary: [] });
  });

  it("la salida sigue el orden de CONQUER_ZONES, no el de entrada", () => {
    const result = lightZones([
      {
        muscles: [
          m("calves", "principal"),
          m("abs", "principal"),
          m("chest", "principal"),
        ],
        worked: true,
      },
    ]);
    expect(result.primary).toEqual(["chest", "abs", "calves"]);
  });

  it("una zona repetida con el mismo rol en un ejercicio cuenta una vez", () => {
    // 3 series de un solo ejercicio: 3 < 4, la secundaria no se enciende
    // aunque el catalogo la repita dos veces.
    const result = lightZones([
      {
        muscles: [m("forearm", "secundario"), m("forearm", "secundario")],
        worked: true,
      },
    ]);
    expect(result).toEqual({ primary: [], secondary: [] });
  });

  it("dos ejercicios, uno trabajado y otro no: la secundaria no llega a 4", () => {
    const result = lightZones([
      { muscles: [m("trapezius", "secundario")], worked: true },
      { muscles: [m("trapezius", "secundario")], worked: false },
    ]);
    expect(result).toEqual({ primary: [], secondary: [] });
  });

  it("una zona con ambos roles en el mismo ejercicio sale como principal", () => {
    const result = lightZones([
      {
        muscles: [m("obliques", "secundario"), m("obliques", "principal")],
        worked: true,
      },
    ]);
    expect(result).toEqual({ primary: ["obliques"], secondary: [] });
  });
});
