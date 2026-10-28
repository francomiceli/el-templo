/**
 * Fase 200 (D20, P3, SC2, T15): la proyección del modelo a zonas. Sin DB.
 * Reescribe sobre rutas los casos que el mapeo anterior por categoría cubría
 * (los tests anteriores de la TV y de bloques) y suma las invariantes nombradas del §1.7.2.
 *
 *   pnpm exec vitest run test/anatomy/projection.test.ts
 */
import { describe, it, expect } from "vitest";
import { REGIONES } from "../../src/modules/anatomy/content/regiones";
import { RUTAS } from "../../src/modules/anatomy/content/rutas";
import {
  GRUPOS_ORDEN,
  GRUPOS_ZONA,
  ROM_ROLE_ZONAS,
  UMBRAL_DOMINANCIA,
  ZONAS_ORDEN,
  ZONAS_SIN_RUTA,
  ZONAS_TV,
  ejerciciosPorGrupo,
  grupoDeZona,
  gruposDeZonas,
  rutaSlugDe,
  soloTv,
  zonaInputDe,
  zonasDeEjercicio,
  zonasDeRuta,
  zonasDelBloque,
  zonasDelGrupo,
} from "../../src/modules/anatomy/projection";

/** Las 15 zonas de la TV, en el orden del contrato del poll (T20). */
const ZONAS_TV_POLL = [
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
];

/** Ordena según el dibujo, igual que la proyección. */
function enOrden(zonas: readonly string[]): string[] {
  return ZONAS_ORDEN.filter((z) => zonas.includes(z));
}

describe("zonasDeRuta", () => {
  it("SS pinta cuádriceps y no glúteo (§1.7.2: foco cuádriceps)", () => {
    const zonas = zonasDeRuta("SS");
    expect(zonas).toContain("quadriceps");
    expect(zonas).not.toContain("gluteal");
    expect(zonas).not.toContain("adductors");
  });

  it("NC pinta gemelos (§1.7.2: calf raises)", () => {
    expect(zonasDeRuta("NC")).toContain("calves");
  });

  it("QC pinta el tibial anterior (§1.7.2: tibiales pared)", () => {
    expect(zonasDeRuta("QC")).toContain("tibialis");
  });

  it("FL pinta espalda alta y el recto femoral sostiene (S3.1)", () => {
    const zonas = zonasDeRuta("FL");
    expect(zonas).toContain("upper-back");
    expect(zonas).toContain("quadriceps");
  });

  it("DS lleva cuádriceps y HR lleva oblicuos (R2)", () => {
    expect(zonasDeRuta("DS")).toContain("quadriceps");
    expect(zonasDeRuta("HR")).toContain("obliques");
  });

  it("BL y PL ya no pintan igual (S4.1)", () => {
    expect(zonasDeRuta("BL")).not.toEqual(zonasDeRuta("PL"));
  });

  it("T15: ninguna de las 30 rutas da una proyección vacía", () => {
    expect(RUTAS).toHaveLength(30);
    for (const ruta of RUTAS) {
      expect(zonasDeRuta(ruta.code).length, ruta.code).toBeGreaterThan(0);
    }
  });

  it("SPAGAT, PIKE y AF no quedan vacías por el fallback de movilidad", () => {
    expect(zonasDeRuta("SPAGAT")).toContain("hamstring");
    expect(zonasDeRuta("PIKE").length).toBeGreaterThan(0);
    expect(zonasDeRuta("AF").length).toBeGreaterThan(0);
  });

  it("toda salida va sin repetidas y en el orden de ZONAS_ORDEN", () => {
    for (const ruta of RUTAS) {
      const zonas = zonasDeRuta(ruta.code);
      expect(new Set(zonas).size, ruta.code).toBe(zonas.length);
      expect(zonas, ruta.code).toEqual(enOrden(zonas));
    }
  });

  it("normaliza el código y da [] si no está en el modelo", () => {
    expect(zonasDeRuta("  ss ")).toEqual(zonasDeRuta("SS"));
    expect(zonasDeRuta("NO EXISTE")).toEqual([]);
    expect(zonasDeRuta("")).toEqual([]);
    expect(zonasDeRuta("PLYO")).toEqual([]);
  });

  it("devuelve una copia: mutarla no cambia la siguiente llamada", () => {
    const primera = zonasDeRuta("SS");
    primera.push("chest");
    expect(zonasDeRuta("SS")).not.toContain("chest");
  });
});

