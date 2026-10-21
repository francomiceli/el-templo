import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de OAP desde S2.3 (tabla articular) + S8. Borrador
 * (D5). No hay EMG de pull-up a una mano: se extrapola de pull-up bilateral
 * (citas 2 y 3) + anatomía L1, y esas son las marcas de las celdas sin marca
 * propia.
 */
export const OAP = {
  code: "OAP",
  slug: "dominadas",
  patron: "PULL",
  categoria: "Pull vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "dorsal",
        c: ["L1", 3],
        nota: "En pull-up bilateral 117 a 130 % MVIC",
      },
      { m: "trap-inf", c: ["L1"] },
      { m: "romboides", c: ["L1"] },
      { m: "redondo", c: [2, 3, "L1"] },
      { m: "pectoral", c: [2, 3, "L1"] },
      { m: "biceps", c: [2, 3], nota: "Más activo en chin-up que en pull-up" },
      { m: "braquial", c: [2], nota: "Con el braquiorradial" },
      { m: "antebrazo", c: [2, 3, "L1"], nota: "Agarre unilateral" },
    ],
    sinergista: [],
    estabilizador: [
      { m: "serrato", c: ["L1"] },
      { m: "manguito", c: [3], nota: "Infraespinoso 71 a 79 % MVIC" },
      { m: "oblicuos", c: ["L1"], nota: "Anti-rotación e inclinación lateral" },
      { m: "cuadrado", c: ["L1"], nota: "Anti-rotación e inclinación lateral" },
      {
        m: "erectores",
        c: ["L1"],
        nota: "Anti-rotación e inclinación lateral",
      },
      { m: "delt-post", c: ["L1"] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
