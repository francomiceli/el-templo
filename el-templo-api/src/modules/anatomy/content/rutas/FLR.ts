import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de FLR desde S3.2 (tabla articular) + S8. Borrador
 * (D5). Misma palanca que FL (S3.1); la tabla de FLR no nombra flexores de
 * cadera, así que no se agregan (ver SUMMARY del plan 03).
 */
export const FLR = {
  code: "FLR",
  slug: "front-lever-row",
  patron: "PULL",
  categoria: "Pull horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "dorsal", c: ["L1"] },
      { m: "redondo", c: ["L1"] },
      { m: "delt-post", c: ["L1"] },
      { m: "triceps", c: ["L1"], nota: "Cabeza larga" },
      { m: "romboides", c: ["L1"], nota: "Trapecio medio" },
      { m: "trap-inf", c: ["L1"] },
      { m: "biceps", c: ["L1"] },
      { m: "braquial", c: ["L1"], nota: "Con el braquiorradial" },
      { m: "recto-abd", c: ["L1"], nota: "Hollow rígido" },
      { m: "oblicuos", c: [], nota: "Oblicuo externo, hollow rígido" },
    ],
    sinergista: [],
    estabilizador: [],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
