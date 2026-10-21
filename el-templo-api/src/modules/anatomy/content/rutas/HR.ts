import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de HR desde S6.2 (core posterior) + S6.3 (core
 * lateral), tabla articular + S8. Borrador (D5).
 *
 * Junta las dos secciones: erectores y glúteo mayor/isquios del core posterior
 * (S6.2, incluida la fila de arch hold, R2-27) y oblicuos, cuadrado lumbar y
 * glúteo medio de las planchas laterales (S6.3). Los oblicuos son antagonistas
 * en S6.2 y M/Est en S6.3: gana el rol más alto (motor).
 *
 * Fuera de las relaciones: trapecio inferior y romboides del arch hold ("si
 * los brazos van adelante", sin rol explícito) y el deltoides de S6.3 (sin id).
 * ⚑N: qué ejercicios componen "bote espinal", "espinal cajón", "espinal 360" y
 * "espinal A 1" se confirma con los profes.
 */
export const HR = {
  code: "HR",
  slug: "espinales-y-planchas-laterales",
  patron: "CORE",
  categoria: "Anterior · lateral · posterior",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "erectores",
        c: ["L1", "R"],
        nota: "Con los multífidos: motor del retorno y del arch hold",
      },
      { m: "gluteo-mayor", c: ["L1", "R"] },
      { m: "isquios", c: ["L1", "R"] },
      {
        m: "cuadrado",
        c: [26, 25],
        nota: "Planchas laterales: anti-flexión lateral",
      },
      {
        m: "oblicuos",
        c: [26, 25],
        nota: "Planchas laterales; en el core posterior se alargan (antagonista)",
      },
      {
        m: "gluteo-medio",
        c: [25],
        nota: "Planchas laterales: pierna de abajo",
      },
    ],
    sinergista: [],
    estabilizador: [
      { m: "serrato", c: ["L1", 36], nota: "Brazo de apoyo" },
      { m: "manguito", c: ["L1", 36], nota: "Supraespinoso, brazo de apoyo" },
      { m: "trap-inf", c: ["L1"], nota: "Brazo de apoyo" },
    ],
    antagonista: [
      {
        m: "recto-abd",
        c: ["L1"],
        nota: "Core posterior: se alarga y modula",
      },
    ],
    estira: [],
  },
  fichaProfe: null,
  fichaAlumno: null,
} as const satisfies RutaContenido;
