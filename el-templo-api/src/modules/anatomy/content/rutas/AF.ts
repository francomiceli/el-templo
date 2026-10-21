import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de AF (Animal Flow) desde TI-D, D1 "Análisis por
 * posición" + TI-H. Borrador (D5).
 *
 * AF: sin análisis articular por ruta en la investigación; relaciones por
 * posición (D1). No se encontró ningún estudio de Animal Flow (TI-D): todo es
 * análisis por posición y por tarea con apoyos genéricos. Ruta heterogénea: el
 * rol más alto entre todas las posiciones gana y cada `nota` dice la posición.
 * Sin progresión lineal fija en el catálogo (D2). Cuando D1 y TI-H difieren
 * (glúteo mayor, cuádriceps, flexores de muñeca), manda D1 (R2). Fuera:
 * extensores de muñeca, transverso, deltoides medio y las articulaciones (sin id).
 */
export const AF = {
  code: "AF",
  slug: "animal-flow",
  patron: "FLOW",
  categoria: "Animal Flow",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "gluteo-mayor",
        c: [],
        nota: "Beast walk / bear walk al impulsar, crab (isométrico), ape, scorpion y frogger",
      },
      {
        m: "isquios",
        c: [],
        nota: "Beast walk / bear walk al impulsar y crab (isométrico)",
      },
      {
        m: "vastos",
        c: [],
        nota: "Ape / deep squat, frogger y cossack; en beast es estabilizador isométrico",
      },
      { m: "gemelo", c: [], nota: "Frogger / bunny hops / spider jump" },
      {
        m: "oblicuos",
        c: [],
        nota: "Scorpion (extensión y rotación) y wave unload / primate",
      },
      {
        m: "erectores",
        c: [],
        nota: "Scorpion y wave unload / primate (movilidad segmentaria)",
      },
      {
        m: "recto-abd",
        c: [],
        nota: "Wave unload / primate; en beast, crow y crab es estabilizador",
      },
      { m: "triceps", c: [], nota: "Crab: estabilizador / motor" },
      { m: "delt-post", c: [], nota: "Crab: estabilizador / motor" },
      { m: "trap-inf", c: [], nota: "Crab: estabilizador / motor" },
      {
        m: "romboides",
        c: [],
        nota: "Crab: trapecio medio, estabilizador / motor",
      },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "serrato",
        c: [101],
        nota: "Beast, crow y frogger: protracción en carga",
      },
      { m: "pectoral", c: [101], nota: "Beast: isométrico" },
      { m: "delt-ant", c: [101], nota: "Beast: isométrico" },
      {
        m: "gluteo-medio",
        c: [],
        nota: "Beast walk / bear walk y cossack: control frontal",
      },
      { m: "soleo", c: [], nota: "Ape / deep squat" },
      {
        m: "antebrazo",
        c: [],
        nota: "Crow: agarre con los flexores de muñeca y dedos, isométrico",
      },
    ],
    antagonista: [],
    estira: [
      {
        m: "aductores",
        c: [],
        nota: "Cossack walk, side kick y side monkey: alargados en excéntrico",
      },
    ],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
