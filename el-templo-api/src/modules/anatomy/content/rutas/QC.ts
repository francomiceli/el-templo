import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de QC desde A3 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * Corrección R3-2 (B.2): con el torso reclinado, la gravedad tiende a extender
 * la cadera y la frenan los flexores de cadera (recto femoral, iliopsoas) en
 * isométrico; el glúteo mayor solo co-contrae y los abdominales estabilizan
 * (antiextensión lumbar). ⚑H (H2).
 *
 * A3 declara que todo es "razonamiento a partir de BI2 y [L1], no evidencia de
 * QC": las celdas sin marca propia llevan L1. ⚑N: la definición del quad curl
 * (seiza, quad box, tibiales pared) se confirma con Nacho antes de publicar. El
 * tibial anterior es motor solo en "tibiales pared"; en seiza se estira.
 */
export const QC = {
  code: "QC",
  slug: "quad-curl",
  patron: "LOWER",
  categoria: "Rodilla dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "vastos",
        c: ["L1"],
        nota: "Excéntrico al reclinarse, concéntrico al volver",
      },
      {
        m: "recto-fem",
        c: ["C", "L1", "R"],
        nota: "Muy exigido con la cadera en extensión; además flexor de cadera isométrico con el torso reclinado",
      },
      {
        m: "psoas",
        c: ["R"],
        nota: "Isométrico: la gravedad tiende a extender la cadera y lo frena",
      },
      {
        m: "tibial",
        c: ["L1"],
        nota: "Solo en tibiales pared (dorsiflexión concéntrica y excéntrica); en seiza se estira",
      },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "gluteo-mayor",
        c: ["R"],
        nota: "Co-contracción para no quebrar la cadera hacia adelante",
      },
      {
        m: "recto-abd",
        c: ["R"],
        nota: "Antiextensión lumbar",
      },
      {
        m: "oblicuos",
        c: ["R"],
        nota: "Antiextensión lumbar",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
