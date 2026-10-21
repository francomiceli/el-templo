import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de MU desde S2.2 (tabla articular) + S8. Borrador
 * (D5). La fila columna/cadera de la tabla (kipping y hollow) no asigna un rol
 * por músculo, así que no se vuelca en las relaciones (ver SUMMARY del plan
 * 03). Las celdas sin marca llevan la que declara S2.2 para el resto del
 * análisis: anatomía L1 + coaching L3.
 */
export const MU = {
  code: "MU",
  slug: "muscle-up",
  patron: "PULL",
  categoria: "Pull vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "trap-inf", c: ["L1"], nota: "Tirón" },
      { m: "romboides", c: ["L1"], nota: "Tirón; trapecio medio" },
      { m: "serrato", c: ["L1"], nota: "Transición y soporte" },
      { m: "dorsal", c: ["L1", "R"], nota: "Tirón" },
      { m: "redondo", c: ["L1", "R"], nota: "Tirón" },
      { m: "pectoral", c: ["L1", "R"], nota: "Esternal; tirón y empuje" },
      { m: "delt-post", c: ["L1", "R"], nota: "Tirón" },
      { m: "delt-ant", c: ["L1", "R"], nota: "Empuje" },
      { m: "triceps", c: ["L1", 2], nota: "Empuje" },
      { m: "biceps", c: ["L1", 2], nota: "Tirón" },
      { m: "braquial", c: ["L1", 2], nota: "Tirón; con el braquiorradial" },
      {
        m: "antebrazo",
        c: ["C"],
        nota: "Falso agarre: isométrico todo el elemento",
      },
    ],
    sinergista: [],
    estabilizador: [
      { m: "trap-sup", c: ["L1"] },
      { m: "manguito", c: ["L1", "R"] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
