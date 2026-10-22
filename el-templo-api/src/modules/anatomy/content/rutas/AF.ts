import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de AF (Animal Flow) desde TI-D, D1 "Análisis por
 * posición" + TI-H. Borrador (D5).
 *
 * AF: sin análisis articular por ruta en la investigación; relaciones por
 * posición (D1). No se encontró ningún estudio de Animal Flow (TI-D): todo es
 * análisis por posición y por tarea con apoyos genéricos. Ruta heterogénea: el
 * rol más alto entre todas las posiciones gana y cada `nota` dice la posición.
 * Sin progresión lineal fija en el catálogo (D2). Cuando D1 y TI-H difieren
 * (glúteo mayor, cuádriceps, flexores de muñeca), manda D1 (R2). Fuera:
 * extensores de muñeca, transverso, deltoides medio y las articulaciones (sin id).
 */
export const AF = {
  code: "AF",
  slug: "animal-flow",
  patron: "FLOW",
  categoria: "Animal Flow",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "gluteo-mayor",
        c: [],
        nota: "Beast walk / bear walk al impulsar, crab (isométrico), ape, scorpion y frogger",
      },
      {
        m: "isquios",
        c: [],
        nota: "Beast walk / bear walk al impulsar y crab (isométrico)",
      },
      {
        m: "vastos",
        c: [],
        nota: "Ape / deep squat, frogger y cossack; en beast es estabilizador isométrico",
      },
      { m: "gemelo", c: [], nota: "Frogger / bunny hops / spider jump" },
      {
        m: "oblicuos",
        c: [],
        nota: "Scorpion (extensión y rotación) y wave unload / primate",
      },
      {
        m: "erectores",
        c: [],
        nota: "Scorpion y wave unload / primate (movilidad segmentaria)",
      },
      {
        m: "recto-abd",
        c: [],
        nota: "Wave unload / primate; en beast, crow y crab es estabilizador",
      },
      { m: "triceps", c: [], nota: "Crab: estabilizador / motor" },
      { m: "delt-post", c: [], nota: "Crab: estabilizador / motor" },
      { m: "trap-inf", c: [], nota: "Crab: estabilizador / motor" },
      {
        m: "romboides",
        c: [],
        nota: "Crab: trapecio medio, estabilizador / motor",
      },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "serrato",
        c: [101],
        nota: "Beast, crow y frogger: protracción en carga",
      },
      { m: "pectoral", c: [101], nota: "Beast: isométrico" },
      { m: "delt-ant", c: [101], nota: "Beast: isométrico" },
      {
        m: "gluteo-medio",
        c: [],
        nota: "Beast walk / bear walk y cossack: control frontal",
      },
      { m: "soleo", c: [], nota: "Ape / deep squat" },
      {
        m: "antebrazo",
        c: [],
        nota: "Crow: agarre con los flexores de muñeca y dedos, isométrico",
      },
    ],
    antagonista: [],
    estira: [
      {
        m: "aductores",
        c: [],
        nota: "Cossack walk, side kick y side monkey: alargados en excéntrico",
      },
    ],
  },
  fichaProfe: {
    resumen: {
      t: "Animal Flow: locomoción y posiciones en el piso (beast, crab, ape, scorpion, crow y otras), con 66 ejercicios en CARDIO, CORE, DESPLAZAMIENTO, ESTABILIDAD, MOVILIDAD y UPPER. No hay estudios de Animal Flow: todo es análisis por posición y por tarea con fuentes de apoyo genéricas.",
      c: [],
    },
    tipo: "Sin dato (inferido: dinámica, locomoción), cadena mixta",
    brazo: "Mezcla (varía por posición)",
    escalones: {
      pendiente:
        "La nota PROGRESIONES del catálogo dice que AF no tiene progresión lineal fija: no hay escalones.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Entrada",
        texto: { t: "Posición de entrada.", c: [] },
      },
      {
        nombre: "Transición",
        texto: {
          t: "Transición dinámica (concéntrica o excéntrica) entre posiciones.",
          c: [],
        },
      },
      {
        nombre: "Sostén",
        texto: { t: "Sostén isométrico.", c: [] },
      },
      {
        nombre: "Salida",
        texto: { t: "Salida de la posición.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Beast (cuadrupedia con rodillas flotando)",
        accion:
          "Hombro en flexión cercana a 90° en carga con escápula en protracción; muñeca en extensión cargada de rango alto (valor en grados sin verificar); cadera en flexión cercana a 90° con rodilla flexionada; columna neutra, antiextensión",
        musculos:
          "Serrato anterior, pectoral y deltoides anterior: estabilizadores isométricos. Recto abdominal, transverso y oblicuos: estabilizadores isométricos. Cuádriceps: estabilizador isométrico.",
        contraccion: "Isométrica.",
        c: [101, 31, "C"],
      },
      {
        articulacion: "Beast walk, bear walk, lizard y monkey",
        accion:
          "Carga contralateral alterna en hombro y muñeca; flexión y extensión alterna de cadera; antirrotación de columna",
        musculos:
          "Oblicuos y glúteo medio: estabilizadores. Glúteo mayor e isquios: motores al impulsar.",
        contraccion: "Concéntrica-isométrica-excéntrica.",
        c: [],
      },
      {
        articulacion: "Crab (mesa invertida)",
        accion:
          "Hombro en extensión con rotación externa (cara anterior abierta); muñeca en extensión con los dedos hacia atrás; cadera en extensión sostenida; columna neutra o con leve extensión",
        musculos:
          "Tríceps, deltoides posterior, trapecio medio e inferior y romboides: estabilizadores o motores. Glúteo mayor e isquios: motores isométricos. El crab apoya los pies en el piso: no es el reverse planche de apoyo libre del tren superior, donde el glúteo no sostiene las piernas.",
        contraccion: "Isométrica-concéntrica.",
        c: [],
      },
      {
        articulacion: "Ape y deep squat (manos al piso)",
        accion:
          "Hombro en flexión; muñeca cargada; flexión profunda de cadera y rodilla con dorsiflexión de tobillo; flexión lumbar suave",
        musculos: "Cuádriceps y glúteo mayor: motores. Sóleo: estabilizador.",
        contraccion: "Excéntrica-concéntrica.",
        c: [],
      },
      {
        articulacion: "Scorpion (reach)",
        accion:
          "Hombro variable; carga unilateral en la muñeca; flexión de cadera de la pierna que cruza con rotación; extensión y rotación lumbar y torácica",
        musculos: "Oblicuos, erectores y glúteo mayor: motores o sinergistas.",
        contraccion: "Concéntrica-isométrica.",
        c: [],
      },
      {
        articulacion: "Frogger, bunny hops y spider jump",
        accion:
          "Soporte de carga en hombro y muñeca; flexión y extensión explosiva de cadera y rodilla con aterrizaje; columna neutra",
        musculos:
          "Cuádriceps, glúteos y gemelos: motores concéntricos. Serrato: estabilizador.",
        contraccion: "Concéntrica-excéntrica (ver plyo).",
        c: [],
      },
      {
        articulacion: "Crow, frog y flying crow",
        accion:
          "Hombro en protracción máxima con el codo flexionado soportando las rodillas; muñeca en extensión alta con la carga del cuerpo (grados sin verificar); cadera flexionada con las rodillas contra los tríceps; cifosis activa",
        musculos:
          "Serrato anterior, tríceps y flexores de muñeca y dedos (agarre): estabilizadores isométricos. Core: estabilizador.",
        contraccion: "Isométrica.",
        c: ["C"],
      },
      {
        articulacion: "Cossack walk, side kick y side monkey",
        accion:
          "Abducción y aducción de cadera; flexión profunda unilateral; plano frontal",
        musculos:
          "Aductores: se alargan (excéntrico). Glúteo medio: estabilizador. Cuádriceps: motor.",
        contraccion: "Excéntrica-concéntrica.",
        c: [],
      },
      {
        articulacion: "Wave unload, scorpion reach completo y primate",
        accion:
          "Hombro, muñeca y cadera variables; movilidad segmentaria de columna",
        musculos: "Erectores y abdominales: motores o estabilizadores.",
        contraccion: "Concéntrica-excéntrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Más tiempo en la posición; más dificultad de transición; mayor rango (ape, scorpion); menor base de apoyo (beast, crow); más velocidad (cardio).",
        c: [],
      },
      {
        t: "No hay progresión lineal fija en el catálogo.",
        c: [],
      },
    ],
    siente: {
      pendiente:
        "La sección de Animal Flow no trae un bloque de dónde se siente; el análisis es por posición.",
      quien: "fuente",
    },
    compensa: [
      {
        error:
          "Muñecas: dedos cerrados, peso en la base de la mano o carga en el extremo de extensión",
        porque: {
          t: "La carga axial repetida y la extensión forzada de muñeca se asocian con dolor de muñeca en gimnastas.",
          c: [31],
        },
      },
      {
        error: "Hombros colgados (sin protracción) y escápula alada",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: ["C"],
        },
      },
      {
        error: "Lumbar que se hunde",
        porque: {
          t: "Se pierde la antiextensión.",
          c: ["C"],
        },
      },
      {
        error: "Cadera muy alta o muy baja en beast",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: ["C"],
        },
      },
      {
        error: "Rodillas en valgo en frogger y ape",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: ["C"],
        },
      },
      {
        error: "Cabeza hiperextendida",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Empujá el piso lejos con las manos.", c: ["C"] },
      {
        t: "Abrí los dedos, repartí el peso en toda la mano.",
        c: ["C"],
      },
      {
        t: "Costillas hacia adentro, ombligo hacia arriba.",
        c: ["C"],
      },
      { t: "Caderas a la altura del hombro (beast).", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor del lado de atrás de la muñeca con carga o pérdida de extensión.",
          c: [31],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Pinchazo en la cara anterior del hombro o sensación de que el hombro se sale.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor lumbar en scorpion, con extensión y rotación.",
          c: [103, 96],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Pinchazo en la ingle en flexión profunda de cadera (frog, ape).",
          c: [94],
        },
      },
    ],
    evidencia: {
      t: "No se encontró ningún estudio de Animal Flow en PubMed ni en Europe PMC; todos los apoyos son indirectos. En 31 hombres sanos, gatear en cuadrupedia y el bird dog engrosaron el transverso del abdomen más que en supino, el bird dog engrosó más el erector espinal que las demás condiciones y el ejercicio con talón levantado estimuló más multífido y oblicuo interno. El alzamiento cuadrúpedo de brazo y pierna activó el glúteo mayor más del 45 % de la contracción voluntaria máxima isométrica (n=30). La estabilidad de columna depende de muchos músculos y cambia con la tarea. En un push-up con hombros elevados cerca de 90° la escápula puede quedar en posición de pinzamiento (n=16; condición distinta, extrapolación débil): precaución en posiciones cargadas con el hombro muy flexionado (crow, bear con manos adelantadas).",
      c: [105, 25, 101, 102, "C"],
    },
    gestos: [
      "Beast",
      "Beast walk, bear walk, lizard y monkey",
      "Crab",
      "Ape y deep squat (manos al piso)",
      "Scorpion (reach)",
      "Frogger, bunny hops y spider jump",
      "Crow, frog y flying crow",
      "Cossack walk, side kick y side monkey",
      "Wave unload, scorpion reach completo y primate",
    ],
    pendientes: [
      {
        pendiente:
          "Qué gestos reconoce Nacho dentro de AF y si la ruta (66 ejercicios en seis categorías) es una acumulación histórica o a propósito (§5.4, preguntas de método).",
        quien: "N",
      },
      {
        pendiente:
          "Análisis articular por ruta: AF no tiene tabla propia, solo el análisis por posición (D1) y la progresión, compensaciones y cues (D2).",
        quien: "fuente",
      },
      {
        pendiente:
          "Estudios de Animal Flow: la investigación no encontró ninguno; todo es análisis por posición con apoyos genéricos.",
        quien: "fuente",
      },
      {
        pendiente:
          "Valores en grados de la extensión de muñeca en beast y crow: sin verificar.",
        quien: "fuente",
      },
      {
        pendiente:
          "Dónde se siente y escalones de progresión: la sección no trae ese bloque, y el catálogo no define una progresión lineal.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Posiciones y desplazamientos en el piso, apoyado en manos y pies, como el beast, el crab o el scorpion, para ganar fuerza, control y movilidad.",
    siente: {
      pendiente: "La investigación no dice dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Empujá el piso lejos con las manos.",
      "Abrí los dedos y repartí el peso en toda la mano.",
      "Costillas hacia adentro, ombligo hacia arriba.",
    ],
    errores: [
      {
        error: "Apoyar el peso en la base de la mano con los dedos cerrados",
        texto: "Carga de más la muñeca. Si te duele, avisale a tu profe.",
      },
      {
        error: "Dejar caer la zona baja de la espalda",
        texto:
          "Perdés la estabilidad del tronco: tu profe te ayuda a corregirlo.",
      },
      {
        error: "Hombros colgados, sin empujar el piso",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
    ],
  },
} as const satisfies RutaContenido;
