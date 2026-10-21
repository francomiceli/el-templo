import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de PS desde A2 (tabla articular) + TI-H. Borrador
 * (D5). Ficha completa (D11), port de FICHAS.PS (sketch 019) y RUTA_ALUMNO.PS
 * (sketch 020) verificado frase por frase contra A2 (bloques 1 a 6) y B-PSS.
 *
 * Las marcas son las de la celda de A2: la tabla no declara una general, así
 * que donde la celda no trae marca va `c: []` (el sketch ponía L1 y 53 en tres
 * filas que A2 no marca). Sumo squat (B-PSS) y la parte HIP de PS no cambian
 * los roles: solo el momento de dorsiflexión y la base ancha.
 */
export const PS = {
  code: "PS",
  slug: "pistol-squat",
  patron: "LOWER",
  categoria: "Rodilla dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "gluteo-mayor", c: ["L1"], nota: "Cadera de apoyo" },
      {
        m: "vastos",
        c: [53],
        nota: "Rodilla de apoyo: la demanda excéntrica es mayor que a dos piernas",
      },
      {
        m: "recto-fem",
        c: ["L1", "R"],
        nota: "Pierna libre: isométrico muy acortado (también co-actúa en la rodilla de apoyo)",
      },
      {
        m: "psoas",
        c: ["L1", "R"],
        nota: "Pierna libre: isométrico muy acortado, por eso se acalambra",
      },
      {
        m: "soleo",
        c: [],
        nota: "Excéntrico en el descenso y concéntrico al empujar",
      },
    ],
    sinergista: [
      { m: "aductores", c: ["L1"], nota: "Aductor mayor, cadera de apoyo" },
      {
        m: "isquios",
        c: ["L1"],
        nota: "Su largo cambia poco y su aporte como extensores es moderado; los de la pierna libre se alargan al máximo y suelen ser el primer limitante",
      },
    ],
    estabilizador: [
      {
        m: "gluteo-medio",
        c: [49, 50],
        nota: "Control frontal: evita el valgo y la caída de la pelvis; más demanda que a dos piernas",
      },
      { m: "gemelo", c: [], nota: "Acortado en el fondo" },
      { m: "tibial", c: [] },
      { m: "erectores", c: [], nota: "Tronco: lumbar neutra" },
      { m: "oblicuos", c: [] },
      { m: "recto-abd", c: [] },
      { m: "cuadrado", c: [], nota: "Lado de apoyo" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Sentadilla a una pierna con la otra extendida adelante. Cuádriceps y glúteo de la pierna de apoyo hacen el trabajo; la pierna libre exige flexores de cadera e isquios largos.",
      c: [],
    },
    tipo: "Sin dato (inferido: dinámica), cadena cerrada",
    brazo: null,
    escalones: {
      fuente: "ficha",
      pasos: [
        "Parcial",
        "A caja baja",
        "Asistida",
        "Heel up",
        "Completa",
        "Salto",
      ],
    },
    fases: [
      {
        nombre: "Inicio",
        texto: {
          t: "Parado en una pierna, con la pierna libre extendida adelante.",
          c: [],
        },
      },
      {
        nombre: "Descenso",
        texto: {
          t: "Excéntrico: flexión de cadera, rodilla y dorsiflexión de tobillo, con los brazos y el tronco de contrapeso.",
          c: [],
        },
      },
      {
        nombre: "Fondo",
        texto: { t: "Rango máximo, isométrico breve.", c: [] },
      },
      {
        nombre: "Ascenso",
        texto: { t: "Concéntrico, de vuelta a la posición inicial.", c: [] },
      },
      {
        nombre: "Bloqueo",
        texto: { t: "Se termina de extender la pierna de apoyo.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Cadera de apoyo",
        accion: "Flexión → extensión (plano sagital)",
        musculos:
          "Glúteo mayor: motor. Aductor mayor e isquios: sinergistas (los isquios se alargan en la cadera y se acortan en la rodilla: su largo cambia poco y su aporte como extensores es moderado).",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Cadera de apoyo",
        accion: "Control frontal y transversal (evitar valgo y caída pélvica)",
        musculos:
          "Glúteo medio y menor, tensor de la fascia lata y rotadores externos: estabilizadores.",
        contraccion:
          "Isométrica-excéntrica; mayor demanda que en la sentadilla bipodal.",
        c: [49, 50],
      },
      {
        articulacion: "Rodilla de apoyo",
        accion: "Flexión profunda → extensión (plano sagital)",
        musculos:
          "Cuádriceps: motor (vastos principalmente; el recto femoral co-actúa con la cadera flexionada).",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: [],
      },
      {
        articulacion: "Tobillo de apoyo",
        accion: "Dorsiflexión máxima → plantiflexión (plano sagital)",
        musculos:
          "Sóleo: motor (excéntrico en el descenso, concéntrico al empujar). Gastrocnemio (acortado) y tibial anterior: estabilizadores.",
        contraccion: "Excéntrica / isométrica / concéntrica.",
        c: [],
      },
      {
        articulacion: "Cadera libre",
        accion: "Flexión sostenida con la rodilla extendida (pierna adelante)",
        musculos:
          "Iliopsoas, recto femoral y tensor de la fascia lata: motores isométricos, trabajando muy acortados (por eso se acalambran y la pierna cae). Cuádriceps: estabilizador isométrico para mantener la rodilla estirada. Isquios de la pierna libre: alargados al máximo (cadera flexionada y rodilla extendida); suelen ser el primer limitante del pistol junto con la dorsiflexión.",
        contraccion: "Isométrica.",
        c: ["L1", "R"],
      },
      {
        articulacion: "Tronco y columna",
        accion: "Inclinación adelante controlada; lumbar neutra",
        musculos:
          "Erectores espinales, oblicuos, recto abdominal y cuadrado lumbar del lado de apoyo: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Rango: parcial, caja baja, completa.",
        c: [],
      },
      {
        t: "Asistencia (banda, TRX o mano): baja la carga en la pierna de apoyo.",
        c: [],
      },
      {
        t: "Elevación de talón (heel up): suprime el límite de dorsiflexión, pero aumenta el avance de la rodilla y la demanda de cuádriceps.",
        c: [],
      },
      {
        t: "Contrapeso: más inclinación del tronco significa más trabajo de cadera.",
        c: [45],
      },
      {
        t: "Carga unilateral intrínseca: todo el peso va en una pierna, con mayor demanda excéntrica de cuádriceps que a dos piernas.",
        c: [53],
      },
      {
        t: "Excéntrico lento (la fase excéntrica se marca en la columna de esfuerzo del catálogo) y salto.",
        c: [],
      },
      {
        t: "Pierna libre apoyada en el talón o en una caja, con la pierna libre cada vez más alta.",
        c: ["R"],
      },
      {
        t: "Shrimp: la pierna libre va atrás. Cuánto trabaja el cuádriceps y cuánto la cadera depende de cuánto se incline el tronco y cuánto avance la rodilla; no hay datos.",
        c: ["C"],
      },
      {
        t: "Cossack y side lunge: agregan el plano frontal (aductores en excéntrico, base ancha). La zancada lateral carga más la rótula que la frontal entre 40° y 100° de flexión.",
        c: ["L1", 40],
      },
    ],
    siente: {
      t: "Cuádriceps y glúteo de la pierna de apoyo; sóleo cuando el tobillo llega a la dorsiflexión extrema.",
      c: [],
    },
    compensa: [
      {
        error: "Rodilla hacia adentro (valgo)",
        porque: {
          t: "Falla el control del plano frontal. La hipótesis de trabajo es que depende del control proximal (cadera y pelvis) y distal (tobillo y pie).",
          c: [59],
        },
      },
      {
        error: "Talón que despega",
        porque: {
          t: "Falta dorsiflexión de tobillo o fuerza.",
          c: [54, 55],
        },
      },
      {
        error: "Lumbar que se flexiona al fondo",
        porque: {
          t: "Se pierde la neutralidad cuando la cadera no flexiona más. Una pequeña retroversión al final de una sentadilla profunda sin peso es común y no es por sí misma un problema: corregirla cuando hay carga axial, cuando es grande o cuando da molestia.",
          c: ["C"],
        },
      },
      {
        error: "Caída de la pelvis libre",
        porque: {
          t: "Depende del glúteo medio del lado de apoyo.",
          c: [58],
        },
      },
      {
        error: "Pie colapsado hacia adentro",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: ["C"],
        },
      },
      {
        error: "Pierna libre que apoya el piso",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Tronco que se desploma",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      {
        t: "Trípode del pie: talón, base del dedo gordo, base del meñique.",
        c: ["C"],
      },
      { t: "Sentate hacia atrás y abajo, no te dejes caer.", c: ["C"] },
      { t: "Brazos adelante como contrapeso.", c: ["C"] },
      { t: "Bajá en 3 segundos.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: { t: "Dolor anterior de rodilla persistente.", c: [59] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Pinchazo profundo en la ingle al llegar al fondo.",
          c: [94],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor en la rodilla con las rodillas muy flexionadas que reaparece cada vez.",
          c: ["C"],
        },
      },
      {
        nivel: "derivar",
        texto: { t: "Rodilla que falla o se traba.", c: ["C"] },
      },
    ],
    evidencia: {
      t: "No hay estudio del pistol squat completo (descenso hasta el máximo y pierna libre extendida): lo que hay es de sentadilla a una pierna, con muestras chicas (el efecto del declive, n=10) y mujeres jóvenes sanas, y se extrapola.",
      c: [49, 50, 53, 48, "C"],
    },
    gestos: [
      "Pistol: asistida, heel up, a caja, seiza to pistol",
      "Shrimp",
      "Cossack y side lunge",
      "Cyclist, deep, close y narrow squat",
      "Reverse to squat y snowboard squat",
      "Saltos: jump y tuck jump",
    ],
    pendientes: [
      {
        pendiente:
          "Pistol con una cadera con dolor articular profundo o hiperlaxa: cuándo regresar el rango y cuándo contraindicar (también dragon squat y pigeon).",
        quien: "H",
      },
      {
        pendiente:
          "Umbral de tiempo (2 a 3 semanas) para el dolor de rodilla que persiste, y cómo distinguirlo del dolor muscular tardío: lo fija un kinesiólogo humano.",
        quien: "H",
      },
      {
        pendiente:
          "Criterios de edad y carga para los saltos en menores y adolescentes.",
        quien: "H",
      },
      {
        pendiente:
          "Mecanismo del pie colapsado, de la pierna libre que apoya el piso y del tronco que se desploma: la investigación solo los lista como compensaciones.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Sentadilla a una pierna, con la otra estirada adelante.",
    siente:
      "Muslo de adelante y glúteo de la pierna que apoya; la pantorrilla cuando el tobillo llega al máximo.",
    tips: [
      "Apoyá todo el pie: talón, dedo gordo y meñique.",
      "Sentate hacia atrás y abajo, no te dejes caer.",
      "Brazos adelante para equilibrar.",
    ],
    errores: [
      {
        error: "Rodilla hacia adentro",
        texto: "Se pierde el control de la cadera y la pelvis.",
      },
      {
        error: "Talón que se levanta",
        texto:
          "Falta movilidad de tobillo o fuerza. Tu profe puede darte una variante con el talón elevado.",
      },
      {
        error: "Pierna libre que toca el piso",
        texto:
          "Pasa seguido: tu profe te muestra cómo ir subiéndola de a poco.",
      },
    ],
  },
} as const satisfies RutaContenido;
