/**
 * Fase 200 (P3, D14, T-200-21/22): los serializadores recortan por audiencia.
 * Sin DB: todo es contenido estático.
 *
 *   pnpm exec vitest run test/anatomy/serializers.test.ts
 */
import { describe, it, expect } from "vitest";
import { BANDERAS } from "../../src/modules/anatomy/content/banderas";
import { MUSCULOS } from "../../src/modules/anatomy/content/musculos";
import { RUTAS_POR_CODIGO } from "../../src/modules/anatomy/content/rutas";
import {
  ejerciciosPorRutaDe,
  vistaAlumno,
  vistaProfe,
} from "../../src/modules/anatomy/serializers";
import { ROLES } from "../../src/modules/anatomy/types";
import type { Rol } from "../../src/modules/anatomy/types";
import { textoAlumnoProblemas } from "../../src/modules/anatomy/validate";
import { ROUTE_PROGRESSION_MAP } from "../../src/modules/exercises/route-progression-map";
import { getRouteLabel } from "../../src/modules/tv/route-labels";

const CLAVES_PROHIBIDAS_ALUMNO = new Set([
  "code",
  "antagonista",
  "banderas",
  "banderasRuta",
  "fichaProfe",
  "notaInterna",
  "relaciones",
  "c",
  "pendientes",
]);

const ROLES_NO_ANTAGONISTA: readonly Rol[] = ROLES.filter(
  (rol) => rol !== "antagonista",
);

/** Todas las claves de un árbol JSON, con su ruta (para mensajes). */
function clavesProfundas(obj: unknown, ruta = "$"): string[] {
  if (Array.isArray(obj)) {
    return obj.flatMap((x, i) => clavesProfundas(x, `${ruta}[${i}]`));
  }
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) => [
      `${ruta}.${k}`,
      ...clavesProfundas(v, `${ruta}.${k}`),
    ]);
  }
  return [];
}

/** Todos los strings de un árbol JSON, con su ruta. */
function stringsProfundos(
  obj: unknown,
  ruta = "$",
): { ruta: string; valor: string }[] {
  if (typeof obj === "string") return [{ ruta, valor: obj }];
  if (Array.isArray(obj)) {
    return obj.flatMap((x, i) => stringsProfundos(x, `${ruta}[${i}]`));
  }
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) =>
      stringsProfundos(v, `${ruta}.${k}`),
    );
  }
  return [];
}

function ultimaClave(rutaClave: string): string {
  return rutaClave.slice(rutaClave.lastIndexOf(".") + 1);
}

