import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de REVERSE HYPER desde C5 (tabla articular) + TI-H.
 * Borrador (D5).
 *
 * Los dos estudios son de máquina y se contradicen en el EMG de glúteo e
 * isquios [99][100]; la transferencia a la versión libre no está verificada
 * (C5). Erectores: la tabla de cadera los marca "Est-S" y la lumbar
 * "Est-ISO (alto)": gana sinergista; TI-H los lista como motor ("E alto").
 */
export const REVERSE_HYPER = {
  code: "REVERSE HYPER",
  slug: "reverse-hyper",
  patron: "MOVILIDAD",
  categoria: "Rangos",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "gluteo-mayor", c: [99, 100], nota: "Extensión de cadera" },
      { m: "isquios", c: [99, 100], nota: "Extensión de cadera" },
    ],
    sinergista: [
      {
        m: "erectores",
        c: [99, 100],
        nota: "Cadera: Est-S; lumbar: isométrico alto, es el límite del rango",
      },
    ],
    estabilizador: [
      { m: "recto-abd", c: [], nota: "Pelvis: retroversión leve al final" },
      {
        m: "vastos",
        c: [],
        nota: "Rodilla: extendida (str) o flexionada (tuck)",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Extensión de cadera boca abajo, con el cuerpo apoyado y las piernas colgando: glúteo mayor e isquios son motores y la lumbar (erectores espinales) marca el límite del rango. Los estudios son con máquina; la transferencia a la versión libre del catálogo no está verificada.",
      c: [99, 100, "C"],
    },
    tipo: "Dinámica (inferido), cadena abierta en las piernas (inferido)",
    brazo: null,
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Piernas colgando",
        texto: {
          t: "Cadera a unos 90°; la lumbar se flexiona algo al fondo (unos 20° en máquina). En la versión libre hay que controlar ese rango.",
          c: [100],
        },
      },
      {
        nombre: "Ascenso",
        texto: {
          t: "Concéntrico: extensión de cadera hasta la horizontal, con las rodillas extendidas en 'str' y flexionadas en 'tuck'.",
          c: [],
        },
      },
      {
        nombre: "Pico",
        texto: { t: "Isométrico en la horizontal.", c: [] },
      },
      {
        nombre: "Descenso",
        texto: { t: "Excéntrico: péndulo controlado.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Cadera",
        accion: "Extensión → flexión en plano sagital",
        musculos:
          "Glúteo mayor e isquios: motores. Erectores: estabilizadores o sinergistas.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: [],
      },
      {
        articulacion: "Lumbar",
        accion: "Neutro → leve extensión (límite del rango)",
        musculos: "Erectores espinales: estabilizadores isométricos (alto).",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Pelvis",
        accion: "Retroversión leve al final",
        musculos: "Glúteo mayor: sinergista. Abdominales: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Rodilla",
        accion: "Extensión (str) o flexión (tuck)",
        musculos: "Cuádriceps e isquios: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Largo de la palanca: de tuck a str hay más brazo de momento.",
        c: ["C"],
      },
      { t: "Rango: de half a full.", c: [] },
      { t: "Unilateral (OL).", c: [] },
      { t: "Explosividad (donkey kick).", c: [] },
      { t: "Isométrico largo.", c: [] },
    ],
    siente: {
      pendiente:
        "La sección no tiene un bloque 'dónde se siente' para esta ruta.",
      quien: "fuente",
    },
    compensa: [
      {
        error:
          "Subir las piernas por hiperextensión lumbar en vez de por cadera",
        porque: {
          t: "La lumbar es el límite del rango: la subida tiene que salir del glúteo, no de la espalda.",
          c: ["C"],
        },
      },
      {
        error: "Balancear con inercia",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Rotación pélvica en la versión a una pierna",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Flexión de rodillas",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Subí las piernas desde el glúteo, no desde la espalda.", c: ["C"] },
      { t: "Costillas abajo.", c: ["C"] },
      { t: "Frená en horizontal, no pases.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor lumbar al extender, sobre todo si es de un solo lado y en adolescentes.",
          c: [103],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor que baja por la pierna o entumecimiento.",
          c: [96],
        },
      },
    ],
    evidencia: {
      t: "Estudios con máquina de reverse hyper; la versión del catálogo parece libre y la transferencia no está verificada. Reverse hyper vs hiperextensión (10 sujetos): mayores picos de activación de erectores espinales, glúteo mayor y bíceps femoral con el reverse hyper. En otro estudio (20 sujetos, carga equivalente) la hiperextensión tuvo más activación integrada de glúteo mayor y bíceps femoral, y el reverse hyper mayor momento lumbar pico (+129 %) pero menos flexión lumbar (20,4° vs 31,1°) y más rango muslo-tronco (76,6° vs 64,7°). Resultados contradictorios (distintos protocolos); el segundo describe al reverse hyper como patrón con mayor rango de cadera y menos estrés angular lumbar.",
      c: [99, 100, "C"],
    },
    gestos: [
      "RH full",
      "RH half",
      "RH str (rodillas extendidas)",
      "RH tuck (rodillas flexionadas)",
      "RH a una pierna (OL)",
      "Donkey kick",
    ],
    pendientes: [
      {
        pendiente:
          "Transferencia de los estudios de máquina a la versión libre del catálogo, y resultados contradictorios entre los dos estudios: la investigación no lo resuelve.",
        quien: "fuente",
      },
      {
        pendiente:
          "Dónde se siente y mecanismo de las compensaciones (balanceo, rotación pélvica, flexión de rodillas): la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Con el cuerpo apoyado y las piernas colgando, llevás las piernas hacia atrás y arriba hasta la horizontal, estirando la cadera.",
    siente: {
      pendiente: "Todavía no tenemos escrito dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Subí las piernas desde el glúteo, no desde la espalda.",
      "Costillas abajo.",
      "Frená en horizontal, no pases.",
    ],
    errores: [
      {
        error: "Subir las piernas arqueando la espalda baja",
        texto: "El movimiento tiene que salir de la cadera, no de la espalda.",
      },
      {
        error: "Balancear las piernas con impulso",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
    ],
  },
} as const satisfies RutaContenido;
