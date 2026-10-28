import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de PIKE desde C4 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * Los flexores de cadera son motores (pike activo, L-sit leg lifts) y la tabla
 * los marca M en la fila de pelvis sin condición. Glúteo mayor e isquios
 * quedan como se estiran: la fila de cadera los marca "alargados" (TI-H:
 * "PIKE, Al") y la de pelvis dice "Ant/Al"; se tomó Al (interpretación, a
 * confirmar con H). Jefferson curl: ver NC (sin estudios directos). Fuera:
 * fascia posterior y ciático (sin id).
 */
export const PIKE = {
  code: "PIKE",
  slug: "pike",
  patron: "MOVILIDAD",
  categoria: "Rangos",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "psoas",
        c: ["L1", "C"],
        nota: "Pike activo: concéntricos mientras los isquios dan el rango",
      },
      {
        m: "recto-fem",
        c: ["L1", "C"],
        nota: "Pike activo: concéntricos mientras los isquios dan el rango",
      },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "recto-abd",
        c: [],
        nota: "Lumbar: la flexión es evitable o permitida según la versión",
      },
      { m: "vastos", c: [], nota: "Rodilla extendida" },
    ],
    antagonista: [],
    estira: [
      {
        m: "isquios",
        c: [104],
        nota: "Alargados (pike pasivo); con tensión neural del ciático",
      },
      { m: "gluteo-mayor", c: [], nota: "Alargado en la flexión de cadera" },
      { m: "erectores", c: [], nota: "Columna lumbar: alargados" },
      { m: "gemelo", c: [], nota: "Si se agarra el pie (dorsiflexión)" },
    ],
  },
  fichaProfe: {
    resumen: {
      t: "Flexión de cadera con las rodillas extendidas (pelvis en anteversión sobre los fémures) y flexión de tronco: pike sentado o parado, jefferson curl, box pike, pancake W, head to toe y L-sit leg lifts. En la versión pasiva se alargan isquios, glúteo mayor y fascia posterior; en la activa, los flexores de cadera (psoas y recto femoral) son los motores.",
      c: [],
    },
    tipo: "Mixta",
    brazo: null,
    escalones: {
      pendiente:
        "C4 lista variables de progresión (parcial a full rango, sentado vs parado, a una pierna, con peso, déficit), no una escalera de pasos.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Inicio",
        texto: { t: "Posición inicial.", c: [] },
      },
      {
        nombre: "Flexión",
        texto: {
          t: "Flexión de cadera (pelvis en anteversión sobre los fémures, rodillas extendidas) y flexión de tronco.",
          c: [],
        },
      },
      {
        nombre: "Sostén",
        texto: { t: "Isométrico.", c: [] },
      },
      {
        nombre: "Salida",
        texto: { t: "Concéntrico.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Cadera",
        accion: "Flexión con la rodilla extendida, plano sagital",
        musculos:
          "Isquios, glúteo mayor y fascia posterior: se alargan. Flexores de cadera (psoas, recto femoral): motores (en la versión activa).",
        contraccion:
          "Elongación pasiva; concéntrica-isométrica en la versión activa.",
        c: [],
      },
      {
        articulacion: "Pelvis",
        accion: "Anteversión",
        musculos:
          "Glúteo e isquios: antagonistas o alargados (la tabla los marca Ant/Al sin separar). Flexores de cadera: motores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Columna lumbar",
        accion:
          "Flexión evitable o permitida según la versión (pike vs jefferson), plano sagital",
        musculos: "Erectores: se alargan. Abdominales: estabilizadores.",
        contraccion: "Isométrica-excéntrica.",
        c: [],
      },
      {
        articulacion: "Rodilla",
        accion: "Extensión",
        musculos: "Cuádriceps: estabilizador.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Tobillo",
        accion: "Dorsiflexión si se agarra el pie",
        musculos: "Gastrocnemio: se alarga.",
        contraccion: "Pasiva.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Qué limita el rango: rigidez o tolerancia de isquios y fascia posterior, tensión neural del ciático y topes óseos de cadera.",
        c: [104, 94],
      },
      {
        t: "El pike activo (L-sit leg lifts) exige flexores de cadera concéntricos y rango de isquios al mismo tiempo (limitación por insuficiencia activa del agonista).",
        c: ["L1", "C"],
      },
      {
        t: "Progresa de parcial a full rango; sentado vs parado (cadena cinética), a una pierna (OL), con peso (W) y con déficit (box pike hang).",
        c: [],
      },
      {
        t: "Marco común de movilidad: las mejoras de rango de una sesión y de programas de 3 a 8 semanas se explican principalmente por modificación de la sensación (tolerancia), no por cambio estructural.",
        c: [90, 92],
      },
    ],
    siente: {
      t: "Tensión en la parte posterior del muslo, no en la lumbar.",
      c: ["C"],
    },
    compensa: [
      {
        error: "Flexión lumbar en lugar de flexión de cadera",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Rodillas flexionadas",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Pelvis que se va hacia atrás en lugar de hacia adelante",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Cuello hiperflexionado",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      {
        t: "Cadera adelante y atrás, no redondeá la espalda.",
        c: ["C"],
      },
      { t: "Pecho al muslo con columna larga.", c: ["C"] },
      {
        t: "Sentí tensión en la parte posterior del muslo, no en la lumbar.",
        c: ["C"],
      },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Hormigueo, ardor o tirón eléctrico que baja por detrás de la pierna al hacer pike: bajar el rango y derivar si se repite.",
          c: [96],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en el hueso de la nalga (isquion) o tirón agudo atrás del muslo.",
          c: ["C"],
        },
      },
    ],
    evidencia: {
      t: "La ruta usa el marco común de movilidad: las mejoras de rango de una sesión y de programas de 3 a 8 semanas se explican por modificación de la sensación (tolerancia) y no por cambio estructural; las técnicas neurodinámicas mejoraron la flexibilidad de isquios; el estiramiento estático y la facilitación neuromuscular propioceptiva dieron más rango a largo plazo que el balístico o dinámico. Para el jefferson no hay estudios directos, solo modelos in vitro.",
      c: [90, 91, 92, 104, 97, 98],
    },
    gestos: [
      "Pike sentado y parado",
      "Jefferson curl",
      "Box pike hang y box pike squat",
      "Pancake W",
      "Head to toe",
      "L-sit leg lifts (en CORE/PIKE)",
      "Windmill",
    ],
    pendientes: [
      {
        pendiente:
          "Jefferson curl con carga y pike con peso: inclusión y exclusión (osteoporosis, hernia, edad) y cómo progresar la carga (H12).",
        quien: "H",
      },
      {
        pendiente:
          "Qué gestos reconoce Nacho dentro de PIKE (4 categorías en el catálogo: hip dominant, core, spagat y movilidad), ya que la ruta es heterogénea (§5.4, preguntas de método).",
        quien: "N",
      },
      {
        pendiente:
          "Escalones de la progresión: la sección lista variables, no una escalera de pasos.",
        quien: "fuente",
      },
      {
        pendiente:
          "Rol del glúteo mayor y los isquios en la pelvis: la tabla los marca Ant/Al sin separar.",
        quien: "fuente",
      },
      {
        pendiente:
          "Mecanismo de las compensaciones: la investigación las lista sin explicarlas.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Inclinar el pecho hacia las piernas doblándote desde la cadera, con las rodillas estiradas, para ganar movilidad atrás de las piernas.",
    siente:
      "Tensión en la parte de atrás del muslo, no en la zona baja de la espalda.",
    tips: [
      "Doblá desde la cadera, no redondeés la espalda.",
      "Pecho al muslo con la columna larga.",
      "Sentí la tensión atrás del muslo, no en la espalda baja.",
    ],
    errores: [
      {
        error: "Redondear la espalda en vez de doblar la cadera",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
      {
        error: "Flexionar las rodillas",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
      {
        error: "Dejar caer el cuello",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
    ],
  },
} as const satisfies RutaContenido;
