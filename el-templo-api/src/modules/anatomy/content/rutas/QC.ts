import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de QC desde A3 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * Corrección R3-2 (B.2): con el torso reclinado, la gravedad tiende a extender
 * la cadera y la frenan los flexores de cadera (recto femoral, iliopsoas) en
 * isométrico; el glúteo mayor solo co-contrae y los abdominales estabilizan
 * (antiextensión lumbar). ⚑H (H2).
 *
 * A3 declara que todo es "razonamiento a partir de BI2 y [L1], no evidencia de
 * QC": las celdas sin marca propia llevan L1. ⚑N: la definición del quad curl
 * (seiza, quad box, tibiales pared) se confirma con Nacho antes de publicar. El
 * tibial anterior es motor solo en "tibiales pared" y no va en las relaciones:
 * la vista del alumno lo listaría como "hace el movimiento en Quad Curl".
 */
export const QC = {
  code: "QC",
  slug: "quad-curl",
  patron: "LOWER",
  categoria: "Rodilla dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "vastos",
        c: ["L1"],
        nota: "Excéntrico al reclinarse, concéntrico al volver",
      },
      {
        m: "recto-fem",
        c: ["C", "L1", "R"],
        nota: "Muy exigido con la cadera en extensión; además flexor de cadera isométrico con el torso reclinado",
      },
      {
        m: "psoas",
        c: ["R"],
        nota: "Isométrico: la gravedad tiende a extender la cadera y lo frena",
      },
    ],
    sinergista: [],
    estabilizador: [
      {
        m: "gluteo-mayor",
        c: ["R"],
        nota: "Co-contracción para no quebrar la cadera hacia adelante",
      },
      {
        m: "recto-abd",
        c: ["R"],
        nota: "Antiextensión lumbar",
      },
      {
        m: "oblicuos",
        c: ["R"],
        nota: "Antiextensión lumbar",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Desde sentado sobre los talones, el cuádriceps frena al recostarse hacia atrás con el cuerpo en línea y empuja al volver. La cadera se sostiene con los flexores de cadera en isométrico y los abdominales evitan la hiperextensión lumbar. La definición del ejercicio no está confirmada: es razonamiento, no evidencia de QC.",
      c: ["L1", "R"],
    },
    tipo: "Sin dato (inferido: dinámica con excéntrico), cadena cerrada",
    brazo: null,
    escalones: {
      pendiente:
        "La sección da variables de progresión (palanca, rango, asistencia, caja, carga, una pierna), no una escalera de pasos única: falta la lista de escalones.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Sentado sobre los talones",
        texto: {
          t: "Rodilla en flexión profunda, con el empeine apoyado.",
          c: [],
        },
      },
      {
        nombre: "Extensión o recostado",
        texto: {
          t: "Se extienden las rodillas y se eleva la cadera (concéntrico) y/o se recuesta el torso hacia atrás, con el cuádriceps frenando en excéntrico.",
          c: [],
        },
      },
      {
        nombre: "Posición erguida o inclinada",
        texto: { t: "Isométrico.", c: [] },
      },
      {
        nombre: "Retorno",
        texto: { t: "Se vuelve a la posición de partida.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Rodilla",
        accion: "Flexión profunda → extensión (plano sagital)",
        musculos:
          "Cuádriceps: motor, en excéntrico al reclinarse y en concéntrico al volver. El recto femoral está muy exigido si la cadera está en extensión (es biarticular).",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: ["L1", "C"],
      },
      {
        articulacion: "Cadera",
        accion: "Mantenida en 0° (cuerpo en línea)",
        musculos:
          "Flexores de cadera (recto femoral e iliopsoas): motores isométricos cuando el torso se reclina, porque la gravedad tiende a extender la cadera. Glúteo mayor: co-contracción para no quebrar la cadera hacia adelante. Abdominales: estabilizadores (antiextensión lumbar).",
        contraccion: "Isométrica.",
        c: ["R"],
      },
      {
        articulacion: "Tobillo",
        accion: "Plantiflexión pasiva (empeine al suelo)",
        musculos:
          "Se estiran el tibial anterior y los extensores de los dedos. En 'tibiales pared', el tibial anterior es motor (dorsiflexión, concéntrico y excéntrico).",
        contraccion: "Isométrica pasiva.",
        c: ["L1"],
      },
      {
        articulacion: "Columna lumbar",
        accion: "Neutro: se evita la hiperextensión",
        musculos: "Abdominales (recto abdominal y oblicuos): estabilizadores.",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
    ],
    progresa: [
      {
        t: "Palanca: el brazo de momento sobre la rodilla crece con la distancia horizontal entre la rodilla y el centro de masa, así que reclinar el torso más atrás es más palanca.",
        c: ["C"],
      },
      { t: "Rango: parcial, completo.", c: [] },
      { t: "Asistencia con manos o banda.", c: [] },
      { t: "Caja.", c: [] },
      { t: "Carga externa (W).", c: [] },
      { t: "Una pierna (OL en el catálogo).", c: [] },
    ],
    siente: {
      pendiente:
        "La sección no tiene bloque 'dónde se siente' (solo el análisis articular).",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Cadera que se quiebra (pike)",
        porque: {
          t: "Acorta la palanca.",
          c: ["C"],
        },
      },
      {
        error: "Hiperextensión lumbar (costillas abiertas)",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: ["C"],
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
        error: "Descargar con los tobillos plantiflexionados dolorosos",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Línea recta de rodillas a hombros.", c: ["C"] },
      { t: "Bajá con las costillas abajo.", c: ["C"] },
      { t: "Controlá el descenso, no te tires.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la cara posterior de la rodilla en flexión profunda sostenida.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor anterior de rodilla persistente.", c: [59] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor de empeine o tobillo anterior que no cede.",
          c: ["C"],
        },
      },
    ],
    evidencia: {
      t: "No hay evidencia de quad curl: el ejercicio no está descripto en el repo y todo es razonamiento a partir de la mecánica de la rodilla y de los libros de referencia. El reverse nordic curl (análogo mecánico: cuádriceps excéntrico con la cadera extendida y el torso reclinado) no produjo mayor activación excéntrica de cuádriceps que la sentadilla monopodal, la zancada o la búlgara, con menor rango de rodilla (n=23). Arrodillarse repetidamente a flexión profunda: datos de cadáver y de prótesis, con la advertencia de más presión en cartílago y meniscos en rodillas intactas si es crónico y repetitivo (extrapolación débil).",
      c: [53, 108, "L1"],
    },
    gestos: [
      "Seiza (sentado sobre los talones): seiza reach y seiza up and down",
      "Quad curl: parcial, asistido, completo y con peso",
      "Quad on box (quad box)",
      "Tibiales pared (elevación de punta de pie de espaldas a la pared)",
    ],
    pendientes: [
      {
        pendiente:
          "Definición del quad curl, de seiza y de quad box: el ejercicio no está descripto en el repo y hay que confirmarla con Nacho antes de publicar.",
        quien: "N",
      },
      {
        pendiente:
          "Validar la corrección de roles: los flexores de cadera sostienen la cadera en isométrico, el glúteo solo co-contrae y los abdominales estabilizan.",
        quien: "H",
      },
      {
        pendiente:
          "Seiza y quad curl en rodillas con antecedente de menisco o dolor rotuliano: si se permite rango parcial y con qué criterio.",
        quien: "H",
      },
      {
        pendiente:
          "Criterios de edad y carga para seiza y quad curl en menores y adolescentes.",
        quien: "H",
      },
      {
        pendiente:
          "Umbral de tiempo (2 a 3 semanas) para el dolor de rodilla que persiste, y cómo distinguirlo del dolor muscular tardío: lo fija un kinesiólogo humano.",
        quien: "H",
      },
      {
        pendiente:
          "Dónde se siente, escalones de la progresión y mecanismo de las compensaciones (hiperextensión lumbar, valgo, tobillos dolorosos): la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Partís sentado sobre los talones, te recostás hacia atrás con el cuerpo en línea y volvés con control.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Línea recta de las rodillas a los hombros.",
      "Bajá con las costillas abajo.",
      "Controlá el descenso, no te tires.",
    ],
    errores: [
      {
        error: "Cadera quebrada",
        texto: "Se acorta la palanca y el ejercicio cambia.",
      },
      {
        error: "Costillas abiertas y espalda baja arqueada",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
    ],
  },
} as const satisfies RutaContenido;
