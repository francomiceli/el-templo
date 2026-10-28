import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de BL desde S4.1 (tabla articular) + S8. Borrador
 * (D5). Sin EMG de back lever: anatomía L1 + coaching L3 (marcas de las celdas
 * sin marca propia).
 *
 * Corrección R2 (BS5, R2-1/R2-9): boca abajo, la gravedad tiende a flexionar
 * cadera y columna, y lo frenan glúteo mayor, isquios y erectores (motores);
 * el abdomen controla que no se arquee la zona lumbar (estabilizador). BL no
 * es copia de PL: lleva bíceps (cabeza larga, M/Est en el hombro) y el dorsal
 * es antagonista en el hombro (su acción extensora favorece la caída).
 * ⚑H: la posición escapular en BL varía por escuela (R2-13).
 */
export const BL = {
  code: "BL",
  slug: "back-lever",
  patron: "PUSH",
  categoria: "Push horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "delt-ant", c: ["L1"] },
      { m: "pectoral", c: ["L1"], nota: "Clavicular" },
      {
        m: "biceps",
        c: ["L1"],
        nota: "Cabeza larga: motor y estabilizador en el hombro, isométrico",
      },
      { m: "gluteo-mayor", c: ["L1"] },
      { m: "isquios", c: ["L1"] },
      { m: "erectores", c: ["L1"], nota: "Columna neutra, sin hiperlordosis" },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "trap-inf",
        c: ["L1", "R", "H"],
        nota: "Escápula deprimida y algo retraída",
      },
      { m: "romboides", c: ["L1", "R", "H"] },
      {
        m: "dorsal",
        c: ["L1", "R", "H"],
        nota: "Deprime la escápula vía húmero; en el hombro es antagonista (su acción extensora favorece la caída)",
      },
      {
        m: "braquial",
        c: ["L1", "L3"],
        nota: "Isométrico: resiste la hiperextensión del codo",
      },
      {
        m: "triceps",
        c: ["L1", "L3"],
        nota: "Co-contracción: bloquea el codo",
      },
      { m: "recto-abd", c: ["L1"], nota: "Anti-extensión" },
      { m: "oblicuos", c: ["L1"], nota: "Anti-extensión" },
      { m: "manguito", c: ["L1"] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Cuerpo horizontal boca abajo, colgado de las manos con los brazos rectos. La gravedad tiende a llevar el hombro a la hiperextensión y lo resisten los flexores del hombro; glúteo, isquiotibiales y erectores sostienen piernas y pelvis, y el abdomen controla que la zona lumbar no se arquee.",
      c: ["L1", "L3"],
    },
    tipo: "Mixta (31 % isométrica)",
    brazo: "Brazo recto (SAS) 42 · flexionado (BAS) 7",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Entrada",
        texto: {
          t: "Desde el colgado, 'skin the cat': inversión (pike), paso por la German hang (hombros en extensión y rotación interna extrema) y extensión de cadera hasta quedar con el cuerpo horizontal boca abajo.",
          c: ["L1", "L3"],
        },
      },
      {
        nombre: "Posición sostenida",
        texto: {
          t: "Cuerpo horizontal boca abajo, brazos rectos, manos arriba y delante del tronco; hombros en extensión relativa de ~90° respecto del tronco.",
          c: ["L1", "L3", "M"],
        },
      },
      {
        nombre: "Salida",
        texto: {
          t: "Inversa: volver al pike o a la German hang controlada.",
          c: ["L1", "L3"],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Hombro (glenohumeral)",
        accion:
          "La gravedad empuja al tronco hacia el colgado vertical y tiende a hiperextender el hombro. Se resiste con los flexores de hombro (sagital) y con rotación interna controlada.",
        musculos:
          "Deltoides anterior, pectoral mayor (clavicular), coracobraquial y bíceps (cabeza larga): motores / estabilizadores. Dorsal ancho: antagonista (su acción extensora favorece la caída).",
        contraccion:
          "Entrada: excéntrica al descender por la German hang, concéntrica al volver. Sostén: isométrica.",
        c: ["L1", "M"],
      },
      {
        articulacion: "Escápula (escapulotorácica)",
        accion:
          "Escápula deprimida y algo retraída; la carga tiende a elevarla e inclinarla hacia adelante.",
        musculos:
          "Trapecio inferior, romboides y dorsal ancho (deprime vía húmero): estabilizadores. Pectoral menor: se estira.",
        contraccion: "Isométrica.",
        c: ["L1", "R", "H"],
      },
      {
        articulacion: "Codo",
        accion: "Extendido (brazo recto)",
        musculos:
          "Bíceps, braquial y braquiorradial: estabilizadores isométricos (resisten la hiperextensión). Tríceps: co-contracción (bloquea el codo).",
        contraccion: "Isométrica.",
        c: ["L1", "L3"],
      },
      {
        articulacion: "Columna y cadera",
        accion:
          "Extensión de cadera y columna neutra: evitar la hiperlordosis.",
        musculos:
          "Glúteo mayor, isquiotibiales y erectores espinales: motores. Recto abdominal y oblicuo externo: estabilizadores anti-extensión.",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
    ],
    progresa: [
      {
        t: "Misma palanca que en FL: el centro de masa se aleja del hombro en tuck → adv tuck → straddle → full.",
        c: ["M"],
      },
      {
        t: "El costo es de rango de hombro y de estructuras pasivas (cápsula anterior, bíceps cabeza larga, ligamentos glenohumerales) más que de fuerza pura.",
        c: ["C"],
      },
      {
        t: "El catálogo incluye 'BL pull-up' (brazo flexionado) y 'ZANETTI' (nombre de comunidad, sin definición).",
        c: [],
      },
    ],
    siente: {
      t: "Frente del hombro, pectoral y bíceps.",
      c: ["L1", "L3"],
    },
    compensa: [
      {
        error: "Caderas bajas / lumbar en hiperextensión",
        porque: {
          t: "La columna tiene que quedar neutra: hay que evitar la hiperlordosis.",
          c: ["L1"],
        },
      },
      {
        error: "Codos flexionados",
        porque: {
          t: "La posición pide el codo extendido (brazo recto).",
          c: ["L1", "L3"],
        },
      },
      {
        error: "Cabeza hacia atrás (hiperextensión cervical)",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Hombros adelantados",
        porque: { t: "Se pierde la estabilidad escapular.", c: [] },
      },
      {
        error: "Pecho hundido entre los hombros",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Cuerpo plano, glúteos apretados.", c: ["L3"] },
      {
        t: "Empujá los hombros hacia abajo y hacia las manos.",
        c: ["L3"],
      },
      {
        t: "Bajá a la German hang con control, sin dejarte caer.",
        c: ["L3"],
      },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la cara anterior del hombro durante o después de la German hang o del skin the cat.",
          c: ["L1", "L3"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Sensación de 'salida' o inestabilidad del hombro. En gimnastas operados de hombro hubo hombros inestables y dolorosos, con tracción con las manos fijas en flexión-rotación forzada como mecanismo principal; el back lever no es el mismo gesto pero comparte estrés de la cápsula (extrapolación).",
          c: [18],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor de codo en el pliegue, con debilidad para girar la palma hacia arriba.",
          c: ["L1", "L3"],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Hormigueo.", c: ["L1", "L3"] },
      },
    ],
    evidencia: {
      t: "No hay EMG de back lever: todo es anatomía de libro de texto y coaching.",
      c: ["L1", "L3"],
    },
    gestos: [
      "Skin the cat",
      "German hang",
      "Back lever (tuck a full)",
      "BL pull-up (brazo flexionado)",
      "Zanetti (nombre de comunidad, sin definición)",
    ],
    pendientes: [
      {
        pendiente:
          "Posición escapular en el back lever (depresión vs elevación, retracción vs protracción): varía por escuela.",
        quien: "H",
      },
      {
        pendiente:
          "Confirmar la redacción de la mecánica boca abajo (glúteo, isquiotibiales y erectores sostienen las piernas, el abdomen controla el arco) aplicada al back lever.",
        quien: "H",
      },
      {
        pendiente:
          "Qué indican SUPINE y PRONE en los nombres (probable orientación de la mano o del agarre, no confirmado).",
        quien: "N",
      },
      {
        pendiente:
          "Definir 'Zanetti' (nombre de comunidad sin definición) y dónde está dentro de la ruta.",
        quien: "N",
      },
      {
        pendiente:
          "Criterio de la base para clasificar BL como push horizontal (hipótesis: lo sostienen los flexores del hombro).",
        quien: "N",
      },
      {
        pendiente:
          "El porqué de las compensaciones cabeza hacia atrás y pecho hundido entre los hombros: la sección no lo da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Quedarte horizontal, boca abajo, colgado de las manos con los brazos rectos y el cuerpo plano.",
    siente: "Frente del hombro, pecho y bíceps.",
    tips: [
      "Cuerpo plano, glúteos apretados.",
      "Empujá los hombros hacia abajo y hacia las manos.",
      "Bajá con control, sin dejarte caer.",
    ],
    errores: [
      {
        error: "Caderas bajas",
        texto: "Se arquea la espalda baja.",
      },
      {
        error: "Codos doblados",
        texto: "Los brazos tienen que quedar rectos.",
      },
      {
        error: "Hombros adelantados",
        texto: "Perdés estabilidad en los hombros.",
      },
    ],
  },
} as const satisfies RutaContenido;
