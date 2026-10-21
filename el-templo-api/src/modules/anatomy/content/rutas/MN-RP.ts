import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de MN/RP desde S3.3 (tabla articular) + S8. Borrador
 * (D5).
 *
 * Corrección R2-3 (Pitfall 3): L-sit / V-sit llevan flexores de cadera
 * (psoas, recto femoral, aductores) y recto abdominal; el reverse planche
 * (apoyo libre, boca arriba) lo sostienen abdomen y flexores de cadera, y
 * glúteo y erectores solo co-contraen. ⚑H: confirmar que el reverse planche del
 * catálogo sea el apoyo libre.
 */
export const MN_RP = {
  code: "MN/RP",
  slug: "manna",
  patron: "PULL",
  categoria: "Pull horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "trap-inf", c: ["L1", "R"] },
      { m: "romboides", c: ["L1", "R"], nota: "Trapecio medio" },
      { m: "serrato", c: ["L1", "R"], nota: "Fibras inferiores" },
      { m: "dorsal", c: ["L1", "R"] },
      { m: "redondo", c: ["L1"] },
      { m: "delt-post", c: ["L1"] },
      {
        m: "triceps",
        c: ["L1"],
        nota: "Cabeza larga; en el codo, isométrico",
      },
      { m: "psoas", c: ["L1", "R"], nota: "L-sit y V-sit; reverse planche" },
      {
        m: "recto-fem",
        c: ["L1", "R"],
        nota: "L-sit y V-sit; reverse planche",
      },
      { m: "aductores", c: ["L1", "R"], nota: "L-sit y V-sit" },
      {
        m: "recto-abd",
        c: ["L1", "R"],
        nota: "L-sit y V-sit; reverse planche",
      },
      { m: "oblicuos", c: ["L1", "R"], nota: "Reverse planche" },
    ],
    sinergista: [
      {
        m: "pectoral",
        c: ["L1"],
        nota: "Esternal; se estira en el rango final",
      },
    ],
    estabilizador: [
      { m: "biceps", c: ["L1"], nota: "Cabeza larga, tensión anterior" },
      { m: "braquial", c: ["L1"] },
      { m: "antebrazo", c: ["L1"], nota: "Muñeca en extensión alta" },
      {
        m: "gluteo-mayor",
        c: ["L1", "R"],
        nota: "Co-contracción postural en el reverse planche, no sostiene",
      },
      {
        m: "erectores",
        c: ["L1", "R"],
        nota: "Co-contracción postural en el reverse planche, no sostiene",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
