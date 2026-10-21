/**
 * Fase 200 (D17, D18, SC5): hits de "Hoy en tu clase" por zona. Sin DB; el
 * cálculo vive en el server porque CI no corre tests del app.
 *
 *   pnpm exec vitest run test/anatomy/zone-hits.test.ts
 */
import { describe, it, expect } from "vitest";
import { MUSCULOS } from "../../src/modules/anatomy/content/musculos";
import { RUTAS } from "../../src/modules/anatomy/content/rutas";
import {
  ZONAS_ORDEN,
  zonasDeEjercicio,
  zonasDelBloque,
} from "../../src/modules/anatomy/projection";
import {
  rutasDistintas,
  zoneHitsDelBloque,
  zoneHitsDeRutas,
} from "../../src/modules/anatomy/zone-hits";
import type { HitsZona } from "../../src/modules/anatomy/zone-hits";

/** Todos los ids de músculo que aparecen en los hits de un resultado. */
function idsDe(hits: Partial<Record<string, HitsZona>>): string[] {
  return Object.values(hits).flatMap((h) =>
    h ? [...h.fuerte, ...h.sostiene, ...h.estira] : [],
  );
}

const IDS_MUSCULOS = MUSCULOS.map((m) => m.id as string);

describe("zoneHitsDeRutas", () => {
  it("OAP: el dorsal es fuerte en espalda alta", () => {
    const hits = zoneHitsDeRutas(["OAP"]);
    expect(hits["upper-back"]?.fuerte).toContain("dorsal");
  });

  it("FL: el antagonista (erectores, trapecio superior) no aparece en ningún grupo", () => {
    const ids = idsDe(zoneHitsDeRutas(["FL"]));
    expect(ids).not.toContain("erectores");
    expect(ids).not.toContain("trap-sup");
    expect(zoneHitsDeRutas(["FL"])["lower-back"]).toBeUndefined();
  });

  it("los músculos sin zona (psoas, serrato, manguito) nunca aparecen", () => {
    const ids = idsDe(zoneHitsDeRutas(RUTAS.map((r) => r.code)));
    expect(ids).not.toContain("psoas");
    expect(ids).not.toContain("serrato");
    expect(ids).not.toContain("manguito");
  });

  it("sin rutas da {}", () => {
    expect(zoneHitsDeRutas([])).toEqual({});
  });

  it("un código inexistente se ignora", () => {
    expect(zoneHitsDeRutas(["NO EXISTE"])).toEqual({});
    expect(zoneHitsDeRutas(["NO EXISTE", "FL"])).toEqual(
      zoneHitsDeRutas(["FL"]),
    );
  });

  it("normaliza el código", () => {
    expect(zoneHitsDeRutas(["  fl "])).toEqual(zoneHitsDeRutas(["FL"]));
  });

  it("dos rutas se unen sin repetir ids", () => {
    const juntas = zoneHitsDeRutas(["OAP", "FL"]);
    const dorsales = (juntas["upper-back"]?.fuerte ?? []).filter(
      (id) => id === "dorsal",
    );
    expect(dorsales).toHaveLength(1);
    expect(zoneHitsDeRutas(["OAP", "OAP"])).toEqual(zoneHitsDeRutas(["OAP"]));
    expect(juntas.chest).toBeDefined();
    expect(juntas.quadriceps).toBeDefined();
  });

  it("el estiramiento va a estira", () => {
    expect(zoneHitsDeRutas(["SPAGAT"]).hamstring?.estira).toContain("isquios");
    expect(zoneHitsDeRutas(["BRIDGE"])["upper-back"]?.estira).toContain(
      "dorsal",
    );
  });

  it("estabilizador va a sostiene y motor/sinergista a fuerte", () => {
    const ss = zoneHitsDeRutas(["SS"]);
    expect(ss.quadriceps?.fuerte).toContain("vastos");
    expect(ss.gluteal?.sostiene).toContain("gluteo-mayor");
    expect(ss.gluteal?.fuerte).not.toContain("gluteo-mayor");
  });

  it("ninguna zona queda con los tres grupos vacíos (30 rutas)", () => {
    for (const ruta of RUTAS) {
      const hits = zoneHitsDeRutas([ruta.code]);
      for (const [zona, h] of Object.entries(hits)) {
        const total =
          (h?.fuerte.length ?? 0) +
          (h?.sostiene.length ?? 0) +
          (h?.estira.length ?? 0);
        expect(total, `${ruta.code}/${zona}`).toBeGreaterThan(0);
        expect(h?.movilidad, `${ruta.code}/${zona}`).toBeUndefined();
        expect(h?.sinDetalle, `${ruta.code}/${zona}`).toBeUndefined();
      }
    }
  });

  it("zonas en el orden de ZONAS_ORDEN e ids en el orden de MUSCULOS", () => {
    const hits = zoneHitsDeRutas(RUTAS.map((r) => r.code));
    const zonas = Object.keys(hits);
    expect(zonas).toEqual(ZONAS_ORDEN.filter((z) => zonas.includes(z)));
    for (const h of Object.values(hits)) {
      for (const grupo of [h?.fuerte, h?.sostiene, h?.estira]) {
        const indices = (grupo ?? []).map((id) => IDS_MUSCULOS.indexOf(id));
        expect(indices).toEqual([...indices].sort((a, b) => a - b));
        expect(new Set(grupo).size).toBe(grupo?.length);
      }
    }
  });
});

