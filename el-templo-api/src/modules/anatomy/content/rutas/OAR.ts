import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de OAR desde S3.4 (tabla articular) + S8. Borrador
 * (D5). La tabla dice "glúteos" sin distinguir mayor y medio: se listan ambos
 * (el medio con la marca de S8, Est unilateral).
 */
export const OAR = {
  code: "OAR",
  slug: "remos",
  patron: "PULL",
  categoria: "Pull horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "romboides", c: ["L1"], nota: "Trapecio medio" },
      { m: "trap-inf", c: ["L1"] },
      { m: "dorsal", c: ["L1"] },
      { m: "redondo", c: ["L1"] },
      { m: "delt-post", c: ["L1"] },
      { m: "biceps", c: ["L1"] },
      { m: "braquial", c: ["L1"], nota: "Con el braquiorradial" },
    ],
    sinergista: [],
    estabilizador: [
      { m: "manguito", c: ["L1"] },
      { m: "oblicuos", c: ["L1"], nota: "Anti-rotación" },
      { m: "cuadrado", c: ["L1"], nota: "Anti-rotación" },
      { m: "erectores", c: ["L1"], nota: "Anti-rotación" },
      { m: "gluteo-mayor", c: [], nota: "Glúteos: posición estable" },
      {
        m: "gluteo-medio",
        c: ["L1"],
        nota: "Glúteos: posición estable (unilateral)",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Remada con un solo brazo: se rema hasta que la mano llega al costado mientras el tronco, rígido, resiste la rotación que genera el tirón unilateral.",
      c: ["L1"],
    },
    tipo: "Mixta (26 % isométrica)",
    brazo: "Brazo flexionado (BAS) 31",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Posición inicial",
        texto: {
          t: "Brazo extendido, con el tronco rígido y sin rotar.",
          c: [],
        },
      },
      {
        nombre: "Remada",
        texto: {
          t: "Remada concéntrica hasta que la mano llega al costado.",
          c: [],
        },
      },
      { nombre: "Pausa", texto: { t: "Pausa arriba.", c: [] } },
      {
        nombre: "Descenso",
        texto: { t: "Descenso excéntrico.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Escápula (escapulotorácica)",
        accion: "Retracción + depresión leve",
        musculos: "Romboides y trapecio medio / inferior: motores.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Hombro (glenohumeral)",
        accion: "Extensión + aducción (plano sagital o escapular)",
        musculos:
          "Dorsal ancho, redondo mayor y deltoides posterior: motores. Manguito rotador: estabilizador.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Codo",
        accion: "Flexión",
        musculos: "Bíceps, braquial y braquiorradial: motores.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Tronco",
        accion: "Anti-rotación (el tirón unilateral genera rotación)",
        musculos:
          "Oblicuos, cuadrado lumbar y erectores espinales: estabilizadores (anti-rotación: anatomía, sin EMG directa).",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
      {
        articulacion: "Cadera y pies",
        accion: "Posición estable",
        musculos: "Glúteos: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "La variable es el porcentaje del peso sobre el brazo de trabajo y el brazo de palanca.",
        c: ["M"],
      },
      {
        t: 'Lo que la modifica: la inclinación del cuerpo (más horizontal = más peso del cuerpo sobre el brazo), el porcentaje de carga que se reparte con la otra mano ("asistido"), la altura o amplitud del recorrido y la supresión del apoyo contralateral.',
        c: ["M"],
      },
    ],
    siente: {
      pendiente:
        "La sección de OAR no tiene un bloque de dónde se siente. Los motores de la tabla articular no alcanzan para afirmarlo.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Rotación del tronco para alcanzar",
        porque: {
          t: "El tirón unilateral genera rotación y el tronco tiene que resistirla.",
          c: ["L1"],
        },
      },
      {
        error: "Hombro encogido",
        porque: {
          t: "La sección la lista como compensación habitual y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Cadera que cae",
        porque: {
          t: "La sección la lista como compensación habitual y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Codo que se abre",
        porque: {
          t: "La sección la lista como compensación habitual y no da el porqué.",
          c: [],
        },
      },
      {
        error: "La mano libre empuja",
        porque: {
          t: "Reparte la carga con la otra mano y cambia la variable del ejercicio (porcentaje del peso sobre el brazo de trabajo).",
          c: ["M"],
        },
      },
    ],
    cues: [
      { t: "Tirá con el codo hacia el bolsillo.", c: [] },
      { t: "Pelvis y costillas quietas, que el tronco no gire.", c: [] },
      { t: "Hombro lejos de la oreja.", c: [] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la parte interna o externa del codo.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en el pliegue anterior del codo con debilidad para girar la palma hacia arriba.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la parte de atrás del hombro al final de la remada.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor lumbar de un solo lado que persiste.", c: [] },
      },
    ],
    evidencia: {
      t: "No hay EMG de row a una mano. Lo único relacionado: la remada invertida mostró alta amplitud de dorsal ancho en un único estudio pequeño. El resto es anatomía de libro de texto.",
      c: [30, "L1"],
    },
    gestos: [
      "Row de pie",
      "Row inclinado (OH, OA)",
      "Row horizontal (OH, wide, archer)",
      "Row declinado (OH, OA)",
      "Búlgaro",
      "Typewriter",
    ],
    pendientes: [
      {
        pendiente:
          "Dónde se siente el ejercicio y el porqué de las compensaciones (salvo rotación del tronco y mano libre): la sección no los da.",
        quien: "fuente",
      },
      {
        pendiente:
          "La tabla articular dice solo glúteos sin distinguir mayor y medio: la investigación no lo precisa.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Remos con tu peso en escalones: de dos manos hacia uno solo, y cuanto más horizontal el cuerpo, más difícil. En todos tirás el pecho hacia el agarre con el tronco quieto.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Tirá con el codo hacia el bolsillo.",
      "Pelvis y costillas quietas, que el tronco no gire.",
      "Hombro lejos de la oreja.",
    ],
    errores: [
      {
        error: "El tronco gira para alcanzar",
        texto:
          "Cuando tirás más de un lado (arquero, un brazo), el tronco tiende a girar: tiene que quedarse quieto.",
      },
      {
        error: "La mano libre empuja",
        texto:
          "En el escalón de un brazo, si apoyás la otra mano repartís el peso: si la necesitás, quedate en el escalón anterior.",
      },
    ],
  },
} as const satisfies RutaContenido;