describe("vistaAlumno (D14, D15, T-200-21)", () => {
  const vista = vistaAlumno();

  it("trae 30 rutas, 28 musculos y 16 regiones", () => {
    expect(vista.rutas).toHaveLength(30);
    expect(vista.musculos).toHaveLength(28);
    expect(vista.regiones).toHaveLength(16);
    expect(vista.grupos.map((g) => g.id)).toEqual([
      "fuerte",
      "sostiene",
      "estira",
    ]);
  });

  it("ninguna clave prohibida en todo el arbol", () => {
    const prohibidas = clavesProfundas(vista).filter((k) =>
      CLAVES_PROHIBIDAS_ALUMNO.has(ultimaClave(k)),
    );
    expect(prohibidas).toEqual([]);
  });

  it("ningun string es un codigo de ruta", () => {
    const codigos = new Set(Object.keys(ROUTE_PROGRESSION_MAP));
    const hallados = stringsProfundos(vista).filter((s) =>
      codigos.has(s.valor),
    );
    expect(hallados).toEqual([]);
  });

  it("ningun string tiene los problemas de textoAlumnoProblemas", () => {
    const problemas = stringsProfundos(vista).flatMap((s) =>
      textoAlumnoProblemas(s.valor, s.ruta),
    );
    expect(problemas).toEqual([]);
  });

  it("dorsal: dominadas en fuerte y ningun slug de antagonista en los grupos", () => {
    const dorsal = vista.musculos.find((m) => m.id === "dorsal");
    expect(dorsal).toBeDefined();
    expect(dorsal?.grupos.fuerte).toContain("dominadas");

    // Para todo musculo: los slugs de los 3 grupos salen de roles NO antagonistas.
    for (const musculo of vista.musculos) {
      const antagonistas = new Set<string>();
      const permitidos = new Set<string>();
      for (const ruta of RUTAS_POR_CODIGO.values()) {
        if (ruta.relaciones.antagonista.some((r) => r.m === musculo.id)) {
          antagonistas.add(ruta.slug);
        }
        for (const rol of ROLES_NO_ANTAGONISTA) {
          if (ruta.relaciones[rol].some((r) => r.m === musculo.id)) {
            permitidos.add(ruta.slug);
          }
        }
      }
      const todos = [
        ...musculo.grupos.fuerte,
        ...musculo.grupos.sostiene,
        ...musculo.grupos.estira,
      ];
      for (const slug of todos) {
        // Un musculo es antagonista Y otra cosa en rutas distintas: el slug
        // solo es valido si en ESA ruta tiene un rol que no es antagonista.
        expect(permitidos.has(slug), `${musculo.id} -> ${slug}`).toBe(true);
      }
      for (const slug of antagonistas) {
        const ruta = [...RUTAS_POR_CODIGO.values()].find(
          (r) => r.slug === slug,
        );
        const rolEnRuta = ROLES.find((rol) =>
          ruta?.relaciones[rol].some((r) => r.m === musculo.id),
        );
        // Un musculo aparece UNA vez por ruta: si es antagonista ahi, no sale.
        expect(rolEnRuta).toBe("antagonista");
        expect(todos).not.toContain(slug);
      }
    }
  });

  it("las rutas llevan nombre de getRouteLabel y slug, y fichaCorta null si no hay fichaAlumno", () => {
    for (const ruta of RUTAS_POR_CODIGO.values()) {
      const r = vista.rutas.find((x) => x.slug === ruta.slug);
      expect(r, ruta.code).toBeDefined();
      expect(r?.nombre).toBe(getRouteLabel(ruta.code));
      if (!ruta.fichaAlumno) expect(r?.fichaCorta).toBeNull();
    }
  });

  it("zonas de la ruta: fuerte gana sobre sostiene y no hay antagonista", () => {
    const fl = vista.rutas.find((r) => r.slug === "front-lever");
    expect(fl).toBeDefined();
    const upperBack = fl?.zonas.find((z) => z.slug === "upper-back");
    expect(upperBack?.grupo).toBe("fuerte");
    // En FL el erector es antagonista: lower-back no sale como zona del alumno
    // salvo que otro musculo (no antagonista) la comparta.
    const lowerBack = fl?.zonas.find((z) => z.slug === "lower-back");
    expect(lowerBack).toBeUndefined();
  });

  it("es memoizada y pura (misma referencia, mismo JSON)", () => {
    expect(vistaAlumno()).toBe(vista);
    expect(JSON.stringify(vistaAlumno())).toBe(JSON.stringify(vista));
  });
});

