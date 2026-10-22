import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de DS desde B-DS (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * Corrección R2: la tabla de B-DS pone cuádriceps como motor (TI-H no lo
 * listaba), así que DS lleva vastos. B-DS declara que todo es inferencia [C]:
 * las celdas sin marca propia llevan C. ⚑N: el dragon squat no tiene ninguna
 * fuente primaria ni de revisión y "DP" (dragon pistol) está sin resolver.
 * Fuera de las relaciones: el sóleo del tobillo de apoyo ("EXC / CON" sin rol
 * en la tabla) y TFL / rotadores (sin id).
 */
export const DS = {
  code: "DS",
  slug: "dragon-squat",
  patron: "LOWER",
  categoria: "Cadera dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "gluteo-mayor", c: ["C"], nota: "Cadera de apoyo" },
      {
        m: "vastos",
        c: ["C", 45],
        nota: "Rodilla de apoyo: menos momento que en el pistol si el tronco se inclina",
      },
    ],
    sinergista: [
      { m: "aductores", c: ["C"], nota: "Aductor mayor" },
      { m: "isquios", c: ["C"] },
    ],
    estabilizador: [
      {
        m: "gluteo-medio",
        c: ["C"],
        nota: "Control frontal y rotación: la pierna libre cruzada tiende a rotar la pelvis",
      },
      { m: "oblicuos", c: ["C"], nota: "Antirrotación y neutralidad" },
      { m: "erectores", c: ["C"], nota: "Antirrotación y neutralidad" },
      { m: "cuadrado", c: ["C"], nota: "Antirrotación y neutralidad" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Sentadilla a una pierna con la pierna libre cruzada por detrás del cuerpo. Con la pierna libre atrás el centro de masa se retrasa y el tronco se inclina, y eso corre el momento hacia la cadera. La definición es una inferencia sin fuente y falta confirmarla con Nacho.",
      c: ["C", 45, 40],
    },
    tipo: "Sin dato (inferido: dinámica), cadena cerrada",
    brazo: null,
    escalones: {
      pendiente:
        "La sección da variables de progresión (rango, asistencia, caja, carga, salto, shuffle), no una escalera de pasos única: falta la lista de escalones.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Apoyo (inferida)",
        texto: {
          t: "Apoyo en una pierna, con la libre cruzada atrás.",
          c: ["C"],
        },
      },
      {
        nombre: "Descenso (inferida)",
        texto: {
          t: "Excéntrico, con inclinación del tronco hacia adelante como contrapeso de la pierna trasera.",
          c: ["C"],
        },
      },
      {
        nombre: "Fondo (inferida)",
        texto: { t: "Isométrico.", c: ["C"] },
      },
      {
        nombre: "Ascenso (inferida)",
        texto: { t: "Concéntrico.", c: ["C"] },
      },
      {
        nombre: "Bloqueo (inferida)",
        texto: { t: "Se termina de extender la pierna de apoyo.", c: ["C"] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Cadera de apoyo",
        accion: "Flexión → extensión (plano sagital)",
        musculos: "Glúteo mayor: motor. Aductor mayor e isquios: sinergistas.",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: ["C"],
      },
      {
        articulacion: "Cadera de apoyo",
        accion:
          "Control frontal y rotación (la pierna libre cruzada tiende a rotar la pelvis)",
        musculos:
          "Glúteo medio y menor, tensor de la fascia lata y rotadores: estabilizadores.",
        contraccion: "Isométrica-excéntrica.",
        c: ["C"],
      },
      {
        articulacion: "Rodilla de apoyo",
        accion: "Flexión → extensión (plano sagital)",
        musculos:
          "Cuádriceps: motor, con menos momento que en el pistol si el tronco se inclina.",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: ["C", 45],
      },
      {
        articulacion: "Tobillo de apoyo",
        accion: "Dorsiflexión → plantiflexión",
        musculos: "Sóleo: excéntrico y concéntrico.",
        contraccion: "Excéntrica / concéntrica.",
        c: ["C"],
      },
      {
        articulacion: "Cadera libre",
        accion: "Extensión mantenida y aducción/rotación",
        musculos:
          "Glúteo mayor y aductores de la pierna libre: estabilizadores isométricos.",
        contraccion: "Isométrica.",
        c: ["C"],
      },
      {
        articulacion: "Pelvis y lumbar",
        accion: "Antirrotación y neutralidad",
        musculos: "Oblicuos, erectores y cuadrado lumbar: estabilizadores.",
        contraccion: "Isométrica.",
        c: ["C"],
      },
    ],
    progresa: [
      { t: "Rango: parcial, completo.", c: ["C"] },
      { t: "Asistencia (DP assisted).", c: ["C"] },
      { t: "Caja.", c: ["C"] },
      { t: "Carga externa (W).", c: ["C"] },
      { t: "Salto.", c: ["C"] },
      { t: "Shuffle (desplazamientos).", c: ["C"] },
      {
        t: "La cadera de apoyo queda en flexión, aducción y rotación interna, la posición que más comprime la parte anterior de la cadera: progresar el rango lento y no forzar si da pinchazo en la ingle.",
        c: ["C"],
      },
    ],
    siente: {
      pendiente:
        "La sección no tiene bloque 'dónde se siente' (solo el análisis articular).",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Rotación pélvica por la pierna libre",
        porque: {
          t: "La pierna libre cruzada tiende a rotar la pelvis.",
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
        error: "Talón que despega",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Lumbar que se flexiona al fondo",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Cadera atrás, pecho adelante.", c: ["C"] },
      {
        t: "Pelvis cuadrada, no dejes que la pierna de atrás te gire.",
        c: ["C"],
      },
      { t: "Apretá el glúteo de la pierna de apoyo.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: { t: "Dolor anterior de rodilla persistente.", c: [59] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Pinchazo en la ingle en flexión profunda con rotación.",
          c: [94],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor lumbar que baja a la pierna.", c: [96] },
      },
    ],
    evidencia: {
      t: "No hay ninguna fuente primaria ni de revisión sobre el dragon squat: todo lo de esta ficha es inferencia. Se lo clasifica como cadera dominante porque, con la pierna libre detrás, el centro de masa se retrasa y el tronco se inclina, lo que corre el momento hacia la cadera. Es coherente con el hallazgo de que los ejercicios unilaterales de cadera dominante demandan más glúteo.",
      c: ["C", 45, 40, 51, 52],
    },
    gestos: [
      "Dragon squat (DS): parcial y asistido, shuffle, salto con peso",
      "Dragon pistol (DP, sigla a confirmar): asistido, parcial, completo, full ROM y pulse con peso",
      "Dragon HT (nombre que figura en el título de la sección, sin descripción)",
    ],
    pendientes: [
      {
        pendiente:
          "Descripción del dragon squat (inferido: sentadilla monopodal con la pierna libre por detrás) y qué significa 'DP' (hipótesis: dragon pistol), también en Dragon HT.",
        quien: "N",
      },
      {
        pendiente:
          "Dragon squat con una cadera con dolor articular profundo o hiperlaxa: cuándo regresar el rango y cuándo contraindicar (también pistol y pigeon).",
        quien: "H",
      },
      {
        pendiente:
          "Umbral de tiempo (2 a 3 semanas) para el dolor de rodilla que persiste, y cómo distinguirlo del dolor muscular tardío: lo fija un kinesiólogo humano.",
        quien: "H",
      },
      {
        pendiente:
          "Criterios de edad y carga para los saltos en menores y adolescentes.",
        quien: "H",
      },
      {
        pendiente:
          "Dónde se siente, escalones de la progresión y mecanismo de las compensaciones (salvo la rotación pélvica): la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Sentadilla a una pierna, con la otra pierna cruzada por detrás.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Cadera atrás, pecho adelante.",
      "Cadera cuadrada: no dejes que la pierna de atrás te gire.",
      "Apretá el glúteo de la pierna que apoya.",
    ],
    errores: [
      {
        error: "Cadera que gira",
        texto: "La pierna de atrás tiende a girarte la cadera.",
      },
      {
        error: "Rodilla hacia adentro",
        texto: "Pasa seguido: tu profe te ayuda a corregirla.",
      },
      {
        error: "Talón que se levanta",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
    ],
  },
} as const satisfies RutaContenido;
