import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de OAPU desde S4.3 (tabla articular) + S8. Borrador
 * (D5). Sin EMG unilateral de push-up completo: anatomía L1 y extrapolación de
 * push-up plus y bilateral (citas 9, 13, 14).
 */
export const OAPU = {
  code: "OAPU",
  slug: "push-ups",
  patron: "PUSH",
  categoria: "Push horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "pectoral", c: ["L1"] },
      { m: "delt-ant", c: ["L1"] },
      {
        m: "serrato",
        c: [9, 13, 14],
        nota: "Mayor actividad con la escápula rotada hacia arriba y en protracción",
      },
      { m: "triceps", c: ["L1"] },
      {
        m: "oblicuos",
        c: ["L1"],
        nota: "Anti-rotación fuerte, la carga es lateral",
      },
      {
        m: "cuadrado",
        c: ["L1"],
        nota: "Anti-rotación fuerte, la carga es lateral",
      },
      {
        m: "gluteo-medio",
        c: ["L1"],
        nota: "Anti-rotación fuerte, la carga es lateral",
      },
    ],
    sinergista: [],
    estabilizador: [
      { m: "manguito", c: ["L1"] },
      { m: "biceps", c: ["L1"], nota: "Cabeza larga" },
      { m: "antebrazo", c: [], nota: "Flexores de muñeca" },
      { m: "recto-abd", c: [], nota: "Anti-extensión" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Push-up a un brazo: pectoral, deltoides anterior, serrato anterior y tríceps empujan, y el tronco resiste una anti-rotación fuerte porque la carga es lateral. No hay EMG de push-up unilateral completo.",
      c: ["L1"],
    },
    tipo: "Mixta (32 % isométrica)",
    brazo: "Brazo flexionado (BAS) 76",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Posición inicial",
        texto: {
          t: "Pies abiertos, mano bajo el hombro, la otra mano a la espalda.",
          c: [],
        },
      },
      {
        nombre: "Descenso",
        texto: {
          t: "Excéntrico: el codo flexiona, y la escápula y el tronco anti-rotan.",
          c: [],
        },
      },
      { nombre: "Fondo", texto: { t: "Punto más bajo.", c: [] } },
      { nombre: "Ascenso", texto: { t: "Concéntrico.", c: [] } },
      { nombre: "Bloqueo", texto: { t: "Con protracción.", c: [] } },
    ],
    articulaciones: [
      {
        articulacion: "Hombro (glenohumeral)",
        accion: "Aducción horizontal + flexión (plano transversal)",
        musculos:
          "Pectoral mayor y deltoides anterior: motores. Manguito rotador y bíceps (cabeza larga): estabilizadores.",
        contraccion: "Descenso: excéntrica. Ascenso: concéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Escápula (escapulotorácica)",
        accion: "Protracción + rotación hacia arriba en el bloqueo",
        musculos:
          "Serrato anterior: motor. Mayor actividad con la escápula rotada hacia arriba y en protracción (push-up plus); con elevación humeral de 120° frente a 90° y 60°; un meta-análisis de 19 estudios encontró alta actividad del serrato en el plus estándar, en superficie estable, con los hombros al ancho y flexión de 110 a 120°.",
        contraccion: "Isométrica; concéntrica al bloquear.",
        c: [9, 13, 14],
      },
      {
        articulacion: "Codo",
        accion: "Flexión → extensión",
        musculos: "Tríceps: motor.",
        contraccion: "Descenso: excéntrica. Ascenso: concéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Tronco",
        accion: "Anti-rotación fuerte (la carga es lateral)",
        musculos:
          "Oblicuos (externo e interno), cuadrado lumbar y glúteo medio: motores / estabilizadores (anti-rotación: anatomía, sin EMG directa).",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
      {
        articulacion: "Muñeca",
        accion: "Extensión + soporte",
        musculos: "Flexores: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "La variable es el porcentaje del peso sobre un brazo y el brazo de palanca del tronco.",
        c: ["M"],
      },
      {
        t: "Cadena: push-up bilateral → apoyo asistido (dedos, mano a la pared) → archer (la otra mano hace de apoyo lateral) → OAPU.",
        c: ["M"],
      },
      {
        t: "Separar los pies (straddle) amplía la base y reduce la exigencia de anti-rotación; juntarlos la aumenta.",
        c: ["M"],
      },
      {
        t: "En un push-up plus de rodillas con una sola mano, la actividad del serrato no cambió respecto del bilateral; la extensión de la pierna del mismo lado aumentó el serrato y la del lado contrario el trapecio inferior (n = 32 sanos, de rodillas). La transferencia al OAPU completo es extrapolación.",
        c: [15],
      },
      {
        t: "Un push-up con banda a 6RM produjo EMG comparable a un press de banca a 6RM y ganancias de fuerza similares en 5 semanas (n = 30): es un argumento general de que el push-up se puede cargar para ser efectivo.",
        c: [17],
      },
    ],
    siente: {
      pendiente:
        "La sección de OAPU no tiene un bloque de dónde se siente. Los motores de la tabla articular no alcanzan para afirmarlo.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Rotación del tronco hacia el brazo libre",
        porque: {
          t: "La carga es lateral: el tronco tiene que resistir la rotación (anti-rotación fuerte).",
          c: ["L1"],
        },
      },
      {
        error: "Cadera que cae o sube",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Hombro de trabajo encogido",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Codo que se abre mucho",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "La mano libre apoya sin querer",
        porque: {
          t: "Reparte la carga con la otra mano y cambia la variable del ejercicio (porcentaje del peso sobre el brazo de trabajo).",
          c: ["M"],
        },
      },
    ],
    cues: [
      { t: "Caderas cuadradas al suelo, no abras el pecho.", c: [] },
      { t: "Empujá el piso lejos.", c: [] },
      { t: "Codo a 45°.", c: [] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: { t: "Dolor anterior de hombro en el fondo.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor lateral o medial de codo.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor de muñeca por la extensión.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor lumbar unilateral.", c: [] },
      },
    ],
    evidencia: {
      t: "No hay EMG unilateral de push-up completo: hay datos de push-up plus de rodillas a una mano y de push-up bilateral, y la transferencia al OAPU es extrapolación.",
      c: [15],
    },
    gestos: [
      "Push-up en suelo",
      "Push-up de rodillas",
      "Push-up en anillas",
      "Archer",
      "Asistido con dedos",
      "Straddle (pies separados)",
    ],
    pendientes: [
      {
        pendiente:
          "Dónde se siente el ejercicio y el porqué de las compensaciones cadera que cae o sube, hombro encogido y codo que se abre: la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Flexiones en escalones: arrancás con la común, de dos manos, y avanzás con apoyo y arquero hacia la de un solo brazo. En todas empujás el piso con el cuerpo firme como una tabla.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Cuerpo en una línea: que la cadera no caiga ni suba.",
      "Empujá el piso lejos.",
      "Codo a 45°.",
      "En las de un brazo, caderas cuadradas al suelo: no abras el pecho.",
    ],
    errores: [
      {
        error: "El tronco gira hacia el brazo libre",
        texto:
          "Cuando cargás más un lado (arquero, un brazo), el tronco tiene que quedarse quieto.",
      },
      {
        error: "La mano libre apoya",
        texto:
          "En el escalón de un brazo, si apoyás la otra mano repartís el peso: si la necesitás, quedate en el escalón anterior.",
      },
      {
        error: "Codo muy abierto",
        texto: "Probá con el codo cerca del cuerpo, a 45°.",
      },
    ],
  },
} as const satisfies RutaContenido;
