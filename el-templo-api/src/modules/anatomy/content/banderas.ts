/**
 * Fase 200 D5/D11: banderas de derivación consolidadas (investigación §3.1).
 * Borrador: los umbrales de tiempo los fija un kinesiólogo humano (⚑H).
 * notaInterna NO sale del API (T21 §6.6): solo para quien revisa el contenido.
 *
 * `rutas` = a qué rutas de las 30 de ROUTE_PROGRESSION_MAP aplica la bandera
 * (columna "Dónde aplica" del §3.1 unida con los bloques del §3.2) o "todas".
 * PLYO, CARDIO y KL se descartan por D2: b17 solo aplicaba a PLYO y CARDIO, así
 * que queda sin rutas en v1 (el validador lo admite solo para b17).
 */
import type { BanderaDef } from "../types";

export const BANDERAS = [
  // (a) URGENCIA: cortar la clase y guardia o emergencias el mismo día
  {
    id: "a1",
    nivel: "urgencia",
    senal:
      'Adormecimiento en la entrepierna, los genitales o la cara interna de los muslos ("zona de la silla de montar"); dificultad nueva para orinar, o pérdida de control de orina o de materia fecal; debilidad u hormigueo en las dos piernas a la vez',
    accion: "Cortar la clase; guardia médica ya (no kinesiólogo)",
    rutas: [
      "TTB",
      "HR",
      "HT",
      "NC",
      "PIKE",
      "BRIDGE",
      "REVERSE HYPER",
      "MN/RP",
    ],
    notaInterna:
      "Es una urgencia quirúrgica de la zona lumbar (cauda equina). No aparecía en ninguna parte del documento original",
    fuente: "R3-5; R2 §4 #10",
    umbralH: false,
  },
  {
    id: "a2",
    nivel: "urgencia",
    senal:
      "Dolor, opresión o ardor en el pecho, falta de aire desproporcionada al esfuerzo, palpitaciones irregulares, mareo intenso o desmayo durante o justo después del esfuerzo",
    accion:
      "Cortar ya, no dejar que se vaya solo, llamar a emergencias. Si se repite aunque sea leve: apto médico antes de volver",
    rutas: "todas",
    notaInterna: "Emergencia cardiovascular",
    fuente: "R3-18",
    umbralH: false,
  },
  {
    id: "a3",
    nivel: "urgencia",
    senal:
      "Orina oscura (color té o coca), dolor muscular desproporcionado, hinchazón o debilidad marcada 24–72 h después de una sesión excéntrica nueva o de mucho volumen (nordic, sissy, saltos)",
    accion:
      "Guardia médica el mismo día (no kinesiólogo). Primera sesión de nordic: volumen bajo",
    rutas: ["NC", "SS", "QC", "L", "PS", "SU", "DS", "HT"],
    notaInterna:
      "Posible rabdomiólisis (riesgo renal). El daño y el dolor son medibles incluso con 24 repeticiones de nordic en hombres entrenados [71]. Los volúmenes altos y crecientes dan más dolor [72]",
    fuente: "R3-7",
    umbralH: false,
  },
  {
    id: "a4",
    nivel: "urgencia",
    senal:
      'Un "pop" o chasquido con dolor súbito durante el esfuerzo, sobre todo si después aparece moretón, hinchazón o cambio de forma (bulto en el brazo, pliegue de la axila distinto, hundimiento en el pliegue del codo). Incluye: dolor súbito en el pecho o la axila durante un fondo (profundo, negativo o lastrado), con o sin chasquido',
    accion: "Cortar; derivar el mismo día",
    rutas: [
      "HD/ID",
      "OAP",
      "MU",
      "FL",
      "FLR",
      "BL",
      "OAR",
      "OAPU",
      "PL",
      "PLPU",
    ],
    notaInterna:
      "Las roturas tendinosas de bíceps distal y de pectoral se resuelven mejor si se evalúan temprano. Hay al menos un caso publicado en un atleta de calistenia [38] (el abstract no dice en qué ejercicio)",
    fuente: "R2 §4 #2; R2-24",
    umbralH: false,
  },
  {
    id: "a5",
    nivel: "urgencia",
    senal:
      'Sensación de "patada" o "pedrada" en la pantorrilla o el talón durante un salto o un arranque, con dificultad para empujar con el pie',
    accion: "Cortar, no apoyar, guardia el mismo día",
    rutas: ["NC"],
    notaInterna: "Posible rotura del tendón de Aquiles",
    fuente: "R3-14",
    umbralH: false,
  },
  {
    id: "a6",
    nivel: "urgencia",
    senal:
      "Adolescente (≈10–16 años) con renguera nueva y dolor de ingle, muslo o rodilla, sin golpe previo",
    accion: "Médico en el día",
    rutas: "todas",
    notaInterna:
      "Una lesión de cadera puede doler en la rodilla (posible epifisiólisis)",
    fuente: "R3-15",
    umbralH: false,
  },
  {
    id: "a7",
    nivel: "urgencia",
    senal:
      "Durante una inversión (vertical, HSPU, press): dolor de cabeza fuerte y súbito, visión borrosa o mareo que no pasa al volver de pie",
    accion:
      "Cortar y derivar al médico (consulta médica, no kinesiológica; plazo a validar)",
    rutas: ["HS", "HSPU", "PHS"],
    notaInterna: "Ver tamizaje previo en §3.3",
    fuente: "R2-26",
    umbralH: true,
  },

  // (b1) DERIVAR, transversales (valen para todas las rutas)
  {
    id: "b1",
    nivel: "derivar",
    senal:
      "Dolor que despierta a la noche o que no deja dormir del lado afectado",
    accion: "Cortar y derivar al kinesiólogo",
    rutas: "todas",
    notaInterna: null,
    fuente: "R2 §4 #1",
    umbralH: false,
  },
  {
    id: "b2",
    nivel: "derivar",
    senal:
      'Pérdida de fuerza súbita o "brazo muerto": no puede levantar el brazo, sostener el agarre o girar la palma hacia arriba con fuerza',
    accion: "Cortar y derivar",
    rutas: "todas",
    notaInterna: null,
    fuente: "R2 §4 #3",
    umbralH: false,
  },
  {
    id: "b3",
    nivel: "derivar",
    senal:
      'Hormigueo, adormecimiento o dolor que baja por el brazo (más allá del codo) o por la pierna (más allá de la rodilla), o que aparece al mover o cargar el cuello. Con la columna: dolor lumbar que baja por debajo de la rodilla, hormigueo o adormecimiento en pierna o pie, pérdida de fuerza (pie que "se cae", no puede caminar en puntas o en talones)',
    accion:
      "Cortar y derivar antes de volver a cargar (si además aparece algo de a1: urgencia)",
    rutas: "todas",
    notaInterna: null,
    fuente: "R2 §4 #4; R3-5",
    umbralH: false,
  },
  {
    id: "b4",
    nivel: "derivar",
    senal:
      'Sensación de que el hombro "se sale", se traba o "se va"; un codo que se traba o no termina de estirarse',
    accion: "Cortar y derivar",
    rutas: "todas",
    notaInterna: null,
    fuente: "R2 §4 #5",
    umbralH: false,
  },
  {
    id: "b5",
    nivel: "derivar",
    senal:
      "Dolor articular o tendinoso que no mejora en ~2 semanas pese a bajar la carga, que empeora sesión a sesión o que aparece cada vez más temprano en la sesión",
    accion: "Derivar (rodilla y Aquiles: 2–3 semanas)",
    rutas: "todas",
    notaInterna: "El umbral de tiempo lo fija un kinesiólogo humano (⚑H)",
    fuente: "R2 §4 #6; R2-21",
    umbralH: true,
  },
  {
    id: "b6",
    nivel: "derivar",
    senal:
      "Dolor que no cambia con nada (ni con el movimiento, ni con el reposo, ni con la posición); dolor de espalda nuevo con fiebre, pérdida de peso sin explicación o antecedente de cáncer; dolor después de una caída o un golpe",
    accion: "Médico",
    rutas: "todas",
    notaInterna: null,
    fuente: "R2 §4 #7 y #15; R3-5",
    umbralH: false,
  },
  {
    id: "b7",
    nivel: "derivar",
    senal:
      "Después de una caída sobre la mano extendida (vertical, planche, salida de anillas): dolor en la base del pulgar, del lado del dorso de la mano, aunque pueda seguir entrenando",
    accion: "Derivar",
    rutas: "todas",
    notaInterna:
      "Es la zona del escafoides, cuya fractura se pasa por alto con facilidad",
    fuente: "R2 §4 #8",
    umbralH: false,
  },
  {
    id: "b8",
    nivel: "derivar",
    senal:
      "Menores en crecimiento: dolor de muñeca del lado del pulgar al apoyarse, o dolor de codo (de afuera o de adentro) en apoyos o colgados",
    accion: "Derivar pronto y no entrenar a través del dolor",
    rutas: "todas",
    notaInterna: "Evidencia: [31]",
    fuente: "R2 §4 #9",
    umbralH: false,
  },
  {
    id: "b9",
    nivel: "derivar",
    senal:
      "Dolor en el pliegue anterior del codo con debilidad para girar la palma hacia arriba",
    accion: "Derivar",
    rutas: ["FL", "FLR", "BL", "MU", "OAR", "OAP"],
    notaInterna: null,
    fuente: "R2 §4 #14",
    umbralH: false,
  },
  {
    id: "b10",
    nivel: "derivar",
    senal:
      "Muñeca con carga: dolor del lado del dedo meñique con chasquido o sensación de inestabilidad al apoyar o al girar la muñeca; dolor del lado de atrás de la muñeca con carga o pérdida de extensión",
    accion: "Derivar",
    rutas: ["PL", "PLPU", "HS", "HSPU", "PHS", "MN/RP", "AF", "BRIDGE"],
    notaInterna: "Evidencia: [31]",
    fuente: "R2 §4 ajustes; R3 (BRIDGE, AF)",
    umbralH: false,
  },

  // (b2) DERIVAR, por segmento o contexto
  {
    id: "b11",
    nivel: "derivar",
    senal:
      "Columna: dolor lumbar localizado que se reproduce al arquear (en especial en menores de 20 que entrenan extensión repetida); dolor lumbar con flexión repetida o con hanging leg raises; dolor que aumenta al flexionar y no cede en reposo",
    accion: "Derivar. Si además hay síntomas de b3 o a1, ver esos niveles",
    rutas: ["BRIDGE", "REVERSE HYPER", "HT", "TTB", "HR", "PIKE", "NC"],
    notaInterna:
      "Evidencia: [103] (extensión repetida), [23] (flexión repetida)",
    fuente: "R2-27; R3",
    umbralH: false,
  },
  {
    id: "b12",
    nivel: "derivar",
    senal:
      'PIKE: hormigueo, ardor o "tirón eléctrico" que baja por detrás de la pierna al hacer pike',
    accion: "Bajar rango y derivar si se repite",
    rutas: ["PIKE", "SPAGAT"],
    notaInterna: null,
    fuente: "R3-19",
    umbralH: false,
  },
  {
    id: "b13",
    nivel: "derivar",
    senal:
      'Rodilla: hinchazón que aparece en las horas siguientes a entrenar; rodilla que se traba y no se puede estirar del todo; sensación de que "se sale" o falla al apoyar o al girar; dolor de adelante de la rodilla que dura más de 2–3 semanas o empeora sesión a sesión (escaleras abajo, sentado mucho tiempo, arrodillarse); dolor puntual en el costado de la articulación con flexión profunda o giro',
    accion:
      "Derivar; mientras tanto, sacar saltos y flexión profunda cargada. Un chasquido sin dolor ni hinchazón no es bandera",
    rutas: ["L", "PS", "QC", "SS", "SU", "DS"],
    notaInterna: "El umbral de 2–3 semanas lo fija un kinesiólogo humano (⚑H)",
    fuente: "R3-16",
    umbralH: true,
  },
  {
    id: "b14",
    nivel: "derivar",
    senal:
      'Cadera / ingle: pinchazo profundo en la ingle al llegar al fondo de una sentadilla, un dragon, un pigeon o un spagat, o al cruzar la pierna hacia adentro; chasquido con dolor o sensación de traba; el alumno se agarra el costado de la cadera con la mano en forma de "C"; dolor en la ingle o en la cara interna del muslo al cerrar las piernas con fuerza, al patear o en el cossack; pellizco o dolor en el pliegue de la ingle al flexionar mucho la cadera (TTB, V-sit, PHS); hormigueo o ardor que baja por la pierna',
    accion: "Derivar",
    rutas: [
      "PS",
      "DS",
      "SPAGAT",
      "SIDE PCK",
      "TTB",
      "MN/RP",
      "PHS",
      "AF",
      "L",
      "QC",
      "SS",
      "SU",
    ],
    notaInterna:
      "Dolor de origen articular de cadera o relacionado con aductores/iliopsoas. Marcos de consenso [93][94][95]",
    fuente: "R3 #6; R3-19; R2-22",
    umbralH: false,
  },
  {
    id: "b15",
    nivel: "derivar",
    senal:
      "Isquios: pinchazo o tirón agudo durante un nordic, una bisagra o un sprint, a veces con chasquido; si después aparece moretón en la parte de atrás del muslo, duele al sentarse o cuesta caminar normal",
    accion: "Cortar y derivar en el día o al siguiente",
    rutas: ["NC", "HT"],
    notaInterna: null,
    fuente: "R3 #7",
    umbralH: false,
  },
  {
    id: "b16",
    nivel: "derivar",
    senal:
      "Aquiles: dolor o rigidez en el tendón a la mañana o al arrancar, que dura más de 2–3 semanas o empeora sesión a sesión; bulto o engrosamiento doloroso del tendón",
    accion: "Derivar y bajar saltos/pogo",
    rutas: ["NC"],
    notaInterna: "El umbral de 2–3 semanas lo fija un kinesiólogo humano (⚑H)",
    fuente: "R3-14",
    umbralH: true,
  },
  {
    id: "b17",
    nivel: "derivar",
    senal:
      "Tibia (plyo): dolor en un punto del hueso de la tibia que aparece al saltar y después también al caminar o de noche",
    accion: "Derivar",
    rutas: [],
    notaInterna:
      "Aplicaba solo a PLYO y CARDIO, fuera de las 30 rutas por D2: sin rutas en v1",
    fuente: "R3 #11",
    umbralH: false,
  },
  {
    id: "b18",
    nivel: "derivar",
    senal:
      "Adolescentes (≈10–16 años): dolor en el bulto de abajo de la rótula, en la punta inferior de la rótula o en el talón que aparece con saltos, sissy o arrodillarse",
    accion: "Derivar y bajar impacto/flexión profunda",
    rutas: ["SS", "QC", "SU", "L", "PS", "DS"],
    notaInterna: null,
    fuente: "R3-15",
    umbralH: false,
  },
  {
    id: "b19",
    nivel: "derivar",
    senal:
      "HSPU con cabeza al piso: dolor de cuello, o dolor u hormigueo que baja al brazo después",
    accion:
      "Cortar las variantes con cabeza al piso y derivar (evidencia de un preprint, no revisado por pares)",
    rutas: ["HSPU"],
    notaInterna: "Evidencia: [39]",
    fuente: "R2-25",
    umbralH: false,
  },
  {
    id: "b20",
    nivel: "derivar",
    senal:
      "Bridge con cabeza colgando: mareo, visión borrosa u hormigueo en los brazos; dolor de muñeca que sigue al día siguiente (en adolescentes, derivar)",
    accion: "Cortar",
    rutas: ["BRIDGE"],
    notaInterna: null,
    fuente: "R3 #13",
    umbralH: false,
  },
  {
    id: "b21",
    nivel: "derivar",
    senal:
      'Hombro en colgados y apoyos: dolor profundo anterior o lateral de hombro al colgarse pasivo; sensación de "salida" o inestabilidad; dolor en la cara anterior del hombro durante o después de German hang/skin the cat, planche o fondos profundos',
    accion:
      "Cortar la variante y derivar (en gimnastas, el mecanismo dominante de las lesiones quirúrgicas fue la tracción con manos fijas)",
    rutas: [
      "FL",
      "FLR",
      "BL",
      "MU",
      "OAP",
      "OAR",
      "MN/RP",
      "TTB",
      "PL",
      "HD/ID",
    ],
    notaInterna: "Evidencia: [18]",
    fuente: "R2-22; S2.1, S4.1",
    umbralH: false,
  },

  // (c) Precauciones previas: no prescribir sin aval
  {
    id: "c1",
    nivel: "precaucion",
    senal:
      'Flexión de columna cargada (Jefferson, pike con peso, "deep sq to jefferson"): osteoporosis u osteopenia conocida, antecedente de fractura vertebral, hernia de disco reciente o diagnosticada, o síntomas radiculares. En mujeres posmenopáusicas y personas mayores, preguntar antes',
    accion:
      "No prescribir sin aval del kinesiólogo (para hernia o protrusión diagnosticada: que autorice la flexión con carga antes de empezar). Cargas bajas, progresión lenta. No meter un Jefferson largo justo antes de un levantamiento o salto pesado",
    rutas: ["NC", "HR", "PIKE"],
    notaInterna: "Evidencia: [32]",
    fuente: "R3-17; R2 §4; R2-28",
    umbralH: false,
  },
  {
    id: "c2",
    nivel: "precaucion",
    senal:
      "Inversiones (vertical, HSPU, press): antes de las primeras, preguntar ¿presión alta no controlada?, ¿glaucoma, problemas de retina o cirugía de ojos reciente?, ¿embarazo?, ¿desmayos?",
    accion:
      "Si alguna es sí: que lo consulte con su médico antes de invertirse",
    rutas: ["HS", "HSPU", "PHS"],
    notaInterna: "Criterio a validar por un kinesiólogo humano (⚑H)",
    fuente: "R2-26",
    umbralH: true,
  },
  {
    id: "c3",
    nivel: "precaucion",
    senal:
      "Hombros muy laxos o con antecedente de luxación (también hiperlaxos en spagat y bridge)",
    accion:
      "Preferir colgado activo; German hang y skin the cat solo con criterio de un kinesiólogo",
    rutas: [
      "FL",
      "MU",
      "OAP",
      "FLR",
      "OAR",
      "BL",
      "SPAGAT",
      "SIDE PCK",
      "BRIDGE",
    ],
    notaInterna: "Criterio a validar por un kinesiólogo humano (⚑H)",
    fuente: "R2-10; R2 §5 #6; R3 §humano #7",
    umbralH: true,
  },
  {
    id: "c4",
    nivel: "precaucion",
    senal: "Primera exposición al nordic",
    accion: "Volumen bajo (ver a3). Dosis inicial segura: a definir",
    rutas: ["NC"],
    notaInterna: "La dosis inicial segura la fija un kinesiólogo humano (⚑H)",
    fuente: "R3-7",
    umbralH: true,
  },
  {
    id: "c5",
    nivel: "precaucion",
    senal:
      "Progresión de exposición en SAS (BL, German hang, manna, planche): cuántas sesiones o semanas antes de subir de escalón",
    accion:
      "Sin evidencia directa (la fuente disponible es solo de Aquiles y rotuliano)",
    rutas: ["BL", "MN/RP", "PL", "FL"],
    notaInterna:
      "Fuente disponible: [22]. A definir por un kinesiólogo humano (⚑H)",
    fuente: "R2 §5 #5",
    umbralH: true,
  },
  {
    id: "c6",
    nivel: "precaucion",
    senal:
      "Menores en crecimiento: volumen de apoyo de muñeca y colgados, saltos, sissy, seiza, bridge",
    accion:
      "Criterios de edad y carga a definir con un kinesiólogo pediátrico/deportivo",
    rutas: "todas",
    notaInterna: "Criterio a validar por un kinesiólogo humano (⚑H)",
    fuente: "R2 §5 #7; R3 §humano #3",
    umbralH: true,
  },
] as const satisfies readonly BanderaDef[];

export type BanderaId = (typeof BANDERAS)[number]["id"];
