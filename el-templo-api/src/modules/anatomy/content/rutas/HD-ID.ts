import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de HD/ID desde S4.2 (tabla articular) + S8. Borrador
 * (D5). Siglas HD/ID abiertas para Nacho (⚑N, D1): la expansión no está en la
 * DB y se trata como "Fondos (Dips)".
 *
 * Evidencia directa: [8] (dip en banco, barra y anillas, n = 13). Celdas sin
 * marca propia: []. Filas "Est/M" y "Ant/Est": rol más alto (regla 6).
 */
export const HD_ID = {
  code: "HD/ID",
  slug: "fondos",
  patron: "PUSH",
  categoria: "Push horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "pectoral",
        c: ["L1"],
        nota: "Esternal; invierte su acción según el ángulo",
      },
      { m: "delt-ant", c: ["L1"] },
      { m: "dorsal", c: ["L1"], nota: "Control en el fondo" },
      {
        m: "triceps",
        c: [8],
        nota: "El estudio no dice qué cabeza; pico menor en banco que en barra y anillas",
      },
      {
        m: "trap-inf",
        c: ["L1"],
        nota: "Isométrico y concéntrico al bloquear",
      },
      { m: "serrato", c: ["L1"], nota: "Isométrico y concéntrico al bloquear" },
    ],
    sinergista: [],
    estabilizador: [
      { m: "manguito", c: ["L1"] },
      { m: "biceps", c: [8], nota: "Antagonista y estabilizador en el codo" },
      { m: "antebrazo", c: ["L1"], nota: "Flexores y extensores de muñeca" },
      { m: "recto-abd", c: [] },
      { m: "oblicuos", c: [] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Fondos (Dips) en paralelas, anillas o barra: se baja con flexión de codo y extensión de hombro y se sube con extensión de codo y retorno del hombro a neutro. La expansión de la sigla HD/ID no está en la base y se trata como 'Fondos (Dips)'.",
      c: [],
    },
    tipo: "Mixta (24 % isométrica)",
    brazo: "Brazo flexionado (BAS) 67",
    escalones: {
      pendiente:
        "La sección lista variables de progresión (peso, rango de hombro, estabilidad, trayectoria del torso, reparto unilateral), no una escalera ordenada de escalones.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Soporte superior",
        texto: {
          t: "Brazos extendidos, escápulas deprimidas.",
          c: [],
        },
      },
      {
        nombre: "Descenso",
        texto: {
          t: "Excéntrico: flexión de codo y extensión de hombro (húmero hacia atrás del tronco).",
          c: [],
        },
      },
      {
        nombre: "Fondo",
        texto: {
          t: "Hombro en extensión máxima, codos a 90° o más.",
          c: [],
        },
      },
      {
        nombre: "Ascenso",
        texto: {
          t: "Concéntrico: extensión de codo y retorno del hombro a neutro.",
          c: [],
        },
      },
      {
        nombre: "Bloqueo final",
        texto: { t: "Escápulas deprimidas / protraídas.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Hombro (glenohumeral)",
        accion:
          "Descenso: extensión de hombro (sagital). Ascenso: flexión desde la hiperextensión + aducción horizontal.",
        musculos:
          "Pectoral mayor (esternal; invierte su acción según el ángulo), deltoides anterior y dorsal ancho (control en el fondo): motores / sinergistas. Manguito rotador: estabilizador.",
        contraccion:
          "Descenso: excéntrica. Fondo: isométrica. Ascenso: concéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Escápula (escapulotorácica)",
        accion:
          "Depresión + protracción leve en el soporte; en el fondo, tendencia a elevar.",
        musculos:
          "Trapecio inferior, pectoral menor y serrato anterior: estabilizadores / motores.",
        contraccion: "Isométrica; concéntrica al bloquear.",
        c: ["L1"],
      },
      {
        articulacion: "Codo",
        accion: "Flexión → extensión",
        musculos:
          "Tríceps braquial: motor (el estudio no dice qué cabeza). Pico medio de tríceps: banco 0,83 ± 0,34 mV, barra 1,04 ± 0,27 y anillas 1,05 ± 0,40 mV. El fondo en banco trabaja sobre todo el tríceps, pero con menos activación pico que barra y anillas, y con más extensión de hombro. Bíceps: antagonista / estabilizador.",
        contraccion: "Descenso: excéntrica. Ascenso: concéntrica.",
        c: [8],
      },
      {
        articulacion: "Muñeca",
        accion: "Extensión + soporte",
        musculos: "Flexores y extensores: estabilizadores.",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
      {
        articulacion: "Tronco",
        accion: "Rígido, con ligera inclinación según la variante",
        musculos: "Recto abdominal y oblicuo externo: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Porcentaje del peso: piernas apoyadas en un cajón → piernas libres.",
        c: [],
      },
      {
        t: "Rango de extensión de hombro: dip corto → profundo; Korean y supine, con las manos detrás del cuerpo, son el rango extremo.",
        c: [],
      },
      {
        t: "Estabilidad: barra única → paralelas → anillas.",
        c: [8],
      },
      {
        t: "Trayectoria e inclinación del torso: protracted es un empuje con protracción escapular. El detalle de Russian está por confirmar con los profes.",
        c: [],
      },
      { t: "Reparto unilateral: archer.", c: [] },
      {
        t: "El dip en banco requiere mayor extensión de hombro; el dip en barra es una progresión apropiada desde el banco por sus mayores picos de activación; los dips en anillas tuvieron picos similares a la barra, con tres músculos que aumentaron su intensidad (el abstract no dice cuáles). El estudio concluye con implicancias para personas con historia de dolor o lesión de hombro: la selección de variante importa.",
        c: [8],
      },
      {
        t: "Los detalles de cada variante nombrada (Bulgarian, Hungarian, impossible) no están definidos en la base.",
        c: [],
      },
    ],
    siente: {
      pendiente:
        "La sección de HD/ID no tiene un bloque de dónde se siente. Los motores de la tabla articular no alcanzan para afirmarlo.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Hombros encogidos en el fondo ('orejas al hombro')",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Codos que se abren",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Excesiva profundidad",
        porque: {
          t: "Hay deslizamiento anterior de la cabeza del húmero.",
          c: ["C"],
        },
      },
      {
        error: "Cuello adelantado",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Caderas colgando sin control",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Hombros lejos de las orejas, arriba y abajo.", c: [] },
      { t: "Codos cerca del cuerpo.", c: [] },
      {
        t: "Bajá hasta donde mantengas el pecho abierto sin que el hombro se vaya adelante.",
        c: [],
      },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: { t: "Dolor anterior de hombro en el fondo.", c: [] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor localizado justo en la unión de la clavícula con el hombro o con el esternón.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Hormigueo en el brazo.", c: [] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor de codo en la parte de atrás (tríceps) o en la parte interna.",
          c: [],
        },
      },
      {
        nivel: "urgencia",
        texto: {
          t: "Dolor súbito en el pecho o la axila durante un fondo (sobre todo profundo, negativo o lastrado), con o sin chasquido, y después moretón o cambio de forma del pliegue de la axila: cortar y derivar el mismo día. Hay al menos un caso publicado en un atleta de calistenia (el abstract no dice en qué ejercicio).",
          c: [38],
        },
      },
    ],
    evidencia: {
      t: "Evidencia directa: comparación de dip en banco, barra y anillas en 13 varones experimentados.",
      c: [8],
    },
    gestos: [
      "Dips en paralelas",
      "Dips en anillas",
      "Dip en barra",
      "Russian dip",
      "Korean dip",
      "Bulgarian dip",
      "Hungarian dip",
      "Archer dip",
      "Impossible dip",
      "Supine dip",
      "Protracted dip",
      "Hefesto / Pelican",
    ],
    pendientes: [
      {
        pendiente:
          "Expansión de la sigla HD/ID (hipótesis no verificada: Horizontal Dip / Incline Dip) y nombre oficial de la ruta: la TV la llama 'Hefesto / Impossible Dips'.",
        quien: "N",
      },
      {
        pendiente:
          "Definir con el ejercicio a la vista Russian (suele ser el fondo que baja a apoyar los antebrazos, no verificado), Korean, Bulgarian, Hungarian, impossible, supine, protracted, Pelican y Hefesto.",
        quien: "N",
      },
      {
        pendiente:
          "De qué ejercicios se compone cada variante de fondos (Hefesto, Russian, Korean, Bulgarian, Hungarian, impossible): un error de definición invalida los músculos de ese gesto.",
        quien: "H",
      },
      {
        pendiente:
          "Dónde se siente el ejercicio, el porqué de las compensaciones (hombros encogidos, codos que se abren, cuello adelantado, caderas colgando) y una escalera ordenada de escalones: la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Fondos en paralelas, anillas o barra: te sostenés con los brazos estirados, bajás doblando los codos y subís empujando.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Hombros lejos de las orejas, arriba y abajo.",
      "Codos cerca del cuerpo.",
      "Bajá hasta donde mantengas el pecho abierto sin que el hombro se vaya adelante.",
    ],
    errores: [
      {
        error: "Hombros encogidos en el fondo",
        texto: "Alejá los hombros de las orejas, arriba y abajo.",
      },
      {
        error: "Codos que se abren",
        texto: "Llevalos cerca del cuerpo.",
      },
      {
        error: "Bajar demasiado",
        texto:
          "El hombro se va hacia adelante: bajá solo hasta donde el pecho siga abierto.",
      },
    ],
  },
} as const satisfies RutaContenido;
