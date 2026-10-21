import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de PHS desde S5.3 (tabla articular) + S8. Borrador
 * (D5). Evidencia: EMG de press handstand en 41 gimnastas, el serrato anterior
 * fue el único músculo que difirió (cita 35).
 *
 * La fila de cadera nombra glúteo e isquios para la "alineación final" sin
 * asignarles rol: quedan fuera de las relaciones (pendiente de fuente). La
 * compresión es de iliopsoas, recto femoral y aductores (motores por S8).
 */
export const PHS = {
  code: "PHS",
  slug: "press-to-handstand",
  patron: "PUSH",
  categoria: "Push vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "delt-ant", c: ["L1", 35] },
      { m: "pectoral", c: ["L1", 35], nota: "Clavicular" },
      { m: "serrato", c: [35] },
      { m: "psoas", c: ["L1"], nota: "Compresión de cadera" },
      { m: "recto-fem", c: ["L1"], nota: "Compresión de cadera" },
      { m: "aductores", c: ["L1"], nota: "Compresión de cadera" },
      { m: "recto-abd", c: [], nota: "Compresión: flexión de tronco" },
      { m: "oblicuos", c: [], nota: "Compresión: flexión de tronco" },
    ],
    sinergista: [
      { m: "trap-sup", c: [], nota: "Rotación hacia arriba" },
      { m: "trap-inf", c: [], nota: "Rotación hacia arriba" },
    ],
    estabilizador: [
      { m: "manguito", c: ["L1", 35] },
      { m: "romboides", c: [], nota: "Trapecio medio" },
      { m: "triceps", c: [], nota: "Isométrico, brazo extendido" },
      { m: "antebrazo", c: [], nota: "Flexores de muñeca" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
