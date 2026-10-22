import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de SIDE PCK (Side Pancake, D1) desde C3 (tabla
 * articular) + TI-H. Borrador (D5).
 *
 * Corrección A9 / R3-3 (B.2, §1.6): el contenido es pancake lateral, no un
 * pike. Pasada la vertical, el descenso lo frenan en excéntrico el cuadrado
 * lumbar y los oblicuos del lado CONTRARIO (el costado que se estira), que
 * también cargan el sostén y el retorno concéntrico; el lado hacia el que te
 * inclinás solo trabaja en la versión activa. ⚑H (H2). Los isquios mediales
 * quedan antagonistas (la tabla de rodilla los marca Ant; gana ese rol sobre
 * "alargados"). Fuera de las relaciones: intertransversos y deltoides (sin id);
 * dorsal y pectoral de TI-H ("SIDE PCK windmill") sin rol explícito.
 */
export const SIDE_PCK = {
  code: "SIDE PCK",
  slug: "side-pancake",
  patron: "MOVILIDAD",
  categoria: "Rangos",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "oblicuos",
        c: ["L1", "R"],
        nota: "Lado contrario: excéntrico al bajar, isométrico en el sostén, concéntrico al subir; a la vez alargados",
      },
      {
        m: "cuadrado",
        c: ["L1", "R"],
        nota: "Lado contrario: excéntrico al bajar, isométrico en el sostén, concéntrico al subir; a la vez alargado",
      },
    ],
    sinergista: [],
    estabilizador: [
      { m: "vastos", c: [], nota: "Rodilla extendida (pierna recta)" },
      { m: "gluteo-medio", c: [], nota: "Pelvis neutra y cuadrada" },
      { m: "manguito", c: [], nota: "Windmill / overhead" },
    ],
    antagonista: [
      {
        m: "isquios",
        c: [],
        nota: "Isquios mediales co-activos en la rodilla; además alargados en la cadera",
      },
    ],
    estira: [
      {
        m: "aductores",
        c: [],
        nota: "Grácil, aductor largo y magno alargados (base ancha)",
      },
    ],
  },
  fichaProfe: {
    resumen: {
      t: "Flexión lateral del tronco con las piernas abiertas (pancake lateral). Pasada la vertical, la gravedad hace el trabajo y el descenso lo frenan en excéntrico el cuadrado lumbar y los oblicuos del lado contrario a la inclinación (el costado que se estira); el lado hacia el que te inclinás solo trabaja en concéntrico si se tira activamente hacia abajo (versión activa).",
      c: ["R"],
    },
    tipo: "Dinámica (21 % isométrica)",
    brazo: null,
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Base",
        texto: { t: "Sentado o parado en base ancha.", c: [] },
      },
      {
        nombre: "Inclinación",
        texto: {
          t: "Inclinación lateral hacia una pierna: pasada la vertical, el descenso lo frenan en excéntrico el cuadrado lumbar y los oblicuos del lado contrario (el costado que se estira). El lado hacia el que se inclina solo trabaja en concéntrico en la versión activa.",
          c: ["R"],
        },
      },
      {
        nombre: "Sostén",
        texto: { t: "Sostén del rango (isométrico).", c: [] },
      },
      {
        nombre: "Retorno",
        texto: {
          t: "Concéntrico del lado contrario.",
          c: ["R"],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Columna lumbar y torácica",
        accion: "Flexión lateral, plano frontal",
        musculos:
          "Oblicuos, cuadrado lumbar e intertransversos del lado contrario: motores (excéntrico al bajar, isométrico en el sostén, concéntrico al subir) y a la vez alargados, junto con la fascia toracolumbar. En el lado de la inclinación son motores concéntricos solo en la versión activa. El rango por segmento es chico.",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: ["L1", "R"],
      },
      {
        articulacion: "Cadera (ambas)",
        accion:
          "Abducción (base ancha), plano frontal; en la cadera de la pierna hacia la que se inclina, flexión",
        musculos:
          "Aductores (grácil, largo y magno): se alargan. Isquios mediales: se alargan.",
        contraccion: "Isométrica pasiva.",
        c: [],
      },
      {
        articulacion: "Rodilla",
        accion: "Extensión (pierna recta) o flexión (pierna doblada)",
        musculos: "Cuádriceps: estabilizador. Isquios mediales: antagonistas.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Hombro (windmill y overhead)",
        accion: "Flexión",
        musculos: "Deltoides y manguito: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Pelvis",
        accion: "Neutra y cuadrada",
        musculos: "Glúteo medio: estabilizador.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Progresa por rango (parcial a full), pierna doblada a recta, peso (estático o dinámico) y unilateral (a una pierna).",
        c: [],
      },
      {
        t: "El giro (twist) y el windmill agregan rotación y control antirrotación.",
        c: ["C"],
      },
      {
        t: "Marco común de movilidad: el rango lo limitan lo articular y óseo, lo muscular y del tejido conectivo, y lo neural y sensorial; la mejora a corto plazo es principalmente de tolerancia al estiramiento, no estructural.",
        c: [94, "L1", 90, 92, 104],
      },
    ],
    siente: {
      pendiente:
        "La sección de side pancake no trae un bloque de dónde se siente; no se infiere de la tabla de tejidos alargados.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Rotar el tronco en vez de inclinar lateralmente",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Flexión hacia adelante en lugar de lateral",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Cadera que se despega del suelo",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Rodilla que rota",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Colapso lumbar",
        porque: {
          t: "La investigación la lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Costado largo, no te dejes caer.", c: ["C"] },
      { t: "Cadera pegada al piso.", c: ["C"] },
      { t: "Pecho al costado, no al piso.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Pinchazo o dolor en la cara interna de la ingle o del muslo.",
          c: [93],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor lumbar agudo, o que baja a la pierna.",
          c: [96],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la cara interna de la rodilla en las variantes con la pierna doblada.",
          c: ["C"],
        },
      },
    ],
    evidencia: {
      t: "No hay estudios del side pancake ni del windmill de oblicuos. Lo relacionado: en el puente lateral (side bridge, otro ejercicio) el oblicuo externo y el glúteo medio se activaron más del 45 % de la contracción voluntaria máxima isométrica en 30 sujetos, lo que sugiere que la musculatura lateral del tronco es un estabilizador relevante de la pelvis. Para la estabilidad lumbar, ningún músculo domina. El resto es anatomía de manual.",
      c: [25, 101, "L1"],
    },
    gestos: [
      "Pancake lateral (flexión lateral con piernas abiertas)",
      "A una pierna (OL)",
      "Con carga (W)",
      "Con giro (twist)",
      "Windmill (también overhead)",
    ],
    pendientes: [
      {
        pendiente:
          "Validar la corrección de roles del side pancake: excéntrico y concéntrico del lado contrario, y el lado de la inclinación solo en la versión activa (H2, R3-3).",
        quien: "H",
      },
      {
        pendiente: "Dónde se siente: la sección no trae ese bloque.",
        quien: "fuente",
      },
      {
        pendiente:
          "Qué limita el rango específico del side pancake: la sección no lo trae, solo el marco común de movilidad.",
        quien: "fuente",
      },
      {
        pendiente:
          "Evidencia específica del side pancake y del windmill, y mecanismo de las compensaciones: la investigación no los tiene.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Inclinarte hacia un costado con las piernas abiertas, sin girar el tronco y con la cadera firme en el piso.",
    siente: {
      pendiente: "La investigación no dice dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Costado largo, no te dejes caer.",
      "Cadera pegada al piso.",
      "Pecho al costado, no al piso.",
    ],
    errores: [
      {
        error: "Girar el tronco en vez de inclinarte al costado",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
      {
        error: "Inclinarte hacia adelante en lugar de al costado",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
      {
        error: "Despegar la cadera del piso",
        texto: "Pasa seguido: tu profe te ayuda a corregirlo.",
      },
    ],
  },
} as const satisfies RutaContenido;
