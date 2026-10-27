/**
 * Fase 200 SC2/T16: diferencias APROBADAS entre la pintura de la TV pre-200
 * (snapshot congelado en test/anatomy/__fixtures__/zonas-tv-pre-200.ts) y la
 * proyección del modelo de anatomía (`zonasDeRuta`). Una entrada por ruta con
 * diferencia, con su motivo y la sección de la investigación que la respalda.
 * Franco las revisa en la UAT (criterio 2). Todo en borrador (D5).
 *
 * Contrato (el test de paridad lo exige):
 *   pre − quita ∪ agrega == zonasDeRuta(code)
 * Cambiar relaciones de una ruta cambia esta lista y el test la obliga.
 */

/** Diferencia de pintura de una ruta respecto de la TV pre-200. */
export interface DiferenciaZonas {
  readonly code: string;
  /** Zonas que la TV pre-200 pintaba y el modelo ya no. */
  readonly quita: readonly string[];
  /** Zonas que el modelo pinta y la TV pre-200 no. */
  readonly agrega: readonly string[];
  /** Por qué, citando la sección de la investigación. */
  readonly motivo: string;
}

export const DIFERENCIAS_APROBADAS: readonly DiferenciaZonas[] = [
  {
    code: "AF",
    quita: [],
    agrega: [
      "deltoids",
      "triceps",
      "trapezius",
      "upper-back",
      "lower-back",
      "gluteal",
      "quadriceps",
      "hamstring",
      "calves",
    ],
    motivo:
      "TI-D (D1): el flow de cuerpo entero tiene 11 motores entre cangrejo, mono, escorpión y crow; el mapeo anterior solo pintaba abdomen y oblicuos por la categoría genérica y ahora se pintan las zonas de todos los motores (rol más alto entre posiciones).",
  },
  {
    code: "BL",
    quita: ["triceps", "abs"],
    agrega: ["biceps", "lower-back", "gluteal", "hamstring"],
    motivo:
      "S4.1 + R2 (§1.7.2: BL ya no es igual a PL): el bíceps (cabeza larga) es motor en el hombro y glúteo mayor, isquios y erectores sostienen la palanca boca abajo (BS5); tríceps y abdomen pasan a estabilizadores.",
  },
  {
    code: "BRIDGE",
    quita: [],
    agrega: ["triceps", "trapezius", "quadriceps", "hamstring"],
    motivo:
      "C2: la tabla articular del puente da tríceps, trapecio (superior e inferior), cuádriceps (vastos) e isquios como motores; los erectores son sinergistas y no cambian la pintura.",
  },
  {
    code: "DS",
    quita: ["lower-back"],
    agrega: ["quadriceps", "adductors"],
    motivo:
      "B-DS (§1.7.2): la tabla de B-DS da cuádriceps como motor (el listado TI-H de DS no lo traía) y aductores como sinergistas; erectores y cuadrado lumbar pasan a estabilizadores.",
  },
  {
    code: "FL",
    quita: ["biceps"],
    agrega: ["chest", "triceps", "obliques", "quadriceps"],
    motivo:
      "S3.1 + S6.1 (§1.7.2, C4): en FL el recto femoral sostiene las piernas (motor isométrico) y pectoral, tríceps y oblicuos son motores del press y el dragon flag; el bíceps pasa a estabilizador.",
  },
  {
    code: "FLR",
    quita: [],
    agrega: ["triceps", "forearm", "abs", "obliques"],
    motivo:
      "S3.2: los motores de la ruta incluyen tríceps, braquial y braquiorradial, recto abdominal y oblicuos, que la categoría de tracción no pintaba.",
  },
  {
    code: "HD/ID",
    quita: [],
    agrega: ["trapezius", "upper-back"],
    motivo:
      "S4.2 (R2): la tabla articular de HD/ID da trapecio inferior (Est/M) y dorsal como motores, no estabilizadores como en S8; siglas abiertas para Nacho (D1).",
  },
  {
    code: "HR",
    quita: ["abs"],
    agrega: ["hamstring"],
    motivo:
      "S6.2 + S6.3: el recto abdominal es antagonista en S6.2 (no se pinta) mientras los oblicuos son motores; los isquios figuran como motores.",
  },
  {
    code: "HS",
    quita: ["deltoids", "triceps", "abs"],
    agrega: ["forearm"],
    motivo:
      "S5.1 (§1.7.2): en el handstand deltoides anterior y tríceps sostienen (estabilizadores) y el abdomen venía de 'STRAIGHT ARM' por 'contiene', un error de carga; los motores son trapecio y flexores de muñeca (agarre).",
  },
  {
    code: "HSPU",
    quita: [],
    agrega: ["chest"],
    motivo: "S5.2: el pectoral es sinergista del press invertido.",
  },
  {
    code: "HT",
    quita: ["lower-back"],
    agrega: ["adductors"],
    motivo:
      "B-HT: los erectores son estabilizadores del hip thrust y los aductores sinergistas.",
  },
  {
    code: "L",
    quita: [],
    agrega: ["hamstring"],
    motivo:
      "A1: los isquiotibiales son sinergistas del lunge (extensión de cadera); glúteo, cuádriceps y aductores siguen igual.",
  },
  {
    code: "MN/RP",
    quita: ["biceps"],
    agrega: ["chest", "obliques", "quadriceps", "adductors"],
    motivo:
      "S3.3 (C2 de §1.8): en el L-sit la compresión de cadera la hacen recto femoral, aductores y oblicuos (motores) y el pectoral es sinergista; el bíceps pasa a estabilizador. A confirmar con Nacho (⚑N).",
  },
  {
    code: "MU",
    quita: [],
    agrega: ["chest", "deltoids", "triceps", "trapezius"],
    motivo:
      "S2.2: la fase de empuje del muscle-up suma pectoral, deltoides y tríceps, y el tirón suma el trapecio inferior, todos como motores.",
  },
  {
    code: "NC",
    quita: ["lower-back"],
    agrega: ["adductors", "calves"],
    motivo:
      "§1.7.2 + B-NC-4: los calf raises hacen motores a gemelo y sóleo (la TV no tenía gemelos en piernas), los aductores son sinergistas y los erectores pasan a estabilizadores.",
  },
  {
    code: "OAP",
    quita: [],
    agrega: ["chest", "trapezius"],
    motivo:
      "S2.3: pectoral y trapecio inferior son motores según la tabla articular del one arm pull-up.",
  },
  {
    code: "OAR",
    quita: [],
    agrega: ["forearm"],
    motivo:
      "S3.4: braquial y braquiorradial son motores según la tabla articular.",
  },
  {
    code: "PHS",
    quita: ["triceps"],
    agrega: ["chest", "obliques", "quadriceps", "adductors"],
    motivo:
      "S5.3: la compresión de cadera suma recto femoral, aductores y oblicuos como motores, el pectoral es motor y el tríceps pasa a estabilizador.",
  },
  {
    code: "PIKE",
    quita: ["lower-back", "abs", "gluteal", "hamstring"],
    agrega: ["quadriceps"],
    motivo:
      "C4 (§1.7.2): en el pike isquios, glúteo mayor y erectores se estiran (Al) y no se pintan como trabajo; el trabajo activo es de los flexores de cadera (recto femoral) y el abdomen estabiliza. A revisar con el kinesiólogo humano (⚑H).",
  },
  {
    code: "PL",
    quita: ["abs"],
    agrega: ["biceps", "lower-back", "gluteal", "hamstring"],
    motivo:
      "S4.4 + BS5: la planche boca abajo se sostiene con glúteo mayor, isquios y erectores, el bíceps es motor y el abdomen pasa a estabilizador.",
  },
  {
    code: "PLPU",
    quita: [],
    agrega: ["lower-back", "gluteal", "hamstring"],
    motivo:
      "S4.5 + BS5: misma cadena posterior que PL (glúteo mayor, isquios y erectores) como motores.",
  },
  {
    code: "PS",
    quita: [],
    agrega: ["hamstring", "calves"],
    motivo:
      "A2 (§1.7.2): isquios sinergistas, sóleo motor y gemelo estabilizador del pistol (dorsiflexión de tobillo).",
  },
  {
    code: "QC",
    quita: ["gluteal", "adductors"],
    agrega: ["tibialis"],
    motivo:
      "A3 (§1.7.2): 'TIBIALES PARED' hace motor al tibial anterior; el glúteo pasa a estabilizador y A3 no lista aductores. Tibialis no viaja a la TV (soloTv).",
  },
  {
    code: "REVERSE HYPER",
    quita: [],
    agrega: ["hamstring"],
    motivo: "C5: los isquios son motores junto al glúteo mayor.",
  },
  {
    code: "SIDE PCK",
    quita: ["abs", "gluteal", "hamstring"],
    agrega: ["lower-back"],
    motivo:
      "A9 + C3 (§1.7.2): abdomen, glúteo e isquios venían de la secundaria 'LOWER POSTERIOR' mal cargada; los motores son oblicuos y cuadrado lumbar, los isquios son antagonistas y el glúteo medio estabilizador.",
  },
  {
    code: "SPAGAT",
    quita: [],
    agrega: ["lower-back", "abs", "obliques", "gluteal", "calves"],
    motivo:
      "C1: SPAGAT no tiene motores, rige el fallback estabilizador y estira (D20, Pitfall 4): erectores, abdomen, oblicuos y glúteos estabilizan y el gemelo se estira.",
  },
  {
    code: "SS",
    quita: ["gluteal", "adductors"],
    agrega: [],
    motivo:
      "A4 (§1.7.2): SS es foco cuádriceps (vastos, recto femoral y flexores de cadera); el glúteo co-contrae y solo estabiliza, y A4 no lista aductores.",
  },
  {
    code: "SU",
    quita: ["lower-back"],
    agrega: ["calves"],
    motivo:
      "A5: sóleo y gemelo son sinergistas del step-up y A5 no lista erectores.",
  },
  {
    code: "TTB",
    quita: ["biceps"],
    agrega: ["trapezius", "quadriceps", "adductors"],
    motivo:
      "S2.4 + S6.1 (§1.7.2): en toe to bar el recto femoral (flexores de cadera) y el trapecio inferior son motores y los aductores sinergistas; el bíceps pasa a estabilizador.",
  },
];
