import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de HSPU desde S5.2 (tabla articular) + S8. Borrador
 * (D5). Sin EMG de HSPU revisado por pares: se deduce de HS (citas 5 y 6) +
 * pike push-up. La fila ST lleva la marca 6 de la celda (contribución relativa
 * del HS completo, no %MVIC).
 */
export const HSPU = {
  code: "HSPU",
  slug: "handstand-push-up",
  patron: "PUSH",
  categoria: "Push vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "delt-ant", c: ["L1"] },
      { m: "trap-sup", c: [6] },
      { m: "serrato", c: [6] },
      { m: "triceps", c: ["L1"] },
    ],
    sinergista: [{ m: "pectoral", c: ["L1"], nota: "Clavicular" }],
    estabilizador: [
      { m: "manguito", c: ["L1"] },
      { m: "trap-inf", c: [6] },
      { m: "antebrazo", c: [6], nota: "Flexores de muñeca" },
      { m: "recto-abd", c: [], nota: "Anti-extensión" },
      { m: "oblicuos", c: [], nota: "Anti-extensión" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
