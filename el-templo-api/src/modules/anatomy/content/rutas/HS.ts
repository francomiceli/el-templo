import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de HS desde S5.1 (tabla articular) + S8. Borrador
 * (D5). Evidencia directa de EMG (citas 5, 6 y 7). Los porcentajes de la cita 6
 * son contribución relativa, no %MVIC (R2-45).
 *
 * Corrección R2: HS lleva deltoides anterior (15 a 18 % de contribución
 * relativa, estabilizador según S8) además del trapecio superior (motor de la
 * elevación) y los flexores de muñeca (motor del control).
 */
export const HS = {
  code: "HS",
  slug: "handstand",
  patron: "PUSH",
  categoria: "Push vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "antebrazo",
        c: [6],
        nota: "Flexores de muñeca y dedos: motor del control (estrategia de muñeca)",
      },
      {
        m: "trap-sup",
        c: [6],
        nota: "Trapecio descendente: 20 a 26 % de contribución relativa",
      },
      { m: "trap-inf", c: ["L1"] },
      { m: "serrato", c: ["L1"] },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "triceps",
        c: [6],
        nota: "13 a 16 % de contribución relativa",
      },
      {
        m: "delt-ant",
        c: [6],
        nota: "15 a 18 % de contribución relativa",
      },
      { m: "pectoral", c: ["L1"], nota: "Clavicular" },
      { m: "manguito", c: ["L1"] },
      { m: "recto-abd", c: ["L1"], nota: "Anti-extensión" },
      { m: "oblicuos", c: ["L1"], nota: "Anti-extensión" },
      { m: "gluteo-mayor", c: ["L1"] },
    ],
    antagonista: [{ m: "erectores", c: ["L1"] }],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
