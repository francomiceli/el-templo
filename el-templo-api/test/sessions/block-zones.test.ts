/**
 * Unit puro de los grupos de zona y las zonas por bloque (fase 197, D-10).
 * Fase 200 D20: las zonas salen de las RUTAS del modelo de anatomía, no de la
 * categoría. Sin DB: son funciones puras de `anatomy/projection.ts`.
 *
 *   pnpm exec vitest run test/sessions/block-zones.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  ZONAS_ORDEN,
  GRUPOS_ORDEN,
  GRUPOS_ZONA,
  grupoDeZona,
  gruposDeZonas,
  zonasDeRuta,
  zonasDelBloque,
  zonasDelGrupo,
  ejerciciosPorGrupo,
} from "../../src/modules/anatomy/projection";
import type { ZonaSlug } from "../../src/modules/anatomy/content/regiones";

/** Ejercicio con ruta del modelo (la categoría no cuenta si la ruta existe). */
function porRuta(route: string) {
  return { route, category: null };
}

/** Ejercicio sin ruta: solo cuenta el fallback por categoría. */
function sinRuta(category: string | null) {
  return { route: null, category };
}

describe("GRUPOS_ORDEN / GRUPOS_ZONA (D-10)", () => {
  it("son 6 grupos en el orden de los chips", () => {
    expect(GRUPOS_ORDEN).toEqual([
      "hombros",
      "pecho",
      "espalda",
      "core",
      "piernas",
      "brazos",
    ]);
  });

  it("la union de los grupos es exactamente ZONAS_ORDEN, sin zonas repetidas", () => {
    const todas = GRUPOS_ORDEN.flatMap((g) => [...GRUPOS_ZONA[g]]);
    expect(todas).toHaveLength(ZONAS_ORDEN.length);
    expect(new Set(todas).size).toBe(ZONAS_ORDEN.length);
    expect([...todas].sort()).toEqual([...ZONAS_ORDEN].sort());
  });

  it("la composicion de cada grupo es la de D-10 (tibialis cae en piernas)", () => {
    expect(GRUPOS_ZONA.hombros).toEqual(["deltoids"]);
    expect(GRUPOS_ZONA.pecho).toEqual(["chest"]);
    expect([...GRUPOS_ZONA.espalda].sort()).toEqual(
      ["lower-back", "trapezius", "upper-back"].sort(),
    );
    expect([...GRUPOS_ZONA.core].sort()).toEqual(["abs", "obliques"]);
    expect([...GRUPOS_ZONA.piernas].sort()).toEqual(
      [
        "adductors",
        "calves",
        "gluteal",
        "hamstring",
        "quadriceps",
        "tibialis",
      ].sort(),
    );
    expect([...GRUPOS_ZONA.brazos].sort()).toEqual(
      ["biceps", "forearm", "triceps"].sort(),
    );
  });
});

describe("grupoDeZona", () => {
  it("cubre todas las zonas de ZONAS_ORDEN y cada una cae en exactamente un grupo", () => {
    for (const zona of ZONAS_ORDEN) {
      const grupos = GRUPOS_ORDEN.filter((g) => GRUPOS_ZONA[g].includes(zona));
      expect(grupos).toHaveLength(1);
      expect(grupoDeZona(zona)).toBe(grupos[0]);
    }
  });

  it("gemelos cae en piernas y trapecio en espalda", () => {
    expect(grupoDeZona("calves")).toBe("piernas");
    expect(grupoDeZona("trapezius")).toBe("espalda");
  });

  it("tibialis cae en piernas y no tira (Pitfall 2)", () => {
    expect(grupoDeZona("tibialis")).toBe("piernas");
  });
});

describe("gruposDeZonas", () => {
  it("gemelos -> piernas", () => {
    expect(gruposDeZonas(["calves"])).toEqual(["piernas"]);
  });

  it("tibialis -> piernas", () => {
    expect(gruposDeZonas(["tibialis"])).toEqual(["piernas"]);
  });

  it("sin repetidos y en el orden de GRUPOS_ORDEN, no el de entrada", () => {
    expect(gruposDeZonas(["trapezius", "deltoids"])).toEqual([
      "hombros",
      "espalda",
    ]);
    const zonas: ZonaSlug[] = ["quadriceps", "gluteal", "calves", "abs"];
    expect(gruposDeZonas(zonas)).toEqual(["core", "piernas"]);
  });

  it("vacio -> []", () => {
    expect(gruposDeZonas([])).toEqual([]);
  });
});

