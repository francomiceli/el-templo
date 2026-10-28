import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de MU desde S2.2 (tabla articular) + S8. Borrador
 * (D5). La fila columna/cadera de la tabla (kipping y hollow) no asigna un rol
 * por músculo, así que no se vuelca en las relaciones (ver SUMMARY del plan
 * 03). Las celdas sin marca llevan la que declara S2.2 para el resto del
 * análisis: anatomía L1 + coaching L3.
 */
export const MU = {
  code: "MU",
  slug: "muscle-up",
  patron: "PULL",
  categoria: "Pull vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "trap-inf", c: ["L1"], nota: "Tirón" },
      { m: "romboides", c: ["L1"], nota: "Tirón; trapecio medio" },
      { m: "serrato", c: ["L1"], nota: "Transición y soporte" },
      { m: "dorsal", c: ["L1", "R"], nota: "Tirón" },
      { m: "redondo", c: ["L1", "R"], nota: "Tirón" },
      { m: "pectoral", c: ["L1", "R"], nota: "Esternal; tirón y empuje" },
      { m: "delt-post", c: ["L1", "R"], nota: "Tirón" },
      { m: "delt-ant", c: ["L1", "R"], nota: "Empuje" },
      { m: "triceps", c: ["L1", 2], nota: "Empuje" },
      { m: "biceps", c: ["L1", 2], nota: "Tirón" },
      { m: "braquial", c: ["L1", 2], nota: "Tirón; con el braquiorradial" },
      {
        m: "antebrazo",
        c: ["C"],
        nota: "Falso agarre: isométrico todo el elemento",
      },
    ],
    sinergista: [],
    estabilizador: [
      { m: "trap-sup", c: ["L1"] },
      { m: "manguito", c: ["L1", "R"] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Pasar de colgado a soporte arriba de la barra o las anillas con los brazos extendidos: tirón explosivo, transición (el cuerpo pasa de debajo a encima del agarre) y empuje.",
      c: ["L1", "L3"],
    },
    tipo: "Dinámica (13 % isométrica)",
    brazo: "Brazo flexionado (BAS) 54 · recto (SAS) 1",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Colgado",
        texto: {
          t: "Colgado con falso agarre (muñeca flexionada sobre el aro o la barra).",
          c: ["L1", "L3"],
        },
      },
      {
        nombre: "Tirón",
        texto: {
          t: 'Tirón explosivo ("high pull"): extensión de hombro + flexión de codo; el aro o la barra llega al esternón o al abdomen.',
          c: ["L1", "L3"],
        },
      },
      {
        nombre: "Transición",
        texto: {
          t: "El cuerpo pasa de debajo a encima del agarre: los codos van hacia atrás y luego adelante, y los hombros pasan por delante de las manos.",
          c: ["L1", "L3"],
        },
      },
      {
        nombre: "Empuje",
        texto: {
          t: "Empuje (dip) hasta el soporte con los brazos extendidos.",
          c: ["L1", "L3"],
        },
      },
      {
        nombre: "Descenso",
        texto: { t: "Descenso controlado (inversa).", c: ["L1", "L3"] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Escápula (escapulotorácica)",
        accion:
          "Tirón: depresión + retracción + rotación hacia abajo. Transición: protracción + inclinación anterior. Soporte: depresión + protracción moderada.",
        musculos:
          "Trapecio inferior, trapecio medio y romboides (tirón): motores. Serrato anterior y pectoral menor (transición y soporte): motores / sinergistas. Trapecio superior: estabilizador.",
        contraccion:
          "Tirón: concéntrica. Transición: concéntrica del serrato. Soporte: isométrica.",
        c: ["L1"],
      },
      {
        articulacion: "Hombro (glenohumeral)",
        accion:
          "Tirón: extensión (y aducción si el agarre es ancho) desde flexión máxima. Transición: el tronco pasa por encima de las manos y el hombro va hacia extensión máxima + rotación interna (el punto de mayor estrés anterior). Empuje: flexión de hombro desde la hiperextensión hasta neutro, junto con la extensión de codo.",
        musculos:
          "Tirón: dorsal ancho, redondo mayor, pectoral mayor esternal y deltoides posterior. Empuje: pectoral mayor, deltoides anterior y tríceps. Manguito rotador: estabilizador.",
        contraccion:
          "Tirón: concéntrica. Transición: excéntrica → isométrica en el punto bajo. Empuje: concéntrica. Descenso: excéntrica.",
        c: ["L1", "R"],
      },
      {
        articulacion: "Codo",
        accion: "Flexión intensa (tirón) → extensión (empuje)",
        musculos:
          "Bíceps, braquial y braquiorradial (tirón): motores. Tríceps (empuje): motor.",
        contraccion:
          "Tirón: concéntrica. Empuje: concéntrica. Descenso: excéntrica (en el pull-up, el EMG medio concéntrico fue mayor que el excéntrico para braquiorradial, bíceps y pectoral mayor).",
        c: ["L1", 2],
      },
      {
        articulacion: "Muñeca",
        accion:
          "Falso agarre: flexión con desviación cubital sostenida (la desviación no está confirmada)",
        musculos: "Flexores de muñeca y dedos: motores isométricos.",
        contraccion: "Isométrica durante todo el elemento.",
        c: ["C", "H"],
      },
      {
        articulacion: "Columna y cadera",
        accion:
          'Kipping: extensión → flexión de cadera ("swing"). Estricto: hollow rígido.',
        musculos:
          "Glúteo e isquiotibiales (fase de arco); iliopsoas, recto femoral y abdomen (golpe de cadera); recto abdominal y oblicuo externo (hollow).",
        contraccion: "Concéntrica en el kip; isométrica en el estricto.",
        c: ["L1"],
      },
    ],
    progresa: [
      {
        t: "La variable es cuánta energía viene del cuerpo (kip) y cuánta del músculo, la altura que debe alcanzar el tirón antes de la transición y la inestabilidad (las anillas se mueven; con barra el recorrido es fijo).",
        c: ["L1", "L3"],
      },
      {
        t: "Escalones del catálogo: transición asistida, kipping, estricto, lento, ancho, archer, lastrado.",
        c: ["L1", "L3"],
      },
      {
        t: 'El "slow" alarga el tiempo bajo tensión en el punto de transición (el de menor ventaja mecánica).',
        c: ["M"],
      },
    ],
    siente: {
      pendiente:
        "La sección de MU no tiene un bloque de dónde se siente. Los motores de la tabla articular no alcanzan para afirmarlo.",
      quien: "fuente",
    },
    compensa: [
      {
        error:
          "Chicken wing: un codo se adelanta o se abre y el otro se retrasa en la transición (a veces con un codo muy flexionado)",
        porque: {
          t: "Compensa un déficit de fuerza o de movilidad de un hombro.",
          c: ["C"],
        },
      },
      {
        error: "Tirón bajo (no llegan al esternón)",
        porque: {
          t: "La transición exige más desde un ángulo débil.",
          c: ["L1", "L3"],
        },
      },
      {
        error: "Pérdida del falso agarre o muñeca que se abre",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Hombros encogidos en la salida",
        porque: {
          t: "El trapecio superior trabaja en lugar de la depresión escapular.",
          c: ["L1", "L3"],
        },
      },
    ],
    cues: [
      { t: "Tirá hacia las caderas, no hacia arriba.", c: ["L3"] },
      { t: "Codos pegados y juntos al pasar.", c: ["L3"] },
      { t: "Llevá los hombros por encima de las manos.", c: ["L3"] },
      {
        t: "Pasá rápido y controlado por el punto bajo: bajá solo hasta donde puedas empujar sin que el hombro se vaya hacia adelante.",
        c: ["L3"],
      },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor anterior de hombro o chasquido doloroso en la transición. Un estudio de cinemática (11 hombres sanos, sin lesiones medidas) señala más riesgo con agarres anchos y movimientos dinámicos tipo kipping, por la elevación alta del brazo.",
          c: [1],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la parte interna o externa del codo con la transición.",
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
          t: "Dolor en la cara palmar de la muñeca con el falso agarre.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Hormigueo en la mano.", c: [] },
      },
    ],
    evidencia: {
      t: "Evidencia directa: una sola EMG (10 hombres activos). En anillas el muscle-up exige más trapecio superior, bíceps y flexores de antebrazo en el tirón, y más tríceps y bíceps en el empuje, que en barra; los estabilizadores del hombro no cambiaron y los autores sugieren aprender primero en barra (señalada por la revisión, leída solo por el revisor). En pull-ups, que no son MU, el pico de activación empezó por trapecio inferior y pectoral mayor y terminó con bíceps y dorsal ancho. El resto es anatomía funcional y coaching.",
      c: [37, 3, "L1", "L3"],
    },
    gestos: [
      "Muscle up en barra",
      "Muscle up en anillas",
      "Estricto y kipping (swing kipping MU bar)",
      "Falso agarre",
      "Standing muscle up inclinado",
      "Transición asistida (bottom dip rack, assisted kip MU rack)",
      "Archer y lastrado",
    ],
    pendientes: [
      {
        pendiente:
          "Posición de la muñeca en el falso agarre (flexión y qué desviación) y su carga cubital: la desviación cubital no está confirmada.",
        quien: "H",
      },
      {
        pendiente:
          "Dónde se siente el ejercicio y el porqué de la compensación pérdida del falso agarre: la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Pasar de colgado a quedar arriba de la barra (o las anillas) con los brazos estirados: primero tirás, después pasás por encima y empujás.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Tirá hacia las caderas, no hacia arriba.",
      "Codos pegados y juntos al pasar.",
      "Llevá los hombros por encima de las manos.",
    ],
    errores: [
      {
        error: "Un codo se abre y el otro se atrasa",
        texto:
          "Suele pasar por falta de fuerza o de movilidad en un hombro: avisale a tu profe.",
      },
      {
        error: "Tirón bajo",
        texto: "Pasar por encima se hace más difícil desde ahí.",
      },
      {
        error: "Hombros encogidos al salir",
        texto:
          "Trabaja la parte de arriba del hombro en lugar de bajar los hombros.",
      },
    ],
  },
} as const satisfies RutaContenido;