describe("vistaProfe (D8-D11, T-200-22)", () => {
  const vista = vistaProfe(new Map());

  it("trae 30 rutas, 28 musculos y 16 regiones, todo en borrador", () => {
    expect(vista.estado).toBe("borrador");
    expect(vista.rutas).toHaveLength(30);
    expect(vista.musculos).toHaveLength(28);
    expect(vista.regiones).toHaveLength(16);
    expect(vista.rutas.every((r) => r.estado === "borrador")).toBe(true);
  });

  it("notaInterna no sale en ninguna parte del arbol", () => {
    const hallazgos = clavesProfundas(vista).filter(
      (k) => ultimaClave(k) === "notaInterna",
    );
    expect(hallazgos).toEqual([]);
  });

  it("FL: escalones del mapa en sentence case", () => {
    const fl = vista.rutas.find((r) => r.code === "FL");
    expect(fl?.fichaProfe?.escalones).toEqual([
      "Tuck",
      "Adv tuck",
      "Super adv",
      "Straddle",
      "Half layout",
      "Full",
    ]);
  });

  it("banderas: catalogo global una vez cada una y las rutas llevan solo ids", () => {
    const catalogo = vista.banderas;
    expect(catalogo.length).toBeGreaterThan(0);
    const idsCatalogo = catalogo.map((b) => b.id);
    expect(new Set(idsCatalogo).size).toBe(idsCatalogo.length);
    // Cada bandera viaja con senal y accion, nunca con la nota interna.
    for (const b of catalogo) {
      expect(Object.keys(b).sort()).toEqual([
        "accion",
        "fuente",
        "id",
        "nivel",
        "senal",
        "umbralH",
      ]);
    }
    // Cada id de ruta existe en el catalogo; ninguna ruta embebe banderas.
    for (const r of vista.rutas) {
      for (const id of r.banderaIds) {
        expect(idsCatalogo, `${r.code} -> ${id}`).toContain(id);
      }
      expect(r).not.toHaveProperty("banderas");
      expect(r.fichaProfe ?? {}).not.toHaveProperty("banderas");
    }
  });

  it("banderas heredadas por id: FL incluye b9 y b21, PS no incluye b9", () => {
    const ids = (code: string) =>
      vista.rutas.find((r) => r.code === code)?.banderaIds ?? [];
    expect(ids("FL")).toEqual(expect.arrayContaining(["b9", "b21"]));
    expect(ids("PS")).not.toContain("b9");
  });

  it("las banderas de 'todas' llegan a todas las rutas", () => {
    const todas = BANDERAS.filter((b) => b.rutas === "todas").map((b) => b.id);
    expect(todas.length).toBeGreaterThan(0);
    for (const r of vista.rutas) {
      expect(r.banderaIds).toEqual(expect.arrayContaining(todas));
    }
  });

  it("zonasFicha de FL: upper-back motor y rol de mayor prioridad por zona", () => {
    const fl = vista.rutas.find((r) => r.code === "FL");
    const upper = fl?.zonasFicha.find((z) => z.slug === "upper-back");
    expect(upper?.rol).toBe("motor");

    // lower-back lo pinta el rol de MAYOR prioridad entre los musculos de FL
    // que comparten esa zona (el erector es antagonista en FL).
    const rutaFl = RUTAS_POR_CODIGO.get("FL");
    expect(rutaFl).toBeDefined();
    const enLower = ROLES.flatMap((rol) =>
      (rutaFl?.relaciones[rol] ?? [])
        .filter((rel) => {
          const def = MUSCULOS.find((m) => m.id === rel.m);
          return def?.zona?.slug === "lower-back";
        })
        .map(() => rol),
    );
    const lower = fl?.zonasFicha.find((z) => z.slug === "lower-back");
    expect(lower?.rol).toBe(enLower[0]);
    expect(enLower).toContain("antagonista");

    // Una entrada por (slug, vista).
    const claves = (fl?.zonasFicha ?? []).map((z) => `${z.slug}|${z.vista}`);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("sinDibujo de FL incluye psoas (zona null)", () => {
    const fl = vista.rutas.find((r) => r.code === "FL");
    expect(fl?.sinDibujo.map((s) => s.m)).toContain("psoas");
  });

  it("nombre de ruta = getRouteLabel (R3)", () => {
    const mnrp = vista.rutas.find((r) => r.code === "MN/RP");
    expect(mnrp?.nombre).toBe(getRouteLabel("MN/RP"));
    for (const r of vista.rutas) expect(r.nombre).toBe(getRouteLabel(r.code));
  });

  it("indice inverso: cada musculo lista las rutas por rol", () => {
    const dorsal = vista.musculos.find((m) => m.id === "dorsal");
    expect(dorsal?.roles.motor).toContain("FL");
    for (const musculo of vista.musculos) {
      expect(Object.keys(musculo.roles).sort()).toEqual([...ROLES].sort());
    }
  });

  it("regiones: una zona con varios musculos los lista (>1 = grupo)", () => {
    const upper = vista.regiones.find((r) => r.slug === "upper-back");
    expect(upper?.musculos).toEqual(
      expect.arrayContaining(["dorsal", "redondo", "romboides"]),
    );
  });

  it("los ejercicios del catalogo viajan en su ruta y nEjercicios cuenta", () => {
    const conEjercicios = vistaProfe(
      new Map([["FL", ["Tuck FL", "Adv tuck FL"]]]),
    );
    const fl = conEjercicios.rutas.find((r) => r.code === "FL");
    expect(fl?.ejercicios).toEqual(["Tuck FL", "Adv tuck FL"]);
    expect(fl?.nEjercicios).toBe(2);
    const ps = conEjercicios.rutas.find((r) => r.code === "PS");
    expect(ps?.ejercicios).toEqual([]);
    expect(ps?.nEjercicios).toBe(0);
  });

  it("las rutas sin ficha viajan con fichaProfe null (en preparacion)", () => {
    const sinFicha = vista.rutas.filter((r) => !r.fichaProfe);
    for (const r of sinFicha) {
      expect(RUTAS_POR_CODIGO.get(r.code)?.fichaProfe).toBeNull();
    }
  });
});

describe("ejerciciosPorRutaDe", () => {
  it("normaliza la ruta, ordena por dificultad, escalon (NULL al final) y nombre, sin repetir", () => {
    const mapa = ejerciciosPorRutaDe([
      {
        route: "fl ",
        exercise: " B ",
        dificultadLineal: 2,
        progressionStep: null,
      },
      {
        route: "FL",
        exercise: "A",
        dificultadLineal: 2,
        progressionStep: 1,
      },
      {
        route: "FL",
        exercise: "C",
        dificultadLineal: 1,
        progressionStep: 5,
      },
      {
        route: "FL",
        exercise: "A",
        dificultadLineal: 2,
        progressionStep: 1,
      },
      {
        route: "",
        exercise: "Suelto",
        dificultadLineal: 1,
        progressionStep: null,
      },
    ]);
    expect(mapa.get("FL")).toEqual(["C", "A", "B"]);
    expect(mapa.size).toBe(1);
  });
});
