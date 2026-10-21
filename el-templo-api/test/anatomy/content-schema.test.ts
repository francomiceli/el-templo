/**
 * Fase 200 (SC1, T-200-01/02): el contenido de anatomía es coherente y el
 * validador "muerde" (casos negativos). Sin DB: todo es contenido estático.
 *
 *   pnpm exec vitest run test/anatomy/content-schema.test.ts
 */
import { describe, it, expect } from "vitest";
import { BANDERAS } from "../../src/modules/anatomy/content/banderas";
import { CITAS, LEYENDA_MARCAS } from "../../src/modules/anatomy/content/citas";
import { REGIONES } from "../../src/modules/anatomy/content/regiones";
import { MUSCULOS } from "../../src/modules/anatomy/content/musculos";
import { GRUPOS_ALUMNO } from "../../src/modules/anatomy/content/grupos-alumno";
import {
  GLOSARIO_CONTRACCIONES,
  GLOSARIO_PRECISION,
  GLOSARIO_ROLES,
} from "../../src/modules/anatomy/content/glosario";
import {
  textoAlumnoProblemas,
  validarBanderas,
  validarCitas,
  validarContenido,
  validarGruposAlumno,
  validarMarcas,
  validarMusculos,
  validarRegiones,
} from "../../src/modules/anatomy/validate";
import { ROLES, esPendiente } from "../../src/modules/anatomy/types";
import type {
  BanderaDef,
  CitaDef,
  GrupoAlumnoDef,
  MusculoDef,
  RegionDef,
} from "../../src/modules/anatomy/types";

const REGIONES_DEF: readonly RegionDef[] = REGIONES;

/** Bandera válida de base para los casos negativos. */
function bandera(parcial: Partial<BanderaDef> = {}): BanderaDef {
  return {
    id: "b3",
    nivel: "derivar",
    senal: "Hormigueo que baja por el brazo.",
    accion: "Cortar y derivar.",
    rutas: ["FL", "PL"],
    notaInterna: null,
    fuente: "R2 §4 #4",
    umbralH: false,
    ...parcial,
  };
}

/** Cita válida de base para los casos negativos. */
function cita(parcial: Partial<CitaDef> = {}): CitaDef {
  return {
    id: 1,
    texto: "Autor A. Título. Revista 2020.",
    lectura: "leída: abstract",
    ...parcial,
  };
}

/** Músculo válido de base para los casos negativos. */
function musculo(parcial: Partial<MusculoDef> = {}): MusculoDef {
  return {
    id: "prueba",
    nombre: "Músculo de prueba",
    zona: { slug: "chest", vista: "front" },
    precision: "exacta",
    queHaceAlumno: "Estira el codo.",
    ...parcial,
  };
}

