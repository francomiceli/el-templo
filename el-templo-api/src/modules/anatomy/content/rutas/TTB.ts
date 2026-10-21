import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de TTB desde S2.4 (tabla articular) + S6.1 + S8.
 * Borrador (D5). Ruta heterogénea (R5): gestos como texto, sin modelo por
 * gesto en v1.
 */
export const TTB = {
  code: "TTB",
  slug: "toe-to-bar",
  patron: "PULL",
  categoria: "Pull vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "psoas", c: ["L1"], nota: "Flexión de cadera" },
      { m: "recto-fem", c: ["L1"], nota: "Flexión de cadera" },
      { m: "recto-abd", c: ["L1", 23] },
      {
        m: "oblicuos",
        c: ["L1", 23],
        nota: "Oblicuo externo; el interno estabiliza",
      },
      { m: "dorsal", c: ["L1"], nota: "Motor / estabilizador" },
      { m: "redondo", c: ["L1"], nota: "Motor / estabilizador" },
      { m: "trap-inf", c: ["L1"], nota: "Motor / estabilizador" },
      { m: "antebrazo", c: [], nota: "Agarre" },
    ],
    sinergista: [{ m: "aductores", c: ["L1"] }],
    estabilizador: [
      { m: "biceps", c: [], nota: "Flexores del codo" },
      { m: "braquial", c: [], nota: "Flexores del codo" },
      { m: "triceps", c: ["L1"], nota: "Cabeza larga, colgado (S6.1)" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
