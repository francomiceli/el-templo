import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de PL desde S4.4 (tabla articular) + S8. Borrador
 * (D5). Evidencia directa: EMG de la support scale en 7 gimnastas de anillas
 * (cita 4).
 *
 * Corrección R2-14 (BS5, boca abajo): glúteo mayor, isquios y erectores son
 * motores isométricos (sostienen las piernas) y el abdomen es estabilizador
 * (evita el arco lumbar).
 */
export const PL = {
  code: "PL",
  slug: "planche",
  patron: "PUSH",
  categoria: "Push horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "delt-ant", c: [4] },
      { m: "pectoral", c: [4], nota: "Clavicular" },
      {
        m: "biceps",
        c: [4],
        nota: "Cabeza larga: flexor activo del hombro; en el codo estabiliza",
      },
      { m: "serrato", c: [4], nota: "Protracción y rotación hacia arriba" },
      { m: "triceps", c: [4], nota: "Isométrico, brazo recto" },
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
      { m: "trap-inf", c: [4] },
      { m: "romboides", c: [4], nota: "Trapecio medio" },
      { m: "antebrazo", c: [], nota: "Flexores y extensores, extensión alta" },
      { m: "recto-abd", c: ["R"], nota: "Evita el arco lumbar" },
      { m: "oblicuos", c: ["R"], nota: "Evita el arco lumbar" },
      { m: "dorsal", c: [] },
      { m: "manguito", c: [4] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
