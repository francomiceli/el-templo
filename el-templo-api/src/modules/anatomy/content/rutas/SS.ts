import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de SS desde A4 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * Corrección R3-1 (B.2, §1.7.2): el sissy squat es de cuádriceps con palanca
 * larga. Con el cuerpo reclinado y la cadera neutra, los flexores de cadera
 * (recto femoral e iliopsoas) la sostienen en isométrico; el glúteo mayor solo
 * co-contrae ("no sostiene", TI-H) y el glúteo medio y los aductores no entran
 * como motor ni sinergista. ⚑H (H2). Sin estudios de sissy squat (A4): marcas
 * C y L1 de la tabla; el resto lleva `c: []`.
 */
export const SS = {
  code: "SS",
  slug: "sissy-squat",
  patron: "LOWER",
  categoria: "Rodilla dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "vastos",
        c: ["C", "L1"],
        nota: "Rodilla muy avanzada y flexionada: máxima demanda de cuádriceps con palanca larga",
      },
      {
        m: "recto-fem",
        c: ["C", "L1", "R"],
        nota: "Trabaja en los dos extremos: extiende la rodilla y sostiene la cadera",
      },
      {
        m: "psoas",
        c: ["R"],
        nota: "Isométrico: con el cuerpo reclinado la gravedad empuja la cadera a extenderse y lo frena",
      },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "gluteo-mayor",
        c: ["R"],
        nota: "Co-contracción para mantener la línea; no sostiene",
      },
      { m: "gemelo", c: [], nota: "Isométrico, talones arriba" },
      { m: "soleo", c: [], nota: "Isométrico, talones arriba" },
      { m: "recto-abd", c: [] },
      { m: "oblicuos", c: [], nota: "De TI-H (abdominales)" },
      { m: "erectores", c: [] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
