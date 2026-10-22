import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de BRIDGE desde C2 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * Hombro en flexión máxima: empujan deltoides anterior, serrato y trapecio
 * (el coracobraquial no tiene id) mientras dorsal, pectoral y redondo mayor se
 * alargan. Cadera: glúteo mayor e isquios motores; iliopsoas y recto femoral
 * alargados. Los erectores y el cuadrado lumbar son sinergistas (extensión
 * torácica y lumbar). Sin estudios de rueda ni de bridge con carga (C2).
 * Fuera: pectoral menor y extensores de muñeca (sin id).
 */
export const BRIDGE = {
  code: "BRIDGE",
  slug: "bridge",
  patron: "MOVILIDAD",
  categoria: "Rangos",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "delt-ant",
        c: ["L1"],
        nota: "Empuje con el hombro en flexión máxima",
      },
      { m: "serrato", c: ["L1"], nota: "Rotación superior de la escápula" },
      {
        m: "trap-sup",
        c: ["L1"],
        nota: "Empuje; trapecio superior e inferior",
      },
      {
        m: "trap-inf",
        c: ["L1"],
        nota: "Empuje; trapecio superior e inferior",
      },
      { m: "triceps", c: [], nota: "Extensión de codo" },
      { m: "gluteo-mayor", c: [], nota: "Extensión de cadera" },
      { m: "isquios", c: [], nota: "Extensión de cadera" },
      { m: "vastos", c: [], nota: "Extensión de rodilla" },
    ],
    sinergista: [
      {
        m: "erectores",
        c: ["L1"],
        nota: "Extensión torácica y lumbar; la lumbar es la que se vende",
      },
      { m: "cuadrado", c: [], nota: "Extensión lumbar" },
    ],
    estabilizador: [{ m: "soleo", c: [], nota: "Rodilla y tobillo" }],
    antagonista: [],
    estira: [
      { m: "dorsal", c: ["L1"], nota: "Hombro en flexión máxima" },
      { m: "pectoral", c: ["L1"], nota: "Pectoral mayor y menor" },
      { m: "redondo", c: ["L1"], nota: "Hombro en flexión máxima" },
      {
        m: "antebrazo",
        c: [],
        nota: "Flexores de muñeca y dedos, con la muñeca en extensión máxima",
      },
      {
        m: "recto-abd",
        c: ["L1"],
        nota: "Columna torácica y lumbar en extensión",
      },
      { m: "psoas", c: [], nota: "Cadera en extensión" },
      { m: "recto-fem", c: [], nota: "Cadera en extensión" },
    ],
  },
  fichaProfe: {
    resumen: {
      t: "Puente de espalda (rueda): con manos y pies apoyados, el cuerpo hace un arco con el hombro en flexión máxima y extensión de columna torácica, lumbar y cadera. La lumbar es la que se vende si hombros, columna torácica y cadera no dan el rango.",
      c: [],
    },
    tipo: "Mixta (37 % isométrica), cadena cerrada (manos y pies fijos)",
    brazo: "Brazos rectos con el hombro en flexión (inferido)",
    escalones: {
      fuente: "ficha",
      pasos: [
        "Table",
        "Shoulder bridge",
        "Low bridge",
        "Mid bridge",
        "Full bridge",
      ],
    },
    fases: [
      {
        nombre: "Apoyo",
        texto: {
          t: "Acostado boca arriba, con pies y manos apoyados.",
          c: [],
        },
      },
      {
        nombre: "Empuje",
        texto: {
          t: "Concéntrico: extensión de codos, hombros flexionados y cadera extendida.",
          c: [],
        },
      },
      {
        nombre: "Pico",
        texto: {
          t: "Isométrico del arco: extensión de columna torácica, lumbar y cadera, hombro cerca de la flexión máxima y muñeca en extensión máxima.",
          c: [],
        },
      },
      {
        nombre: "Descenso",
        texto: { t: "Excéntrico.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Hombro (glenohumeral)",
        accion:
          "Flexión máxima (cerca de 180°) con escápula en rotación superior y báscula posterior, plano sagital y escapular",
        musculos:
          "Deltoides anterior, coracobraquial, serrato anterior y trapecio superior e inferior: motores (empuje). Dorsal ancho, pectoral mayor y menor y redondo mayor: se alargan.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Codo",
        accion: "Extensión, plano sagital",
        musculos: "Tríceps: motor.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: [],
      },
      {
        articulacion: "Muñeca",
        accion: "Extensión máxima (carga axial), plano sagital",
        musculos:
          "Flexores de muñeca y dedos: se alargan. Extensores: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Columna torácica",
        accion: "Extensión, plano sagital",
        musculos:
          "Erectores torácicos: sinergistas. Recto abdominal y pectorales: se alargan. El rango segmentario es limitado (costillas, apófisis espinosas).",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
      {
        articulacion: "Columna lumbar",
        accion: "Extensión, plano sagital",
        musculos:
          "Erectores lumbares y cuadrado lumbar: sinergistas. Recto abdominal y psoas: se alargan.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Cadera",
        accion: "Extensión, plano sagital",
        musculos:
          "Glúteo mayor e isquios: motores. Iliopsoas y recto femoral: se alargan.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: [],
      },
      {
        articulacion: "Rodilla y tobillo",
        accion: "Extensión de rodilla y dorsiflexión de tobillo",
        musculos: "Cuádriceps: motor. Sóleo: estabilizador.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Qué limita el rango, en orden de aparición habitual: (1) movilidad de hombro (flexión y escápula) y del dorsal ancho y el pectoral; (2) extensión torácica; (3) extensión de cadera (flexores); (4) extensión de muñeca; (5) la lumbar es la que se vende: si hombros, columna torácica y cadera no dan, el arco se concentra en 1 o 2 segmentos lumbares.",
        c: ["C", "L1"],
      },
      {
        t: "Progresa por altura y rango: table, shoulder, low, mid y full (más hombro, más extensión torácica y de cadera). La asimetría (a un brazo o una pierna) agrega control y rotación; el wall walk permite entrar y salir de forma gradual. La carga adicional no aplica.",
        c: [],
      },
      {
        t: "Acercar las manos a los pies aumenta la demanda de extensión.",
        c: ["C"],
      },
    ],
    siente: {
      t: "Se debería sentir hombro, pecho y cadera abriéndose y el glúteo activo; no un pinchazo en la zona lumbar.",
      c: [],
    },
    compensa: [
      {
        error: "Hiperextensión lumbar concentrada en L4-L5 y L5-S1",
        porque: {
          t: "Si hombros, columna torácica y cadera no dan el rango, el arco se concentra en 1 o 2 segmentos lumbares.",
          c: ["C"],
        },
      },
      {
        error: "Hombros cerrados (poca flexión) con los codos abiertos",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Cabeza colgando",
        porque: { t: "Carga la columna cervical.", c: [] },
      },
      {
        error: "Pies muy separados y rodillas en valgo o varo",
        porque: {
          t: "Se hace para compensar la falta de extensión de cadera.",
          c: ["C"],
        },
      },
      {
        error: "Muñecas con desviación radial o cubital forzada",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Pérdida del empuje del glúteo (cadera baja)",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Empujá el piso con manos y pies a la vez.", c: ["C"] },
      { t: "Llevá los hombros sobre las muñecas.", c: ["C"] },
      { t: "Glúteos activos: abrí la cadera, no la espalda.", c: ["C"] },
      { t: "Relajá el cuello.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor lumbar localizado que se reproduce al arquear, sobre todo en menores de 20 que entrenan extensión repetida.",
          c: [103],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor lumbar que baja a la pierna, adormecimiento o debilidad.",
          c: [96],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor del lado de atrás de la muñeca con carga o pérdida de extensión de la muñeca.",
          c: [31],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Mareo, visión borrosa u hormigueo en los brazos con la cabeza colgando: cortar el ejercicio.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor de muñeca que sigue al día siguiente (en adolescentes, derivar).",
          c: [31],
        },
      },
    ],
    evidencia: {
      t: "No hay estudios de rueda o bridge con carga lumbar en las fuentes leídas. Lo que hay es indirecto: la fractura por estrés de la parte posterior de una vértebra lumbar es más frecuente en deportes con carga repetida, extensión y rotación, compromete sobre todo L5 y suele diagnosticarse tarde (revisión narrativa de 50 trabajos); hasta 79 % de los gimnastas tienen dolor de muñeca por carga axial repetida y extensión forzada en esqueleto inmaduro; y en un push-up con hombros elevados cerca de 90° la escápula puede quedar en posición de pinzamiento (n=16), una condición distinta de la flexión completa del bridge (extrapolación débil) que sugiere cuidado con la carga de hombro en rangos extremos. Las banderas rojas lumbares tienen poca evidencia de exactitud diagnóstica individual: son un marco de razonamiento clínico, no un detector.",
      c: [103, 31, 102, 96, "C"],
    },
    gestos: [
      "Shoulder bridge",
      "Table",
      "Low, mid y full bridge",
      "Elbow bridge",
      "Wall bridge y wall walk",
      "Twist",
      "A un brazo (OL / one arm)",
      "Seal reps y seal push-up",
      "Cat-cow",
    ],
    pendientes: [
      {
        pendiente:
          "Población hiperlaxa o con antecedente de luxación en spagat y bridge: cómo detectarla sin pruebas clínicas y qué hacer (H7).",
        quien: "H",
      },
      {
        pendiente:
          "Menores y adolescentes: criterios de edad y carga para el bridge, y volumen de apoyo de muñeca (H8).",
        quien: "H",
      },
      {
        pendiente:
          "Estudios de rueda o bridge con carga lumbar: la investigación no los tiene; el cuidado sale de evidencia indirecta y de coaching.",
        quien: "fuente",
      },
      {
        pendiente:
          "Mecanismo de varias compensaciones (hombros cerrados, muñecas, pérdida de empuje del glúteo): la investigación las lista sin explicarlas.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "El puente de espalda: apoyás manos y pies en el piso y arqueás el cuerpo hacia arriba, abriendo hombros, pecho y cadera.",
    siente:
      "Hombros, pecho y cadera abriéndose, y los glúteos trabajando. En la zona baja de la espalda no tendrías que sentir un pinchazo.",
    tips: [
      "Empujá el piso con manos y pies a la vez.",
      "Glúteos activos: abrí la cadera, no la espalda.",
      "Relajá el cuello.",
    ],
    errores: [
      {
        error: "Arquear solo la espalda baja",
        texto:
          "Todo el arco se concentra ahí: abrí más los hombros y la cadera.",
      },
      {
        error: "Dejar la cabeza colgando",
        texto:
          "Se carga el cuello. Si te mareás o sentís hormigueo en los brazos, cortá y avisale a tu profe.",
      },
      {
        error: "Separar mucho los pies",
        texto:
          "Se hace para compensar la falta de apertura de cadera: tu profe te ayuda a corregirlo.",
      },
    ],
  },
} as const satisfies RutaContenido;
