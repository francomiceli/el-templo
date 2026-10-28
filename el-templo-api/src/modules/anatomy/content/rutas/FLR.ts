import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de FLR desde S3.2 (tabla articular) + S8. Borrador
 * (D5). Misma palanca que FL (S3.1); la tabla de FLR no nombra flexores de
 * cadera, así que no se agregan (ver SUMMARY del plan 03).
 */
export const FLR = {
  code: "FLR",
  slug: "front-lever-row",
  patron: "PULL",
  categoria: "Pull horizontal",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "dorsal", c: ["L1"] },
      { m: "redondo", c: ["L1"] },
      { m: "delt-post", c: ["L1"] },
      { m: "triceps", c: ["L1"], nota: "Cabeza larga" },
      { m: "romboides", c: ["L1"], nota: "Trapecio medio" },
      { m: "trap-inf", c: ["L1"] },
      { m: "biceps", c: ["L1"] },
      { m: "braquial", c: ["L1"], nota: "Con el braquiorradial" },
      { m: "recto-abd", c: ["L1"], nota: "Hollow rígido" },
      { m: "oblicuos", c: [], nota: "Oblicuo externo, hollow rígido" },
    ],
    sinergista: [],
    estabilizador: [],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Remada en horizontal desde el front lever: se parte con los brazos rectos, se rema hasta llevar la barra a la cintura o a las costillas y se baja lento hasta volver a los brazos rectos.",
      c: [],
    },
    tipo: "Mixta (43 % isométrica)",
    brazo: "Brazo flexionado (BAS) 30",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Partida",
        texto: {
          t: "Se parte de FL (o de su progresión) con los brazos rectos.",
          c: [],
        },
      },
      {
        nombre: "Remada",
        texto: {
          t: "Remada concéntrica: los codos flexionan, los hombros extienden y las escápulas retraen y deprimen, hasta llevar la barra a la cintura o a las costillas.",
          c: [],
        },
      },
      {
        nombre: "Pausa",
        texto: { t: "Pausa con la barra arriba.", c: [] },
      },
      {
        nombre: "Descenso",
        texto: {
          t: "Excéntrico lento hasta volver a los brazos rectos.",
          c: [],
        },
      },
    ],
    articulaciones: [
      {
        articulacion: "Hombro (glenohumeral)",
        accion: "Extensión continuada + aducción",
        musculos:
          "Dorsal ancho, redondo mayor, deltoides posterior y tríceps (cabeza larga): motores.",
        contraccion:
          "Subida: concéntrica. Arriba: isométrica. Descenso: excéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Escápula (escapulotorácica)",
        accion: "Retracción + depresión",
        musculos: "Romboides y trapecio medio / inferior: motores.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Codo",
        accion: "Flexión",
        musculos: "Bíceps, braquial y braquiorradial: motores.",
        contraccion: "Concéntrica / isométrica / excéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Tronco",
        accion: "Hollow rígido",
        musculos:
          "Recto abdominal y oblicuo externo: motores / estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Es la misma palanca del front lever (ver FL) más el rango de remada.",
        c: [],
      },
      {
        t: 'El row "a la cintura" inclinado frente al horizontal cambia el ángulo del cuerpo con la vertical: la inclinación es el brazo de palanca del cuerpo.',
        c: ["M"],
      },
      {
        t: "El row a la cintura enfatiza la extensión de hombro (dorsal) por sobre la flexión de codo.",
        c: ["C"],
      },
    ],
    siente: {
      pendiente:
        "La sección de FLR no dice dónde se siente. Los motores de la tabla articular no alcanzan para afirmarlo.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Remar con los hombros encogidos",
        porque: {
          t: "Como en el front lever (misma palanca), el trapecio superior sustituye a la depresión escapular.",
          c: ["L1", "L3"],
        },
      },
      {
        error: "Caderas que caen al subir",
        porque: {
          t: "Como en el front lever (misma palanca), aumenta la lordosis lumbar y se pierde el hollow.",
          c: ["L1", "L3"],
        },
      },
      {
        error: "Cuello que se adelanta",
        porque: {
          t: "La sección la lista como compensación habitual y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Codos que se abren",
        porque: {
          t: "La sección la lista como compensación habitual y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Tirón con impulso de piernas",
        porque: {
          t: "La sección la lista como compensación habitual y no da el porqué.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Llevá la barra al ombligo.", c: [] },
      { t: "Codos pegados a las costillas.", c: [] },
      { t: "Bajá en tres segundos sin soltar el hollow.", c: [] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Igual que FL: dolor en la cara anterior del hombro (surco del bíceps) que aparece al sostener.",
          c: [18, 19],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Igual que FL: dolor de codo (anterior, en el pliegue), por tracción con el brazo recto.",
          c: ["L1", "L3"],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Igual que FL: hormigueo en la mano.", c: ["L1", "L3"] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Igual que FL: dolor lumbar al sostener.",
          c: ["L1", "L3"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Igual que FL: dolor articular o tendinoso que no mejora en ~2 semanas pese a bajar la carga, o que empeora sesión a sesión.",
          c: ["H"],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Igual que FL: dolor en el pliegue anterior del codo con debilidad para girar la palma hacia arriba.",
          c: ["L1", "L3"],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor de codo con la flexión profunda.", c: [] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la parte de atrás del hombro al final de la remada.",
          c: [],
        },
      },
    ],
    evidencia: {
      t: "La investigación no trae EMG de esta ruta. Lo único relacionado: en una revisión narrativa de EMG del dorsal ancho, la remada invertida mostró la mayor amplitud, en un solo estudio pequeño que requiere replicación (no es FLR). El resto es anatomía de libro de texto.",
      c: [30, "L1"],
    },
    gestos: [
      "Row a la cintura (inclinado)",
      "Row front (pike, tuck, adv tuck, wide)",
      "Front lever con brazo flexionado (BA FL straddle, full)",
    ],
    pendientes: [
      {
        pendiente:
          "Umbral de ~2 semanas para dolor articular o tendinoso que no mejora (y cómo distinguirlo del dolor muscular tardío): lo fija un kinesiólogo humano.",
        quien: "H",
      },
      {
        pendiente:
          "Nombre oficial de la ruta FLR (la base la llama Front Lever Row y la TV Front Lever Pull Ups): decide qué texto se muestra.",
        quien: "N",
      },
      {
        pendiente:
          "La tabla articular no nombra la cadera aunque la sección dice que es la misma palanca de FL (donde la sostienen los flexores de cadera y el abdomen): la investigación no extiende esa fila a FLR.",
        quien: "fuente",
      },
      {
        pendiente:
          "Dónde se siente el ejercicio y el porqué de cada compensación (salvo hombros encogidos y caderas que caen, tomados de FL): la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Remar colgado en horizontal: partís con los brazos rectos, llevás la barra hacia la cintura y bajás despacio.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Llevá la barra al ombligo.",
      "Codos pegados a las costillas.",
      "Bajá en tres segundos, con el abdomen duro.",
    ],
    errores: [
      {
        error: "Hombros encogidos",
        texto:
          "Trabaja la parte de arriba del hombro en lugar de la espalda: alejalos de las orejas.",
      },
      {
        error: "Caderas que caen",
        texto: "Se arquea la espalda baja y se pierde el abdomen duro.",
      },
    ],
  },
} as const satisfies RutaContenido;