describe("rutasDistintas", () => {
  it("deduplica, normaliza y descarta vacías y desconocidas", () => {
    expect(
      rutasDistintas([
        { route: " fl ", category: null },
        { route: "FL", category: null },
        { route: "", category: "PLYO" },
        { route: "XYZ", category: null },
        { route: "SS", category: null },
        { route: null, category: null },
        { route: undefined, category: null },
        { route: "side   pck", category: null },
      ]),
    ).toEqual(["FL", "SS", "SIDE PCK"]);
  });

  it("sin ejercicios da []", () => {
    expect(rutasDistintas([])).toEqual([]);
  });
});

describe("zoneHitsDelBloque", () => {
  it("con rutas es lo mismo que zoneHitsDeRutas de sus rutas distintas", () => {
    const ejercicios = [
      { route: "OAP", category: null },
      { route: "oap", category: null },
      { route: "SS", category: null },
    ];
    expect(zoneHitsDelBloque(ejercicios, "STRENGTH")).toEqual(
      zoneHitsDeRutas(["OAP", "SS"]),
    );
  });

  it("ROM sin ruta: las zonas del fallback, con movilidad y sin músculos", () => {
    const ejercicios = [{ route: "", category: null }];
    const hits = zoneHitsDelBloque(ejercicios, "ROM_LOWER");
    const esperado = zonasDelBloque(ejercicios, "ROM_LOWER");
    expect(esperado.length).toBeGreaterThan(0);
    expect(Object.keys(hits)).toEqual(esperado);
    for (const h of Object.values(hits)) {
      expect(h).toEqual({
        fuerte: [],
        sostiene: [],
        estira: [],
        movilidad: true,
      });
    }
  });

  it("ROM sin ejercicios también usa el fallback", () => {
    expect(Object.keys(zoneHitsDelBloque([], "ROM_CORE"))).toEqual(
      zonasDelBloque([], "ROM_CORE"),
    );
  });

  it("un bloque sin ruta y sin fallback (INITIUM) da {}", () => {
    expect(
      zoneHitsDelBloque([{ route: "", category: null }], "INITIUM"),
    ).toEqual({});
    expect(zoneHitsDelBloque([], "INITIUM")).toEqual({});
  });

  it("PLYO sin ruta en un bloque de trabajo: sus zonas con sinDetalle", () => {
    const plyo = { route: "", category: "PLYO" };
    const ejercicios = [plyo, { route: null, category: "POTENCIA" }];
    const hits = zoneHitsDelBloque(ejercicios, "MAIN");
    expect(Object.keys(hits)).toEqual(zonasDeEjercicio(plyo));
    for (const h of Object.values(hits)) {
      expect(h).toEqual({
        fuerte: [],
        sostiene: [],
        estira: [],
        sinDetalle: true,
      });
    }
  });

  it("CARDIO sin ruta no marca ninguna zona", () => {
    expect(
      zoneHitsDelBloque([{ route: "", category: "CARDIO" }], "MAIN"),
    ).toEqual({});
  });

  it("mezcla: las zonas que cubre la ruta conservan sus músculos y las de PLYO suman sinDetalle", () => {
    const ejercicios = [
      { route: "OAP", category: null },
      { route: "", category: "PLYO" },
    ];
    const hits = zoneHitsDelBloque(ejercicios, "MAIN");
    expect(hits["upper-back"]?.fuerte).toContain("dorsal");
    expect(hits["upper-back"]?.sinDetalle).toBeUndefined();
    expect(hits.calves).toEqual({
      fuerte: [],
      sostiene: [],
      estira: [],
      sinDetalle: true,
    });
    const pintadas = zonasDelBloque(ejercicios, "MAIN");
    for (const z of pintadas) expect(hits[z], z).toBeDefined();
  });

  it("toda zona que pinta el cuerpo tiene su entrada (chip y hoja coinciden)", () => {
    const casos: [{ route: string; category: string | null }[], string][] = [
      [[{ route: "FL", category: null }], "MAIN"],
      [[{ route: "", category: "KNEE DOMINANT" }], "MAIN"],
      [[], "ROM_UPPER"],
      [[{ route: "SPAGAT", category: null }], "ROM_LOWER"],
    ];
    for (const [ejercicios, role] of casos) {
      const hits = zoneHitsDelBloque(ejercicios, role);
      for (const z of zonasDelBloque(ejercicios, role)) {
        expect(hits[z], `${role}/${z}`).toBeDefined();
      }
    }
  });
});
