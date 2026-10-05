/**
 * Unit puro del mapeo curado ejercicio -> zonas musculares (intro "el recorrido
 * de hoy"). Sin DB: `muscle-zones.ts` es una funcion pura sobre tres tablas.
 *
 *   pnpm exec vitest run test/tv/tv-muscle-zones.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  ZONAS_ORDEN,
  zonasDeEjercicio,
  zonasDelGrupo,
} from "../../src/modules/tv/muscle-zones";
import type { TvZonaMuscular } from "../../src/modules/tv/types";

/** Ejercicio con solo categoria principal. */
function porCategoria(category: string | null) {
  return { category, categorySecondary: null, route: null };
}

describe("ZONAS_ORDEN", () => {
  it("es el orden de declaracion de TvZonaMuscular (15 zonas, sin repetidas)", () => {
    expect(ZONAS_ORDEN).toEqual([
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
    expect(new Set(ZONAS_ORDEN).size).toBe(15);
  });
});

describe("zonasDeEjercicio — categoria principal", () => {
  // Tabla del contrato: categoria -> zonas, ya en el orden estable de ZONAS_ORDEN.
  const tabla: [string, TvZonaMuscular[]][] = [
    ["PULL VERTICAL", ["biceps", "forearm", "upper-back"]],
    ["PULL HORIZONTAL", ["deltoids", "biceps", "trapezius", "upper-back"]],
    ["PUSH HORIZONTAL", ["chest", "deltoids", "triceps"]],
    ["PUSH VERTICAL", ["deltoids", "triceps", "trapezius"]],
    ["HIP DOMINANT", ["lower-back", "gluteal", "hamstring"]],
    ["KNEE DOMINANT", ["gluteal", "quadriceps", "adductors"]],
    ["LUNGE", ["gluteal", "quadriceps", "adductors"]],
    ["CORE ANTERIOR", ["abs", "obliques"]],
    ["CORE", ["abs", "obliques"]],
    ["CORE LATERAL", ["abs", "obliques"]],
    ["OBLICUOS", ["abs", "obliques"]],
    ["CORE POSTERIOR", ["lower-back", "gluteal"]],
    ["BRIDGE", ["deltoids", "lower-back", "gluteal"]],
    ["SPAGAT", ["hamstring", "adductors"]],
    ["PLYO", ["gluteal", "quadriceps", "calves"]],
    ["POTENCIA", ["gluteal", "quadriceps", "calves"]],
    ["UPPER", ["chest", "deltoids", "upper-back"]],
  ];

  it.each(tabla)("%s -> %j", (category, esperado) => {
    expect(zonasDeEjercicio(porCategoria(category))).toEqual(esperado);
  });

  it.each([
    "CARDIO",
    "DESPLAZAMIENTO",
    "COORDINATIVO",
    "MOVILIDAD",
    "ESTABILIDAD",
    "",
    "   ",
    "categoria-que-no-existe",
    "pull", // valor de prueba de otros tests: no es una categoria del catalogo
  ])("categoria sin mapeo %j -> []", (category) => {
    expect(zonasDeEjercicio(porCategoria(category))).toEqual([]);
  });

  it("null/undefined en todo -> [] sin tirar", () => {
    expect(
      zonasDeEjercicio({
        category: null,
        categorySecondary: null,
        route: null,
      }),
    ).toEqual([]);
    expect(
      zonasDeEjercicio({
        category: undefined,
        categorySecondary: undefined,
        route: undefined,
      }),
    ).toEqual([]);
  });
});

describe("zonasDeEjercicio — normalizacion", () => {
  it("trim + mayusculas + espacios internos repetidos (el CSV trae espacios finales)", () => {
    const esperado = ["chest", "deltoids", "triceps"];
    expect(zonasDeEjercicio(porCategoria("PUSH HORIZONTAL "))).toEqual(
      esperado,
    );
    expect(zonasDeEjercicio(porCategoria("  push horizontal"))).toEqual(
      esperado,
    );
    expect(zonasDeEjercicio(porCategoria("Push   Horizontal"))).toEqual(
      esperado,
    );
  });

  it("la secundaria y la ruta tambien se normalizan", () => {
    expect(
      zonasDeEjercicio({
        category: null,
        categorySecondary: "  quads ",
        route: " ttb ",
      }),
    ).toEqual(["abs", "obliques", "quadriceps"]);
  });
});

describe("zonasDeEjercicio — categoria secundaria (se SUMA, match por 'contiene')", () => {
  const sec = (categorySecondary: string | null) => ({
    category: null,
    categorySecondary,
    route: null,
  });

  const tabla: [string, TvZonaMuscular[]][] = [
    ["STRAIGHT ARM", ["abs"]],
    ["QUADS", ["quadriceps"]],
    ["ISQUIOS", ["hamstring"]],
    ["GLUTES", ["gluteal"]],
    ["GLUTE", ["gluteal"]],
    ["ABS", ["abs"]],
    ["OBLICUOS", ["obliques"]],
    ["ESPINALES", ["lower-back"]],
    ["CORE ANTERIOR", ["abs"]],
    ["CORE POSTERIOR", ["lower-back"]],
    ["LOWER ANTERIOR", ["quadriceps"]],
    ["LOWER POSTERIOR", ["gluteal", "hamstring"]],
    ["PIKE", ["abs", "hamstring"]],
  ];

  it.each(tabla)("%s -> %j", (secundaria, esperado) => {
    expect(zonasDeEjercicio(sec(secundaria))).toEqual(esperado);
  });

  it("'contiene': texto libre con varias claves suma todas", () => {
    expect(zonasDeEjercicio(sec("STRAIGHT ARM / QUADS"))).toEqual([
      "abs",
      "quadriceps",
    ]);
  });

  it("clave desconocida o vacia no aporta nada", () => {
    expect(zonasDeEjercicio(sec("ALGO RARO"))).toEqual([]);
    expect(zonasDeEjercicio(sec(""))).toEqual([]);
    expect(zonasDeEjercicio(sec(null))).toEqual([]);
  });

  it("se SUMA a la categoria principal (no la reemplaza)", () => {
    expect(
      zonasDeEjercicio({
        category: "KNEE DOMINANT",
        categorySecondary: "ISQUIOS",
        route: null,
      }),
    ).toEqual(["gluteal", "quadriceps", "hamstring", "adductors"]);
  });
});

describe("zonasDeEjercicio — ruta del ejercicio (se SUMA, match exacto)", () => {
  const ruta = (route: string | null) => ({
    category: null,
    categorySecondary: null,
    route,
  });

  it("TTB -> abs, obliques", () => {
    expect(zonasDeEjercicio(ruta("TTB"))).toEqual(["abs", "obliques"]);
  });

  it("MN/RP -> triceps, abs", () => {
    expect(zonasDeEjercicio(ruta("MN/RP"))).toEqual(["triceps", "abs"]);
  });

  it("otras rutas (OAP, HSPU, ...) no aportan; es match exacto, no 'contiene'", () => {
    expect(zonasDeEjercicio(ruta("OAP"))).toEqual([]);
    expect(zonasDeEjercicio(ruta("HSPU"))).toEqual([]);
    expect(zonasDeEjercicio(ruta("TTB2"))).toEqual([]);
  });

  it("se SUMA a categoria y secundaria", () => {
    expect(
      zonasDeEjercicio({
        category: "PULL VERTICAL",
        categorySecondary: null,
        route: "TTB",
      }),
    ).toEqual(["biceps", "forearm", "upper-back", "abs", "obliques"]);
  });
});

describe("zonasDeEjercicio — dedupe y orden estable", () => {
  it("sin repetidas aunque tres fuentes aporten la misma zona", () => {
    const zonas = zonasDeEjercicio({
      category: "CORE ANTERIOR", // abs, obliques
      categorySecondary: "ABS / OBLICUOS", // abs, obliques
      route: "TTB", // abs, obliques
    });
    expect(zonas).toEqual(["abs", "obliques"]);
  });

  it("el orden es el de ZONAS_ORDEN, no el de aporte", () => {
    const zonas = zonasDeEjercicio({
      category: "LUNGE", // quadriceps, gluteal, adductors
      categorySecondary: "ABS", // abs
      route: "MN/RP", // abs, triceps
    });
    expect(zonas).toEqual([
      "triceps",
      "abs",
      "gluteal",
      "quadriceps",
      "adductors",
    ]);
    const indices = zonas.map((z) => ZONAS_ORDEN.indexOf(z));
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  it("es determinista: dos llamadas con el mismo input dan lo mismo", () => {
    const e = {
      category: "HIP DOMINANT",
      categorySecondary: "GLUTES",
      route: null,
    };
    expect(zonasDeEjercicio(e)).toEqual(zonasDeEjercicio(e));
  });
});

describe("zonasDelGrupo", () => {
  it("union de varios ejercicios, sin repetidas y en orden estable", () => {
    const zonas = zonasDelGrupo([
      { category: "PUSH HORIZONTAL", categorySecondary: null, route: null },
      { category: "PULL VERTICAL", categorySecondary: null, route: null },
      { category: "PUSH VERTICAL", categorySecondary: null, route: null },
    ]);
    expect(zonas).toEqual([
      "chest",
      "deltoids",
      "triceps",
      "biceps",
      "forearm",
      "trapezius",
      "upper-back",
    ]);
  });

  it("lista vacia y sin roles ROM -> []", () => {
    expect(zonasDelGrupo([])).toEqual([]);
    expect(zonasDelGrupo([], ["NUCLEUS"])).toEqual([]);
  });

  it("ejercicios sin mapeo y rol NO ROM -> [] (el grupo igual existe, sin pintar)", () => {
    expect(zonasDelGrupo([porCategoria("CARDIO")], ["EPIKOS"])).toEqual([]);
  });

  it.each([
    [
      "ROM_LOWER",
      ["gluteal", "quadriceps", "hamstring", "adductors", "calves"],
    ],
    ["ROM_CORE", ["lower-back", "abs", "obliques"]],
    ["ROM_UPPER", ["chest", "deltoids", "upper-back"]],
  ])("fallback ROM cuando la union queda vacia: %s", (role, esperado) => {
    expect(zonasDelGrupo([], [role])).toEqual(esperado);
    // Ejercicios que no aportan zonas tambien activan el fallback.
    expect(zonasDelGrupo([porCategoria("MOVILIDAD")], [role])).toEqual(
      esperado,
    );
  });

  it("el fallback ROM NO pisa zonas reales: si hay union, se usa solo esa", () => {
    expect(zonasDelGrupo([porCategoria("SPAGAT")], ["ROM_LOWER"])).toEqual([
      "hamstring",
      "adductors",
    ]);
  });
});
