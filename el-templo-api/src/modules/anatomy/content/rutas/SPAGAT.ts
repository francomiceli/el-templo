import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de SPAGAT desde C1 (tabla articular, spagat frontal)
 * + C0 + TI-H. Borrador (D5).
 *
 * Lectura pasiva (interpretación, a confirmar con H): la tabla marca M "para
 * elevar activamente" (flexores de cadera) y "para sostener" (glúteo mayor)
 * como variante de flexibilidad activa. Para el ejercicio base (elongación
 * pasiva) esos músculos quedan así: flexores de cadera = estira (pierna
 * trasera alargada) y glúteo mayor = estabilizador (TI-H: "SPAGAT trasera,
 * Est"). La variante activa va en la `nota`. Por eso la ruta casi no tiene
 * motores: es lo correcto para una ruta de rango. Fuera: el piriforme, la
 * cápsula y el ciático (sin id) y los rotadores externos profundos.
 */
export const SPAGAT = {
  code: "SPAGAT",
  slug: "spagat",
  patron: "MOVILIDAD",
  categoria: "Rangos",
  estado: "borrador",
  relaciones: {
    motor: [],
    sinergista: [],
    estabilizador: [
      {
        m: "gluteo-mayor",
        c: [],
        nota: "Cadera trasera: sostiene el rango (la tabla lo marca motor en la versión activa); en el pigeon se alarga",
      },
      { m: "vastos", c: [], nota: "Rodilla delantera extendida" },
      { m: "gluteo-medio", c: [], nota: "Pelvis neutra y cuadrada" },
      { m: "oblicuos", c: [], nota: "Pelvis neutra y cuadrada" },
      { m: "erectores", c: [], nota: "Lumbar neutral" },
      { m: "recto-abd", c: [], nota: "Lumbar neutral" },
    ],
    antagonista: [],
    estira: [
      {
        m: "isquios",
        c: [104],
        nota: "Cadera delantera: elongación pasiva, con tensión neural del ciático",
      },
      {
        m: "psoas",
        c: ["L1"],
        nota: "Cadera trasera: se alarga con la cápsula anterior; en la versión activa, motor para elevar la pierna delantera",
      },
      {
        m: "recto-fem",
        c: ["L1"],
        nota: "Cadera trasera: se alarga, más con la rodilla flexionada (couch stretch)",
      },
      {
        m: "aductores",
        c: [],
        nota: "De TI-H: alargado (la tabla del spagat frontal no lo nombra)",
      },
      {
        m: "gemelo",
        c: [],
        nota: "Rodilla delantera: se alarga si el pie se dorsiflexiona",
      },
    ],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
