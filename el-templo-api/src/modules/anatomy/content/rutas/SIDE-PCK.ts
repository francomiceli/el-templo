import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de SIDE PCK (Side Pancake, D1) desde C3 (tabla
 * articular) + TI-H. Borrador (D5).
 *
 * Corrección A9 / R3-3 (B.2, §1.6): el contenido es pancake lateral, no un
 * pike. Pasada la vertical, el descenso lo frenan en excéntrico el cuadrado
 * lumbar y los oblicuos del lado CONTRARIO (el costado que se estira), que
 * también cargan el sostén y el retorno concéntrico; el lado hacia el que te
 * inclinás solo trabaja en la versión activa. ⚑H (H2). Los isquios mediales
 * quedan antagonistas (la tabla de rodilla los marca Ant; gana ese rol sobre
 * "alargados"). Fuera de las relaciones: intertransversos y deltoides (sin id);
 * dorsal y pectoral de TI-H ("SIDE PCK windmill") sin rol explícito.
 */
export const SIDE_PCK = {
  code: "SIDE PCK",
  slug: "side-pancake",
  patron: "MOVILIDAD",
  categoria: "Rangos",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "oblicuos",
        c: ["L1", "R"],
        nota: "Lado contrario: excéntrico al bajar, isométrico en el sostén, concéntrico al subir; a la vez alargados",
      },
      {
        m: "cuadrado",
        c: ["L1", "R"],
        nota: "Lado contrario: excéntrico al bajar, isométrico en el sostén, concéntrico al subir; a la vez alargado",
      },
    ],
    sinergista: [],
    estabilizador: [
      { m: "vastos", c: [], nota: "Rodilla extendida (pierna recta)" },
      { m: "gluteo-medio", c: [], nota: "Pelvis neutra y cuadrada" },
      { m: "manguito", c: [], nota: "Windmill / overhead" },
    ],
    antagonista: [
      {
        m: "isquios",
        c: [],
        nota: "Isquios mediales co-activos en la rodilla; además alargados en la cadera",
      },
    ],
    estira: [
      {
        m: "aductores",
        c: [],
        nota: "Grácil, aductor largo y magno alargados (base ancha)",
      },
    ],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
