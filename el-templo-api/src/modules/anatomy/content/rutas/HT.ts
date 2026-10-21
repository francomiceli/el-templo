import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de HT desde B-HT (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * El EMG del glúteo mayor en el hip thrust no predijo la hipertrofia [63]: las
 * marcas de las relaciones son las de la tabla y la evidencia mixta de B-HT.
 * Cuádriceps "activo" (vasto lateral 99,5 % vs 110 % MVIC [60]) queda como
 * estabilizador isométrico a ~90° (TI-H). Los isquios son sinergistas en
 * cadera (la rodilla los marca Ant/S): gana el rol más alto. ⚑N: "L. on box"
 * sin definir.
 */
export const HT = {
  code: "HT",
  slug: "hip-thrust",
  patron: "LOWER",
  categoria: "Cadera dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "gluteo-mayor",
        c: [60, 61],
        nota: "Fibras superiores e inferiores; pico en el bloqueo",
      },
    ],
    sinergista: [
      {
        m: "isquios",
        c: [60, 68],
        nota: "Con rodilla flexionada, predominan los mediales",
      },
      { m: "aductores", c: [], nota: "Aductor mayor" },
    ],
    estabilizador: [
      {
        m: "gluteo-medio",
        c: [],
        nota: "Muy exigido en la versión a una pierna",
      },
      { m: "oblicuos", c: [], nota: "Frenan la anteversión; control pélvico" },
      { m: "recto-abd", c: [], nota: "Frenan la anteversión" },
      { m: "erectores", c: [] },
      {
        m: "vastos",
        c: [60],
        nota: "Activo en isométrico con la rodilla a ~90°; más demanda con los pies cerca",
      },
      { m: "soleo", c: [], nota: "Apoyo de pie" },
      { m: "gemelo", c: [], nota: "Apoyo de pie" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
