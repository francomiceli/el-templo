import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de HD/ID desde S4.2 (tabla articular) + S8. Borrador
 * (D5). Siglas HD/ID abiertas para Nacho (⚑N, D1): la expansión no está en la
 * DB y se trata como "Fondos (Dips)".
 *
 * Evidencia directa: [8] (dip en banco, barra y anillas, n = 13). Celdas sin
 * marca propia: []. Filas "Est/M" y "Ant/Est": rol más alto (regla 6).
 */
export const HD_ID = {
  code: "HD/ID",
  slug: "fondos",
  patron: "PUSH",
  categoria: "Push horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "pectoral",
        c: ["L1"],
        nota: "Esternal; invierte su acción según el ángulo",
      },
      { m: "delt-ant", c: ["L1"] },
      { m: "dorsal", c: ["L1"], nota: "Control en el fondo" },
      {
        m: "triceps",
        c: [8],
        nota: "El estudio no dice qué cabeza; pico menor en banco que en barra y anillas",
      },
      {
        m: "trap-inf",
        c: ["L1"],
        nota: "Isométrico y concéntrico al bloquear",
      },
      { m: "serrato", c: ["L1"], nota: "Isométrico y concéntrico al bloquear" },
    ],
    sinergista: [],
    estabilizador: [
      { m: "manguito", c: ["L1"] },
      { m: "biceps", c: [8], nota: "Antagonista y estabilizador en el codo" },
      { m: "antebrazo", c: ["L1"], nota: "Flexores y extensores de muñeca" },
      { m: "recto-abd", c: [] },
      { m: "oblicuos", c: [] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
