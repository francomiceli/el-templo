import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de HSPU desde S5.2 (tabla articular) + S8. Borrador
 * (D5). Sin EMG de HSPU revisado por pares: se deduce de HS (citas 5 y 6) +
 * pike push-up. La fila ST lleva la marca 6 de la celda (contribución relativa
 * del HS completo, no %MVIC).
 */
export const HSPU = {
  code: "HSPU",
  slug: "handstand-push-up",
  patron: "PUSH",
  categoria: "Push vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "delt-ant", c: ["L1"] },
      { m: "trap-sup", c: [6] },
      { m: "serrato", c: [6] },
      { m: "triceps", c: ["L1"] },
    ],
    sinergista: [{ m: "pectoral", c: ["L1"], nota: "Clavicular" }],
    estabilizador: [
      { m: "manguito", c: ["L1"] },
      { m: "trap-inf", c: [6] },
      { m: "antebrazo", c: [6], nota: "Flexores de muñeca" },
      { m: "recto-abd", c: [], nota: "Anti-extensión" },
      { m: "oblicuos", c: [], nota: "Anti-extensión" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Flexión de brazos en vertical o en pike: descenso excéntrico con la cabeza hacia el piso y ascenso con extensión de codo y elevación escapular hasta el bloqueo. No hay EMG de HSPU revisado por pares: se deduce del handstand y del pike push-up.",
      c: [5, 6, 39],
    },
    tipo: "Mixta/dinámica (28 % isométrica)",
    brazo: "Brazo flexionado (BAS) 61",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Inicio",
        texto: { t: "Handstand o pike.", c: [] },
      },
      {
        nombre: "Descenso",
        texto: {
          t: "Excéntrico: los codos flexionan, la cabeza baja, los hombros extienden respecto de la vertical y la escápula baja.",
          c: [],
        },
      },
      {
        nombre: "Fondo",
        texto: { t: "Cabeza al piso o a 90°.", c: [] },
      },
      {
        nombre: "Ascenso",
        texto: {
          t: "Extensión de codo + elevación escapular hasta el bloqueo.",
          c: [],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Hombro (glenohumeral)",
        accion: "Flexión ~120° → 180° (sagital)",
        musculos:
          "Deltoides anterior: motor. Pectoral mayor (clavicular): sinergista. Manguito: estabilizador.",
        contraccion: "Descenso: excéntrica. Ascenso: concéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Escápula (escapulotorácica)",
        accion:
          "Elevación + rotación hacia arriba hacia el bloqueo; protracción",
        musculos:
          "Trapecio superior y serrato anterior: motores. Trapecio inferior: estabilizador. En el handstand completo contribuyen el trapecio descendente (20 a 26 %) y el deltoides anterior (15 a 18 %); es contribución relativa, no %MVIC.",
        contraccion: "Descenso: excéntrica. Ascenso: concéntrica.",
        c: [6],
      },
      {
        articulacion: "Codo",
        accion: "Flexión → extensión",
        musculos: "Tríceps: motor.",
        contraccion: "Descenso: excéntrica. Ascenso: concéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Muñeca",
        accion: "Extensión alta",
        musculos: "Flexores: estabilizadores.",
        contraccion: "Isométrica.",
        c: [6],
      },
      {
        articulacion: "Columna",
        accion: "Anti-extensión",
        musculos: "Recto abdominal y oblicuos: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Variables: porcentaje del peso sobre los brazos (pike en suelo, elevado, vertical), rango (parcial, 90°, profundo o con déficit), apoyo (pared, libre) y energía (kipping).",
        c: ["L1"],
      },
    ],
    siente: {
      pendiente: "La sección de HSPU no tiene el bloque 'dónde se siente'.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Arco lumbar",
        porque: { t: "Para llegar a la pared.", c: [] },
      },
      {
        error: "Codos que se abren",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Cuello flexionado",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Pierna que patea",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Pérdida de protracción al bloquear",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Codos a 45°.", c: [] },
      {
        t: "Trípode con las manos y la cabeza (en el escalón bajo).",
        c: [],
      },
      { t: "Empujá el piso lejos hasta elevar los hombros.", c: [] },
      {
        t: "Con la cabeza al piso: cabeza neutra al tocar el piso, no tires la cabeza hacia atrás; tocá suave (evidencia de un preprint, no revisado por pares).",
        c: [39],
      },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor cervical (en HSPU con la cabeza al piso).",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor de hombro anterior o superior.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor de codo posterior.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor de muñeca.", c: [] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor de cuello, o dolor u hormigueo que baja al brazo después de HSPU: cortar las variantes con la cabeza al piso y derivar (evidencia de un preprint, no revisado por pares).",
          c: [39],
        },
      },
    ],
    evidencia: {
      t: "No hay EMG de HSPU revisado por pares. Hay un preprint (no revisado por pares) de cinética sobre el kipping, n = 16: la fuerza sobre la cabeza durante el kip suele superar el peso corporal y quienes tuvieron dolor llevaban la cabeza en extensión. El resto se deduce del handstand y del pike push-up.",
      c: [39, 5, 6],
    },
    gestos: [
      "Pike push-up (en suelo, con cajón, elevado)",
      "HSPU en pared",
      "HSPU a 90°",
      "HSPU con déficit (rango profundo)",
      "HSPU libre",
      "HSPU con kipping",
      "Variantes archer y wide",
    ],
    pendientes: [
      {
        pendiente: "Dónde se siente el HSPU: la sección no lo da.",
        quien: "fuente",
      },
      {
        pendiente:
          "El porqué de las compensaciones (codos que se abren, cuello flexionado, pierna que patea, pérdida de protracción al bloquear): la sección no lo da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Una flexión de brazos cabeza abajo: bajás la cabeza hacia el piso doblando los codos y empujás para volver arriba hasta estirar los brazos.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Codos a 45°.",
      "Empujá el piso lejos hasta elevar los hombros.",
      "Si tocás con la cabeza: cabeza neutra, no la tires hacia atrás y tocá suave.",
    ],
    errores: [
      {
        error: "Codos que se abren",
        texto: "Probá con los codos a 45°.",
      },
      {
        error: "Cabeza tirada hacia atrás al tocar el piso",
        texto: "Cabeza neutra y tocá suave.",
      },
      {
        error: "No elevar los hombros al subir",
        texto: "Empujá el piso lejos hasta elevar los hombros.",
      },
    ],
  },
} as const satisfies RutaContenido;
