import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de HS desde S5.1 (tabla articular) + S8. Borrador
 * (D5). Evidencia directa de EMG (citas 5, 6 y 7). Los porcentajes de la cita 6
 * son contribución relativa, no %MVIC (R2-45).
 *
 * Corrección R2: HS lleva deltoides anterior (15 a 18 % de contribución
 * relativa, estabilizador según S8) además del trapecio superior (motor de la
 * elevación) y los flexores de muñeca (motor del control).
 */
export const HS = {
  code: "HS",
  slug: "handstand",
  patron: "PUSH",
  categoria: "Push vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "antebrazo",
        c: [6],
        nota: "Flexores de muñeca y dedos: motor del control (estrategia de muñeca)",
      },
      {
        m: "trap-sup",
        c: [6],
        nota: "Trapecio descendente: 20 a 26 % de contribución relativa",
      },
      { m: "trap-inf", c: ["L1"] },
      { m: "serrato", c: ["L1"] },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "triceps",
        c: [6],
        nota: "13 a 16 % de contribución relativa",
      },
      {
        m: "delt-ant",
        c: [6],
        nota: "15 a 18 % de contribución relativa",
      },
      { m: "pectoral", c: ["L1"], nota: "Clavicular" },
      { m: "manguito", c: ["L1"] },
      { m: "recto-abd", c: ["L1"], nota: "Anti-extensión" },
      { m: "oblicuos", c: ["L1"], nota: "Anti-extensión" },
      { m: "gluteo-mayor", c: ["L1"] },
    ],
    antagonista: [{ m: "erectores", c: ["L1"] }],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Vertical sobre las manos: línea tobillos-cadera-hombros-manos, hombros en flexión máxima (~180°), escápulas elevadas y rotadas hacia arriba. El equilibrio lo corrigen primero los flexores de muñeca y dedos ('estrategia de muñeca'); si falla, se pasa a una estrategia mixta con hombros, caderas y codos.",
      c: [6, 7],
    },
    tipo: "Sin dato (inferido estática / de equilibrio)",
    brazo: "Brazo recto (SAS) 49",
    escalones: {
      fuente: "ficha",
      pasos: ["Wall belly", "Wall back", "Free", "One-arm free HS"],
    },
    fases: [
      {
        nombre: "Entrada",
        texto: {
          t: "Kick-up o press desde L o pike (ver el press a vertical), caminata de pared, tripod.",
          c: [],
        },
      },
      {
        nombre: "Sostenido",
        texto: {
          t: "Línea tobillos-cadera-hombros-manos, hombros en flexión máxima (~180°), escápulas elevadas y rotadas hacia arriba.",
          c: [],
        },
      },
      {
        nombre: "Salida",
        texto: {
          t: "Vuelta a piso controlada (rollout, cartwheel).",
          c: [],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Muñeca",
        accion:
          "Extensión alta + estrategia de equilibrio ('estrategia de muñeca'); si falla, estrategia mixta con hombros, caderas y codos",
        musculos:
          "Flexores de muñeca y dedos: motores del control (media 60 %, pico 200 % en gimnastas; contribución relativa, no %MVIC). Extensores: estabilizadores.",
        contraccion:
          "Isométrica con microcorrecciones concéntricas y excéntricas.",
        c: [6, 7],
      },
      {
        articulacion: "Codo",
        accion: "Extendido",
        musculos:
          "Tríceps: estabilizador, con una contribución relativa de 13 a 16 % (no %MVIC). Los gimnastas adultos mostraron 19,1 % menos actividad de tríceps y 17,6 % menos de deltoides anterior que los jóvenes (interpretación: con más experiencia se usa menos activación).",
        contraccion: "Isométrica.",
        c: [5, 6],
      },
      {
        articulacion: "Hombro (glenohumeral)",
        accion: "Flexión ~180° (sagital)",
        musculos:
          "Deltoides anterior: 15 a 18 % de contribución relativa (no %MVIC). Pectoral mayor (clavicular) y manguito: estabilizadores.",
        contraccion: "Isométrica.",
        c: [6, "L1"],
      },
      {
        articulacion: "Escápula (escapulotorácica)",
        accion:
          "Elevación + rotación hacia arriba máxima; posición neutra de protracción",
        musculos:
          "Trapecio descendente (superior): 20 a 26 % de contribución relativa (no %MVIC). Trapecio inferior y serrato anterior: motores o estabilizadores.",
        contraccion: "Isométrica.",
        c: [6, "L1"],
      },
      {
        articulacion: "Columna y costillas",
        accion: "Línea neutra (sin hiperlordosis)",
        musculos:
          "Recto abdominal y oblicuos: estabilizadores (anti-extensión). Erectores: antagonistas. Glúteo mayor: estabilizador.",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
      {
        articulacion: "Cabeza y cuello",
        accion: "Neutro; la flexión cervical empeora el desempeño",
        musculos: "La tabla no asigna músculos.",
        contraccion: "No indicada.",
        c: [7],
      },
    ],
    progresa: [
      {
        t: "La variable es la base de apoyo y los grados de libertad de control: pared (apoyo externo), libre, un brazo o pocos dedos (reduce la base) y anillas.",
        c: [],
      },
      {
        t: "También cambian la posición del centro de masa respecto de las manos y la flexión de hombro necesaria (movilidad: que el brazo llegue a ~180° sin arquear la zona lumbar).",
        c: [],
      },
      {
        t: "El catálogo lo refleja: wall belly, wall back, free, one-arm free HS.",
        c: [],
      },
      {
        t: "Los jóvenes, que tuvieron peor control postural, mostraron más actividad de tríceps, bíceps y recto femoral que los adultos.",
        c: [6],
      },
      {
        t: "El apoyo en barras o anillas bajó el EMG de flexores de muñeca respecto del piso; el resto aumentó en anillas.",
        c: [5],
      },
    ],
    siente: {
      t: "Se siente en muñecas (flexores), hombros, tríceps y abdomen.",
      c: [],
    },
    compensa: [
      {
        error: "Costillas abiertas + hiperlordosis (cuerpo 'banana')",
        porque: {
          t: "Compensación típica de falta de flexión de hombro o de control abdominal.",
          c: ["C"],
        },
      },
      {
        error: "Hombros no elevados (pecho caído)",
        porque: { t: "Pierde la ventaja mecánica.", c: [] },
      },
      {
        error: "Codos hiperextendidos",
        porque: {
          t: "Discutible: en personas hiperlaxas es habitual y la escuela de gimnasia varía; lo decide un kinesiólogo o coach humano.",
          c: ["H"],
        },
      },
      {
        error: "Cabeza metida o levantada",
        porque: {
          t: "Flexionar el cuello empeora la vertical.",
          c: [7],
        },
      },
    ],
    cues: [
      { t: "Empujá el piso lejos, orejas entre los brazos.", c: [] },
      { t: "Costillas hacia la cadera, glúteos duros.", c: [] },
      { t: "Dedos agarrando el piso para corregir.", c: [] },
      { t: "Mirá entre las manos.", c: [] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor de muñeca persistente (cara dorsal o radial).",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "En menores de edad, dolor de muñeca del lado del pulgar al apoyarse.",
          c: [31],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la parte alta del hombro en flexión máxima.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor cervical.", c: [] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Antes de las primeras inversiones (vertical, HSPU, press), preguntar: ¿presión alta no controlada?, ¿glaucoma, problemas de retina o cirugía de ojos reciente?, ¿embarazo?, ¿desmayos? Si alguna es sí, que lo consulte con su médico antes de invertirse (a validar por un médico o kinesiólogo humano; es una consulta médica, no kinesiológica).",
          c: ["R", "H"],
        },
      },
      {
        nivel: "urgencia",
        texto: {
          t: "Durante la inversión: dolor de cabeza fuerte y súbito, visión borrosa o mareo que no pasa al volver de pie. Cortar y derivar al médico (a validar por un médico o kinesiólogo humano; es una consulta médica, no kinesiológica).",
          c: ["R", "H"],
        },
      },
    ],
    evidencia: {
      t: "Evidencia directa de EMG: 25 gimnastas (10 adultos, 15 jóvenes) en piso, anillas y paralelas; correlación entre EMG y control postural; revisión sistemática de 21 estudios.",
      c: [5, 6, 7],
    },
    gestos: [
      "Tripod",
      "Headstand",
      "Handstand en pared (wall belly)",
      "Handstand en pared (wall back)",
      "Handstand libre (free)",
      "Handstand a un brazo",
      "Forearm handstand",
      "Kick-up",
    ],
    pendientes: [
      {
        pendiente:
          "Tamizaje médico previo a las inversiones y señales durante la vertical: validar con un médico o kinesiólogo humano (es una consulta médica, no kinesiológica).",
        quien: "H",
      },
      {
        pendiente:
          "Codos hiperextendidos en la vertical: definir si se corrigen siempre o se toleran en personas hiperlaxas.",
        quien: "H",
      },
      {
        pendiente:
          "Músculos de cabeza y cuello en la vertical: la tabla no los asigna.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Sostenerte cabeza abajo, apoyado solo en las manos, con el cuerpo en una línea recta desde las manos hasta los pies y los brazos pegados a las orejas.",
    siente: "Muñecas, hombros, tríceps y abdomen.",
    tips: [
      "Empujá el piso lejos, orejas entre los brazos.",
      "Costillas hacia la cadera, glúteos duros.",
      "Dedos agarrando el piso para corregir, y mirá entre las manos.",
    ],
    errores: [
      {
        error: "Costillas abiertas y espalda en arco",
        texto:
          "Suele pasar por poca flexión de hombro o poco control del abdomen: llevá las costillas hacia la cadera.",
      },
      {
        error: "Hombros sin subir y pecho caído",
        texto: "Perdés ventaja: empujá el piso lejos.",
      },
      {
        error: "Cabeza metida o levantada",
        texto: "Doblar el cuello empeora la vertical: mirá entre las manos.",
      },
    ],
  },
} as const satisfies RutaContenido;
