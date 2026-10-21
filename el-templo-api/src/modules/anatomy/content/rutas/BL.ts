import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de BL desde S4.1 (tabla articular) + S8. Borrador
 * (D5). Sin EMG de back lever: anatomía L1 + coaching L3 (marcas de las celdas
 * sin marca propia).
 *
 * Corrección R2 (BS5, R2-1/R2-9): boca abajo, la gravedad tiende a flexionar
 * cadera y columna, y lo frenan glúteo mayor, isquios y erectores (motores);
 * el abdomen controla que no se arquee la zona lumbar (estabilizador). BL no
 * es copia de PL: lleva bíceps (cabeza larga, M/Est en el hombro) y el dorsal
 * es antagonista en el hombro (su acción extensora favorece la caída).
 * ⚑H: la posición escapular en BL varía por escuela (R2-13).
 */
export const BL = {
  code: "BL",
  slug: "back-lever",
  patron: "PUSH",
  categoria: "Push horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "delt-ant", c: ["L1"] },
      { m: "pectoral", c: ["L1"], nota: "Clavicular" },
      {
        m: "biceps",
        c: ["L1"],
        nota: "Cabeza larga: motor y estabilizador en el hombro, isométrico",
      },
      { m: "gluteo-mayor", c: ["L1"] },
      { m: "isquios", c: ["L1"] },
      { m: "erectores", c: ["L1"], nota: "Columna neutra, sin hiperlordosis" },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "trap-inf",
        c: ["L1", "R", "H"],
        nota: "Escápula deprimida y algo retraída",
      },
      { m: "romboides", c: ["L1", "R", "H"] },
      {
        m: "dorsal",
        c: ["L1", "R", "H"],
        nota: "Deprime la escápula vía húmero; en el hombro es antagonista (su acción extensora favorece la caída)",
      },
      {
        m: "braquial",
        c: ["L1", "L3"],
        nota: "Isométrico: resiste la hiperextensión del codo",
      },
      {
        m: "triceps",
        c: ["L1", "L3"],
        nota: "Co-contracción: bloquea el codo",
      },
      { m: "recto-abd", c: ["L1"], nota: "Anti-extensión" },
      { m: "oblicuos", c: ["L1"], nota: "Anti-extensión" },
      { m: "manguito", c: ["L1"] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
