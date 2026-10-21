import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de DS desde B-DS (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * Corrección R2: la tabla de B-DS pone cuádriceps como motor (TI-H no lo
 * listaba), así que DS lleva vastos. B-DS declara que todo es inferencia [C]:
 * las celdas sin marca propia llevan C. ⚑N: el dragon squat no tiene ninguna
 * fuente primaria ni de revisión y "DP" (dragon pistol) está sin resolver.
 * Fuera de las relaciones: el sóleo del tobillo de apoyo ("EXC / CON" sin rol
 * en la tabla) y TFL / rotadores (sin id).
 */
export const DS = {
  code: "DS",
  slug: "dragon-squat",
  patron: "LOWER",
  categoria: "Cadera dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "gluteo-mayor", c: ["C"], nota: "Cadera de apoyo" },
      {
        m: "vastos",
        c: ["C", 45],
        nota: "Rodilla de apoyo: menos momento que en el pistol si el tronco se inclina",
      },
    ],
    sinergista: [
      { m: "aductores", c: ["C"], nota: "Aductor mayor" },
      { m: "isquios", c: ["C"] },
    ],
    estabilizador: [
      {
        m: "gluteo-medio",
        c: ["C"],
        nota: "Control frontal y rotación: la pierna libre cruzada tiende a rotar la pelvis",
      },
      { m: "oblicuos", c: ["C"], nota: "Antirrotación y neutralidad" },
      { m: "erectores", c: ["C"], nota: "Antirrotación y neutralidad" },
      { m: "cuadrado", c: ["C"], nota: "Antirrotación y neutralidad" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
