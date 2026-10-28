import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de HT desde B-HT (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * El EMG del glúteo mayor en el hip thrust no predijo la hipertrofia [63]: las
 * marcas de las relaciones son las de la tabla y la evidencia mixta de B-HT.
 * Cuádriceps "activo" (vasto lateral 99,5 % vs 110 % MVIC [60]) queda como
 * estabilizador isométrico a ~90° (TI-H). Los isquios son sinergistas en
 * cadera (la rodilla los marca Ant/S): gana el rol más alto. ⚑N: "L. on box"
 * sin definir.
 */
export const HT = {
  code: "HT",
  slug: "hip-thrust",
  patron: "LOWER",
  categoria: "Cadera dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "gluteo-mayor",
        c: [60, 61],
        nota: "Fibras superiores e inferiores; pico en el bloqueo",
      },
    ],
    sinergista: [
      {
        m: "isquios",
        c: [60, 68],
        nota: "Con rodilla flexionada, predominan los mediales",
      },
      { m: "aductores", c: [], nota: "Aductor mayor" },
    ],
    estabilizador: [
      {
        m: "gluteo-medio",
        c: [],
        nota: "Muy exigido en la versión a una pierna",
      },
      { m: "oblicuos", c: [], nota: "Frenan la anteversión; control pélvico" },
      { m: "recto-abd", c: [], nota: "Frenan la anteversión" },
      { m: "erectores", c: [] },
      {
        m: "vastos",
        c: [60],
        nota: "Activo en isométrico con la rodilla a ~90°; más demanda con los pies cerca",
      },
      { m: "soleo", c: [], nota: "Apoyo de pie" },
      { m: "gemelo", c: [], nota: "Apoyo de pie" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Extensión de cadera en rango corto, con las escápulas apoyadas en banco o piso y la rodilla a unos 90° en el pico: carga sobre todo el glúteo mayor (fibras superiores e inferiores), con isquios y aductor mayor como apoyo. Muy bueno para activar glúteo; no hay evidencia de que sea mejor que la sentadilla en resultado.",
      c: [60, 61, 62, 63],
    },
    tipo: "Sin dato (inferido: dinámica), cadena cerrada",
    brazo: null,
    escalones: {
      pendiente:
        "La sección da variables de progresión (rango, carga, una pierna, palanca de isquios, explosividad), no una escalera de pasos única: falta la lista de escalones.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Preparación",
        texto: {
          t: "Escápulas apoyadas en banco o piso, pies apoyados.",
          c: [],
        },
      },
      {
        nombre: "Ascenso",
        texto: {
          t: "Concéntrico: extensión de cadera hasta el bloqueo (extensión completa), con las tibias verticales.",
          c: [],
        },
      },
      {
        nombre: "Pico",
        texto: {
          t: "Isométrico: pelvis en retroversión, cadera extendida.",
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
        articulacion: "Cadera",
        accion: "Extensión (hasta unos 0°) en plano sagital",
        musculos:
          "Glúteo mayor (fibras superiores e inferiores): motor. Isquios y aductor mayor: sinergistas.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: [],
      },
      {
        articulacion: "Cadera y pelvis",
        accion:
          "Estabilidad frontal y rotación (muy exigida en la versión a una pierna)",
        musculos:
          "Glúteo medio y menor, tensor de la fascia lata y oblicuos: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Rodilla",
        accion: "Unos 90° de flexión mantenida en el pico",
        musculos:
          "Cuádriceps activo (en un estudio el vasto lateral no difirió de la sentadilla: 99,5 % vs 110 % de la contracción máxima voluntaria en promedio; más demanda con los pies cerca). Isquios: antagonistas o sinergistas.",
        contraccion: "Isométrica.",
        c: [60],
      },
      {
        articulacion: "Tobillo",
        accion: "Neutro, apoyo de pie",
        musculos: "Sóleo y gastrocnemio: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Columna lumbar",
        accion: "Neutral, evita la hiperextensión",
        musculos:
          "Recto abdominal y oblicuos: estabilizadores isométricos (frenan la anteversión). Erectores: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Rango: puente bajo en piso, hombros sobre banco o caja, talones elevados.",
        c: [],
      },
      { t: "Carga externa (W, barra).", c: [] },
      {
        t: "Una pierna (OL): duplica la carga relativa y exige glúteo medio y control pélvico.",
        c: ["C"],
      },
      {
        t: "Palanca de isquios (anillas o slide): al alejarse la pierna sube la demanda de isquios y flexores de rodilla con la cadera extendida; coherente con que los isquios mediales dominan en el puente.",
        c: ["C", 68],
      },
      { t: "Explosividad (HT EXP).", c: [] },
    ],
    siente: {
      t: "Glúteo e isquios. Con los pies muy lejos pesan más los isquios y con los pies muy cerca, el cuádriceps.",
      c: ["C"],
    },
    compensa: [
      {
        error:
          "Hiperextensión lumbar al bloqueo (costillas abiertas, pelvis en anteversión)",
        porque: {
          t: "Se siente en la zona lumbar y se pierde el glúteo.",
          c: ["C"],
        },
      },
      {
        error: "Pies muy lejos o muy cerca",
        porque: {
          t: "Muy lejos carga más los isquios; muy cerca, el cuádriceps.",
          c: ["C"],
        },
      },
      {
        error: "Calambre de isquios",
        porque: {
          t: "Se ajusta alejando un poco los pies o bajando la cadera; no es bandera.",
          c: ["C"],
        },
      },
      {
        error: "Rodillas que colapsan",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "En una pierna: rotación y caída de la pelvis libre",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Cuello hiperextendido",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Mentón al pecho, costillas abajo.", c: ["C"] },
      { t: "Empujá con los talones, tibias verticales arriba.", c: ["C"] },
      { t: "Pausa de 1 segundo apretando.", c: ["C"] },
      { t: "Pelvis en retroversión al subir.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor lumbar localizado al extender, o que baja a la pierna con adormecimiento o debilidad.",
          c: [96, 103],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la parte alta de atrás del muslo, cerca del isquion, que persiste o aparece con un tirón súbito.",
          c: ["C"],
        },
      },
    ],
    evidencia: {
      t: "Evidencia mixta, con muestras chicas y mayoría de mujeres entrenadas o atletas. Con barra y 10RM estimado, el glúteo mayor se activó más que en la sentadilla trasera (superior 69,5 % vs 29,4 %; inferior 86,8 % vs 45,4 %), sin diferencia en el vasto lateral; en atletas con 3RM el pico de activación del glúteo mayor fue mayor en el hip thrust con menor fuerza de reacción; la activación es mayor en el tercio superior del rango (bloqueo), mientras que la búlgara rinde más en el tercio inferior y da más vasto lateral en todo el recorrido. En 9 semanas la hipertrofia glútea fue similar entre hip thrust y sentadilla (la sentadilla hizo crecer más cuádriceps y aductores) y la mayor activación del hip thrust no predijo la hipertrofia. El puente con rodillas flexionadas tuvo de las menores razones bíceps femoral/mediales (más isquios mediales). Lectura honesta: carga la cadera en rango corto y es muy bueno para activar glúteo; no hay evidencia de que sea mejor que la sentadilla en resultado.",
      c: [60, 61, 62, 63, 68],
    },
    gestos: [
      "Hip thrust (puente de glúteo)",
      "HT on box",
      "HT en anillas (reach on rings)",
      "HT slide",
      "HT a una pierna (OL)",
      "HT explosivo (EXP)",
      "Low bridge",
    ],
    pendientes: [
      {
        pendiente:
          "Significado de 'L.' en 'HT L. ON BOX OL' (§5.4 #12): sin hipótesis, hay que preguntarle a Nacho.",
        quien: "N",
      },
      {
        pendiente:
          "Escalones de la progresión: la sección da variables, no una lista de pasos.",
        quien: "fuente",
      },
      {
        pendiente:
          "Mecanismo de las compensaciones (rodillas que colapsan, caída de la pelvis libre, cuello hiperextendido): la investigación no lo da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Subís la cadera apoyando la espalda alta en un banco o en el piso, hasta dejarla bien estirada con las espinillas verticales.",
    siente:
      "El glúteo y la parte de atrás del muslo. Con los pies muy lejos se siente más atrás del muslo; muy cerca, más adelante.",
    tips: [
      "Mentón al pecho, costillas abajo.",
      "Empujá con los talones, espinillas verticales arriba.",
      "Pausa de 1 segundo apretando.",
    ],
    errores: [
      {
        error: "Arquear la espalda baja arriba",
        texto: "Se siente en la espalda baja y se pierde el glúteo.",
      },
      {
        error: "Pies muy lejos o muy cerca",
        texto:
          "Muy lejos trabaja más atrás del muslo; muy cerca, más adelante.",
      },
    ],
  },
} as const satisfies RutaContenido;