describe("contenido de anatomía — coherencia", () => {
  it("validarContenido() no devuelve errores", () => {
    const errores = validarContenido();
    expect(errores, errores.join("\n")).toEqual([]);
  });

  it("hay 16 regiones (15 de la TV + tibialis) y 28 músculos", () => {
    expect(REGIONES).toHaveLength(16);
    expect(REGIONES.filter((r) => r.enTv)).toHaveLength(15);
    expect(MUSCULOS).toHaveLength(28);
    expect(new Set(MUSCULOS.map((m) => m.id)).size).toBe(28);
  });

  it("solo serrato, manguito y psoas no tienen zona (los profundos, D10)", () => {
    const sinZona = MUSCULOS.filter((m) => m.zona === null)
      .map((m) => m.id)
      .sort();
    expect(sinZona).toEqual(["manguito", "psoas", "serrato"]);
    for (const m of MUSCULOS) {
      expect(m.precision === null, m.id).toBe(m.zona === null);
    }
  });

  it("el glosario tiene 5 roles en orden, 3 contracciones y 3 precisiones", () => {
    expect(GLOSARIO_ROLES.map((g) => g.rol)).toEqual([...ROLES]);
    expect(GLOSARIO_CONTRACCIONES.map((g) => g.clave)).toEqual(["C", "E", "I"]);
    expect(GLOSARIO_PRECISION.map((g) => g.clave)).toEqual([
      "exacta",
      "agrupada",
      "aproximada",
    ]);
  });

  it("los 3 grupos de alumno cubren los roles salvo antagonista (D14)", () => {
    expect(GRUPOS_ALUMNO.map((g) => g.id)).toEqual([
      "fuerte",
      "sostiene",
      "estira",
    ]);
    const roles = GRUPOS_ALUMNO.flatMap((g) => [...g.roles]);
    expect(roles).toEqual(["motor", "sinergista", "estabilizador", "estira"]);
    expect(roles).not.toContain("antagonista");
  });

  it("los textos de alumno de los 28 músculos no tienen jerga ni códigos", () => {
    for (const m of MUSCULOS) {
      expect(textoAlumnoProblemas(m.queHaceAlumno, m.id), m.id).toEqual([]);
    }
  });

  it("hay 34 banderas (a1-a7, b1-b21, c1-c6) y 114 citas (1..109 + L1..L5)", () => {
    expect(BANDERAS).toHaveLength(34);
    expect(BANDERAS.filter((b) => b.nivel === "urgencia")).toHaveLength(7);
    expect(BANDERAS.filter((b) => b.nivel === "derivar")).toHaveLength(21);
    expect(BANDERAS.filter((b) => b.nivel === "precaucion")).toHaveLength(6);
    expect(CITAS).toHaveLength(114);
    for (let i = 1; i <= 109; i++) {
      expect(
        CITAS.some((c) => c.id === i),
        `cita ${i}`,
      ).toBe(true);
    }
    for (const l of ["L1", "L2", "L3", "L4", "L5"]) {
      expect(
        CITAS.some((c) => c.id === l),
        l,
      ).toBe(true);
    }
  });

  it("la leyenda de marcas tiene C, M, R, H y N", () => {
    expect(Object.keys(LEYENDA_MARCAS).sort()).toEqual([
      "C",
      "H",
      "M",
      "N",
      "R",
    ]);
  });

  it("las banderas transversales aplican a todas las rutas y b17 no tiene rutas", () => {
    for (const id of [
      "a2",
      "a6",
      "b1",
      "b2",
      "b3",
      "b4",
      "b5",
      "b6",
      "b7",
      "b8",
      "c6",
    ]) {
      expect(BANDERAS.find((b) => b.id === id)?.rutas, id).toBe("todas");
    }
    expect(BANDERAS.find((b) => b.id === "b17")?.rutas).toEqual([]);
  });

  it("esPendiente distingue una sección pendiente de contenido", () => {
    expect(esPendiente({ pendiente: "falta", quien: "H" })).toBe(true);
    expect(esPendiente({ pendiente: "falta", quien: "otro" })).toBe(false);
    expect(esPendiente({ t: "texto", c: [] })).toBe(false);
    expect(esPendiente(null)).toBe(false);
    expect(esPendiente("pendiente")).toBe(false);
  });
});

