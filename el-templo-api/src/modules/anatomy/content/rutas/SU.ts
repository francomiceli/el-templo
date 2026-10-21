import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de SU desde A5 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * A5 no trae marcas en la tabla: `c: []`. Sóleo y gastrocnemio son sinergistas
 * al subir y estabilizadores al bajar (gana el rol más alto). "Cuádriceps" sin
 * más queda como vastos: el recto femoral no se nombra en esta tabla. ⚑N: PQ y
 * PSU (pistol step-up, hipótesis) sin definir.
 */
export const SU = {
  code: "SU",
  slug: "step-up",
  patron: "LOWER",
  categoria: "Rodilla dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "gluteo-mayor",
        c: [],
        nota: "Concéntrico al subir, excéntrico al bajar",
      },
      {
        m: "vastos",
        c: [25],
        nota: "Concéntrico al subir, excéntrico al bajar (step-up lateral > 45 % MVIC en el vasto medial oblicuo)",
      },
    ],
    sinergista: [
      { m: "aductores", c: [], nota: "Aductor mayor" },
      { m: "isquios", c: [] },
      {
        m: "soleo",
        c: [],
        nota: "Concéntrico al subir; estabilizador excéntrico al bajar",
      },
      {
        m: "gemelo",
        c: [],
        nota: "Concéntrico al subir; estabilizador excéntrico al bajar",
      },
      { m: "psoas", c: [], nota: "Pierna libre: flexores de cadera" },
    ],
    estabilizador: [
      {
        m: "gluteo-medio",
        c: [],
        nota: "Control pélvico en el apoyo en el cajón: esencial",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
