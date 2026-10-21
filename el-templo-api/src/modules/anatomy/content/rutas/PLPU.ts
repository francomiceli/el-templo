import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de PLPU desde S4.5 (tabla articular) + S8. Borrador
 * (D5). Sin EMG de planche push-up: se deduce de planche (cita 4) + push-up.
 *
 * Tronco/cadera: igual que PL por coherencia (R2-14), boca abajo. La fila ST
 * dice solo "trapecio = Est" sin porción: no se volcó (pendiente de fuente).
 */
export const PLPU = {
  code: "PLPU",
  slug: "planche-push-up",
  patron: "PUSH",
  categoria: "Push horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "delt-ant", c: ["L1"] },
      { m: "pectoral", c: ["L1"], nota: "Clavicular" },
      { m: "serrato", c: [9, 13], nota: "Protracción mantenida" },
      { m: "triceps", c: ["L1"], nota: "Flexión profunda y extensión" },
      {
        m: "gluteo-mayor",
        c: ["R"],
        nota: "Isométrico: sostiene las piernas",
      },
      { m: "isquios", c: ["R"], nota: "Isométrico: sostiene las piernas" },
      { m: "erectores", c: ["R"], nota: "Isométrico: sostiene las piernas" },
    ],
    sinergista: [],
    estabilizador: [
      { m: "biceps", c: [4], nota: "Cabeza larga" },
      { m: "antebrazo", c: [], nota: "Flexores y extensores, carga máxima" },
      { m: "recto-abd", c: ["R"], nota: "Evita el arco lumbar" },
      { m: "oblicuos", c: ["R"], nota: "Evita el arco lumbar" },
      { m: "dorsal", c: [] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
