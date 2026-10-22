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
  fichaProfe: {
    resumen: {
      t: "Ruta heterogénea: la sección la trata en cuatro grupos por separado (nordic, bisagra, jefferson curl y elevaciones de gemelos). El nordic es un excéntrico de isquios sobre la rodilla; la bisagra es cadera dominante con glúteo mayor; el jefferson es flexión de columna cargada; las elevaciones cargan gastrocnemio y sóleo.",
      c: [],
    },
    tipo: "Sin dato (NC puro = excéntrico/mixto), cadena cerrada",
    brazo: null,
    escalones: {
      pendiente:
        "La sección da variables de progresión por gesto (asistencia, amplitud, carga, una pierna, excéntrico lento), no una escalera de pasos única para la ruta heterogénea: falta la lista de escalones.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Nordic · Arrodillado",
        texto: {
          t: "Arrodillado, tobillos fijos, cuerpo rígido (cadera extendida, columna neutra).",
          c: [],
        },
      },
      {
        nombre: "Nordic · Caída",
        texto: {
          t: "Caída hacia adelante con control excéntrico de los isquios sobre la rodilla (la gravedad ejerce un momento extensor sobre la rodilla).",
          c: [],
        },
      },
      {
        nombre: "Nordic · Pérdida de control",
        texto: {
          t: "Punto donde se pierde el control: se suelta y se amortigua con las manos.",
          c: [],
        },
      },
      {
        nombre: "Nordic · Retorno",
        texto: {
          t: "Ayudado por los brazos en el nivel básico; concéntrico de los isquios en los niveles altos.",
          c: [],
        },
      },
      {
        nombre: "Bisagra",
        texto: {
          t: "Parado o apoyado; bajada excéntrica (la cadera flexiona por inclinación pélvica, rodilla en leve flexión, columna neutra); fondo isométrico; extensión concéntrica; bloqueo. Incluye deadlift, good morning, deadlift a una pierna y deadlift to clean.",
          c: [],
        },
      },
      {
        nombre: "Jefferson curl",
        texto: {
          t: "Flexión vertebral segmentaria lenta con carga, de pie, hasta que el tronco cuelga. Incluye variantes a una pierna, con slantboard y deep squat to jefferson.",
          c: [],
        },
      },
      {
        nombre: "Elevaciones de gemelos",
        texto: {
          t: "Concéntrico al subir y excéntrico al bajar.",
          c: ["L1", "R"],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Nordic · Rodilla",
        accion:
          "Extensión pasiva por gravedad (hacia adelante) con freno de los flexores, plano sagital",
        musculos:
          "Bíceps femoral (largo y corto), semitendinoso y semimembranoso: motores en excéntrico. Gastrocnemio, grácil y sartorio: sinergistas.",
        contraccion: "Excéntrica; concéntrica si el retorno es propio.",
        c: [],
      },
      {
        articulacion: "Nordic · Cadera",
        accion: "Neutra mantenida (extensión isométrica)",
        musculos:
          "Glúteo mayor, aductor mayor e isquios largos: estabilizadores isométricos.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Nordic · Columna lumbar y pelvis",
        accion: "Neutro; evita hiperextensión y quiebre en la cadera",
        musculos: "Erectores y abdominales: estabilizadores isométricos.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Nordic · Tobillo",
        accion: "Fijo (plantiflexión leve)",
        musculos:
          "El peso o el ancla fija el tobillo. Gastrocnemio: sinergista.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Bisagra · Cadera",
        accion: "Flexión → extensión en plano sagital",
        musculos:
          "Glúteo mayor: motor. Isquios y aductor mayor: sinergistas (largos en el fondo).",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: [],
      },
      {
        articulacion: "Bisagra · Rodilla",
        accion: "Flexión leve, fija",
        musculos:
          "Isquios: estabilizadores o sinergistas. Cuádriceps: estabilizador.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Bisagra · Lumbar",
        accion: "Neutro",
        musculos:
          "Erectores: estabilizadores isométricos (alto en la bisagra). Abdominales: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Bisagra · Tobillo",
        accion: "Dorsiflexión leve",
        musculos: "Sóleo: estabilizador.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Bisagra a una pierna · Cadera",
        accion: "Estabilidad frontal",
        musculos: "Glúteo medio y menor: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Elevaciones de gemelos · Tobillo",
        accion: "Plantiflexión",
        musculos:
          "De pie con la rodilla extendida: gastrocnemio y sóleo, motores. Con la rodilla flexionada (sentado, soleo squat, horse stance) el gastrocnemio queda acortado y aporta menos, así que predomina el sóleo.",
        contraccion: "Concéntrica al subir, excéntrica al bajar.",
        c: ["L1", "R"],
      },
      {
        articulacion: "Horse stance · Cadera y tobillo",
        accion: "Base ancha",
        musculos:
          "Momento de dorsiflexión de tobillo y mayor demanda de aductores y rotadores.",
        contraccion: "Isométrica.",
        c: [43, "C"],
      },
    ],
    progresa: [
      {
        t: "Nordic: cuanto más horizontal el cuerpo, mayor el brazo de momento de la gravedad sobre la rodilla (física).",
        c: ["C"],
      },
      {
        t: "Nordic: se progresa recortando asistencia (banda, manos, rango parcial 'BENT'), aumentando amplitud, carga (W), pasando a una pierna (OL) y retardando el excéntrico.",
        c: [],
      },
      {
        t: "Nordic BENT: la flexión de cadera reduce el brazo de palanca.",
        c: ["C"],
      },
      {
        t: "Primera sesión de nordic: volumen bajo. Con 24 repeticiones en hombres entrenados el daño y el dolor son medibles, y los volúmenes altos y crecientes dan más dolor.",
        c: [71, 72],
      },
      {
        t: "Elevaciones de gemelos: el esfuerzo relativo de los plantiflexores sube con la carga externa.",
        c: [46],
      },
      {
        t: "Jefferson curl: cargas bajas y progresión lenta, no en personas con dolor lumbar (práctica de coaching).",
        c: ["C"],
      },
    ],
    siente: {
      t: "Nordic: cara posterior del muslo (isquios) en el excéntrico.",
      c: [],
    },
    compensa: [
      {
        error: "Nordic: quebrar en la cadera (pike)",
        porque: { t: "Acorta la palanca.", c: ["C"] },
      },
      {
        error: "Nordic: hiperextensión lumbar (banana)",
        porque: {
          t: "Se hace para mantener la altura del torso.",
          c: ["C"],
        },
      },
      {
        error: "Nordic: piernas asimétricas o pelvis rotada",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: ["C"],
        },
      },
      {
        error: "Nordic: soltar de golpe",
        porque: { t: "Se pierde la fase excéntrica.", c: [] },
      },
      {
        error: "Nordic: dolor de rodilla por apoyo rotuliano al arrodillarse",
        porque: {
          t: "Se resuelve con colchoneta doble; es bandera solo si duele igual con apoyo blando.",
          c: ["C"],
        },
      },
      {
        error: "Bisagra: redondear la lumbar",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Bisagra: transformarla en sentadilla",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Bisagra: hiperextensión final",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Nordic: cuerpo recto de rodillas a cabeza.", c: ["C"] },
      { t: "Nordic: apretá los glúteos.", c: ["C"] },
      { t: "Nordic: frená la caída lo más lento posible.", c: ["C"] },
      { t: "Nordic: caé con las manos, no con la cara.", c: ["C"] },
      {
        t: "Bisagra: empujá la cadera hacia atrás como cerrando una puerta con la cola.",
        c: ["C"],
      },
      { t: "Bisagra: pecho largo.", c: ["C"] },
      { t: "Bisagra: cuando subís, el piso se aleja.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Pinchazo o tirón agudo en la parte de atrás del muslo o en el glúteo durante la ejecución, a veces con chasquido: cortar y derivar en el día.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor persistente en la parte alta de atrás del muslo.",
          c: ["C"],
        },
      },
      {
        nivel: "urgencia",
        texto: {
          t: "Orina oscura (color té o coca), dolor muscular desproporcionado, hinchazón o debilidad marcada 24 a 72 h después de una sesión excéntrica nueva o de mucho volumen (nordic, sissy, saltos): guardia, no kinesiólogo.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Bisagra: dolor lumbar que baja a la pierna, entumecimiento o debilidad.",
          c: [96],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "No prescribir jefferson ni flexión de columna cargada sin aval de un profesional en personas con osteoporosis u osteopenia conocida, antecedente de fractura vertebral, hernia de disco (reciente o diagnosticada: el kinesiólogo autoriza la flexión con carga antes de empezar) o síntomas radiculares. En mujeres posmenopáusicas y personas mayores, preguntar antes. Aplica también a la pica con peso y a deep squat to jefferson.",
          c: ["R"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Elevaciones de gemelos: dolor y rigidez en el tendón de Aquiles a la mañana o al arrancar, que dura más de 2 a 3 semanas o empeora sesión a sesión; bulto o engrosamiento doloroso del tendón: derivar y bajar saltos y pogo.",
          c: ["H"],
        },
      },
      {
        nivel: "urgencia",
        texto: {
          t: "Sensación de patada o pedrada en la pantorrilla o el talón durante un salto o un arranque, con dificultad para empujar con el pie: cortar, no apoyar, guardia el mismo día.",
          c: ["R"],
        },
      },
    ],
    evidencia: {
      t: "Nordic: el semitendinoso se activa más y el nordic muestra de las menores razones bíceps femoral/mediales; en 12 semanas hizo crecer 1,9 veces más que el LSET los flexores de rodilla que no extienden la cadera, pero el LSET hizo crecer 2,2 veces más los que sí la extienden (bíceps femoral largo +19 % con LSET vs +5 % con nordic): no es el mejor para el isquio más lesionado en sprint. Prevención de lesiones: un metaanálisis halla RR 0,49 a favor de programas que incluyen nordic y un RCT de 942 futbolistas RR 0,293, pero una reevaluación con solo RCT aleatorizados da RR 0,56 y 0,59 con intervalos que cruzan 1: evidencia inconclusa, con mucho riesgo de sesgo; el nordic suele ir dentro de programas multiejercicio y su efecto aislado no se puede separar. Fuerza excéntrica en nordic menor a 337 N y fascículos del bíceps femoral largo menores a 10,56 cm elevaron el riesgo de lesión de isquios. Una sesión de 24 repeticiones redujo la fuerza excéntrica hasta el día 3 y causó dolor los días 2 y 3. Bisagra: el peso muerto a una pierna tuvo la mayor activación de glúteo mayor entre 12 ejercicios; sumo vs convencional difieren en trabajo mecánico y momentos articulares. Jefferson curl: no hay ningún estudio en las fuentes leídas; lo más cercano son modelos de laboratorio en columna porcina cervical, donde la flexo-extensión repetida con compresión produjo hernia discal, y extrapolarlo a una columna lumbar humana viva con carga lenta y progresiva es especulativo. Elevaciones de gemelos: el esfuerzo relativo de los plantiflexores sube con la carga externa; horse stance aumenta la demanda de aductores y rotadores.",
      c: [
        64,
        65,
        66,
        67,
        68,
        69,
        71,
        72,
        49,
        44,
        97,
        98,
        46,
        43,
        "L1",
        "R",
        "C",
      ],
    },
    gestos: [
      "Nordic hamstring curl (NC, NC BENT, NC OL, asistido, full ROM con peso)",
      "Deadlift (convencional y sumo)",
      "Good morning",
      "Deadlift a una pierna (OL)",
      "Deadlift to clean",
      "Jefferson curl (a una pierna, slantboard, deep squat to jefferson)",
      "Elevaciones de gemelos (calf raises)",
      "Soleo squat",
      "Horse stance",
    ],
    pendientes: [
      {
        pendiente:
          "Jefferson curl con carga: inclusión y exclusión (osteoporosis, hernia, edad) y cómo progresar la carga.",
        quien: "H",
      },
      {
        pendiente:
          "Primera exposición al nordic: dosis inicial segura (volumen).",
        quien: "H",
      },
      {
        pendiente:
          "Umbrales de tiempo del dolor del tendón de Aquiles (2 a 3 semanas) y cómo distinguirlo del dolor muscular tardío: lo fija un kinesiólogo humano.",
        quien: "H",
      },
      {
        pendiente:
          "Significado de 'FR' en 'NC BENT FR' (§5.4 #4) y confirmar 'GM' como good morning (§5.4 #26).",
        quien: "N",
      },
      {
        pendiente:
          "Escalones de la progresión: la sección da variables por gesto, no una lista de pasos.",
        quien: "fuente",
      },
      {
        pendiente:
          "Jefferson curl y elevaciones de gemelos: sin fases propias, sin cues y sin tabla de roles por músculo (solo texto); no hay estudio de jefferson en las fuentes.",
        quien: "fuente",
      },
      {
        pendiente:
          "Dónde se siente la bisagra, el jefferson y las elevaciones de gemelos, y el mecanismo de las compensaciones de la bisagra: la sección solo lo dice para el nordic.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Grupo de ejercicios para la parte de atrás del cuerpo: el nordic (caer hacia adelante frenando con la parte de atrás del muslo), la bisagra de cadera (peso muerto, good morning), el jefferson curl (bajar enroscando la espalda de a poco, con carga) y las elevaciones de gemelos.",
    siente:
      "En el nordic, la parte de atrás del muslo mientras frenás la caída.",
    tips: [
      "Cuerpo recto de rodillas a cabeza.",
      "Apretá los glúteos.",
      "Frená la caída lo más lento posible.",
    ],
    errores: [
      {
        error: "Doblarte en la cadera durante el nordic",
        texto: "Se acorta la palanca y el ejercicio se hace más fácil.",
      },
      {
        error: "Arquear la espalda baja durante el nordic",
        texto:
          "Se hace para mantener el torso alto: tu profe te ayuda a corregirlo.",
      },
      {
        error: "Soltarte de golpe",
        texto: "Perdés la parte del frenado, que es la que trabaja.",
      },
    ],
  },
} as const satisfies RutaContenido;
