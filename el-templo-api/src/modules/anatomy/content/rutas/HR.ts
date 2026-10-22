import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de HR desde S6.2 (core posterior) + S6.3 (core
 * lateral), tabla articular + S8. Borrador (D5).
 *
 * Junta las dos secciones: erectores y glúteo mayor/isquios del core posterior
 * (S6.2, incluida la fila de arch hold, R2-27) y oblicuos, cuadrado lumbar y
 * glúteo medio de las planchas laterales (S6.3). Los oblicuos son antagonistas
 * en S6.2 y M/Est en S6.3: gana el rol más alto (motor).
 *
 * Fuera de las relaciones: trapecio inferior y romboides del arch hold ("si
 * los brazos van adelante", sin rol explícito) y el deltoides de S6.3 (sin id).
 * ⚑N: qué ejercicios componen "bote espinal", "espinal cajón", "espinal 360" y
 * "espinal A 1" se confirma con los profes.
 */
export const HR = {
  code: "HR",
  slug: "espinales-y-planchas-laterales",
  patron: "CORE",
  categoria: "Anterior · lateral · posterior",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "erectores",
        c: ["L1", "R"],
        nota: "Con los multífidos: motor del retorno y del arch hold",
      },
      { m: "gluteo-mayor", c: ["L1", "R"] },
      { m: "isquios", c: ["L1", "R"] },
      {
        m: "cuadrado",
        c: [26, 25],
        nota: "Planchas laterales: anti-flexión lateral",
      },
      {
        m: "oblicuos",
        c: [26, 25],
        nota: "Planchas laterales; en el core posterior se alargan (antagonista)",
      },
      {
        m: "gluteo-medio",
        c: [25],
        nota: "Planchas laterales: pierna de abajo",
      },
    ],
    sinergista: [],
    estabilizador: [
      { m: "serrato", c: ["L1", 36], nota: "Brazo de apoyo" },
      { m: "manguito", c: ["L1", 36], nota: "Supraespinoso, brazo de apoyo" },
      { m: "trap-inf", c: ["L1"], nota: "Brazo de apoyo" },
    ],
    antagonista: [
      {
        m: "recto-abd",
        c: ["L1"],
        nota: "Core posterior: se alarga y modula",
      },
    ],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Dos familias de core. Espinales: flexión segmentaria controlada de la columna y extensión vertebral de vuelta (Jefferson curl, torsión, cajón, arch hold boca abajo), con erectores, multífidos, glúteo mayor e isquiotibiales como motores. Planchas laterales: anti-flexión lateral, con cuadrado lumbar, oblicuos y glúteo medio.",
      c: ["L1", "R", 25, 26],
    },
    tipo: "Dinámica (inferido)",
    brazo: null,
    escalones: {
      pendiente:
        "La sección no da una escalera única para la ruta: lista variables (rango, carga, unilateralidad, torsión, tiempo bajo tensión) y no hay evidencia comparativa entre escalones. Para las planchas laterales da una secuencia de palanca, pero la ruta mezcla dos familias.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Espinales",
        texto: {
          t: "Típicamente de pie o sentado: flexión segmentaria controlada de la columna (cabeza hacia vértebras sucesivas), fondo y extensión vertebral controlada de vuelta.",
          c: [],
        },
      },
      {
        nombre: "Bote espinal",
        texto: {
          t: "Extensión de cadena posterior sostenida (definición pendiente: no se sabe si es boat o hold).",
          c: [],
        },
      },
      {
        nombre: "Planchas laterales",
        texto: {
          t: "Posición lateral sobre antebrazo o mano, elevación de cadera, hold y descenso. 'Twist' = rotación del tronco con el brazo libre; 'arch' = elevación con arqueo lateral.",
          c: [],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Columna lumbar y torácica (espinales)",
        accion: "Flexión controlada (sagital) → extensión",
        musculos:
          "Erectores espinales (iliocostal, longísimo, espinoso), multífidos y semiespinoso: motores del retorno. Abdominales: antagonistas que se alargan y modulan.",
        contraccion:
          "Bajada: excéntrica (frenar la flexión). Subida: concéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Cadera (espinales)",
        accion: "Flexión (bisagra) → extensión",
        musculos: "Glúteo mayor e isquiotibiales: motores.",
        contraccion: "Bajada: excéntrica. Subida: concéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Tejidos pasivos (espinales)",
        accion: "Ligamentos posteriores, discos y fascia toracolumbar",
        musculos:
          "La flexión completa mantenida produce creep lumbar: +5,5° en 20 min con constante de tiempo 9,4 min y recuperación de ~50 % de la rigidez en 2 min; la laxitud temporal puede elevar el riesgo de lesión por hiperflexión. Después de una flexión completa sostenida la columna queda más laxa por un rato: los autores recomendaron caminar o pararse unos minutos antes de un esfuerzo exigente. No meter un Jefferson largo justo antes de un levantamiento o salto pesado.",
        contraccion: "No aplica.",
        c: [32],
      },
      {
        articulacion: "Flexión-relajación (espinales)",
        accion:
          "Cerca de la flexión máxima los erectores dejan de activarse y la carga queda en los tejidos pasivos",
        musculos:
          "Por eso la carga externa del Jefferson se progresa muy de a poco.",
        contraccion: "No aplica.",
        c: ["R"],
      },
      {
        articulacion: "Columna y cadera (arch hold boca abajo)",
        accion:
          "Extensión sostenida boca abajo ('bote espinal' muy probable; definición a confirmar)",
        musculos:
          "Erectores espinales, multífidos, glúteo mayor e isquiotibiales: motores. Trapecio inferior y romboides si los brazos van adelante.",
        contraccion: "Isométrica.",
        c: ["L1", "R", "N"],
      },
      {
        articulacion: "Columna lumbar (planchas laterales)",
        accion: "Anti-flexión lateral (plano frontal)",
        musculos:
          "Cuadrado lumbar, oblicuos (externo e interno) y multífidos: motores o estabilizadores.",
        contraccion: "Isométrica.",
        c: [26, 25],
      },
      {
        articulacion: "Cadera (planchas laterales)",
        accion: "Abducción neutral (pierna de abajo)",
        musculos: "Glúteo medio: motor o estabilizador.",
        contraccion: "Isométrica.",
        c: [25],
      },
      {
        articulacion: "Hombro del brazo de apoyo",
        accion: "Abducción ~90° en carga, estabilización",
        musculos:
          "Deltoides, supraespinoso y serrato anterior: estabilizadores.",
        contraccion: "Isométrica.",
        c: ["L1", 36],
      },
      {
        articulacion: "Escápula (planchas laterales)",
        accion: "Depresión + protracción",
        musculos: "Serrato anterior y trapecio inferior: estabilizadores.",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
    ],
    progresa: [
      {
        t: "Espinales: las variables son el rango de flexión, la carga externa (Jefferson con peso), la unilateralidad ('A 1' = a una pierna, presumiblemente), la torsión (suma rotación) y el tiempo bajo tensión ('360').",
        c: [],
      },
      {
        t: "No hay evidencia comparativa entre escalones.",
        c: [],
      },
      {
        t: "Planchas laterales: la variable es el brazo de palanca del tronco (rodillas apoyadas, pies, pierna elevada), la base de apoyo (codo, mano) y los añadidos rotatorios (twist).",
        c: ["M"],
      },
    ],
    siente: {
      t: "En los espinales, se siente en toda la espalda y en los isquiotibiales.",
      c: [],
    },
    compensa: [
      {
        error: "Flexión solo lumbar (en lugar de segmentaria)",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Pérdida de control al llegar al fondo",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Perder la bisagra de cadera",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Plancha lateral: cadera que cae o se adelanta",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error:
          "Plancha lateral: hombro de apoyo hundido (pérdida de depresión)",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Plancha lateral: tronco rotado hacia el piso o hacia el techo",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Bajá vértebra por vértebra.", c: [] },
      { t: "Isquios largos, rodillas casi extendidas.", c: [] },
      { t: "Subí en orden inverso.", c: [] },
      {
        t: "Plancha lateral: cadera hacia el techo, hombro lejos de la oreja.",
        c: [],
      },
      {
        t: "Plancha lateral: línea recta desde la cabeza hasta los pies.",
        c: [],
      },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor lumbar que baja a la pierna, hormigueo en la pierna, pérdida de fuerza.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor que aumenta al flexionar y no cede en reposo.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Precaución previa: si tuvo una hernia o protrusión diagnosticada, que el kinesiólogo autorice la flexión con carga antes de empezar.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Planchas laterales: dolor lateral lumbar punzante.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Planchas laterales: dolor de hombro del brazo de apoyo.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Planchas laterales: parestesias (hormigueo).",
          c: [],
        },
      },
    ],
    evidencia: {
      t: "Del Jefferson curl no se encontró ningún estudio: el resto de los espinales es anatomía de libro de texto más literatura de columna lumbar general. En core lateral, el cuadrado lumbar fue más activo (54 % del máximo) en side support (apoyado en un codo y ambos pies) que en otras tareas, con electrodos intramusculares en 4 adultos; el side bridge sirvió para fortalecer glúteo medio y oblicuo externo en 30 sujetos sanos; el side bridge fue evaluado en un tercer estudio (el abstract no da el número).",
      c: ["L1", 26, 25, 29],
    },
    gestos: [
      "Bote espinal (definición pendiente)",
      "Espinal cajón",
      "Espinal Jefferson (Jefferson curl)",
      "Espinal torsión",
      "Espinal A 1 (presumiblemente a una pierna)",
      "Espinal 360",
      "Bote lateral",
      "Side plank (supp, arch, elbow, twist)",
    ],
    pendientes: [
      {
        pendiente:
          "De qué ejercicios se componen 'bote espinal', 'espinal cajón', 'espinal 360' y 'espinal A 1' (compartido con Nacho): de eso depende la tabla de músculos.",
        quien: "H",
      },
      {
        pendiente:
          "Definir 'bote espinal' (muy probablemente un arch hold boca abajo), 'espinal cajón', 'espinal 360', 'espinal A 1' y 'espinal torsión'.",
        quien: "N",
      },
      {
        pendiente:
          "Qué significa la sigla HR (sin expansión en el repo; el nombre oficial ya está fijado).",
        quien: "N",
      },
      {
        pendiente:
          "Jefferson curl con carga: criterios de inclusión y exclusión (osteoporosis, hernia, edad) y cómo progresar la carga.",
        quien: "H",
      },
      {
        pendiente: "Escalones de la ruta: la sección no da una escalera única.",
        quien: "fuente",
      },
      {
        pendiente:
          "Dónde se siente en las planchas laterales: la sección lo da solo para los espinales.",
        quien: "fuente",
      },
      {
        pendiente:
          "El porqué de las compensaciones (espinales y planchas laterales): la sección no lo da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Dos tipos de ejercicio para la espalda y el centro del cuerpo: los espinales, donde bajás la columna vértebra por vértebra y volvés a subir en orden inverso, y las planchas laterales, donde sostenés el cuerpo de costado apoyado en el antebrazo o la mano.",
    siente:
      "En los espinales: toda la espalda y la parte de atrás de las piernas.",
    tips: [
      "Bajá vértebra por vértebra.",
      "Piernas largas, con las rodillas casi estiradas.",
      "En la plancha lateral: cadera hacia el techo y hombro lejos de la oreja.",
    ],
    errores: [
      {
        error: "Doblar solo la zona de la cintura",
        texto: "Bajá vértebra por vértebra y subí en orden inverso.",
      },
      {
        error: "Cadera que cae en la plancha lateral",
        texto: "Cadera hacia el techo, hombro lejos de la oreja.",
      },
      {
        error: "Tronco rotado en la plancha lateral",
        texto: "Buscá una línea recta desde la cabeza hasta los pies.",
      },
    ],
  },
} as const satisfies RutaContenido;
