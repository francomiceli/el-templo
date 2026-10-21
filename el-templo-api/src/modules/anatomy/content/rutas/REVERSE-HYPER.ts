import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de REVERSE HYPER desde C5 (tabla articular) + TI-H.
 * Borrador (D5).
 *
 * Los dos estudios son de máquina y se contradicen en el EMG de glúteo e
 * isquios [99][100]; la transferencia a la versión libre no está verificada
 * (C5). Erectores: la tabla de cadera los marca "Est-S" y la lumbar
 * "Est-ISO (alto)": gana sinergista; TI-H los lista como motor ("E alto").
 */
export const REVERSE_HYPER = {
  code: "REVERSE HYPER",
  slug: "reverse-hyper",
  patron: "MOVILIDAD",
  categoria: "Rangos",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "gluteo-mayor", c: [99, 100], nota: "Extensión de cadera" },
      { m: "isquios", c: [99, 100], nota: "Extensión de cadera" },
    ],
    sinergista: [
      {
        m: "erectores",
        c: [99, 100],
        nota: "Cadera: Est-S; lumbar: isométrico alto, es el límite del rango",
      },
    ],
    estabilizador: [
      { m: "recto-abd", c: [], nota: "Pelvis: retroversión leve al final" },
      {
        m: "vastos",
        c: [],
        nota: "Rodilla: extendida (str) o flexionada (tuck)",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
