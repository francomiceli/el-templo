import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de SU desde A5 (tabla articular) + TI-H. Borrador
 * (D5).
 *
 * A5 no trae marcas en la tabla: `c: []`. Sóleo y gastrocnemio son sinergistas
 * al subir y estabilizadores al bajar (gana el rol más alto). "Cuádriceps" sin
 * más queda como vastos: el recto femoral no se nombra en esta tabla. ⚑N: PQ y
 * PSU (pistol step-up, hipótesis) sin definir.
 */
export const SU = {
  code: "SU",
  slug: "step-up",
  patron: "LOWER",
  categoria: "Rodilla dominante",
  estado: "borrador",
  relaciones: {
    motor: [
      {
        m: "gluteo-mayor",
        c: [],
        nota: "Concéntrico al subir, excéntrico al bajar",
      },
      {
        m: "vastos",
        c: [25],
        nota: "Concéntrico al subir, excéntrico al bajar (step-up lateral > 45 % MVIC en el vasto medial oblicuo)",
      },
    ],
    sinergista: [
      { m: "aductores", c: [], nota: "Aductor mayor" },
      { m: "isquios", c: [] },
      {
        m: "soleo",
        c: [],
        nota: "Concéntrico al subir; estabilizador excéntrico al bajar",
      },
      {
        m: "gemelo",
        c: [],
        nota: "Concéntrico al subir; estabilizador excéntrico al bajar",
      },
      { m: "psoas", c: [], nota: "Pierna libre: flexores de cadera" },
    ],
    estabilizador: [
      {
        m: "gluteo-medio",
        c: [],
        nota: "Control pélvico en el apoyo en el cajón: esencial",
      },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Subir a un cajón con una pierna y bajar con control. El glúteo mayor y el cuádriceps hacen el trabajo, concéntricos al subir y excéntricos al bajar; el glúteo medio controla la pelvis en el apoyo en el cajón.",
      c: [],
    },
    tipo: "Sin dato (inferido: dinámica), cadena cerrada",
    brazo: null,
    escalones: {
      pendiente:
        "La sección da variables de progresión (altura del cajón, tempo, carga, trayectoria, salto), no una escalera de pasos única: falta la lista de escalones.",
      quien: "fuente",
    },
    fases: [
      {
        nombre: "Apoyo y carga",
        texto: { t: "Se apoya el pie en el cajón y se carga.", c: [] },
      },
      {
        nombre: "Ascenso",
        texto: {
          t: "Concéntrico: extensión de cadera y rodilla de la pierna del cajón, con plantiflexión.",
          c: [],
        },
      },
      {
        nombre: "Bloqueo",
        texto: { t: "Isométrico.", c: [] },
      },
      {
        nombre: "Descenso (step-down)",
        texto: {
          t: "Excéntrico: flexión controlada de rodilla y cadera, con dorsiflexión.",
          c: [],
        },
      },
      {
        nombre: "Toque suave",
        texto: { t: "Se toca el suelo apenas.", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Cadera",
        accion: "Extensión → flexión (plano sagital)",
        musculos: "Glúteo mayor: motor. Aductor mayor e isquios: sinergistas.",
        contraccion: "Concéntrica al subir / excéntrica al bajar.",
        c: [],
      },
      {
        articulacion: "Cadera",
        accion: "Control pélvico (plano frontal)",
        musculos:
          "Glúteo medio y menor y tensor de la fascia lata: estabilizadores (esenciales en el apoyo en el cajón).",
        contraccion: "Isométrica-excéntrica.",
        c: [],
      },
      {
        articulacion: "Rodilla",
        accion: "Extensión → flexión (plano sagital)",
        musculos:
          "Cuádriceps: motor, concéntrico al subir y excéntrico al bajar.",
        contraccion: "Concéntrica al subir / excéntrica al bajar.",
        c: [],
      },
      {
        articulacion: "Tobillo",
        accion: "Dorsiflexión ↔ plantiflexión (plano sagital)",
        musculos:
          "Sóleo y gastrocnemio: sinergistas concéntricos al subir y estabilizadores excéntricos al bajar.",
        contraccion: "Concéntrica al subir / excéntrica al bajar.",
        c: [],
      },
      {
        articulacion: "Pierna libre",
        accion: "Flexión de cadera y rodilla (balanceo)",
        musculos: "Flexores de cadera: sinergistas.",
        contraccion: "Concéntrica / isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Altura del cajón: más flexión inicial y más demanda de cadera y rodilla.",
        c: [],
      },
      { t: "Tempo excéntrico en el step-down.", c: [] },
      { t: "Carga externa (W).", c: [] },
      {
        t: "Menos ayuda de la pierna de abajo (rebote).",
        c: [],
      },
      { t: "Trayectoria: lateral, shuffle.", c: [] },
      { t: "Salto.", c: [] },
      {
        t: "PSU y PQ como unilateralidad extrema (hipótesis, sin confirmar).",
        c: [],
      },
    ],
    siente: {
      pendiente:
        "La sección no tiene bloque 'dónde se siente' (solo el análisis articular).",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Empujar con la pierna de abajo",
        porque: {
          t: "La pierna que queda en el suelo ayuda a subir: 'hace trampa'.",
          c: [],
        },
      },
      {
        error: "Cadera que se levanta o cae",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Rodilla hacia adentro (valgo)",
        porque: {
          t: "Falla el control del plano frontal. La hipótesis de trabajo es que depende del control proximal (cadera y pelvis) y distal (tobillo y pie).",
          c: [59],
        },
      },
      {
        error: "Tronco inclinado a un lado",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
      {
        error: "Talón del cajón que despega",
        porque: {
          t: "La investigación lo lista como compensación típica sin dar el mecanismo.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Todo el pie sobre el cajón, empujá con el talón.", c: ["C"] },
      { t: "Subí sin impulso de la pierna de abajo.", c: ["C"] },
      { t: "Bajá en 3 segundos tocando el suelo apenas.", c: ["C"] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: {
          t: "Dolor de rodilla al subir y bajar escaleras que persiste.",
          c: [59],
        },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Dolor lateral de rodilla o de cadera en el apoyo.",
          c: ["C"],
        },
      },
    ],
    evidencia: {
      t: "Step-up frontal frente a sentadilla monopodal: el step-up activó menos glúteo mayor y medio que la monopodal (n=18). Step-up lateral: más de 45 % de MVIC en el vasto medial oblicuo (n=30). La carga de LCA en step-up, step-down y sentadilla es mayor cerca de 30° de flexión, pero baja en valor absoluto. Una banda que tira la rodilla hacia adentro aumentó el valgo pico en el step-up frontal.",
      c: [50, 25, 40],
    },
    gestos: [
      "PQ (parcial, full ROM con peso): sigla sin definir",
      "Lunge to step up",
      "Step down con peso",
      "Step out",
      "SU shuffle (side) y SU shuffle jump con peso",
      "Speed skater",
      "Versión HIP: step up box, step down, shuffle, side",
    ],
    pendientes: [
      {
        pendiente:
          "Qué significan PQ y PSU (hipótesis: PSU = pistol step-up) y en qué se diferencian.",
        quien: "N",
      },
      {
        pendiente:
          "Confirmar qué son 'shuffle' y 'speed skater' en el catálogo.",
        quien: "N",
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
          "Dónde se siente, escalones de la progresión y mecanismo de las compensaciones (salvo el valgo): la sección no los da.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Subir a un cajón con una pierna y bajar con control.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Todo el pie sobre el cajón, empujá con el talón.",
      "Subí sin impulso de la pierna de abajo.",
      "Bajá en 3 segundos tocando el suelo apenas.",
    ],
    errores: [
      {
        error: "Empujar con la pierna de abajo",
        texto: "Esa pierna hace trampa y te ayuda a subir.",
      },
      {
        error: "Rodilla hacia adentro",
        texto: "Se pierde el control de la cadera y la pelvis.",
      },
      {
        error: "Cadera que se levanta o cae",
        texto: "Pasa seguido: tu profe te ayuda a corregirla.",
      },
    ],
  },
} as const satisfies RutaContenido;