describe("zonasDeEjercicio", () => {
  it("la ruta manda sobre la categoría", () => {
    expect(zonasDeEjercicio({ route: "SS", category: "PLYO" })).toEqual(
      zonasDeRuta("SS"),
    );
  });

  it("normaliza la ruta (espacios y mayúsculas)", () => {
    expect(zonasDeEjercicio({ route: "  ss ", category: null })).toEqual(
      zonasDeRuta("SS"),
    );
    expect(
      zonasDeEjercicio({ route: "side   pck", category: undefined }),
    ).toEqual(zonasDeRuta("SIDE PCK"));
  });

  it("sin ruta cae a ZONAS_SIN_RUTA por categoría (KNEE DOMINANT, PLYO)", () => {
    expect(zonasDeEjercicio({ route: "", category: "KNEE DOMINANT" })).toEqual([
      "gluteal",
      "quadriceps",
      "adductors",
    ]);
    expect(zonasDeEjercicio({ route: null, category: " plyo " })).toEqual([
      "gluteal",
      "quadriceps",
      "calves",
    ]);
    expect(zonasDeEjercicio({ route: "XYZ", category: "POTENCIA" })).toEqual([
      "gluteal",
      "quadriceps",
      "calves",
    ]);
  });

  it("da [] con todo null o con categorías sin dueño (CARDIO, COORDINATIVO)", () => {
    expect(zonasDeEjercicio({ route: null, category: null })).toEqual([]);
    expect(zonasDeEjercicio({ route: undefined, category: undefined })).toEqual(
      [],
    );
    expect(zonasDeEjercicio({ route: "", category: "CARDIO" })).toEqual([]);
    expect(zonasDeEjercicio({ route: "", category: "COORDINATIVO" })).toEqual(
      [],
    );
  });

  it("ZONAS_SIN_RUTA solo aporta PLYO, POTENCIA, LUNGE y KNEE DOMINANT", () => {
    expect(Object.keys(ZONAS_SIN_RUTA).sort()).toEqual([
      "KNEE DOMINANT",
      "LUNGE",
      "PLYO",
      "POTENCIA",
    ]);
  });
});

describe("zonaInputDe", () => {
  it("unifica los conversores de sesiones y bloques libres", () => {
    expect(zonaInputDe({ exerciseRoute: "FL", category: "PULL" })).toEqual({
      route: "FL",
      category: "PULL",
    });
    expect(zonaInputDe({})).toEqual({ route: undefined, category: undefined });
    expect(zonaInputDe({ exerciseRoute: null, category: null })).toEqual({
      route: null,
      category: null,
    });
  });
});

describe("rutaSlugDe", () => {
  it("da el slug de la ruta modelada, normalizando el código", () => {
    expect(rutaSlugDe({ exerciseRoute: "MU" })).toBe("muscle-up");
    expect(rutaSlugDe({ exerciseRoute: "  mu " })).toBe("muscle-up");
  });

  it("sin ruta o con una ruta fuera del modelo es null", () => {
    expect(rutaSlugDe({})).toBeNull();
    expect(rutaSlugDe({ exerciseRoute: null })).toBeNull();
    expect(rutaSlugDe({ exerciseRoute: "NO-EXISTE" })).toBeNull();
  });

  it("todas las rutas del modelo se encuentran por su código", () => {
    for (const ruta of RUTAS) {
      expect(rutaSlugDe({ exerciseRoute: ruta.code })).toBe(ruta.slug);
    }
  });
});

describe("zonasDelGrupo (dominancia)", () => {
  it("UMBRAL_DOMINANCIA es 0.4", () => {
    expect(UMBRAL_DOMINANCIA).toBe(0.4);
  });

  it("3 de OAP + 1 de SS: el ejercicio suelto queda fuera", () => {
    const oap = { route: "OAP", category: null };
    const ss = { route: "SS", category: null };
    expect(zonasDelGrupo([oap, oap, oap, ss])).toEqual(zonasDeRuta("OAP"));
  });

  it("en el borde exacto (2 de 5) la zona entra", () => {
    const oap = { route: "OAP", category: null };
    const ss = { route: "SS", category: null };
    const zonas = zonasDelGrupo([oap, oap, oap, oap, oap, ss, ss]);
    expect(zonas).toContain("quadriceps");
  });

  it("un grupo sin ejercicios ni roles ROM da []", () => {
    expect(zonasDelGrupo([])).toEqual([]);
    expect(zonasDelGrupo([], ["INITIUM"])).toEqual([]);
  });

  it("cae al fallback ROM si no queda ninguna zona", () => {
    expect(zonasDelGrupo([], ["ROM_CORE"])).toEqual(
      enOrden(ROM_ROLE_ZONAS["ROM_CORE"] ?? []),
    );
    expect(
      zonasDelGrupo([{ route: "", category: "CARDIO" }], ["ROM_UPPER"]),
    ).toEqual(enOrden(["deltoids", "chest", "upper-back"]));
  });

  it("no usa el fallback ROM si ya hay zonas", () => {
    const ss = { route: "SS", category: null };
    expect(zonasDelGrupo([ss], ["ROM_CORE"])).toEqual(zonasDeRuta("SS"));
  });
});

