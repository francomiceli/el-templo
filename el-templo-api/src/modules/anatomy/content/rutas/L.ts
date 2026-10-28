import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de L desde A1 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * A1 declara "roles [L1][L2]" para toda la tabla: las celdas sin marca propia
 * llevan esas dos. Los gemelos no aparecen: la tabla nombra "sóleo y
 * gastrocnemio EXC controlan" sin dar un rol y TI-H solo lista el sóleo (S/Est);
 * el sóleo queda como estabilizador y el gemelo fuera (pendiente de fuente).
 * El recto femoral es motor (rodilla delantera, "vastos + recto femoral"); en
 * la pierna de atrás se alarga.
 */
export const L = {
  code: "L",
  slug: "lunge",
  patron: "LOWER",
  categoria: "Rodilla dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "gluteo-mayor", c: ["L1", "L2"], nota: "Cadera delantera" },
      {
        m: "vastos",
        c: ["L1", "L2"],
        nota: "Rodilla delantera: excéntrico al bajar, concéntrico al subir",
      },
      {
        m: "recto-fem",
        c: ["L1", "L2"],
        nota: "Rodilla delantera; en la pierna de atrás se alarga y limita el rango",
      },
    ],
    sinergista: [
      {
        m: "aductores",
        c: ["L1", "L2"],
        nota: "Aductor mayor, fibras isquiocondíleas",
      },
      {
        m: "isquios",
        c: ["L1", "L2", 68],
        nota: "En la fase concéntrica la relación bíceps femoral / mediales fue alta",
      },
    ],
    estabilizador: [
      {
        m: "gluteo-medio",
        c: ["L1", "L2"],
        nota: "Control frontal de la cadera delantera; contralateral en la pelvis",
      },
      { m: "tibial", c: ["L1", "L2"], nota: "Tobillo delantero" },
      {
        m: "soleo",
        c: ["L1", "L2"],
        nota: "Controla en excéntrico la dorsiflexión (TI-H: sinergista / estabilizador)",
      },
      { m: "erectores", c: ["L1", "L2"], nota: "Pelvis y lumbar: neutro" },
      { m: "oblicuos", c: ["L1", "L2"], nota: "Pelvis y lumbar: neutro" },
      { m: "cuadrado", c: ["L1", "L2"], nota: "Pelvis y lumbar: neutro" },
    ],
    antagonista: [],
    estira: [
      {
        m: "psoas",
        c: ["L1", "L2"],
        nota: "Cadera trasera: se alarga y limita el rango (más en la búlgara)",
      },
    ],
  },
  fichaProfe: {
    resumen: {
      t: "Zancada: el cuádriceps y el glúteo mayor de la pierna de adelante hacen el trabajo. La pierna de atrás queda con la cadera en extensión y sus flexores de cadera se alargan y limitan el rango, más en la búlgara.",
      c: ["L1", "L2", "C"],
    },
    tipo: "Sin dato (inferido: dinámica), cadena cerrada",
    brazo: null,
    escalones: {
      pendiente:
        "La sección da variables de progresión (rango, asistencia, elevación del pie de atrás, largo del paso, carga, salto), no una escalera de pasos única: falta la lista de escalones.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Apoyo y carga",
        texto: {
          t: "Se apoya y se carga la pierna de adelante. La pierna de atrás queda con la cadera en extensión y la rodilla flexionada.",
          c: [],
        },
      },
      {
        nombre: "Descenso",
        texto: { t: "Excéntrico.", c: [] },
      },
      {
        nombre: "Fondo",
        texto: {
          t: "Isométrico breve, con la rodilla de atrás cerca del suelo.",
          c: [],
        },
      },
      {
        nombre: "Ascenso",
        texto: { t: "Concéntrico.", c: [] },
      },
      {
        nombre: "Reposición",
        texto: { t: "Se vuelve a la posición de partida.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Cadera delantera",
        accion: "Flexión → extensión (plano sagital)",
        musculos:
          "Glúteo mayor: motor. Aductor mayor (fibras isquiocondíleas) e isquios: sinergistas (en la zancada la relación bíceps femoral / mediales fue alta en la fase concéntrica). Recto femoral: antagonista relativo.",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: ["L1", "L2", 68],
      },
      {
        articulacion: "Cadera delantera",
        accion:
          "Control de aducción-abducción y rotación (planos frontal y transversal)",
        musculos:
          "Glúteo medio y menor y tensor de la fascia lata: estabilizadores.",
        contraccion: "Isométrica-excéntrica en todo el recorrido.",
        c: ["L1", "L2"],
      },
      {
        articulacion: "Cadera trasera",
        accion: "Extensión, con alargamiento de los flexores (plano sagital)",
        musculos:
          "Iliopsoas y recto femoral alargados: limitan el rango, más aún en la búlgara. Glúteo mayor: estabilizador.",
        contraccion: "Excéntrica leve / isométrica / concéntrica leve.",
        c: ["L1", "L2", "C"],
      },
      {
        articulacion: "Rodilla delantera",
        accion: "Flexión → extensión (plano sagital)",
        musculos:
          "Cuádriceps (vastos y recto femoral): motor. Isquios: antagonistas co-activos.",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: ["L1", "L2"],
      },
      {
        articulacion: "Rodilla trasera",
        accion: "Flexión mantenida (plano sagital)",
        musculos:
          "Cuádriceps de atrás: estabilizador (el recto femoral queda alargado con la cadera en extensión y la rodilla flexionada).",
        contraccion: "Isométrica-excéntrica.",
        c: ["L1", "L2"],
      },
      {
        articulacion: "Tobillo delantero",
        accion: "Dorsiflexión, con avance de la tibia (plano sagital)",
        musculos:
          "Sóleo y gastrocnemio controlan en excéntrico. Tibial anterior: estabilizador.",
        contraccion:
          "Excéntrica / isométrica / concéntrica (plantiflexión al empujar).",
        c: ["L1", "L2"],
      },
      {
        articulacion: "Pelvis y lumbar",
        accion: "Neutro: se evita la rotación y la báscula (todos los planos)",
        musculos:
          "Erectores espinales, oblicuos y cuadrado lumbar: estabilizadores. Glúteo medio contralateral: estabilizador.",
        contraccion: "Isométrica.",
        c: ["L1", "L2"],
      },
    ],
    progresa: [
      {
        t: "Rango: parcial, completa, profunda. La profundidad sube el momento y el esfuerzo relativo del extensor de rodilla.",
        c: [46],
      },
      {
        t: "Asistencia con mano o banda: resta carga.",
        c: [],
      },
      {
        t: "Elevación del pie de atrás: aumenta el recorrido y la carga unilateral.",
        c: [51],
      },
      {
        t: "Largo del paso: desplaza la demanda entre rodilla y cadera.",
        c: [40, 45],
      },
      { t: "Carga externa (W).", c: [] },
      { t: "Salto (pliometría).", c: [] },
      {
        t: "Heel up: quita demanda de dorsiflexión y adelanta la rodilla.",
        c: ["C"],
      },
    ],
    siente: {
      t: "Cuádriceps y glúteo del lado de adelante. En la búlgara, también se siente el flexor de cadera y el cuádriceps de atrás estirándose.",
      c: [],
    },
    compensa: [
      {
        error: "Rodilla de adelante hacia adentro (valgo)",
        porque: {
          t: "Falla el control del plano frontal. La hipótesis de trabajo es que depende del control proximal (cadera y pelvis) y distal (tobillo y pie).",
          c: [59],
        },
      },
      {
        error: "Talón de adelante que despega",
        porque: {
          t: "Dorsiflexión de tobillo limitada.",
          c: [54, 55],
        },
      },
      {
        error: "Tronco que cae adelante",
        porque: {
          t: "Cambia la demanda hacia la cadera: no siempre es un error.",
          c: [52],
        },
      },
      {
        error: "Lumbar en hiperextensión con la pelvis en anteversión",
        porque: {
          t: "Pasa cuando el flexor de cadera de la pierna de atrás es corto.",
          c: ["C"],
        },
      },
      {
        error: "Pelvis que rota hacia el lado de adelante",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: ["C"],
        },
      },
      {
        error: "Pasos que cruzan la línea media y estrechan la base",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: ["C"],
        },
      },
    ],
    cues: [
      { t: "Pie entero en el piso, tres puntos.", c: ["C"] },
      { t: "Bajá la cadera derecho, como en un ascensor.", c: ["C"] },
      { t: "Costillas sobre la pelvis.", c: ["C"] },
      {
        t: "La rodilla de adelante sigue la dirección del segundo dedo.",
        c: ["C"],
      },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la parte delantera de la rodilla que persiste o aparece al bajar escaleras o cargar.",
          c: [59],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Rodilla que se traba, falla o se hincha después de entrenar.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la punta de abajo de la rótula con saltos.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor profundo en la ingle al flexionar mucho la cadera.",
          c: [94, 95],
        },
      },
    ],
    evidencia: {
      t: "Búlgara (35 % de 1RM) frente a sentadilla trasera (70 % de 1RM), n=20 hombres: ambas con más momento neto en la cadera que en la rodilla o el tobillo, y la búlgara bajó la demanda de rodilla. Búlgara con el tronco flexionado: más glúteo mayor, bíceps femoral y recto femoral (n=21 mujeres). Zancada y step-up lateral: más de 45 % de MVIC en el vasto medial oblicuo (n=30). Paso largo frente a corto, con peso corporal: más fuerza patelofemoral con el largo entre 10° y 40° de flexión y con el corto entre 50° y 100°; la zancada estacionaria carga menos la rótula que la zancada en movimiento. La sentadilla monopodal dio más activación excéntrica de cuádriceps que la zancada frontal y que la búlgara (n=23). Rodilla dominante o cadera dominante es una etiqueta de patrón, no de cinética medida: una búlgara cargada puede ser más de cadera que de rodilla.",
      c: [51, 52, 25, 40, 53],
    },
    gestos: [
      "Zancada: parcial y asistida, hacia atrás (back), deep y shuffle",
      "Búlgara (con peso y con salto)",
      "Heel up",
      "Lunge jump",
    ],
    pendientes: [
      {
        pendiente:
          "Umbral de tiempo (2 a 3 semanas) para el dolor de rodilla que persiste, y cómo distinguirlo del dolor muscular tardío: lo fija un kinesiólogo humano.",
        quien: "H",
      },
      {
        pendiente:
          "Criterios de edad y carga para los saltos en menores y adolescentes.",
        quien: "H",
      },
      {
        pendiente:
          "Confirmar qué significan 'LS' (inferido: lunge o split squat) y 'shuffle' en el catálogo.",
        quien: "N",
      },
      {
        pendiente:
          "Porqué de la pelvis que rota hacia el lado de adelante y de los pasos que cruzan la línea media: la investigación solo los lista como compensaciones.",
        quien: "fuente",
      },
      {
        pendiente:
          "Escalones de la progresión: la sección da variables, no una lista de pasos.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Un paso largo y bajar con control, con una pierna adelante y la otra atrás.",
    siente:
      "Muslo y glúteo de la pierna de adelante. En la búlgara, también el frente de la cadera y el muslo de la pierna de atrás estirándose.",
    tips: [
      "Pie entero en el piso, tres puntos.",
      "Bajá la cadera derecho, como en un ascensor.",
      "Costillas sobre la cadera.",
    ],
    errores: [
      {
        error: "Rodilla de adelante hacia adentro",
        texto:
          "Se pierde el control de la cadera. Llevala en la dirección del segundo dedo del pie.",
      },
      {
        error: "Talón de adelante que se levanta",
        texto:
          "Falta movilidad de tobillo. Avisale a tu profe y te da una variante.",
      },
      {
        error: "Tronco que cae adelante",
        texto:
          "Pasa más trabajo a la cadera. No siempre es un error: consultale a tu profe.",
      },
    ],
  },
} as const satisfies RutaContenido;
