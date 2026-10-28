import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de PL desde S4.4 (tabla articular) + S8. Borrador
 * (D5). Evidencia directa: EMG de la support scale en 7 gimnastas de anillas
 * (cita 4).
 *
 * Corrección R2-14 (BS5, boca abajo): glúteo mayor, isquios y erectores son
 * motores isométricos (sostienen las piernas) y el abdomen es estabilizador
 * (evita el arco lumbar).
 */
export const PL = {
  code: "PL",
  slug: "planche",
  patron: "PUSH",
  categoria: "Push horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "delt-ant", c: [4] },
      { m: "pectoral", c: [4], nota: "Clavicular" },
      {
        m: "biceps",
        c: [4],
        nota: "Cabeza larga: flexor activo del hombro; en el codo estabiliza",
      },
      { m: "serrato", c: [4], nota: "Protracción y rotación hacia arriba" },
      { m: "triceps", c: [4], nota: "Isométrico, brazo recto" },
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
      { m: "trap-inf", c: [4] },
      { m: "romboides", c: [4], nota: "Trapecio medio" },
      { m: "antebrazo", c: [], nota: "Flexores y extensores, extensión alta" },
      { m: "recto-abd", c: ["R"], nota: "Evita el arco lumbar" },
      { m: "oblicuos", c: ["R"], nota: "Evita el arco lumbar" },
      { m: "dorsal", c: [] },
      { m: "manguito", c: [4] },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Cuerpo horizontal boca abajo, brazos rectos, hombros por delante de las manos y escápulas protraídas. Lo sostienen el hombro anterior, el pecho, el serrato y el tríceps; glúteo, isquiotibiales y erectores sostienen las piernas y el abdomen evita el arco lumbar.",
      c: [4, "R"],
    },
    tipo: "Estática predominante (67 % isométrica)",
    brazo: "Brazo recto (SAS) 43 · flexionado (BAS) 5",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Entrada",
        texto: {
          t: "Desde L-sit o tuck, crow o lean hacia adelante.",
          c: [],
        },
      },
      {
        nombre: "Hold",
        texto: {
          t: "Cuerpo horizontal boca abajo, brazos rectos, hombros por delante de las manos, escápulas protraídas.",
          c: [],
        },
      },
      {
        nombre: "Salida",
        texto: {
          t: "Descenso controlado o vuelta al apoyo.",
          c: [],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Hombro (glenohumeral)",
        accion:
          "Flexión de hombro sostenida (sagital), con el húmero inclinado hacia adelante",
        musculos:
          "Deltoides anterior, pectoral mayor (clavicular), coracobraquial y bíceps (cabeza larga): motores / estabilizadores. En el estudio registraron pectoral clavicular, dorsal, tríceps (cabeza larga), infraespinoso, trapecio medio (transverso), serrato, bíceps y deltoides anterior.",
        contraccion: "Isométrica.",
        c: [4],
      },
      {
        articulacion: "Escápula (escapulotorácica)",
        accion:
          "Protracción + rotación hacia arriba, con la depresión mantenida",
        musculos:
          "Serrato anterior: motor. Trapecio inferior y medio: estabilizadores. El estudio midió la razón serrato/trapecio, que cambió entre el planche y sus ejercicios preparatorios.",
        contraccion: "Isométrica.",
        c: [4],
      },
      {
        articulacion: "Codo",
        accion: "Extendido (brazo recto)",
        musculos:
          "Tríceps: motor isométrico. Bíceps: estabilizador (la coactivación bíceps/tríceps difirió entre el planche y los ejercicios preparatorios).",
        contraccion: "Isométrica.",
        c: [4],
      },
      {
        articulacion: "Muñeca",
        accion: "Extensión alta con carga elevada",
        musculos: "Flexores y extensores: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Columna y cadera",
        accion: "Línea con leve retroversión",
        musculos:
          "Glúteo mayor, isquiotibiales y erectores espinales: motores isométricos (sostienen las piernas). Recto abdominal y oblicuos: estabilizadores (evitan el arco).",
        contraccion: "Isométrica.",
        c: ["R"],
      },
    ],
    progresa: [
      {
        t: "La variable es la distancia horizontal entre los hombros y el centro de masa (= el torque que tiene que hacer el hombro).",
        c: ["M"],
      },
      {
        t: "El centro de masa siempre tiene que quedar encima de las manos. Por eso, cuanto más se alargan las piernas (tuck → adv tuck → straddle → full), más hay que adelantar los hombros por delante de las manos (más lean), y crecen el torque del hombro y la extensión de muñeca.",
        c: ["R"],
      },
      {
        t: "Brazo flexionado frente a brazo recto: el bent-arm acorta el brazo de palanca y desplaza trabajo a tríceps y hombro anterior.",
        c: ["C"],
      },
      {
        t: "Resultado clave del estudio: diferencias grandes entre el planche y sus ejercicios preparatorios en trapecio, pectoral y bíceps (η² = 0,64, 0,51 y 0,67), y también en la razón bíceps/tríceps, la razón serrato/trapecio y las sinergias musculares. Las progresiones no entrenan exactamente lo mismo que el planche completo. El abstract no da los valores de EMG ni cuáles son los ejercicios preparatorios.",
        c: [4],
      },
    ],
    siente: {
      t: "Pecho, hombro anterior, antebrazo y muñeca, y abdomen; el bíceps también.",
      c: [4],
    },
    compensa: [
      {
        error:
          "Sin protracción (pecho caído entre los hombros, escápulas aducidas)",
        porque: { t: "Reduce la estabilidad del soporte.", c: [] },
      },
      {
        error: "Caderas altas (pike)",
        porque: { t: "Acortan la palanca.", c: [] },
      },
      {
        error: "Lumbar hiperextendido o cadera baja",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Codos flexionados para 'ayudar'",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Hombros encogidos",
        porque: {
          t: "Hay elevación en lugar de depresión de la escápula.",
          c: [],
        },
      },
    ],
    cues: [
      {
        t: "Empujá el piso lejos y redondeá la espalda alta (protracción).",
        c: [],
      },
      { t: "Hombros por delante de las manos.", c: [] },
      { t: "Pelvis hacia atrás, glúteos duros.", c: [] },
      { t: "Dedos hacia afuera para repartir la carga.", c: [] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la cara anterior del hombro o en el bíceps (tendón de arriba) con el brazo recto.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor de muñeca (cara dorsal por impacto o extensión, o cara palmar).",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "En menores de edad, dolor de muñeca del lado del pulgar al apoyarse.",
          c: [31],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor medial de codo.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Hormigueo en los dedos.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Sensación de bloqueo en el hombro.", c: [] },
      },
    ],
    evidencia: {
      t: "Evidencia directa: EMG de la support scale (planche) y de 5 ejercicios preparatorios en 7 gimnastas de anillas de alto nivel.",
      c: [4],
    },
    gestos: [
      "Planche (lean, tuck, adv tuck, straddle, full)",
      "Planche con brazo flexionado (bent-arm)",
      "Crow",
      "Caseta (sin definir)",
    ],
    pendientes: [
      {
        pendiente:
          "Confirmar la redacción de la mecánica boca abajo (glúteo, isquiotibiales y erectores sostienen las piernas, el abdomen evita el arco) aplicada al planche.",
        quien: "H",
      },
      {
        pendiente:
          "Definir 'caseta' (CASETA PL TO STR. ASSISTED en el catálogo): sin definición en la base.",
        quien: "N",
      },
      {
        pendiente:
          "El porqué de las compensaciones lumbar hiperextendido o cadera baja y codos flexionados para 'ayudar': la sección no lo da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Sostener todo el cuerpo horizontal, boca abajo, apoyado solo en las manos, con los brazos rectos y los hombros por delante de las manos.",
    siente: "Pecho, hombro de adelante, antebrazo y muñeca, y abdomen.",
    tips: [
      "Empujá el piso lejos y redondeá la espalda alta.",
      "Hombros por delante de las manos.",
      "Pelvis hacia atrás, glúteos duros.",
    ],
    errores: [
      {
        error: "Pecho caído entre los hombros",
        texto: "Perdés estabilidad en el soporte.",
      },
      {
        error: "Caderas altas",
        texto: "Acortás la palanca.",
      },
      {
        error: "Hombros encogidos",
        texto: "Subís los hombros en lugar de bajarlos.",
      },
    ],
  },
} as const satisfies RutaContenido;
