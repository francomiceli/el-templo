import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de NC desde B-NC-1..4 (tablas articulares) + TI-H.
 * Borrador (D5). Ruta heterogénea (R5): nordic, bisagra, jefferson y gemelos;
 * gestos como texto (sin modelo por gesto en v1). El rol más alto gana y cada
 * `nota` dice en qué gesto.
 *
 * Nordic (B-NC-1): isquios motores en excéntrico; gastrocnemio sinergista; la
 * cadera es isométrica. Bisagra (B-NC-2): glúteo mayor motor, isquios y
 * aductor mayor sinergistas. Calf raises (B-NC-4): gastrocnemio y sóleo
 * motores; con la rodilla flexionada predomina el sóleo. Jefferson (B-NC-3) no
 * trae roles: es flexión de columna cargada, sin estudios, con contraindicaciones
 * (⚑H, H12).
 */
export const NC = {
  code: "NC",
  slug: "nordic-curl",
  patron: "LOWER",
  categoria: "Cadera dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "isquios",
        c: [68, 69],
        nota: "Nordic: motores en excéntrico sobre la rodilla (el semitendinoso preferente); bisagra: sinergistas",
      },
      {
        m: "gluteo-mayor",
        c: [49],
        nota: "Bisagra (deadlift, good morning): motor; en el nordic, estabilizador isométrico de cadera",
      },
      {
        m: "gemelo",
        c: ["L1", "R"],
        nota: "Calf raises de pie: motor; en el nordic, sinergista",
      },
      {
        m: "soleo",
        c: ["L1", "R"],
        nota: "Calf raises: motor siempre, y predomina con la rodilla flexionada (soleo squat, horse stance)",
      },
    ],
    sinergista: [
      {
        m: "aductores",
        c: [],
        nota: "Bisagra: aductor mayor sinergista; en el nordic, estabilizador isométrico",
      },
    ],
    estabilizador: [
      { m: "erectores", c: [], nota: "Isométrico; alto en la bisagra" },
      { m: "recto-abd", c: [], nota: "Isométrico" },
      { m: "oblicuos", c: [], nota: "De TI-H (abdominales)" },
      { m: "vastos", c: [], nota: "Bisagra: cuádriceps estabilizador" },
      {
        m: "gluteo-medio",
        c: [],
        nota: "Bisagra a una pierna: estabilidad frontal",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
