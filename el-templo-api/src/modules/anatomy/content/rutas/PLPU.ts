import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de PLPU desde S4.5 (tabla articular) + S8. Borrador
 * (D5). Sin EMG de planche push-up: se deduce de planche (cita 4) + push-up.
 *
 * Tronco/cadera: igual que PL por coherencia (R2-14), boca abajo. La fila ST
 * dice solo "trapecio = Est" sin porción: no se volcó (pendiente de fuente).
 */
export const PLPU = {
  code: "PLPU",
  slug: "planche-push-up",
  patron: "PUSH",
  categoria: "Push horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "delt-ant", c: ["L1"] },
      { m: "pectoral", c: ["L1"], nota: "Clavicular" },
      { m: "serrato", c: [9, 13], nota: "Protracción mantenida" },
      { m: "triceps", c: ["L1"], nota: "Flexión profunda y extensión" },
      {
        m: "gluteo-mayor",
        c: ["R"],
        nota: "Isométrico: sostiene las piernas",
      },
      { m: "isquios", c: ["R"], nota: "Isométrico: sostiene las piernas" },
      { m: "erectores", c: ["R"], nota: "Isométrico: sostiene las piernas" },
    ],
    sinergista: [],
    estabilizador: [
      { m: "biceps", c: [4], nota: "Cabeza larga" },
      { m: "antebrazo", c: [], nota: "Flexores y extensores, carga máxima" },
      { m: "recto-abd", c: ["R"], nota: "Evita el arco lumbar" },
      { m: "oblicuos", c: ["R"], nota: "Evita el arco lumbar" },
      { m: "dorsal", c: [] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Empuje de brazos desde el planche (o su escalón): el cuerpo baja con los codos flexionando y los hombros avanzan más, y vuelve a empujar hasta extender. No hay EMG de planche push-up: se deduce del planche y del push-up.",
      c: [4],
    },
    tipo: "Dinámica",
    brazo: "Brazo flexionado (BAS) 23",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Inicio",
        texto: { t: "Planche (o su escalón).", c: [] },
      },
      {
        nombre: "Descenso",
        texto: {
          t: "Los codos flexionan y los hombros avanzan más.",
          c: [],
        },
      },
      {
        nombre: "Fondo",
        texto: {
          t: "Pecho entre las manos, cuerpo horizontal.",
          c: [],
        },
      },
      {
        nombre: "Empuje",
        texto: { t: "Se empuja hasta extender y volver al planche.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Hombro (glenohumeral)",
        accion: "Flexión + aducción horizontal con alto momento",
        musculos:
          "Deltoides anterior y pectoral mayor (clavicular): motores. Bíceps (cabeza larga): estabilizador.",
        contraccion: "Descenso: excéntrica. Ascenso: concéntrica.",
        c: ["L1", 4],
      },
      {
        articulacion: "Escápula (escapulotorácica)",
        accion: "Protracción mantenida",
        musculos: "Serrato anterior: motor. Trapecio: estabilizador.",
        contraccion: "Isométrica.",
        c: [9, 13],
      },
      {
        articulacion: "Codo",
        accion: "Flexión profunda y luego extensión",
        musculos: "Tríceps: motor.",
        contraccion: "Descenso: excéntrica. Ascenso: concéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Muñeca",
        accion: "Extensión alta, carga máxima",
        musculos: "Flexores y extensores: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Tronco y cadera",
        accion: "Línea con leve retroversión",
        musculos:
          "Glúteo mayor, isquiotibiales y erectores espinales: motores isométricos (sostienen las piernas). Recto abdominal y oblicuos: estabilizadores (evitan el arco). Aplicado por coherencia con la corrección del planche.",
        contraccion: "Isométrica.",
        c: ["R"],
      },
    ],
    progresa: [
      {
        t: "El planche push-up combina las variables del planche (palanca) con el recorrido de codo (rango) y el paso de brazo recto a brazo flexionado (SA → BA), como en 'PLPU SA STR TO BA FULL' del catálogo.",
        c: [],
      },
      {
        t: "En el planche la variable de palanca es la distancia horizontal entre los hombros y el centro de masa (= el torque que tiene que hacer el hombro).",
        c: ["M"],
      },
      {
        t: "En el nivel pseudo-planche (manos cerca de las caderas, dedos hacia atrás) el hombro se adelanta aún más (lean) y el tríceps trabaja a mayor ángulo.",
        c: ["C"],
      },
    ],
    siente: {
      pendiente:
        "La sección de PLPU no tiene el bloque 'dónde se siente'. El del planche (pecho, hombro anterior, antebrazo y muñeca, abdomen) es de otro ejercicio y no se traslada.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Bajar sin mantener la protracción ('hundir el pecho')",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Caderas que suben",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Codos que se abren",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Perder la línea del cuerpo",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
    ],
    cues: [
      {
        t: "Bajá el pecho hacia las manos manteniendo el cuerpo recto.",
        c: [],
      },
      { t: "Protracción siempre, incluso abajo.", c: [] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: { t: "Dolor anterior de hombro y de bíceps.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor de muñeca.", c: [] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor medial de codo (el tríceps y los flexores del antebrazo toman mucha carga).",
          c: [],
        },
      },
    ],
    evidencia: {
      t: "No hay EMG de planche push-up: se deduce del planche (EMG en 7 gimnastas de anillas) y del push-up.",
      c: [4],
    },
    gestos: [
      "Planche push-up por escalones (tuck, adv tuck, super adv tuck, straddle, full)",
      "Pseudo-planche push-up (manos cerca de las caderas, dedos hacia atrás)",
      "Planche push-up de brazo recto a brazo flexionado (SA → BA)",
      "Planche push-up asistido",
      "Protracted dips",
      "Caseta (sin definir)",
    ],
    pendientes: [
      {
        pendiente:
          "Confirmar la redacción de la mecánica boca abajo (glúteo, isquiotibiales y erectores sostienen las piernas, el abdomen evita el arco) aplicada al planche push-up, que se trasladó por coherencia con el planche.",
        quien: "H",
      },
      {
        pendiente:
          "Definir 'caseta' (PLPU CASETA en el catálogo): sin definición en la base.",
        quien: "N",
      },
      {
        pendiente: "Dónde se siente el planche push-up: la sección no lo da.",
        quien: "fuente",
      },
      {
        pendiente:
          "El porqué de las compensaciones (hundir el pecho, caderas que suben, codos que se abren, perder la línea del cuerpo): la sección no lo da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Una flexión de brazos desde la posición de planche: bajás el pecho entre las manos con el cuerpo recto y horizontal, y empujás hasta volver arriba.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Bajá el pecho hacia las manos manteniendo el cuerpo recto.",
      "Empujá el piso lejos con la espalda alta, también cuando estás abajo.",
    ],
    errores: [
      {
        error: "Hundir el pecho al bajar",
        texto: "Empujá el piso lejos con la espalda alta, también abajo.",
      },
      {
        error: "Perder la línea del cuerpo",
        texto: "Bajá el pecho hacia las manos manteniendo el cuerpo recto.",
      },
    ],
  },
} as const satisfies RutaContenido;
