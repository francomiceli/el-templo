import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de OAR desde S3.4 (tabla articular) + S8. Borrador
 * (D5). La tabla dice "glúteos" sin distinguir mayor y medio: se listan ambos
 * (el medio con la marca de S8, Est unilateral).
 */
export const OAR = {
  code: "OAR",
  slug: "remos",
  patron: "PULL",
  categoria: "Pull horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "romboides", c: ["L1"], nota: "Trapecio medio" },
      { m: "trap-inf", c: ["L1"] },
      { m: "dorsal", c: ["L1"] },
      { m: "redondo", c: ["L1"] },
      { m: "delt-post", c: ["L1"] },
      { m: "biceps", c: ["L1"] },
      { m: "braquial", c: ["L1"], nota: "Con el braquiorradial" },
    ],
    sinergista: [],
    estabilizador: [
      { m: "manguito", c: ["L1"] },
      { m: "oblicuos", c: ["L1"], nota: "Anti-rotación" },
      { m: "cuadrado", c: ["L1"], nota: "Anti-rotación" },
      { m: "erectores", c: ["L1"], nota: "Anti-rotación" },
      { m: "gluteo-mayor", c: [], nota: "Glúteos: posición estable" },
      {
        m: "gluteo-medio",
        c: ["L1"],
        nota: "Glúteos: posición estable (unilateral)",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
