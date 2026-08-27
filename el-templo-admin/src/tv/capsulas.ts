/**
 * Cápsulas de técnica de la pantalla PRE-CLASE del TV (pantalla de transición
 * diurna). Hermanas de las frases de `quotes.ts` pero instruccionales: un cue
 * técnico por ejercicio, corto y accionable, pensado para leerse en los minutos
 * previos a la clase.
 *
 * El cue viene partido en tramos: `acento: true` marca el golpe visual (se
 * pinta en terracotta y es el remate de la escritura). El corte es editorial,
 * igual que el navy/oro de las frases: al editar un cue hay que elegir a mano
 * dónde cae el énfasis. Los tramos se concatenan SIN separador — el espaciado
 * viaja en el `text`.
 *
 * `musculos` alimenta los chips "ACTIVA": 2-3 grupos por ejercicio, los que un
 * alumno debería SENTIR trabajando, no la lista anatómica completa.
 *
 * Rotan con la misma mecánica barajada de las frases (`rotationIndex`, un paso
 * por minuto): todos los TV de la sede muestran la misma cápsula.
 */

export interface CapsulaSegment {
  text: string;
  /** Tramo en terracotta: el golpe del cue. */
  acento?: boolean;
}

export interface CapsulaTecnica {
  /** Nombre del ejercicio, en mayúsculas (título Cinzel). */
  ejercicio: string;
  cue: CapsulaSegment[];
  /** Chips "ACTIVA": 2-3 grupos musculares, en mayúsculas. */
  musculos: string[];
}

export const CAPSULAS: CapsulaTecnica[] = [
  {
    ejercicio: 'DOMINADAS',
    cue: [
      { text: 'El pecho busca la barra: ' },
      { text: 'el codo termina atrás, no abajo.', acento: true },
    ],
    musculos: ['DORSAL ANCHO', 'BÍCEPS', 'TRAPECIO'],
  },
  {
    ejercicio: 'FONDOS',
    cue: [
      { text: 'Brazos firmes y hombros lejos de las orejas: ' },
      {
        text: 'bajá hasta los 90° inclinando el pecho apenas adelante.',
        acento: true,
      },
    ],
    musculos: ['PECTORAL', 'TRÍCEPS', 'DELTOIDE ANTERIOR'],
  },
  {
    ejercicio: 'REMOS',
    cue: [
      { text: 'Tirá con la espalda: ' },
      { text: 'juntá los omóplatos antes de flexionar.', acento: true },
    ],
    musculos: ['DORSAL', 'ROMBOIDES', 'BÍCEPS'],
  },
  {
    ejercicio: 'FLEXIONES DE BRAZOS',
    cue: [
      { text: 'El cuerpo es una tabla de la cabeza al talón: ' },
      { text: 'codos a 45°, ni pegados ni en cruz.', acento: true },
    ],
    musculos: ['PECTORAL', 'TRÍCEPS', 'CORE'],
  },
  {
    ejercicio: 'SENTADILLAS',
    cue: [
      { text: 'El peso repartido en talón y medio pie: ' },
      { text: 'las rodillas siguen la punta de los dedos.', acento: true },
    ],
    musculos: ['CUÁDRICEPS', 'GLÚTEOS', 'CORE'],
  },
  {
    ejercicio: 'PLANCHA',
    cue: [
      { text: 'Glúteos y abdomen apretados: ' },
      { text: 'la cadera ni sube ni cae.', acento: true },
    ],
    musculos: ['CORE', 'GLÚTEOS', 'HOMBROS'],
  },
  {
    ejercicio: 'ESTOCADAS',
    cue: [
      { text: 'La rodilla de adelante firme y estable: ' },
      { text: 'el impulso nace del talón, no de la punta.', acento: true },
    ],
    musculos: ['GLÚTEOS', 'CUÁDRICEPS', 'ISQUIOTIBIALES'],
  },
  {
    ejercicio: 'RESPIRACIÓN',
    cue: [
      { text: 'El aire también es técnica: ' },
      { text: 'exhalá en el esfuerzo, inhalá al volver.', acento: true },
    ],
    musculos: ['DIAFRAGMA', 'CORE'],
  },
  {
    ejercicio: 'FRONT LEVER',
    cue: [
      { text: 'Cuerpo rígido de la cabeza a los pies: ' },
      {
        text: 'hombros abajo y tirá con los dorsales sin doblar los codos.',
        acento: true,
      },
    ],
    musculos: ['DORSAL ANCHO', 'CORE', 'GLÚTEOS'],
  },
  {
    ejercicio: 'VERTICALES',
    cue: [
      { text: 'Empujá el piso con los hombros y apilá muñeca-cadera-talón: ' },
      {
        text: 'abdomen y glúteos firmes, la mirada entre las manos.',
        acento: true,
      },
    ],
    musculos: ['HOMBROS', 'CORE', 'TRÍCEPS'],
  },
];
