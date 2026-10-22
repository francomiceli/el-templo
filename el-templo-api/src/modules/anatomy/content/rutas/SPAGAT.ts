import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de SPAGAT desde C1 (tabla articular, spagat frontal)
 * + C0 + TI-H. Borrador (D5).
 *
 * Lectura pasiva (interpretación, a confirmar con H): la tabla marca M "para
 * elevar activamente" (flexores de cadera) y "para sostener" (glúteo mayor)
 * como variante de flexibilidad activa. Para el ejercicio base (elongación
 * pasiva) esos músculos quedan así: flexores de cadera = estira (pierna
 * trasera alargada) y glúteo mayor = estabilizador (TI-H: "SPAGAT trasera,
 * Est"). La variante activa va en la `nota`. Por eso la ruta casi no tiene
 * motores: es lo correcto para una ruta de rango. Fuera: el piriforme, la
 * cápsula y el ciático (sin id) y los rotadores externos profundos.
 */
export const SPAGAT = {
  code: "SPAGAT",
  slug: "spagat",
  patron: "MOVILIDAD",
  categoria: "Rangos",
  estado: "borrador",
  relaciones: {
    motor: [],
    sinergista: [],
    estabilizador: [
      {
        m: "gluteo-mayor",
        c: [],
        nota: "Cadera trasera: sostiene el rango (la tabla lo marca motor en la versión activa); en el pigeon se alarga",
      },
      { m: "vastos", c: [], nota: "Rodilla delantera extendida" },
      { m: "gluteo-medio", c: [], nota: "Pelvis neutra y cuadrada" },
      { m: "oblicuos", c: [], nota: "Pelvis neutra y cuadrada" },
      { m: "erectores", c: [], nota: "Lumbar neutral" },
      { m: "recto-abd", c: [], nota: "Lumbar neutral" },
    ],
    antagonista: [],
    estira: [
      {
        m: "isquios",
        c: [104],
        nota: "Cadera delantera: elongación pasiva, con tensión neural del ciático",
      },
      {
        m: "psoas",
        c: ["L1"],
        nota: "Cadera trasera: se alarga con la cápsula anterior; en la versión activa, motor para elevar la pierna delantera",
      },
      {
        m: "recto-fem",
        c: ["L1"],
        nota: "Cadera trasera: se alarga, más con la rodilla flexionada (couch stretch)",
      },
      {
        m: "aductores",
        c: [],
        nota: "De TI-H: alargado (la tabla del spagat frontal no lo nombra)",
      },
      {
        m: "gemelo",
        c: [],
        nota: "Rodilla delantera: se alarga si el pie se dorsiflexiona",
      },
    ],
  },
  fichaProfe: {
    resumen: {
      t: "Splits y estiramientos de cadera: elongación pasiva de isquios en la pierna delantera y de flexores de cadera y cápsula anterior en la trasera, con la pelvis cuadrada. No hay carga sino asistencia y rango; la mejora a corto plazo es principalmente de tolerancia al estiramiento, y la fuerza activa se entrena con isométrico y concéntrico en el rango final.",
      c: [90, 92, "L1"],
    },
    tipo: "Sin dato (inferido: estática, de elongación)",
    brazo: null,
    escalones: {
      fuente: "ficha",
      pasos: [
        "Asistido (delta/omega, bloques o cintas)",
        "Pierna doblada",
        "Pierna extendida",
        "Altura / full",
      ],
    },
    fases: [
      {
        nombre: "Entrada",
        texto: {
          t: "Entrada controlada: se ejerce fuerza para bajar.",
          c: [],
        },
      },
      {
        nombre: "Aproximación",
        texto: { t: "Aproximación al rango final.", c: [] },
      },
      {
        nombre: "Sostén",
        texto: {
          t: "Isométrico pasivo o activo, de 30 a 120 s.",
          c: [],
        },
      },
      {
        nombre: "Salida",
        texto: {
          t: "Salida activa: concéntrico de los agonistas.",
          c: [],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Cadera delantera (spagat frontal)",
        accion: "Flexión con la rodilla extendida, plano sagital",
        musculos:
          "Isquios (bíceps femoral, semitendinoso, semimembranoso): se alargan. También glúteo mayor y tensión neural del nervio ciático. Flexores de cadera: motores para elevar la pierna de forma activa.",
        contraccion:
          "Elongación pasiva; isométrica-concéntrica para elevar activamente.",
        c: [104],
      },
      {
        articulacion: "Cadera trasera",
        accion: "Extensión (hasta cerca de la hiperextensión), plano sagital",
        musculos:
          "Iliopsoas y recto femoral (más si la rodilla va flexionada, como en el couch stretch), cápsula anterior y ligamento iliofemoral: se alargan. Glúteo mayor: motor para sostener.",
        contraccion: "Elongación pasiva.",
        c: ["L1"],
      },
      {
        articulacion: "Rodilla delantera",
        accion: "Extensión",
        musculos:
          "Cuádriceps: estabilizador. Gastrocnemio: se alarga si el pie se dorsiflexiona.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Pelvis",
        accion: "Neutra y cuadrada (evitar rotación y báscula)",
        musculos: "Glúteo medio y oblicuos: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Lumbar",
        accion: "Neutral",
        musculos: "Erectores y abdominales: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Pigeon y 90-90 (pierna de adelante)",
        accion: "Flexión más rotación externa de cadera",
        musculos:
          "Se alargan el glúteo mayor (por la flexión), el piriforme (con la cadera muy flexionada se comporta como rotador interno, por eso la rotación externa lo estira) y la cápsula posterior. Los rotadores externos profundos (obturadores, gemelos, cuadrado femoral) no se estiran en esta posición. Si falta rotación externa de cadera, la rodilla de adelante recibe torsión: regresar (pie más cerca de la ingle o en caja).",
        contraccion: "Elongación pasiva.",
        c: ["L1", "R"],
      },
    ],
    progresa: [
      {
        t: "Qué limita el rango, por orden de probabilidad: tolerancia o sensación y rigidez de isquios y flexores de cadera; tensión neural del ciático; topes óseos y cápsula (variantes de forma de cadera).",
        c: ["C", 104, 94, 95],
      },
      {
        t: "No hay carga sino asistencia y rango: asistido (delta/omega, bloques o cintas), pierna doblada, pierna extendida, altura o full. Cambia la palanca con apoyo de manos o bloques bajo la cadera.",
        c: [],
      },
      {
        t: "La mejora a corto plazo es principalmente de tolerancia, no estructural; la fuerza activa se entrena con isométrico y concéntrico en el rango final.",
        c: [90, 92],
      },
    ],
    siente: {
      t: "Isquios en la pierna delantera; cara anterior de la cadera y del muslo en la trasera.",
      c: [],
    },
    compensa: [
      {
        error:
          "Rotación pélvica (abrir la cadera hacia el lado de la pierna trasera)",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: ["C"],
        },
      },
      {
        error: "Rodilla trasera que gira hacia afuera",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Hiperextensión lumbar",
        porque: { t: "Se hace para 'bajar más'.", c: ["C"] },
      },
      {
        error: "Flexión lumbar",
        porque: { t: "Pasa si los isquios están cortos.", c: ["C"] },
      },
      {
        error: "Pierna delantera en rotación externa",
        porque: { t: "Se hace para 'ganar' rango.", c: ["C"] },
      },
      {
        error: "Hiperextensión de la rodilla delantera",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Colgarse de ligamentos y cápsula sin tono muscular",
        porque: {
          t: "En coaching se considera riesgoso, pero no hay evidencia leída que lo pruebe.",
          c: ["C"],
        },
      },
    ],
    cues: [
      { t: "Caderas cuadradas hacia adelante.", c: ["C"] },
      { t: "Empujá el piso con ambos pies para activar.", c: ["C"] },
      { t: "Respirá largo; no rebotes.", c: ["C"] },
      { t: "Salí con la fuerza de la pierna, no con la espalda.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Pinchazo profundo en la ingle (o el alumno se agarra el costado de la cadera con la mano en forma de C) al llegar al rango final, sobre todo en personas muy móviles.",
          c: [94, 95],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la ingle o en la cara interna del muslo al cerrar las piernas con fuerza, al patear o en el cossack.",
          c: [93],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Hormigueo o ardor que baja por la pierna.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en el hueso de la nalga (zona del isquion).",
          c: ["C"],
        },
      },
    ],
    evidencia: {
      t: "Evidencia débil: la mayoría de los estudios de estiramiento usan poblaciones no atléticas y rangos agudos; sobre splits específicamente no hay trabajos revisados por pares leídos. Los cambios de rango de una sesión y de programas de 3 a 8 semanas se explican por modificación de la sensación (tolerancia) y no por cambio estructural; el estiramiento estático crónico bajó la rigidez y subió la tolerancia sin cambiar la longitud fascicular. Bailarines preprofesionales jóvenes tuvieron más rotación externa pasiva y menos interna que no bailarines, pero no se puede separar entrenamiento de selección. La asociación entre mucha movilidad y dolor profundo de ingle es un reporte descriptivo.",
      c: [90, 92, 95, 107, "C"],
    },
    gestos: [
      "Spagat frontal (full, asistido, delta, omega)",
      "Couch stretch",
      "Pigeon",
      "Warrior",
      "Gentleman",
      "90-90",
      "Diagonal stretch",
      "Quad stretch de pie",
      "Isquios acostado",
    ],
    pendientes: [
      {
        pendiente:
          "Población hiperlaxa o con antecedente de luxación en spagat: cómo detectarla sin pruebas clínicas y qué hacer (H7).",
        quien: "H",
      },
      {
        pendiente:
          "Pigeon y spagat con una cadera con dolor articular profundo o hiperlaxa: cuándo regresar el rango y cuándo contraindicar (H14).",
        quien: "H",
      },
      {
        pendiente:
          "Significado de 'delta' y 'omega' en el spagat (§5.4 #15): hipótesis de tipos de asistencia, a confirmar con Nacho. Los escalones de la ficha quedan sujetos a esa definición.",
        quien: "N",
      },
      {
        pendiente:
          "Evidencia específica sobre splits y mecanismo de varias compensaciones (rodilla trasera, hiperextensión de rodilla delantera): la investigación no los tiene.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Posiciones y estiramientos de cadera, como el spagat y el couch stretch, para ganar movilidad en las piernas.",
    siente:
      "Atrás del muslo en la pierna de adelante, y adelante de la cadera y del muslo en la pierna de atrás.",
    tips: [
      "Caderas cuadradas hacia adelante.",
      "Respirá largo, no rebotes.",
      "Salí con la fuerza de la pierna, no con la espalda.",
    ],
    errores: [
      {
        error: "Abrir la cadera hacia el lado de la pierna de atrás",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
      {
        error: "Arquear la espalda baja para bajar más",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
      {
        error: "Colgarte de las articulaciones sin fuerza en la pierna",
        texto: "Se considera arriesgado: llegá hasta donde podés controlar.",
      },
    ],
  },
} as const satisfies RutaContenido;