describe("zonasDelBloque (unión)", () => {
  it("une las zonas de todos los ejercicios, sin dominancia", () => {
    const oap = { route: "OAP", category: null };
    const ss = { route: "SS", category: null };
    expect(zonasDelBloque([oap, oap, oap, ss], "STRENGTH")).toEqual(
      enOrden([...zonasDeRuta("OAP"), ...zonasDeRuta("SS")]),
    );
  });

  it("cae al fallback ROM si la unión queda vacía", () => {
    expect(zonasDelBloque([], "ROM_LOWER")).toEqual(
      enOrden(ROM_ROLE_ZONAS["ROM_LOWER"] ?? []),
    );
    expect(
      zonasDelBloque([{ route: "", category: null }], "ROM_UPPER"),
    ).toEqual(enOrden(["deltoids", "chest", "upper-back"]));
  });

  it("sin zonas ni rol ROM da []", () => {
    expect(zonasDelBloque([], "INITIUM")).toEqual([]);
    expect(
      zonasDelBloque([{ route: "", category: "CARDIO" }], "NUCLEUS"),
    ).toEqual([]);
  });
});

describe("ejerciciosPorGrupo", () => {
  it("tiene siempre las 6 claves", () => {
    const cuenta = ejerciciosPorGrupo([], "INITIUM");
    expect(Object.keys(cuenta).sort()).toEqual([...GRUPOS_ORDEN].sort());
    for (const g of GRUPOS_ORDEN) expect(cuenta[g]).toBe(0);
  });

  it("cuenta ejercicios con al menos una zona del grupo", () => {
    const cuenta = ejerciciosPorGrupo(
      [
        { route: "SS", category: null },
        { route: "L", category: null },
        { route: "OAP", category: null },
      ],
      "STRENGTH",
    );
    expect(cuenta.piernas).toBe(2);
    expect(cuenta.espalda).toBe(1);
    expect(cuenta.brazos).toBe(1);
  });

  it("un bloque ROM sin zonas vale 1 en cada grupo del fallback", () => {
    const cuenta = ejerciciosPorGrupo([], "ROM_CORE");
    expect(cuenta.core).toBe(1);
    expect(cuenta.espalda).toBe(1);
    expect(cuenta.piernas).toBe(0);
  });
});

describe("grupos de zona", () => {
  it("tibialis cae en piernas y no tira (Pitfall 2, T-200-12)", () => {
    expect(grupoDeZona("tibialis")).toBe("piernas");
    expect(gruposDeZonas(["tibialis"])).toEqual(["piernas"]);
  });

  it("GRUPOS_ZONA cubre las 16 zonas una sola vez", () => {
    const todas = GRUPOS_ORDEN.flatMap((g) => [...GRUPOS_ZONA[g]]);
    expect(todas).toHaveLength(16);
    expect(new Set(todas).size).toBe(16);
    expect([...todas].sort()).toEqual([...ZONAS_ORDEN].sort());
  });

  it("GRUPOS_ZONA sale de REGIONES[].grupo", () => {
    for (const r of REGIONES) {
      expect(GRUPOS_ZONA[r.grupo], r.slug).toContain(r.slug);
      expect(grupoDeZona(r.slug), r.slug).toBe(r.grupo);
    }
  });

  it("grupoDeZona no tira con ninguna zona del dibujo", () => {
    for (const z of ZONAS_ORDEN) expect(grupoDeZona(z)).toBeDefined();
  });

  it("gruposDeZonas deduplica y respeta GRUPOS_ORDEN", () => {
    expect(gruposDeZonas(["calves", "chest", "quadriceps"])).toEqual([
      "pecho",
      "piernas",
    ]);
    expect(gruposDeZonas(new Set(["triceps", "deltoids"]))).toEqual([
      "hombros",
      "brazos",
    ]);
    expect(gruposDeZonas([])).toEqual([]);
  });

  it("GRUPOS_ORDEN son los 6 chips en su orden", () => {
    expect(GRUPOS_ORDEN).toEqual([
      "hombros",
      "pecho",
      "espalda",
      "core",
      "piernas",
      "brazos",
    ]);
  });
});

describe("filtro de la TV", () => {
  it("ZONAS_TV son las 15 del poll, en su orden", () => {
    expect(ZONAS_TV).toEqual(ZONAS_TV_POLL);
  });

  it("ZONAS_ORDEN suma tibialis al final (16)", () => {
    expect(ZONAS_ORDEN).toHaveLength(16);
    expect(ZONAS_ORDEN.slice(0, 15)).toEqual(ZONAS_TV_POLL);
    expect(ZONAS_ORDEN[15]).toBe("tibialis");
  });

  it("soloTv quita tibialis y conserva el orden", () => {
    expect(soloTv(["quadriceps", "tibialis"])).toEqual(["quadriceps"]);
    expect(soloTv(zonasDeRuta("QC"))).toEqual(["quadriceps"]);
    expect(soloTv(ZONAS_ORDEN)).toEqual(ZONAS_TV_POLL);
    expect(soloTv([])).toEqual([]);
  });
});
