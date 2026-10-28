import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de FL desde S3.1 (tabla articular) + S8. Borrador
 * (D5). Ruta heterogénea (R5): gestos como texto, sin modelo por gesto en v1.
 *
 * Mecánica boca arriba (BS5, R2-1/R2-2): psoas y recto femoral son motores
 * isométricos (sostienen las piernas), el glúteo mayor solo co-contrae para la
 * retroversión y los erectores son antagonistas. Las celdas de la tabla sin
 * marca propia llevan la que declara S3.1 para toda la sección: anatomía L1 +
 * coaching L3.
 */
export const FL = {
  code: "FL",
  slug: "front-lever",
  patron: "PULL",
  categoria: "Pull horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "dorsal", c: ["L1"], nota: "En cadena cerrada" },
      { m: "redondo", c: ["L1"] },
      { m: "pectoral", c: ["L1"], nota: "Esternal" },
      { m: "delt-post", c: ["L1"] },
      {
        m: "triceps",
        c: ["L1"],
        nota: "Cabeza larga; en el codo co-contrae y lo bloquea",
      },
      { m: "trap-inf", c: ["L1", "L3"] },
      { m: "romboides", c: ["L1", "L3"] },
      { m: "recto-abd", c: ["L1", "L3"] },
      { m: "oblicuos", c: ["L1", "L3"] },
      {
        m: "psoas",
        c: ["R"],
        nota: "Isométrico: sostiene las piernas en línea",
      },
      {
        m: "recto-fem",
        c: ["R"],
        nota: "Isométrico: sostiene las piernas en línea",
      },
    ],
    sinergista: [],
    estabilizador: [
      { m: "manguito", c: ["L1"] },
      { m: "serrato", c: ["L1", "L3"] },
      { m: "biceps", c: ["L1", "L3"], nota: "Isométrico, brazo recto" },
      { m: "braquial", c: ["L1", "L3"], nota: "Isométrico, brazo recto" },
      {
        m: "gluteo-mayor",
        c: ["L1", "R"],
        nota: "Co-contrae para la retroversión, no sostiene las piernas",
      },
    ],
    antagonista: [
      { m: "trap-sup", c: ["L1", "L3"] },
      { m: "erectores", c: ["L1", "L3"], nota: "No deberían dominar" },
    ],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Cuerpo horizontal boca arriba, colgado de la barra con los brazos rectos. Lo sostienen los músculos que bajan el brazo (dorsal ancho, redondo mayor), el abdomen en hollow y, para mantener las piernas en línea, los flexores de cadera.",
      c: ["L1", "L3"],
    },
    tipo: "Mixta (30 % isométrica)",
    brazo: "Brazo recto (SAS) 89 · flexionado (BAS) 28",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Entrada",
        texto: {
          t: "Desde colgado (o inversión, skin the cat), tirón con los brazos rectos hasta quedar con el cuerpo horizontal (tuck lever raise).",
          c: ["L1", "L3"],
        },
      },
      {
        nombre: "Sostén",
        texto: {
          t: "Cuerpo horizontal boca arriba, brazos rectos casi perpendiculares al tronco (ángulo húmero-tronco de ~90°), escápulas deprimidas y retraídas, hollow.",
          c: ["L1", "L3", "M"],
        },
      },
      {
        nombre: "Salida",
        texto: {
          t: "Descenso excéntrico hasta colgado, o inversión controlada.",
          c: ["L1", "L3"],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Hombro (glenohumeral)",
        accion: "Extensión desde flexión (plano sagital), aducción leve",
        musculos:
          "Dorsal ancho, redondo mayor, pectoral mayor esternal, deltoides posterior y tríceps (cabeza larga): motores. Manguito rotador (infraespinoso, redondo menor, subescapular): estabilizador.",
        contraccion:
          "Entrada: concéntrica. Sostén: isométrica. Descenso: excéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Escápula (escapulotorácica)",
        accion: "Depresión + retracción moderada (nunca elevación)",
        musculos:
          "Trapecio inferior, romboides, dorsal ancho (en cadena cerrada) y pectoral menor: motores / sinergistas. Serrato anterior: estabilizador. Trapecio superior: antagonista.",
        contraccion: "Isométrica.",
        c: ["L1", "L3"],
      },
      {
        articulacion: "Codo",
        accion: "Extendido (brazo recto)",
        musculos:
          "Bíceps (la cabeza larga cruza el hombro), braquial y braquiorradial: estabilizadores isométricos. Tríceps: co-contracción (bloquea el codo; su cabeza larga además ayuda a extender el hombro). En el planche el bíceps tuvo diferencias grandes de actividad entre la habilidad y sus ejercicios preparatorios.",
        contraccion: "Isométrica.",
        c: ["L1", "L3", 4],
      },
      {
        articulacion: "Columna lumbar y pelvis",
        accion: "Hollow: retroversión pélvica, anti-extensión",
        musculos:
          "Recto abdominal y oblicuos: motores / estabilizadores. Erectores espinales: antagonistas (no deberían dominar). Glúteo mayor: co-contracción para la retroversión.",
        contraccion: "Isométrica.",
        c: ["L1", "L3"],
      },
      {
        articulacion: "Cadera",
        accion:
          "Extensión neutra mantenida contra la gravedad, que tiende a hiperextenderla",
        musculos:
          "Iliopsoas, recto femoral y tensor de la fascia lata: motores isométricos (sostienen las piernas en línea). Glúteo mayor: co-contracción para la retroversión pélvica, no sostiene las piernas.",
        contraccion: "Isométrica.",
        c: ["R"],
      },
    ],
    progresa: [
      {
        t: "Lo que cambia es la distancia horizontal entre el hombro y el centro de masa de tronco y piernas.",
        c: ["M"],
      },
      {
        t: "Tuck: rodillas al pecho, centro de masa cerca del hombro. Adv tuck: espalda plana, rodillas lejos del pecho, centro de masa más lejos. One leg / straddle: una pierna o ambas abiertas, distribución intermedia. Half layout y full: piernas rectas y juntas, máxima distancia.",
        c: ["M"],
      },
      {
        t: "El straddle suele costar menos que el full por la proyección más corta de las piernas abiertas sobre el eje del cuerpo (derivación mecánica, no verificada con datos).",
        c: ["M"],
      },
      {
        t: "Ruta paralela con brazo flexionado (bent arm FL, rows): acorta el brazo de palanca efectivo y reparte el trabajo en el codo (ver FLR).",
        c: ["L1", "L3"],
      },
      {
        t: "En el catálogo, FL WIDE es con los brazos más abiertos: cambia la dirección de la fuerza sobre el dorsal (sin evidencia).",
        c: [],
      },
    ],
    siente: {
      t: "Dorsal ancho, redondo mayor, abdomen y el bíceps (pliegue del codo), que trabaja fuerte para proteger el codo con los brazos rectos.",
      c: ["C"],
    },
    compensa: [
      {
        error: "Caderas caídas / piernas más abajo",
        porque: {
          t: "Aumenta la lordosis lumbar y se pierde el hollow (se pierde la anti-extensión).",
          c: ["L1", "L3"],
        },
      },
      {
        error: "Caderas altas (pike)",
        porque: {
          t: "Acorta artificialmente la palanca: es una trampa de progresión.",
          c: ["L1", "L3"],
        },
      },
      {
        error: "Codos flexionados",
        porque: {
          t: "Convierte el brazo recto en brazo flexionado: el movimiento ya no es un front lever estricto.",
          c: ["L1", "L3"],
        },
      },
      {
        error: "Hombros encogidos / cabeza adelantada",
        porque: {
          t: "El trapecio superior sustituye a la depresión escapular.",
          c: ["L1", "L3"],
        },
      },
    ],
    cues: [
      { t: "Tirá la barra hacia las caderas, brazos rectos.", c: ["L3"] },
      {
        t: "Hollow: costillas abajo, pelvis hacia atrás (retroversión), abdomen duro como si te fueran a pegar.",
        c: ["L3"],
      },
      { t: "Hombros lejos de las orejas y hacia atrás.", c: ["L3"] },
      { t: "Cuerpo recto como una tabla desde el cuello.", c: ["L3"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la cara anterior del hombro (surco del bíceps) que aparece al sostener.",
          c: [18, 19],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor de codo (anterior, en el pliegue), por tracción con el brazo recto.",
          c: ["L1", "L3"],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Hormigueo en la mano.", c: ["L1", "L3"] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor lumbar al sostener.", c: ["L1", "L3"] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor articular o tendinoso que no mejora en ~2 semanas pese a bajar la carga, o que empeora sesión a sesión.",
          c: ["H"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en el pliegue anterior del codo con debilidad para girar la palma hacia arriba.",
          c: ["L1", "L3"],
        },
      },
    ],
    evidencia: {
      t: "No hay EMG de front lever revisada por pares: solo un listado de congreso sin texto accesible. Todo lo de esta ficha es anatomía de libro de texto y coaching, más extrapolación de planche y cruz de hierro.",
      c: [109, "L1", "L3", 4, 21],
    },
    gestos: [
      "Dragon flag (30)",
      "Elbow victorian (13)",
      "FL press (≈24)",
      "Boat (7)",
      "Hangs y escápulas",
    ],
    pendientes: [
      {
        pendiente:
          "Umbral de ~2 semanas para dolor articular o tendinoso que no mejora (y cómo distinguirlo del dolor muscular tardío): lo fija un kinesiólogo humano.",
        quien: "H",
      },
      {
        pendiente:
          "Confirmar la redacción de la mecánica boca arriba (abdomen y flexores de cadera sostienen las piernas, el glúteo solo co-contrae) aplicada a FL, dragon flag y boat.",
        quien: "H",
      },
      {
        pendiente:
          "Colgado pasivo prolongado en hombros laxos o con antecedente de luxación: preferir el colgado activo, criterio a validar.",
        quien: "H",
      },
      {
        pendiente:
          "Definición con el ejercicio a la vista de DP, ICM, Yewkies, Elbow Victorian y Boat dentro de la ruta (y confirmar que DF sea el dragon flag): un error de definición invalida los músculos de ese gesto.",
        quien: "N",
      },
      {
        pendiente:
          'Retracción escapular "to 90": el catálogo no la define (probable arrastre del cuerpo hacia ~90° con brazos rectos).',
        quien: "N",
      },
    ],
  },
  fichaAlumno: {
    que: "Quedarte horizontal colgado de la barra, boca arriba, con los brazos rectos.",
    siente: "Espalda (dorsales), abdomen y el pliegue del codo.",
    tips: [
      "Tirá la barra hacia las caderas, brazos rectos.",
      "Costillas abajo, abdomen duro.",
      "Hombros lejos de las orejas.",
    ],
    errores: [
      { error: "Caderas caídas", texto: "Se arquea la espalda baja." },
      {
        error: "Caderas altas",
        texto: "Parece más fácil, pero no es el front.",
      },
      { error: "Codos doblados", texto: "Ya no es el mismo ejercicio." },
    ],
  },
} as const satisfies RutaContenido;
