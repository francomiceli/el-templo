import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de SS desde A4 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * Corrección R3-1 (B.2, §1.7.2): el sissy squat es de cuádriceps con palanca
 * larga. Con el cuerpo reclinado y la cadera neutra, los flexores de cadera
 * (recto femoral e iliopsoas) la sostienen en isométrico; el glúteo mayor solo
 * co-contrae ("no sostiene", TI-H) y el glúteo medio y los aductores no entran
 * como motor ni sinergista. ⚑H (H2). Sin estudios de sissy squat (A4): marcas
 * C y L1 de la tabla; el resto lleva `c: []`.
 */
export const SS = {
  code: "SS",
  slug: "sissy-squat",
  patron: "LOWER",
  categoria: "Rodilla dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "vastos",
        c: ["C", "L1"],
        nota: "Rodilla muy avanzada y flexionada: máxima demanda de cuádriceps con palanca larga",
      },
      {
        m: "recto-fem",
        c: ["C", "L1", "R"],
        nota: "Trabaja en los dos extremos: extiende la rodilla y sostiene la cadera",
      },
      {
        m: "psoas",
        c: ["R"],
        nota: "Isométrico: con el cuerpo reclinado la gravedad empuja la cadera a extenderse y lo frena",
      },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "gluteo-mayor",
        c: ["R"],
        nota: "Co-contracción para mantener la línea; no sostiene",
      },
      { m: "gemelo", c: [], nota: "Isométrico, talones arriba" },
      { m: "soleo", c: [], nota: "Isométrico, talones arriba" },
      { m: "recto-abd", c: [] },
      { m: "oblicuos", c: [], nota: "De TI-H (abdominales)" },
      { m: "erectores", c: [] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Sentadilla con los talones arriba, el torso reclinado y la rodilla muy adelantada: máxima demanda de cuádriceps con palanca larga. La cadera queda neutra y la sostienen en isométrico los flexores de cadera; el glúteo solo co-contrae.",
      c: ["C", "R"],
    },
    tipo: "Sin dato (inferido: dinámica), cadena cerrada",
    brazo: null,
    escalones: {
      pendiente:
        "La sección da variables de progresión (rango, asistencia, ángulo de la línea del cuerpo, carga, una pierna, tiempo bajo tensión), no una escalera de pasos única: falta la lista de escalones.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Parado",
        texto: { t: "De pie, con los talones elevándose.", c: [] },
      },
      {
        nombre: "Descenso",
        texto: {
          t: "Excéntrico: flexión de rodilla con la cadera extendida y el torso inclinado hacia atrás (línea hombros-rodillas), con los talones arriba.",
          c: [],
        },
      },
      {
        nombre: "Fondo",
        texto: { t: "Isométrico, con la rodilla muy avanzada.", c: [] },
      },
      {
        nombre: "Ascenso",
        texto: {
          t: "Concéntrico. El Hindu squat es la versión dinámica, con balanceo de brazos y talones que se elevan.",
          c: [],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Rodilla",
        accion:
          "Flexión profunda con la rodilla muy avanzada → extensión (plano sagital)",
        musculos:
          "Cuádriceps: motor. El recto femoral queda especialmente largo (cadera extendida y rodilla flexionada).",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: ["C", "L1"],
      },
      {
        articulacion: "Cadera",
        accion: "Neutra (0°), isométrica",
        musculos:
          "Flexores de cadera (recto femoral e iliopsoas): motores isométricos. Con el cuerpo reclinado la gravedad empuja la cadera hacia la extensión y son ellos los que la frenan. El recto femoral trabaja en los dos extremos (extiende la rodilla y sostiene la cadera), por eso se siente tanto en el muslo de adelante. Glúteo mayor: co-contracción para mantener la línea (no dejar que la cadera se flexione).",
        contraccion: "Isométrica.",
        c: ["R"],
      },
      {
        articulacion: "Tobillo y pie",
        accion: "Plantiflexión sostenida (talones arriba), apoyo en el antepié",
        musculos:
          "Gastrocnemio y sóleo: estabilizadores isométricos. Flexores de los dedos e intrínsecos del pie: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Columna lumbar",
        accion: "Neutro",
        musculos: "Abdominales y erectores: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      { t: "Rango: parcial, completo.", c: [] },
      { t: "Asistencia con apoyo de mano.", c: [] },
      { t: "Ángulo de la línea del cuerpo (palanca).", c: [] },
      { t: "Carga externa (W).", c: [] },
      { t: "Una pierna (OL en el catálogo).", c: [] },
      { t: "Tiempo bajo tensión en la fase excéntrica.", c: [] },
    ],
    siente: {
      t: "Muslo de adelante: el recto femoral trabaja en los dos extremos (extiende la rodilla y sostiene la cadera), por eso se siente tanto ahí.",
      c: ["R"],
    },
    compensa: [
      {
        error: "Cadera que se quiebra hacia atrás",
        porque: {
          t: "Acorta la palanca y le roba demanda al cuádriceps.",
          c: [45],
        },
      },
      {
        error: "Hiperextensión lumbar",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Talón que se eleva demasiado temprano",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Valgo",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Sacudir el torso para volver",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Rodillas y hombros en una línea.", c: ["C"] },
      { t: "Empujá el piso con el antepié.", c: ["C"] },
      { t: "Bajá lento, no rebotes en el fondo.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la parte delantera de la rodilla o en el tendón debajo de la rótula que aparece o persiste.",
          c: [40, 59],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Molestia en el tendón rotuliano que empeora con cada sesión.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Cualquier chasquido doloroso.", c: [] },
      },
    ],
    evidencia: {
      t: "No hay estudio de sissy squat entre las fuentes leídas. Por mecánica: con la rodilla muy adelantada y en flexión profunda sube la carga sobre la rótula y el tendón rotuliano; las cargas de LCA de la sentadilla aparecen sobre todo entre 0° y 60° de flexión y son chicas en valor absoluto; en el fondo trabaja más el LCP (cizalla posterior); con las rodillas libres el torque de rodilla sube y el de cadera baja; la flexión profunda sube la demanda del extensor de rodilla; y la sentadilla con talones arriba requirió unos 157° de flexión de rodilla. Conclusión: ejercicio de máxima demanda de cuádriceps con palanca larga; no hay datos de seguridad; prudencia con dolor rotuliano o del tendón.",
      c: [40, 41, 45, 46, 56, "C"],
    },
    gestos: [
      "Hindu squat (parcial, full ROM y con peso)",
      "Ape reach",
      "Soleo squat",
      "Crab sissy",
      "Sissy squat asistido",
      "Levitation squat asistido",
    ],
    pendientes: [
      {
        pendiente:
          "Validar la corrección de roles: los flexores de cadera sostienen la cadera en isométrico y el glúteo solo co-contrae.",
        quien: "H",
      },
      {
        pendiente:
          "Sissy en rodillas con antecedente de menisco o dolor rotuliano: si se permite rango parcial y con qué criterio.",
        quien: "H",
      },
      {
        pendiente:
          "Criterios de edad y carga para el sissy en menores y adolescentes.",
        quien: "H",
      },
      {
        pendiente:
          "Umbral de tiempo (2 a 3 semanas) para el dolor de rodilla que persiste, y cómo distinguirlo del dolor muscular tardío: lo fija un kinesiólogo humano.",
        quien: "H",
      },
      {
        pendiente:
          "Datos de seguridad del sissy squat y mecanismo de las compensaciones (hiperextensión lumbar, talón temprano, valgo, sacudir el torso): la investigación no los tiene.",
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
    que: "Sentadilla con los talones arriba, el torso inclinado hacia atrás y las rodillas muy adelante.",
    siente: "Sobre todo el muslo de adelante.",
    tips: [
      "Rodillas y hombros en una línea.",
      "Empujá el piso con la parte de adelante del pie.",
      "Bajá lento, no rebotes en el fondo.",
    ],
    errores: [
      {
        error: "Cadera que se quiebra hacia atrás",
        texto: "Se acorta la palanca y el muslo trabaja menos.",
      },
      {
        error: "Espalda baja arqueada",
        texto: "Pasa seguido: tu profe te ayuda a corregirla.",
      },
    ],
  },
} as const satisfies RutaContenido;
