import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de MN/RP desde S3.3 (tabla articular) + S8. Borrador
 * (D5).
 *
 * Corrección R2-3 (Pitfall 3): L-sit / V-sit llevan flexores de cadera
 * (psoas, recto femoral, aductores) y recto abdominal; el reverse planche
 * (apoyo libre, boca arriba) lo sostienen abdomen y flexores de cadera, y
 * glúteo y erectores solo co-contraen. ⚑H: confirmar que el reverse planche del
 * catálogo sea el apoyo libre.
 */
export const MN_RP = {
  code: "MN/RP",
  slug: "manna",
  patron: "PULL",
  categoria: "Pull horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "trap-inf", c: ["L1", "R"] },
      { m: "romboides", c: ["L1", "R"], nota: "Trapecio medio" },
      { m: "serrato", c: ["L1", "R"], nota: "Fibras inferiores" },
      { m: "dorsal", c: ["L1", "R"] },
      { m: "redondo", c: ["L1"] },
      { m: "delt-post", c: ["L1"] },
      {
        m: "triceps",
        c: ["L1"],
        nota: "Cabeza larga; en el codo, isométrico",
      },
      { m: "psoas", c: ["L1", "R"], nota: "L-sit y V-sit; reverse planche" },
      {
        m: "recto-fem",
        c: ["L1", "R"],
        nota: "L-sit y V-sit; reverse planche",
      },
      { m: "aductores", c: ["L1", "R"], nota: "L-sit y V-sit" },
      {
        m: "recto-abd",
        c: ["L1", "R"],
        nota: "L-sit y V-sit; reverse planche",
      },
      { m: "oblicuos", c: ["L1", "R"], nota: "Reverse planche" },
    ],
    sinergista: [
      {
        m: "pectoral",
        c: ["L1"],
        nota: "Esternal; se estira en el rango final",
      },
    ],
    estabilizador: [
      { m: "biceps", c: ["L1"], nota: "Cabeza larga, tensión anterior" },
      { m: "braquial", c: ["L1"] },
      { m: "antebrazo", c: ["L1"], nota: "Muñeca en extensión alta" },
      {
        m: "gluteo-mayor",
        c: ["L1", "R"],
        nota: "Co-contracción postural en el reverse planche, no sostiene",
      },
      {
        m: "erectores",
        c: ["L1", "R"],
        nota: "Co-contracción postural en el reverse planche, no sostiene",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Soporte con brazos rectos: L-sit (manos al costado de la cadera), V-sit o manna (manos detrás) y reverse planche (manos detrás, cuerpo boca arriba). Cadera y tronco trabajan distinto según el escalón.",
      c: [],
    },
    tipo: "Mixta (33 % isométrica)",
    brazo: "Brazo recto (SAS) 28",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "L-sit / V-sit",
        texto: {
          t: "Soporte, depresión escapular y compresión de cadera (L = 90°, V = más cerrada).",
          c: [],
        },
      },
      {
        nombre: "Scapula press",
        texto: {
          t: "Elevación y depresión escapular con los brazos rectos (movimiento pequeño).",
          c: [],
        },
      },
      {
        nombre: "Manna press",
        texto: {
          t: "Desde el V-sit, elevar la cadera sobre las manos (soporte con la cadera por encima de la altura del hombro).",
          c: [],
        },
      },
      {
        nombre: "Reverse planche",
        texto: {
          t: "Cuerpo horizontal boca arriba, manos detrás, cadera extendida.",
          c: [],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Escápula (escapulotorácica)",
        accion:
          "Depresión + retracción. Con el hombro en hiperextensión la escápula tiende a inclinarse hacia adelante y rotar hacia abajo: el trabajo es controlar esa inclinación y que no se eleve.",
        musculos:
          "Trapecio inferior y medio, romboides, dorsal ancho y fibras inferiores del serrato anterior: motores / estabilizadores. Pectoral menor: se estira.",
        contraccion:
          "Isométrica (sostén). Concéntrica y excéntrica en el scapula press.",
        c: ["L1", "R", "H"],
      },
      {
        articulacion: "Hombro (glenohumeral)",
        accion:
          "Extensión de hombro (sagital, hasta hiperextensión relativa) + rotación externa o interna según el agarre",
        musculos:
          "Dorsal ancho, redondo mayor, deltoides posterior y tríceps (cabeza larga): motores. Pectoral mayor esternal (se estira en el rango final): antagonista / sinergista. Bíceps (cabeza larga, tensión anterior): estabilizador.",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
      {
        articulacion: "Codo",
        accion: "Extendido (brazo recto)",
        musculos:
          "Tríceps y ancóneo: motores isométricos (mantienen la extensión). Bíceps y braquial: antagonistas / estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Muñeca",
        accion: "Extensión alta (dedos hacia atrás o hacia los costados)",
        musculos:
          "Extensores y flexores: estabilizadores. Carga articular alta.",
        contraccion: "Isométrica.",
        c: ["L1"],
      },
      {
        articulacion: "Cadera y columna",
        accion:
          "L-sit y V-sit: flexión de cadera con rodillas extendidas y retroversión. Reverse planche (apoyo solo en manos, boca arriba): la gravedad tiende a extender cadera y columna.",
        musculos:
          "L-sit y V-sit: iliopsoas, recto femoral, aductores y recto abdominal: motores. Reverse planche: el abdomen (recto abdominal, oblicuos) y los flexores de cadera: motores isométricos; glúteo y erectores: co-contracción postural, no sostienen. Es distinto de la plancha invertida con los talones en el piso, donde sí trabaja sobre todo el glúteo.",
        contraccion: "Isométrica.",
        c: ["L1", "R", "H"],
      },
    ],
    progresa: [
      {
        t: "L-sit → V-sit: sube la exigencia de movilidad y de fuerza de compresión (brazo de palanca de las piernas respecto de la cadera, que se acorta al elevarse; el soporte se hace más corto).",
        c: [],
      },
      {
        t: "El manna press agrega la traslación de la cadera sobre las manos (inclinación de los hombros hacia adelante, lean).",
        c: [],
      },
      {
        t: "En el reverse planche, igual que en el planche, el centro de masa tiene que quedar encima de las manos: cuanto más se alargan las piernas (tuck → straddle → full), más hay que llevar los hombros hacia atrás de las manos, y crece el torque que tiene que hacer el hombro (distancia horizontal entre los hombros y el centro de masa).",
        c: ["R"],
      },
      {
        t: "Combina flexibilidad de isquiotibiales, extensión de hombro y fuerza con brazos rectos (SAS).",
        c: [],
      },
    ],
    siente: {
      pendiente:
        "La sección de MN/RP no tiene un bloque de dónde se siente. Los motores de la tabla articular no alcanzan para afirmarlo.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Hombros elevados (colapso hacia las orejas)",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Flexión de codo",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Caderas bajas y rodillas dobladas en el L-sit",
        porque: { t: "Se pierde la palanca.", c: [] },
      },
      {
        error: "Hiperextensión lumbar para 'sentir' el reverse planche",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Muñecas con presión desigual",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
    ],
    cues: [
      {
        t: "Empujá el piso para alejarlo y sacá los hombros de las orejas.",
        c: [],
      },
      {
        t: "Las piernas arrancan desde la cadera, no desde las rodillas.",
        c: [],
      },
      { t: "Pelvis levemente atrás, abdomen duro.", c: [] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor anterior de hombro en la posición de extensión extrema (reverse planche, Korean u hombros detrás del cuerpo): tensión de la cápsula anterior, el bíceps y el pectoral.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor lumbar con la hiperextensión.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor de muñeca por la extensión final.", c: [] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Pellizco o dolor en el pliegue de la ingle en el V-sit, al comprimir la cadera.",
          c: [],
        },
      },
    ],
    evidencia: {
      t: "La sección no cita estudios: sus filas se apoyan en anatomía de libro de texto y en el texto aportado por la revisión del kinesiólogo, sin cita verificada.",
      c: ["L1", "R"],
    },
    gestos: [
      "L-sit",
      "V-sit",
      "Scapula press",
      "Manna press",
      "Reverse planche",
    ],
    pendientes: [
      {
        pendiente:
          "Confirmar que el reverse planche del catálogo sea el apoyo libre (solo manos, boca arriba) y no la variante con pies apoyados: cambia qué músculos son motores.",
        quien: "H",
      },
      {
        pendiente:
          "Confirmar la redacción de la mecánica boca arriba (abdomen y flexores de cadera sostienen las piernas, el glúteo solo co-contrae) aplicada al reverse planche.",
        quien: "H",
      },
      {
        pendiente:
          "Escápula en el reverse planche con el hombro en hiperextensión (inclinación anterior y rotación hacia abajo): confirmar la redacción.",
        quien: "H",
      },
      {
        pendiente:
          "Definir con el ejercicio a la vista si el reverse planche del catálogo es el apoyo libre o la variante con pies apoyados.",
        quien: "N",
      },
      {
        pendiente:
          "Criterio de la base para clasificar MN/RP como pull horizontal (hipótesis: el motor del hombro son los extensores, igual que en FL y los rows) y nombre oficial de la ruta (Manna, L-sit o Reverse planche).",
        quien: "N",
      },
      {
        pendiente:
          "Dónde se siente el ejercicio y el porqué de las compensaciones (hombros elevados, flexión de codo, hiperextensión lumbar, muñecas con presión desigual): la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Sostenerte con los brazos rectos apoyado en las manos: sentado con las piernas estiradas al frente (L-sit), o boca arriba con las manos detrás del cuerpo (reverse planche).",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Empujá el piso para alejarlo y sacá los hombros de las orejas.",
      "Las piernas arrancan desde la cadera, no desde las rodillas.",
      "Pelvis levemente atrás, abdomen duro.",
    ],
    errores: [
      {
        error: "Hombros hacia las orejas",
        texto: "Empujá el piso para alejarlo y sacá los hombros de las orejas.",
      },
      {
        error: "Codos doblados",
        texto: "Los brazos tienen que quedar rectos.",
      },
      {
        error: "Caderas bajas y rodillas dobladas en el L-sit",
        texto: "Perdés la palanca.",
      },
    ],
  },
} as const satisfies RutaContenido;
