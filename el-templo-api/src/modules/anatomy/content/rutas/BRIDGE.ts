import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de BRIDGE desde C2 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * Hombro en flexión máxima: empujan deltoides anterior, serrato y trapecio
 * (el coracobraquial no tiene id) mientras dorsal, pectoral y redondo mayor se
 * alargan. Cadera: glúteo mayor e isquios motores; iliopsoas y recto femoral
 * alargados. Los erectores y el cuadrado lumbar son sinergistas (extensión
 * torácica y lumbar). Sin estudios de rueda ni de bridge con carga (C2).
 * Fuera: pectoral menor y extensores de muñeca (sin id).
 */
export const BRIDGE = {
  code: "BRIDGE",
  slug: "bridge",
  patron: "MOVILIDAD",
  categoria: "Rangos",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "delt-ant",
        c: ["L1"],
        nota: "Empuje con el hombro en flexión máxima",
      },
      { m: "serrato", c: ["L1"], nota: "Rotación superior de la escápula" },
      {
        m: "trap-sup",
        c: ["L1"],
        nota: "Empuje; trapecio superior e inferior",
      },
      {
        m: "trap-inf",
        c: ["L1"],
        nota: "Empuje; trapecio superior e inferior",
      },
      { m: "triceps", c: [], nota: "Extensión de codo" },
      { m: "gluteo-mayor", c: [], nota: "Extensión de cadera" },
      { m: "isquios", c: [], nota: "Extensión de cadera" },
      { m: "vastos", c: [], nota: "Extensión de rodilla" },
    ],
    sinergista: [
      {
        m: "erectores",
        c: ["L1"],
        nota: "Extensión torácica y lumbar; la lumbar es la que se vende",
      },
      { m: "cuadrado", c: [], nota: "Extensión lumbar" },
    ],
    estabilizador: [{ m: "soleo", c: [], nota: "Rodilla y tobillo" }],
    antagonista: [],
    estira: [
      { m: "dorsal", c: ["L1"], nota: "Hombro en flexión máxima" },
      { m: "pectoral", c: ["L1"], nota: "Pectoral mayor y menor" },
      { m: "redondo", c: ["L1"], nota: "Hombro en flexión máxima" },
      {
        m: "antebrazo",
        c: [],
        nota: "Flexores de muñeca y dedos, con la muñeca en extensión máxima",
      },
      {
        m: "recto-abd",
        c: ["L1"],
        nota: "Columna torácica y lumbar en extensión",
      },
      { m: "psoas", c: [], nota: "Cadera en extensión" },
      { m: "recto-fem", c: [], nota: "Cadera en extensión" },
    ],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
