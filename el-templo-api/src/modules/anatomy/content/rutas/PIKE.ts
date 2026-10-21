import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de PIKE desde C4 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * Los flexores de cadera son motores (pike activo, L-sit leg lifts) y la tabla
 * los marca M en la fila de pelvis sin condición. Glúteo mayor e isquios
 * quedan como se estiran: la fila de cadera los marca "alargados" (TI-H:
 * "PIKE, Al") y la de pelvis dice "Ant/Al"; se tomó Al (interpretación, a
 * confirmar con H). Jefferson curl: ver NC (sin estudios directos). Fuera:
 * fascia posterior y ciático (sin id).
 */
export const PIKE = {
  code: "PIKE",
  slug: "pike",
  patron: "MOVILIDAD",
  categoria: "Rangos",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "psoas",
        c: ["L1", "C"],
        nota: "Pike activo: concéntricos mientras los isquios dan el rango",
      },
      {
        m: "recto-fem",
        c: ["L1", "C"],
        nota: "Pike activo: concéntricos mientras los isquios dan el rango",
      },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "recto-abd",
        c: [],
        nota: "Lumbar: la flexión es evitable o permitida según la versión",
      },
      { m: "vastos", c: [], nota: "Rodilla extendida" },
    ],
    antagonista: [],
    estira: [
      {
        m: "isquios",
        c: [104],
        nota: "Alargados (pike pasivo); con tensión neural del ciático",
      },
      { m: "gluteo-mayor", c: [], nota: "Alargado en la flexión de cadera" },
      { m: "erectores", c: [], nota: "Columna lumbar: alargados" },
      { m: "gemelo", c: [], nota: "Si se agarra el pie (dorsiflexión)" },
    ],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
