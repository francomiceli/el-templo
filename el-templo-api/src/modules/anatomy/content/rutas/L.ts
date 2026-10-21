import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de L desde A1 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * A1 declara "roles [L1][L2]" para toda la tabla: las celdas sin marca propia
 * llevan esas dos. Los gemelos no aparecen: la tabla nombra "sóleo y
 * gastrocnemio EXC controlan" sin dar un rol y TI-H solo lista el sóleo (S/Est);
 * el sóleo queda como estabilizador y el gemelo fuera (pendiente de fuente).
 * El recto femoral es motor (rodilla delantera, "vastos + recto femoral"); en
 * la pierna de atrás se alarga.
 */
export const L = {
  code: "L",
  slug: "lunge",
  patron: "LOWER",
  categoria: "Rodilla dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "gluteo-mayor", c: ["L1", "L2"], nota: "Cadera delantera" },
      {
        m: "vastos",
        c: ["L1", "L2"],
        nota: "Rodilla delantera: excéntrico al bajar, concéntrico al subir",
      },
      {
        m: "recto-fem",
        c: ["L1", "L2"],
        nota: "Rodilla delantera; en la pierna de atrás se alarga y limita el rango",
      },
    ],
    sinergista: [
      {
        m: "aductores",
        c: ["L1", "L2"],
        nota: "Aductor mayor, fibras isquiocondíleas",
      },
      {
        m: "isquios",
        c: ["L1", "L2", 68],
        nota: "En la fase concéntrica la relación bíceps femoral / mediales fue alta",
      },
    ],
    estabilizador: [
      {
        m: "gluteo-medio",
        c: ["L1", "L2"],
        nota: "Control frontal de la cadera delantera; contralateral en la pelvis",
      },
      { m: "tibial", c: ["L1", "L2"], nota: "Tobillo delantero" },
      {
        m: "soleo",
        c: ["L1", "L2"],
        nota: "Controla en excéntrico la dorsiflexión (TI-H: sinergista / estabilizador)",
      },
      { m: "erectores", c: ["L1", "L2"], nota: "Pelvis y lumbar: neutro" },
      { m: "oblicuos", c: ["L1", "L2"], nota: "Pelvis y lumbar: neutro" },
      { m: "cuadrado", c: ["L1", "L2"], nota: "Pelvis y lumbar: neutro" },
    ],
    antagonista: [],
    estira: [
      {
        m: "psoas",
        c: ["L1", "L2"],
        nota: "Cadera trasera: se alarga y limita el rango (más en la búlgara)",
      },
    ],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
