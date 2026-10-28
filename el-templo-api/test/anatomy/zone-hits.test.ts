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

  it("los profundos cuentan en la zona de la que cuelgan: manguito en hombros, serrato en pecho, psoas en abdomen", () => {
    const todas = zoneHitsDeRutas(RUTAS.map((r) => r.code));
    const ids = (zona: string): string[] => {
      const h = todas[zona as keyof typeof todas];
      return h ? [...h.fuerte, ...h.sostiene, ...h.estira] : [];
    };
    expect(ids("deltoids")).toContain("manguito");
    expect(ids("chest")).toContain("serrato");
    expect(ids("abs")).toContain("psoas");
    // Y en ninguna otra zona.
    for (const zona of ZONAS_ORDEN) {
      if (zona !== "deltoids") expect(ids(zona), zona).not.toContain("manguito");
      if (zona !== "chest") expect(ids(zona), zona).not.toContain("serrato");
      if (zona !== "abs") expect(ids(zona), zona).not.toContain("psoas");
    }
  });

  it("FL: el manguito sostiene en hombros, el serrato sostiene en pecho y el psoas es fuerte en abdomen (después del recto)", () => {
    const fl = zoneHitsDeRutas(["FL"]);
    expect(fl.deltoids).toEqual({
      fuerte: ["delt-post"],
      sostiene: ["manguito"],
      estira: [],
      rutas: [{ ruta: "FL", grupo: "fuerte" }],
    });
    expect(fl.chest).toEqual({
      fuerte: ["pectoral"],
      sostiene: ["serrato"],
      estira: [],
      rutas: [{ ruta: "FL", grupo: "fuerte" }],
    });
    expect(fl.abs).toEqual({
      fuerte: ["recto-abd", "psoas"],
      sostiene: [],
      estira: [],
      rutas: [{ ruta: "FL", grupo: "fuerte" }],
    });
  });

  it("OAP: el manguito deja a la ruta en 'sostiene' en hombros aunque no haya ningún músculo del dibujo más fuerte", () => {
    expect(zoneHitsDeRutas(["OAP"]).deltoids).toEqual({
      fuerte: [],
      sostiene: ["delt-post", "manguito"],
      estira: [],
      rutas: [{ ruta: "OAP", grupo: "sostiene" }],
    });
  });

  it("psoas estira (L, BRIDGE, SPAGAT) cuenta en abdomen como estira", () => {
    expect(zoneHitsDeRutas(["L"]).abs).toEqual({
      fuerte: [],
      sostiene: [],
      estira: ["psoas"],
      rutas: [{ ruta: "L", grupo: "estira" }],
    });
    expect(zoneHitsDeRutas(["BRIDGE"]).abs?.estira).toEqual([
      "recto-abd",
      "psoas",
    ]);
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

/** Grupo más fuerte (fuerte > sostiene > estira) de una ruta en una zona, calculado a mano desde el modelo. */
function grupoEsperado(
  codigo: string,
  zona: string,
): "fuerte" | "sostiene" | "estira" | null {
  const ruta = RUTAS.find((r) => r.code === codigo);
  if (!ruta) throw new Error(`Falta la ruta ${codigo}`);
  const zonaDe = new Map<string, string>(
    MUSCULOS.flatMap((m): [string, string][] => {
      const z = m.zona?.slug ?? ("debajoDe" in m ? m.debajoDe : undefined);
      return z ? [[m.id, z]] : [];
    }),
  );
  const grupos = new Set<string>();
  const porRol = [
    ["motor", "fuerte"],
    ["sinergista", "fuerte"],
    ["estabilizador", "sostiene"],
    ["estira", "estira"],
  ] as const;
  for (const [rol, grupo] of porRol) {
    if (ruta.relaciones[rol].some((rel) => zonaDe.get(rel.m) === zona)) {
      grupos.add(grupo);
    }
  }
  for (const g of ["fuerte", "sostiene", "estira"] as const) {
    if (grupos.has(g)) return g;
  }
  return null;
}

describe("zoneHitsDeRutas — rutas por zona", () => {
  it("una entrada por ruta que toca la zona, en el orden de entrada, con su grupo más fuerte", () => {
    const hits = zoneHitsDeRutas(["OAP", "FL", "HSPU"]);
    expect(hits.deltoids?.rutas).toEqual([
      { ruta: "OAP", grupo: "sostiene" },
      { ruta: "FL", grupo: "fuerte" },
      { ruta: "HSPU", grupo: "fuerte" },
    ]);
    // El orden de las rutas sigue al de entrada, no al alfabético ni al del modelo.
    expect(
      zoneHitsDeRutas(["HSPU", "FL", "OAP"]).deltoids?.rutas.map(
        (r) => r.ruta,
      ),
    ).toEqual(["HSPU", "FL", "OAP"]);
  });

  it("una ruta que no toca la zona no figura en ella", () => {
    const hits = zoneHitsDeRutas(["OAP", "FL", "HSPU"]);
    expect(hits.abs?.rutas).toEqual([
      { ruta: "FL", grupo: "fuerte" },
      { ruta: "HSPU", grupo: "sostiene" },
    ]);
  });

  it("gana el grupo más fuerte cuando la ruta tiene músculos de varios grupos en la zona", () => {
    // SPAGAT en abdomen: recto-abd sostiene + psoas estira -> sostiene.
    expect(zoneHitsDeRutas(["SPAGAT"]).abs).toEqual({
      fuerte: [],
      sostiene: ["recto-abd"],
      estira: ["psoas"],
      rutas: [{ ruta: "SPAGAT", grupo: "sostiene" }],
    });
    // BRIDGE en pecho: serrato fuerte + pectoral estira -> fuerte.
    expect(zoneHitsDeRutas(["BRIDGE"]).chest).toEqual({
      fuerte: ["serrato"],
      sostiene: [],
      estira: ["pectoral"],
      rutas: [{ ruta: "BRIDGE", grupo: "fuerte" }],
    });
  });

  it("repetir o normalizar un código no duplica la entrada", () => {
    const hits = zoneHitsDeRutas(["FL", " fl ", "FL", "OAP"]);
    expect(hits.chest?.rutas).toEqual([
      { ruta: "FL", grupo: "fuerte" },
      { ruta: "OAP", grupo: "fuerte" },
    ]);
  });

  it("un código desconocido no deja entrada", () => {
    expect(zoneHitsDeRutas(["NO EXISTE", "FL"]).chest?.rutas).toEqual([
      { ruta: "FL", grupo: "fuerte" },
    ]);
  });

  it("las 30 rutas: cada zona lista exactamente a la ruta con el grupo calculado desde el modelo (profundos incluidos)", () => {
    for (const ruta of RUTAS) {
      const hits = zoneHitsDeRutas([ruta.code]);
      for (const zona of ZONAS_ORDEN) {
        const esperado = grupoEsperado(ruta.code, zona);
        expect(hits[zona]?.rutas, `${ruta.code}/${zona}`).toEqual(
          esperado ? [{ ruta: ruta.code, grupo: esperado }] : undefined,
        );
      }
    }
  });

  it("el grupo de la ruta es coherente con los ids: nunca 'fuerte' sin ids fuertes, ni 'sostiene' sin sostiene/fuerte", () => {
    const hits = zoneHitsDeRutas(RUTAS.map((r) => r.code));
    for (const [zona, h] of Object.entries(hits)) {
      for (const r of h?.rutas ?? []) {
        if (r.grupo === "fuerte") {
          expect(h?.fuerte.length, `${zona}/${r.ruta}`).toBeGreaterThan(0);
        } else if (r.grupo === "sostiene") {
          expect(h?.sostiene.length, `${zona}/${r.ruta}`).toBeGreaterThan(0);
        } else {
          expect(h?.estira.length, `${zona}/${r.ruta}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("sin rutas no hay entradas", () => {
    expect(zoneHitsDeRutas([])).toEqual({});
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

  it("rutas del bloque: una entrada por ruta distinta (dedupe y normaliza), en orden de aparición", () => {
    const ejercicios = [
      { route: "FL", category: null },
      { route: " fl ", category: null },
      { route: "", category: null },
      { route: "OAP", category: null },
      { route: "FL", category: null },
    ];
    const hits = zoneHitsDelBloque(ejercicios, "MAIN");
    expect(hits.chest?.rutas).toEqual([
      { ruta: "FL", grupo: "fuerte" },
      { ruta: "OAP", grupo: "fuerte" },
    ]);
    expect(hits.deltoids?.rutas).toEqual([
      { ruta: "FL", grupo: "fuerte" },
      { ruta: "OAP", grupo: "sostiene" },
    ]);
  });

  it("un bloque sin rutas del modelo no trae entradas de ruta (movilidad/sinDetalle con rutas vacías)", () => {
    const rom = zoneHitsDelBloque([], "ROM_CORE");
    expect(Object.values(rom).length).toBeGreaterThan(0);
    for (const h of Object.values(rom)) expect(h.rutas).toEqual([]);
    const plyo = zoneHitsDelBloque([{ route: "", category: "PLYO" }], "MAIN");
    expect(Object.values(plyo).length).toBeGreaterThan(0);
    for (const h of Object.values(plyo)) expect(h.rutas).toEqual([]);
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
        rutas: [],
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
        rutas: [],
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
      rutas: [],
      sinDetalle: true,
    });
    expect(hits["upper-back"]?.rutas).toEqual([
      { ruta: "OAP", grupo: "fuerte" },
    ]);
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