describe("zonasDelBloque", () => {
  it("es la UNION de las zonas de las rutas de sus ejercicios (sin dominancia 0.4)", () => {
    const esperado = ZONAS_ORDEN.filter(
      (z) => zonasDeRuta("OAP").includes(z) || zonasDeRuta("SS").includes(z),
    );
    expect(zonasDelBloque([porRuta("OAP"), porRuta("SS")], "NUCLEUS")).toEqual(
      esperado,
    );
  });

  it("SS aporta cuadriceps (invariante nombrada)", () => {
    expect(zonasDelBloque([porRuta("SS")], "NUCLEUS")).toContain("quadriceps");
  });

  it("conserva zonas que la dominancia de la TV descartaria", () => {
    // 5 ejercicios SS (cuadriceps) + 1 OAP (tracción): la TV (umbral 0.4)
    // descarta lo de OAP, la canasta lo conserva.
    const ejercicios = [
      ...Array.from({ length: 5 }, () => porRuta("SS")),
      porRuta("OAP"),
    ];
    expect(zonasDelGrupo(ejercicios, ["NUCLEUS"])).not.toContain("upper-back");
    expect(zonasDelBloque(ejercicios, "NUCLEUS")).toContain("upper-back");
  });

  it("un ejercicio sin ruta usa el fallback por categoria (PLYO)", () => {
    expect(zonasDelBloque([sinRuta("PLYO")], "NUCLEUS")).toEqual([
      "gluteal",
      "quadriceps",
      "calves",
    ]);
  });

  it("ROM sin rutas ni categorias cae al fallback por rol, en orden ZONAS_ORDEN", () => {
    const ejercicios = [sinRuta(null), sinRuta("MOVILIDAD")];
    expect(zonasDelBloque(ejercicios, "ROM_CORE")).toEqual([
      "lower-back",
      "abs",
      "obliques",
    ]);
  });

  it("el fallback ROM no pisa las zonas propias de los ejercicios", () => {
    expect(zonasDelBloque([porRuta("SS")], "ROM_CORE")).toEqual(
      zonasDeRuta("SS"),
    );
  });

  it("rol de trabajo sin rutas ni categorias -> [] (sin fallback)", () => {
    expect(zonasDelBloque([sinRuta(null)], "NUCLEUS")).toEqual([]);
    expect(zonasDelBloque([], "NUCLEUS")).toEqual([]);
  });
});

describe("ejerciciosPorGrupo", () => {
  it("cuenta por grupo los ejercicios con al menos una zona del grupo", () => {
    const cuenta = ejerciciosPorGrupo(
      [porRuta("OAP"), porRuta("SS"), porRuta("SS")],
      "NUCLEUS",
    );
    // OAP: pecho, brazos y espalda. SS: solo cuadriceps (piernas).
    expect(cuenta).toEqual({
      hombros: 0,
      pecho: 1,
      espalda: 1,
      core: 0,
      piernas: 2,
      brazos: 1,
    });
  });

  it("un ejercicio con varias zonas del mismo grupo cuenta una sola vez", () => {
    // OAP pinta trapecio y dorsal (ambos en espalda): cuenta 1.
    const cuenta = ejerciciosPorGrupo([porRuta("OAP")], "NUCLEUS");
    expect(cuenta.espalda).toBe(1);
  });

  it("ROM_LOWER sin rutas ni categorias -> piernas 1 y el resto 0", () => {
    expect(ejerciciosPorGrupo([sinRuta(null)], "ROM_LOWER")).toEqual({
      hombros: 0,
      pecho: 0,
      espalda: 0,
      core: 0,
      piernas: 1,
      brazos: 0,
    });
  });

  it("siempre trae los 6 grupos como clave, aun sin ejercicios", () => {
    const cuenta = ejerciciosPorGrupo([], "NUCLEUS");
    expect(Object.keys(cuenta).sort()).toEqual([...GRUPOS_ORDEN].sort());
    expect(Object.values(cuenta).every((n) => n === 0)).toBe(true);
  });
});
