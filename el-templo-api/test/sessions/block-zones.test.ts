/**
 * Unit puro de los grupos de zona y las zonas por bloque (fase 197, D-10).
 * Sin DB: son funciones puras de `tv/muscle-zones.ts`.
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
  zonasDelBloque,
  zonasDelGrupo,
  ejerciciosPorGrupo,
} from "../../src/modules/tv/muscle-zones";
import type { TvZonaMuscular } from "../../src/modules/tv/types";

/** Ejercicio con solo categoria principal (sin secundaria ni ruta). */
function porCategoria(category: string | null) {
  return { category, categorySecondary: null, route: null };
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

  it("la composicion de cada grupo es la de D-10", () => {
    expect(GRUPOS_ZONA.hombros).toEqual(["deltoids"]);
    expect(GRUPOS_ZONA.pecho).toEqual(["chest"]);
    expect([...GRUPOS_ZONA.espalda].sort()).toEqual(
      ["lower-back", "trapezius", "upper-back"].sort(),
    );
    expect([...GRUPOS_ZONA.core].sort()).toEqual(["abs", "obliques"]);
    expect([...GRUPOS_ZONA.piernas].sort()).toEqual(
      ["adductors", "calves", "gluteal", "hamstring", "quadriceps"].sort(),
    );
    expect([...GRUPOS_ZONA.brazos].sort()).toEqual(
      ["biceps", "forearm", "triceps"].sort(),
    );
  });
});

describe("grupoDeZona", () => {
  it("cubre las 15 zonas de ZONAS_ORDEN y cada una cae en exactamente un grupo", () => {
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
});

describe("gruposDeZonas", () => {
  it("gemelos -> piernas", () => {
    expect(gruposDeZonas(["calves"])).toEqual(["piernas"]);
  });

  it("sin repetidos y en el orden de GRUPOS_ORDEN, no el de entrada", () => {
    expect(gruposDeZonas(["trapezius", "deltoids"])).toEqual([
      "hombros",
      "espalda",
    ]);
    const zonas: TvZonaMuscular[] = ["quadriceps", "gluteal", "calves", "abs"];
    expect(gruposDeZonas(zonas)).toEqual(["core", "piernas"]);
  });

  it("vacio -> []", () => {
    expect(gruposDeZonas([])).toEqual([]);
  });
});

describe("zonasDelBloque", () => {
  it("es la UNION de las zonas de sus ejercicios (sin dominancia 0.4)", () => {
    const ejercicios = [
      porCategoria("PULL VERTICAL"),
      porCategoria("KNEE DOMINANT"),
    ];
    expect(zonasDelBloque(ejercicios, "NUCLEUS")).toEqual([
      "biceps",
      "forearm",
      "upper-back",
      "gluteal",
      "quadriceps",
      "adductors",
    ]);
  });

  it("conserva zonas que la dominancia de la TV descartaria", () => {
    // 5 ejercicios de piernas + 1 de tracción: la TV (umbral 0.4) descarta
    // dorsales/biceps, la canasta los conserva.
    const ejercicios = [
      ...Array.from({ length: 5 }, () => porCategoria("KNEE DOMINANT")),
      porCategoria("PULL VERTICAL"),
    ];
    expect(zonasDelGrupo(ejercicios, ["NUCLEUS"])).not.toContain("upper-back");
    expect(zonasDelBloque(ejercicios, "NUCLEUS")).toContain("upper-back");
  });

  it("ROM sin categorias cae al fallback por rol, en orden ZONAS_ORDEN", () => {
    const ejercicios = [porCategoria(null), porCategoria("MOVILIDAD")];
    expect(zonasDelBloque(ejercicios, "ROM_CORE")).toEqual([
      "lower-back",
      "abs",
      "obliques",
    ]);
  });

  it("el fallback ROM no pisa las zonas propias de los ejercicios", () => {
    expect(
      zonasDelBloque([porCategoria("CORE ANTERIOR")], "ROM_CORE"),
    ).toEqual(["abs", "obliques"]);
  });

  it("rol de trabajo sin categorias -> [] (sin fallback)", () => {
    expect(zonasDelBloque([porCategoria(null)], "NUCLEUS")).toEqual([]);
    expect(zonasDelBloque([], "NUCLEUS")).toEqual([]);
  });
});

describe("ejerciciosPorGrupo", () => {
  it("cuenta por grupo los ejercicios con al menos una zona del grupo", () => {
    const cuenta = ejerciciosPorGrupo(
      [
        porCategoria("PUSH HORIZONTAL"),
        porCategoria("PUSH VERTICAL"),
        porCategoria("KNEE DOMINANT"),
      ],
      "NUCLEUS",
    );
    expect(cuenta).toEqual({
      hombros: 2,
      brazos: 2,
      pecho: 1,
      espalda: 1,
      piernas: 1,
      core: 0,
    });
  });

  it("un ejercicio con varias zonas del mismo grupo cuenta una sola vez", () => {
    // CORE ANTERIOR -> abs + obliques (ambos en core).
    const cuenta = ejerciciosPorGrupo(
      [porCategoria("CORE ANTERIOR")],
      "NUCLEUS",
    );
    expect(cuenta.core).toBe(1);
  });

  it("ROM_LOWER sin categorias -> piernas 1 y el resto 0", () => {
    expect(ejerciciosPorGrupo([porCategoria(null)], "ROM_LOWER")).toEqual({
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
