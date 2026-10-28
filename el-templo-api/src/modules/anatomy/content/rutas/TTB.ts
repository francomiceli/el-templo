import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de TTB desde S2.4 (tabla articular) + S6.1 + S8.
 * Borrador (D5). Ruta heterogénea (R5): gestos como texto, sin modelo por
 * gesto en v1.
 */
export const TTB = {
  code: "TTB",
  slug: "toe-to-bar",
  patron: "PULL",
  categoria: "Pull vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "psoas", c: ["L1"], nota: "Flexión de cadera" },
      { m: "recto-fem", c: ["L1"], nota: "Flexión de cadera" },
      { m: "recto-abd", c: ["L1", 23] },
      {
        m: "oblicuos",
        c: ["L1", 23],
        nota: "Oblicuo externo; el interno estabiliza",
      },
      { m: "dorsal", c: ["L1"], nota: "Motor / estabilizador" },
      { m: "redondo", c: ["L1"], nota: "Motor / estabilizador" },
      { m: "trap-inf", c: ["L1"], nota: "Motor / estabilizador" },
      { m: "antebrazo", c: [], nota: "Agarre" },
    ],
    sinergista: [{ m: "aductores", c: ["L1"] }],
    estabilizador: [
      { m: "biceps", c: [], nota: "Flexores del codo" },
      { m: "braquial", c: [], nota: "Flexores del codo" },
      { m: "triceps", c: ["L1"], nota: "Cabeza larga, colgado (S6.1)" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Colgado de la barra, llevar los pies hasta la barra: flexión de cadera con retroversión pélvica creciente y tronco flexionado, con el dorsal empujando la barra hacia las caderas.",
      c: ["L1"],
    },
    tipo: "Dinámica / mixta (28 % isométrica)",
    brazo: "Brazo recto (SAS) 71 · flexionado (BAS) 68",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Hang activo",
        texto: {
          t: "Hang activo con hollow: escápulas deprimidas y pelvis en retroversión.",
          c: [],
        },
      },
      {
        nombre: "Elevación de piernas",
        texto: {
          t: "Flexión de cadera con retroversión pélvica creciente.",
          c: [],
        },
      },
      {
        nombre: "Compresión final",
        texto: {
          t: 'Dedos a la barra: el dorsal empuja la barra hacia las caderas (extiende el hombro) para inclinar el tronco hacia atrás y acercar los pies a la barra, con el tronco flexionado ("pike").',
          c: [],
        },
      },
      {
        nombre: "Descenso",
        texto: { t: "Descenso excéntrico controlado.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Cadera",
        accion: "Flexión (sagital), con las rodillas extendidas",
        musculos:
          "Iliopsoas, recto femoral, tensor de la fascia lata y sartorio: motores. Aductores: sinergistas.",
        contraccion:
          "Subida: concéntrica. Arriba: isométrica. Bajada: excéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Columna lumbar y pelvis",
        accion: "Flexión de tronco + retroversión pélvica",
        musculos:
          "Recto abdominal y oblicuo externo: motores. Oblicuo interno y transverso del abdomen: estabilizadores.",
        contraccion:
          "Al inicio isométrica (evitar la anteversión), concéntrica en la compresión, excéntrica al bajar.",
        c: ["L1", 23],
      },
      {
        articulacion: "Escápula y hombro",
        accion:
          "Depresión escapular + extensión de hombro para contrabalancear el movimiento de las piernas",
        musculos:
          "Dorsal ancho, redondo mayor y trapecio inferior: motores / estabilizadores. El dorsal empuja la barra hacia las caderas (extiende el hombro) para inclinar el tronco hacia atrás y acercar los pies a la barra.",
        contraccion: "Isométrica (concéntrica cuando se mueven los hombros).",
        c: ["L1"],
      },
      {
        articulacion: "Codo",
        accion: "Extendido o levemente flexionado",
        musculos: "Flexores del codo: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Muñeca y mano",
        accion: "Agarre",
        musculos: "Flexores de dedos: motores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Rodillas flexionadas → piernas rectas: aumenta el momento de las piernas sobre la cadera.",
        c: ["M"],
      },
      {
        t: "90° → barra → pike invertido: agrega rango de flexión de cadera y columna y exige movilidad de isquiotibiales.",
        c: ["M"],
      },
      { t: "Kipping → estricto: se quita el impulso.", c: ["M"] },
      {
        t: "Con rotación (windshield, ATW): se suman los oblicuos como motores y en anti-rotación.",
        c: ["M", "L1"],
      },
    ],
    siente: {
      pendiente:
        "La sección de TTB no tiene un bloque de dónde se siente. Los motores de la tabla articular no alcanzan para afirmarlo.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Balanceo",
        porque: { t: "Kip no intencional.", c: [] },
      },
      {
        error: "Anteversión pélvica al bajar",
        porque: {
          t: "La zona lumbar queda en extensión con carga.",
          c: [],
        },
      },
      {
        error: "Hombros encogidos",
        porque: { t: "Se pierde el hang activo.", c: [] },
      },
      {
        error: "Brazos que se flexionan",
        porque: { t: "Acortan el recorrido.", c: [] },
      },
      {
        error: "Predominio de flexores de cadera sin retroversión abdominal",
        porque: {
          t: "Ilustración con otro ejercicio: en adultos sanos, el supine double leg thrust activó mucho el recto femoral y los autores sugieren que podría no ser ideal para personas con patología lumbar (no midieron pacientes).",
          c: [29],
        },
      },
      {
        error: "Cuello flexionado",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Primero costillas a la cadera, después subí las piernas.", c: [] },
      { t: "Hombros lejos de las orejas.", c: [] },
      {
        t: "Los dedos buscan la barra con la pelvis que rota hacia atrás.",
        c: [],
      },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor lumbar con flexión o al volver a la posición colgada. En un estudio, el leg raise colgado generó una compresión de columna alta (~3000 N, estimada con modelo).",
          c: [23],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Pellizco o dolor en el pliegue de la ingle al flexionar mucho la cadera.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor anterior de hombro al sostener el hang con elevación pasiva.",
          c: [],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Adormecimiento de las manos.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor de cuello.", c: [] },
      },
    ],
    evidencia: {
      t: "Evidencia directa: en 14 varones, el hanging straight leg raise produjo la mayor exigencia abdominal (recto abdominal > 130 % MVC, oblicuo externo 88 % MVC) y ~3000 N de compresión de columna (estimada con modelo), más que el body saw (< 2500 N). El resto es anatomía de libro de texto.",
      c: [23, "L1"],
    },
    gestos: [
      "Crunch (abs crunch)",
      "TTB 90 y TTB V",
      "Pike y pike invertido",
      "Windshield",
      "ATW (around the world, presumiblemente)",
      "L a V",
      "Shawarma",
      "TTB a un brazo (OA)",
      "Hang to meathook",
      "Hinge (sin definir)",
    ],
    pendientes: [
      {
        pendiente:
          'Cómo se ejecuta el "hinge" / "ABS HINGE" de TTB: probable anti-extensión con descenso en bisagra, no verificada.',
        quien: "N",
      },
      {
        pendiente:
          "Confirmar ATW (around the world, inferido) dentro de la ruta.",
        quien: "N",
      },
      {
        pendiente:
          "Qué gestos reconoce el método dentro de TTB (la ruta es heterogénea: crunch, pike, windshield, L a V, hang to meathook).",
        quien: "N",
      },
      {
        pendiente:
          "Dónde se siente el ejercicio y el porqué de la compensación cuello flexionado: la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Colgado de la barra, llevar los pies hasta tocarla con las piernas estiradas.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Primero costillas a la cadera, después subí las piernas.",
      "Hombros lejos de las orejas.",
      "Los dedos buscan la barra con la pelvis que rota hacia atrás.",
    ],
    errores: [
      {
        error: "Balancearte",
        texto: "El impulso se te escapa sin querer y cambia el ejercicio.",
      },
      {
        error: "Hombros encogidos",
        texto: "Perdés el colgado activo: alejalos de las orejas.",
      },
      {
        error: "Espalda baja arqueada al bajar",
        texto: "Quedás con la espalda baja arqueada y con carga.",
      },
    ],
  },
} as const satisfies RutaContenido;
