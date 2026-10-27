import type { RutaContenido } from "../../types";

/**
 * Fase 200 R2: relaciones de PHS desde S5.3 (tabla articular) + S8. Borrador
 * (D5). Evidencia: EMG de press handstand en 41 gimnastas, el serrato anterior
 * fue el único músculo que difirió (cita 35).
 *
 * La fila de cadera nombra glúteo e isquios para la "alineación final" sin
 * asignarles rol: quedan fuera de las relaciones (pendiente de fuente). La
 * compresión es de iliopsoas y recto femoral. Los aductores no comprimen
 * pasados ~90° de flexión de cadera (ahí extienden): son motores porque
 * cierran el straddle al llegar arriba.
 */
export const PHS = {
  code: "PHS",
  slug: "press-to-handstand",
  patron: "PUSH",
  categoria: "Push vertical",
  estado: "borrador",
  relaciones: {
    motor: [
      { m: "delt-ant", c: ["L1", 35] },
      { m: "pectoral", c: ["L1", 35], nota: "Clavicular" },
      { m: "serrato", c: [35] },
      { m: "psoas", c: ["L1"], nota: "Compresión de cadera" },
      { m: "recto-fem", c: ["L1"], nota: "Compresión de cadera" },
      {
        m: "aductores",
        c: ["L1"],
        nota: "Cierran el straddle al llegar arriba; pasados ~90° de cadera no comprimen",
      },
      { m: "recto-abd", c: [], nota: "Compresión: flexión de tronco" },
      { m: "oblicuos", c: [], nota: "Compresión: flexión de tronco" },
    ],
    sinergista: [
      { m: "trap-sup", c: [], nota: "Rotación hacia arriba" },
      { m: "trap-inf", c: [], nota: "Rotación hacia arriba" },
    ],
    estabilizador: [
      { m: "manguito", c: ["L1", 35] },
      { m: "romboides", c: [], nota: "Trapecio medio" },
      { m: "triceps", c: [], nota: "Isométrico, brazo extendido" },
      { m: "antebrazo", c: [], nota: "Flexores de muñeca" },
    ],
    antagonista: [],
    estira: [],
  },
  fichaProfe: {
    resumen: {
      t: "Del apoyo en L, pike, straddle, frog o crow a la vertical: lean adelante con protracción, elevación de caderas con compresión (flexores de cadera + abdomen) mientras los hombros pasan de ~90° a ~180° de flexión, y llegada a la vertical. Entre chicos de 10 a 12 años, los que lograban el press tenían más activo el serrato anterior; fue el único músculo que difirió.",
      c: [35],
    },
    tipo: "Dinámica (23 % isométrica)",
    brazo: "Brazo recto (SAS) 34 · flexionado (BAS) 13",
    escalones: { fuente: "mapa" },
    fases: [
      {
        nombre: "Posición inicial",
        texto: { t: "L-sit, pike, straddle, frog/crow, tuck.", c: [] },
      },
      {
        nombre: "Lean adelante",
        texto: {
          t: "Los hombros pasan sobre las manos con protracción; la carga en las manos aumenta.",
          c: [],
        },
      },
      {
        nombre: "Elevación de caderas",
        texto: {
          t: "Compresión de cadera (flexores + abdomen) mientras los hombros se abren de ~90° a ~180° de flexión.",
          c: [],
        },
      },
      {
        nombre: "Llegada a la vertical",
        texto: { t: "Apoyo equilibrado, hombros elevados.", c: [] },
      },
      {
        nombre: "Descenso",
        texto: { t: "Descenso inverso (excéntrico).", c: [] },
      },
    ],
    articulaciones: [
      {
        articulacion: "Hombro (glenohumeral)",
        accion: "Flexión de hombro de ~90° → 180° bajo carga",
        musculos:
          "Deltoides anterior y pectoral mayor (clavicular): motores. Manguito: estabilizador.",
        contraccion:
          "Subida: concéntrica. Vertical: isométrica. Bajada: excéntrica.",
        c: ["L1", 35],
      },
      {
        articulacion: "Escápula (escapulotorácica)",
        accion: "Protracción + rotación hacia arriba + elevación",
        musculos:
          "Serrato anterior: motor. Trapecio superior e inferior: sinergistas (rotación hacia arriba). Trapecio medio: estabilizador.",
        contraccion: "Concéntrica, luego isométrica.",
        c: [35],
      },
      {
        articulacion: "Cadera",
        accion: "Flexión mantenida (compresión) → luego extensión a línea",
        musculos:
          "Iliopsoas y recto femoral (compresión); aductores (cierran el straddle al llegar arriba); glúteo e isquiotibiales (alineación final).",
        contraccion: "Isométrica y concéntrica.",
        c: ["L1"],
      },
      {
        articulacion: "Tronco",
        accion:
          "Flexión de tronco/retroversión durante la compresión, luego neutro",
        musculos: "Recto abdominal y oblicuos: motores o estabilizadores.",
        contraccion: "Isométrica y concéntrica.",
        c: [],
      },
      {
        articulacion: "Codo",
        accion: "Extendido",
        musculos: "Tríceps: estabilizador isométrico.",
        contraccion: "Isométrica.",
        c: [],
      },
      {
        articulacion: "Muñeca",
        accion: "Extensión alta con carga creciente",
        musculos: "Flexores: estabilizadores.",
        contraccion: "Isométrica.",
        c: [],
      },
    ],
    progresa: [
      {
        t: "Variables: centro de masa más lejos del hombro (frog/crow press, straddle, pike, tuck planche, straddle planche, planche), demanda de movilidad (isquiotibiales y aductores, pike más cerrado) y tiempo de apoyo del hombro en lean.",
        c: [],
      },
      {
        t: "El straddle es más fácil que el pike porque la compresión es más corta y requiere menos flexibilidad de isquiotibiales.",
        c: ["C"],
      },
    ],
    siente: {
      pendiente: "La sección de PHS no tiene el bloque 'dónde se siente'.",
      quien: "fuente",
    },
    compensa: [
      {
        error: "Salto o impulso ('patada')",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Codos flexionados",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Cadera que no sube",
        porque: { t: "Por falta de lean.", c: [] },
      },
      {
        error: "Lumbar en hiperextensión al llegar",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
      {
        error: "Hombros sin protracción",
        porque: {
          t: "La sección la lista como compensación y no da el porqué.",
          c: [],
        },
      },
    ],
    cues: [
      { t: "Llevá los hombros sobre las manos primero.", c: [] },
      { t: "Apretá las piernas contra el pecho antes de subir.", c: [] },
      { t: "Empujá el piso lejos hasta el final.", c: [] },
    ],
    banderasRuta: [
      {
        nivel: "derivar",
        texto: { t: "Dolor anterior de hombro con el lean.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor de muñeca.", c: [] },
      },
      {
        nivel: "derivar",
        texto: { t: "Dolor lumbar al llegar a la vertical.", c: [] },
      },
      {
        nivel: "derivar",
        texto: {
          t: "Pellizco o dolor en el pliegue de la ingle con la compresión.",
          c: [],
        },
      },
    ],
    evidencia: {
      t: "EMG de press handstand en paralelas en 41 gimnastas varones (12 chicos de 10 a 12 años que lo logran, 13 que no, 16 adultos). Entre los chicos, los que lograban el press tenían el serrato anterior más activo que los que no (diferencia de hasta 63 %, a 160° de flexión de hombro); fue el único músculo que difirió. Los autores parten de la idea de que la dificultad es más de control que de fuerza (no midieron fuerza). Es de 2026 y solo se leyó el abstract o la página de la revista.",
      c: [35],
    },
    gestos: [
      "Lean pike en piso",
      "Pike press",
      "Straddle press",
      "Frog press",
      "Crow press",
      "Tuck, adv tuck y planche press",
    ],
    pendientes: [
      {
        pendiente: "Dónde se siente el press a vertical: la sección no lo da.",
        quien: "fuente",
      },
      {
        pendiente:
          "El porqué de las compensaciones (salto o impulso, codos flexionados, lumbar en hiperextensión al llegar, hombros sin protracción): la sección no lo da.",
        quien: "fuente",
      },
      {
        pendiente:
          "Rol de glúteo e isquiotibiales en la alineación final de la cadera: la tabla los nombra sin asignarles rol.",
        quien: "fuente",
      },
    ],
  },
  fichaAlumno: {
    que: "Subir a la vertical apoyado en las manos sin saltar: los hombros pasan sobre las manos, las caderas suben con las piernas recogidas o abiertas, y llegás arriba con el cuerpo en línea.",
    siente: {
      pendiente:
        "La investigación no dice todavía dónde se siente este ejercicio.",
      quien: "fuente",
    },
    tips: [
      "Llevá los hombros sobre las manos primero.",
      "Apretá las piernas contra el pecho antes de subir.",
      "Empujá el piso lejos hasta el final.",
    ],
    errores: [
      {
        error: "Saltar o dar impulso",
        texto: "Apretá las piernas contra el pecho antes de subir.",
      },
      {
        error: "Cadera que no sube",
        texto: "Falta llevar los hombros sobre las manos primero.",
      },
      {
        error: "Codos flexionados",
        texto: "Empujá el piso lejos hasta el final.",
      },
    ],
  },
} as const satisfies RutaContenido;
