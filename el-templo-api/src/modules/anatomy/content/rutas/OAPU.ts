import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de OAPU desde S4.3 (tabla articular) + S8. Borrador
 * (D5). Sin EMG unilateral de push-up completo: anatomía L1 y extrapolación de
 * push-up plus y bilateral (citas 9, 13, 14).
 */
export const OAPU = {
  code: "OAPU",
  slug: "push-ups",
  patron: "PUSH",
  categoria: "Push horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "pectoral", c: ["L1"] },
      { m: "delt-ant", c: ["L1"] },
      {
        m: "serrato",
        c: [9, 13, 14],
        nota: "Mayor actividad con la escápula rotada hacia arriba y en protracción",
      },
      { m: "triceps", c: ["L1"] },
      {
        m: "oblicuos",
        c: ["L1"],
        nota: "Anti-rotación fuerte, la carga es lateral",
      },
      {
        m: "cuadrado",
        c: ["L1"],
        nota: "Anti-rotación fuerte, la carga es lateral",
      },
      {
        m: "gluteo-medio",
        c: ["L1"],
        nota: "Anti-rotación fuerte, la carga es lateral",
      },
    ],
    sinergista: [],
    estabilizador: [
      { m: "manguito", c: ["L1"] },
      { m: "biceps", c: ["L1"], nota: "Cabeza larga" },
      { m: "antebrazo", c: [], nota: "Flexores de muñeca" },
      { m: "recto-abd", c: [], nota: "Anti-extensión" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