describe("validador — casos negativos (el validador muerde)", () => {
  it("el músculo base es válido", () => {
    expect(validarMusculos([musculo()], REGIONES_DEF)).toEqual([]);
  });

  it("zona inexistente (pecho en vez de chest)", () => {
    const errores = validarMusculos(
      [musculo({ zona: { slug: "pecho", vista: "front" } })],
      REGIONES_DEF,
    );
    expect(errores.length).toBeGreaterThanOrEqual(1);
    expect(errores.join("\n")).toContain("pecho");
  });

  it("vista back sobre una región solo front (chest)", () => {
    const errores = validarMusculos(
      [musculo({ zona: { slug: "chest", vista: "back" } })],
      REGIONES_DEF,
    );
    expect(errores.length).toBeGreaterThanOrEqual(1);
    expect(errores.join("\n")).toContain("no compatible");
  });

  it("vista front sobre una región solo back (gluteal)", () => {
    const errores = validarMusculos(
      [musculo({ zona: { slug: "gluteal", vista: "front" } })],
      REGIONES_DEF,
    );
    expect(errores.length).toBeGreaterThanOrEqual(1);
  });

  it("precisión sin zona y zona sin precisión", () => {
    expect(
      validarMusculos([musculo({ zona: null })], REGIONES_DEF).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      validarMusculos([musculo({ precision: null })], REGIONES_DEF).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("id duplicado y id fuera de kebab-case", () => {
    expect(
      validarMusculos([musculo(), musculo()], REGIONES_DEF).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      validarMusculos([musculo({ id: "Gluteo_Mayor" })], REGIONES_DEF).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("texto de alumno con 'antagonista' (con o sin tildes y mayúsculas)", () => {
    expect(
      textoAlumnoProblemas("Es el Antagonista del dorsal.", "x").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      validarMusculos(
        [musculo({ queHaceAlumno: "Es antagonista del dorsal." })],
        REGIONES_DEF,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("texto de alumno con latín o rótulos clínicos", () => {
    expect(textoAlumnoProblemas("Latissimus dorsi", "x").length).toBe(1);
    expect(textoAlumnoProblemas("Posible rabdomiólisis", "x").length).toBe(1);
  });

  it("texto de alumno con un código de ruta (FL, PS, MN/RP)", () => {
    expect(
      textoAlumnoProblemas("Sirve para el FL completo.", "x").length,
    ).toBeGreaterThanOrEqual(1);
    expect(textoAlumnoProblemas("Mejora tu PS.", "x").length).toBe(1);
    expect(textoAlumnoProblemas("Probá MN/RP.", "x").length).toBe(1);
  });

  it("un texto de alumno limpio no da errores (ni la letra L suelta)", () => {
    expect(textoAlumnoProblemas("Estira el codo. L", "x")).toEqual([]);
    expect(textoAlumnoProblemas("Falla la fuerza.", "x")).toEqual([]);
  });

  it("región con grupo inválido, nombre vacío y slug repetido", () => {
    const base: RegionDef = {
      slug: "a",
      nombre: "A",
      vista: "front",
      grupo: "pecho",
      enTv: true,
    };
    expect(validarRegiones([base])).toEqual([]);
    const invalida = { ...base, grupo: "cabeza" } as unknown as RegionDef;
    expect(validarRegiones([invalida]).length).toBeGreaterThanOrEqual(1);
    expect(
      validarRegiones([{ ...base, nombre: " " }]).length,
    ).toBeGreaterThanOrEqual(1);
    expect(validarRegiones([base, base]).length).toBeGreaterThanOrEqual(1);
  });

  it("marcas: número fuera de rango, letra desconocida y repetidas", () => {
    expect(validarMarcas([4, "L1", "C", "R"], "x")).toEqual([]);
    expect(validarMarcas([0], "x").length).toBe(1);
    expect(validarMarcas([110], "x").length).toBe(1);
    expect(validarMarcas([1.5], "x").length).toBe(1);
    expect(
      validarMarcas(["Z" as unknown as "C"], "x").length,
    ).toBeGreaterThanOrEqual(1);
    expect(validarMarcas([4, 4], "x").length).toBe(1);
  });

  it("marca inválida en la nota de un músculo", () => {
    const errores = validarMusculos(
      [musculo({ nota: { t: "nota", c: [999] } })],
      REGIONES_DEF,
    );
    expect(errores.length).toBeGreaterThanOrEqual(1);
  });

  it("marca numérica que no existe en las citas (999)", () => {
    const errores = validarMarcas([999], "x");
    expect(errores.length).toBeGreaterThanOrEqual(1);
    expect(errores.join("\n")).toContain("999");
  });

  it("marcas que existen en las citas (1, 109, L5) son válidas", () => {
    expect(validarMarcas([1, 109, "L5"], "x")).toEqual([]);
  });

  it("citas: id duplicado, id fuera de rango y textos vacíos", () => {
    expect(validarCitas([cita()])).toEqual([]);
    expect(validarCitas([cita(), cita()]).length).toBeGreaterThanOrEqual(1);
    expect(validarCitas([cita({ id: 110 })]).length).toBeGreaterThanOrEqual(1);
    expect(validarCitas([cita({ texto: " " })]).length).toBe(1);
    expect(validarCitas([cita({ lectura: "" })]).length).toBe(1);
  });

  it("bandera base válida", () => {
    expect(validarBanderas([bandera()])).toEqual([]);
    expect(validarBanderas([bandera({ rutas: "todas" })])).toEqual([]);
  });

  it("bandera con una ruta fuera de las 30 (PLYO)", () => {
    const errores = validarBanderas([bandera({ rutas: ["FL", "PLYO"] })]);
    expect(errores.length).toBeGreaterThanOrEqual(1);
    expect(errores.join("\n")).toContain("PLYO");
  });

  it("bandera con rutas repetidas o lista vacía fuera de b17", () => {
    expect(
      validarBanderas([bandera({ rutas: ["FL", "FL"] })]).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      validarBanderas([bandera({ rutas: [] })]).length,
    ).toBeGreaterThanOrEqual(1);
    expect(validarBanderas([bandera({ id: "b17", rutas: [] })])).toEqual([]);
  });

  it("bandera con un rótulo clínico en la señal o en la acción", () => {
    const enSenal = validarBanderas([
      bandera({ senal: "Dolor en la zona del escafoides." }),
    ]);
    expect(enSenal.length).toBeGreaterThanOrEqual(1);
    expect(enSenal.join("\n")).toContain("escafoides");
    expect(
      validarBanderas([bandera({ accion: "Hacer la maniobra de Slump." })])
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      validarBanderas([bandera({ senal: "Posible Rabdomiólisis." })]).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("el rótulo clínico sí puede ir en notaInterna", () => {
    expect(
      validarBanderas([bandera({ notaInterna: "Zona del escafoides." })]),
    ).toEqual([]);
  });

  it("bandera con nivel incoherente con su letra (b3 como urgencia)", () => {
    const errores = validarBanderas([bandera({ nivel: "urgencia" })]);
    expect(errores.length).toBeGreaterThanOrEqual(1);
    expect(errores.join("\n")).toContain("nivel");
    expect(
      validarBanderas([bandera({ id: "a1", nivel: "derivar" })]).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      validarBanderas([bandera({ id: "c1", nivel: "derivar" })]).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("bandera con id mal formado, duplicada o con textos vacíos", () => {
    expect(
      validarBanderas([bandera({ id: "z9" })]).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      validarBanderas([bandera(), bandera()]).length,
    ).toBeGreaterThanOrEqual(1);
    expect(validarBanderas([bandera({ senal: " " })]).length).toBe(1);
    expect(validarBanderas([bandera({ accion: "" })]).length).toBe(1);
    expect(validarBanderas([bandera({ fuente: "" })]).length).toBe(1);
  });

  it("grupos de alumno: uno que incluye antagonista o falta un rol", () => {
    const [fuerte, sostiene, estira] = GRUPOS_ALUMNO;
    const conAntagonista: GrupoAlumnoDef[] = [
      fuerte,
      sostiene,
      { ...estira, roles: ["estira", "antagonista"] },
    ];
    expect(validarGruposAlumno(conAntagonista).length).toBeGreaterThanOrEqual(
      1,
    );
    const sinEstira: GrupoAlumnoDef[] = [fuerte, sostiene];
    expect(validarGruposAlumno(sinEstira).length).toBeGreaterThanOrEqual(1);
  });
});
