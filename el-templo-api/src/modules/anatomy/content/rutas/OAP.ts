import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de OAP desde S2.3 (tabla articular) + S8. Borrador
 * (D5). No hay EMG de pull-up a una mano: se extrapola de pull-up bilateral
 * (citas 2 y 3) + anatomía L1, y esas son las marcas de las celdas sin marca
 * propia.
 */
export const OAP = {
  code: "OAP",
  slug: "dominadas",
  patron: "PULL",
  categoria: "Pull vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "dorsal",
        c: ["L1", 3],
        nota: "En pull-up bilateral 117 a 130 % MVIC",
      },
      { m: "trap-inf", c: ["L1"] },
      { m: "romboides", c: ["L1"] },
      { m: "redondo", c: [2, 3, "L1"] },
      { m: "pectoral", c: [2, 3, "L1"] },
      { m: "biceps", c: [2, 3], nota: "Más activo en chin-up que en pull-up" },
      { m: "braquial", c: [2], nota: "Con el braquiorradial" },
      { m: "antebrazo", c: [2, 3, "L1"], nota: "Agarre unilateral" },
    ],
    sinergista: [],
    estabilizador: [
      { m: "serrato", c: ["L1"] },
      { m: "manguito", c: [3], nota: "Infraespinoso 71 a 79 % MVIC" },
      { m: "oblicuos", c: ["L1"], nota: "Anti-rotación e inclinación lateral" },
      { m: "cuadrado", c: ["L1"], nota: "Anti-rotación e inclinación lateral" },
      {
        m: "erectores",
        c: ["L1"],
        nota: "Anti-rotación e inclinación lateral",
      },
      { m: "delt-post", c: ["L1"] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Dominada a una mano: el brazo de trabajo tira del cuerpo mientras el tronco resiste la rotación y la inclinación lateral, porque la carga está de un solo lado. No hay EMG de pull-up a una mano: se extrapola del pull-up con dos manos y de la anatomía.",
      c: [2, 3, "L1"],
    },
    tipo: "Mixta (37 % isométrica)",
    brazo: "Brazo flexionado (BAS) 92 · recto (SAS) 1",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Colgado",
        texto: {
          t: "Colgado con control de la rotación del tronco. El colgado puede ser pasivo (la mayor parte de la carga la toman cápsula y ligamentos, con actividad muscular baja) o activo (depresión escapular sin flexionar los codos).",
          c: [2, 3, "L1"],
        },
      },
      {
        nombre: "Iniciación escapular",
        texto: { t: "Iniciación escapular.", c: [2, 3, "L1"] },
      },
      {
        nombre: "Tirón",
        texto: { t: "Tirón concéntrico.", c: [2, 3, "L1"] },
      },
      {
        nombre: "Arriba",
        texto: { t: "Posición arriba.", c: [2, 3, "L1"] },
      },
      {
        nombre: "Descenso",
        texto: { t: "Descenso controlado (excéntrico).", c: [2, 3, "L1"] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Escápula del lado de trabajo (escapulotorácica)",
        accion: "Depresión + rotación hacia abajo con ligera retracción",
        musculos:
          "Trapecio inferior, dorsal ancho y romboides: motores / sinergistas. Serrato anterior: estabilizador.",
        contraccion:
          "Iniciación: concéntrica. Tirón: concéntrica. Descenso: excéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Hombro (glenohumeral)",
        accion: "Extensión / aducción (plano frontal o escapular)",
        musculos:
          "Dorsal ancho (117–130 % MVIC en pull-up bilateral), redondo mayor y pectoral mayor: motores. Infraespinoso (71–79 % MVIC): estabilizador.",
        contraccion:
          "Concéntrica, luego isométrica arriba y excéntrica al bajar.",
        c: ["L1", 3],
      },
      {
        articulacion: "Codo",
        accion: "Flexión",
        musculos:
          "Bíceps (mayor activación en chin-up que en pull-up), braquial y braquiorradial.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: [2, 3],
      },
      {
        articulacion: "Tronco",
        accion:
          "Anti-rotación y anti-inclinación lateral (la carga está de un lado)",
        musculos:
          "Oblicuos, cuadrado lumbar y erectores espinales: estabilizadores (anti-rotación: anatomía, sin EMG directa).",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
      {
        articulacion: "Muñeca y dedos",
        accion: "Agarre unilateral",
        musculos: "Flexores de dedos: motores.",
        contraccion: "Isométrica.",
        c: [2, 3, "L1"],
      },
    ],
    progresa: [
      {
        t: "La variable es el porcentaje del peso que carga el brazo de trabajo: es palanca y reparto de carga.",
        c: ["M"],
      },
      {
        t: "Escalones: asistido con dedos, con la otra mano o archer (el brazo extendido actúa de apoyo y la carga se reparte) → typewriter → un brazo completo → OAP lastrado.",
        c: ["M"],
      },
      {
        t: "El texto completo del estudio de cinemática recomienda las dominadas frontales asistidas para los más débiles (dato señalado por la revisión).",
        c: [1],
      },
    ],
    siente: {
      pendiente:
        "La sección de OAP no tiene un bloque de dónde se siente. Los motores de la tabla articular no alcanzan para afirmarlo.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Rotación y balanceo del tronco",
        porque: {
          t: "La carga está de un solo lado: el tronco tiene que resistir la rotación y la inclinación lateral.",
          c: ["L1"],
        },
      },
      {
        error: "Hombro encogido",
        porque: {
          t: "El trapecio superior pasa a dominar en lugar de la depresión escapular (en los colgados conviene que no domine).",
          c: ["L1"],
        },
      },
      {
        error: "Cuello adelantado",
        porque: {
          t: "La sección la lista como compensación habitual y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Codo del brazo de trabajo que cae hacia afuera",
        porque: {
          t: "La sección la lista como compensación habitual y no da el porqué.",
          c: [],
        },
      },
      {
        error: "La mano libre ayuda sin querer",
        porque: {
          t: "Reparte la carga con la otra mano y cambia la variable del ejercicio (porcentaje del peso sobre el brazo de trabajo).",
          c: ["M"],
        },
      },
    ],
    cues: [
      { t: "Hombro lejos de la oreja antes de tirar.", c: [] },
      { t: "Pecho hacia la barra.", c: [] },
      {
        t: "Costillas y pelvis alineadas, no dejes que el tronco gire.",
        c: [],
      },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en el pliegue anterior del codo o debilidad al girar la palma hacia arriba.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la parte interna o externa del codo.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor de hombro en la parte baja del tirón. En el colgado con agarre invertido el brazo queda muy rotado hacia afuera y se desvía hasta 42° del plano del omóplato; con agarre al frente, hasta 28°.",
          c: [1],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Al colgarse: dolor profundo anterior o lateral de hombro que aparece en el colgado pasivo.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Al colgarse: hormigueo o adormecimiento que baja por el brazo.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: 'Al colgarse: sensación de "salida" o inestabilidad del hombro (en gimnastas la tracción con manos fijas es el mecanismo dominante en lesiones quirúrgicas).',
          c: [18],
        },
      },
    ],
    evidencia: {
      t: "No hay EMG de pull-up a una mano ni estudios revisados por pares de OAP: se extrapola del pull-up bilateral y de la anatomía de libro de texto.",
      c: [2, 3, "L1"],
    },
    gestos: [
      "Dominada a una mano (OAP)",
      "Chin-up a una mano (OAC, inferido)",
      "Typewriter asistido",
      "Archer (L-sit pull-up mid archer)",
      "Asistido con dedos",
      "Colgado a una mano (OA dead hang)",
      "Retracción escapular en barra vertical",
    ],
    pendientes: [
      {
        pendiente:
          "Colgado pasivo prolongado en hombros laxos o con antecedente de luxación: preferir el colgado activo, criterio a validar.",
        quien: "H",
      },
      {
        pendiente:
          "Confirmar qué son OAC (chin-up a una mano, inferido) y L SIT PL.UP dentro de la ruta.",
        quien: "N",
      },
      {
        pendiente:
          "Dónde se siente el ejercicio y el porqué de las compensaciones cuello adelantado y codo que cae hacia afuera: la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Dominadas en escalones: arrancás con la común, de dos manos, y avanzás con apoyo de la otra mano y arquero hacia la de un solo brazo. En todas tirás tu cuerpo hacia la barra con el tronco quieto.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Hombro lejos de la oreja antes de tirar.",
      "Pecho hacia la barra.",
      "Costillas y pelvis alineadas, no dejes que el tronco gire.",
    ],
    errores: [
      {
        error: "El tronco gira o se balancea",
        texto:
          "Cuando cargás más un lado (arquero, un brazo), el tronco tiene que quedarse quieto.",
      },
      {
        error: "Hombro encogido",
        texto:
          "Trabaja la parte de arriba del hombro en lugar de la espalda: alejalo de la oreja.",
      },
      {
        error: "La mano libre ayuda",
        texto:
          "En el escalón de un brazo, si apoyás la otra mano repartís el peso: si la necesitás, quedate en el escalón anterior.",
      },
    ],
  },
} as const satisfies RutaContenido;
