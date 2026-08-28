/**
 * Frases de cierre del PDF de sesión (y de las pantallas de reposo/cierre del TV).
 *
 * Cada frase es una lista de `segments`: cada tramo se pinta en navy por
 * defecto o en dorado si `gold` es true. Los tramos se concatenan SIN separador
 * al renderizar (tanto en el PDF como en el TV), así que el espaciado entre
 * tramos viaja dentro del propio `text` (por convención, como espacio final del
 * tramo que precede al siguiente). El corte es editorial — define dónde cae el
 * golpe visual dorado — y admite varios tramos dorados intercalados.
 *
 * Las comillas van como escapes \u201C / \u201D (mismo criterio que tenía el
 * builder antes de esta extracción) para que no dependan del editor ni de la
 * codificación del archivo. Los acentos sí van literales.
 *
 * La rotación (TV por reloj, PDF por `semana * 7 + día`) NO sigue el orden de la
 * lista: `rotationIndex` baraja el paso con una permutación DETERMINÍSTICA (por
 * hash, sin azar) para que la frase "salte" en vez de ir 1, 2, 3… El determinismo
 * es a propósito: todos los TV de una sede leen el mismo reloj y muestran la
 * misma frase, y un PDF regenerado cae siempre en la misma. Ver `rotationIndex`.
 */
export interface QuoteSegment {
  text: string;
  gold?: boolean;
}

export interface SessionQuote {
  segments: QuoteSegment[];
  author: string;
}

/**
 * Índice de frase para un paso de rotación (el reloj del TV o `semana*7+día` del
 * PDF), barajado con una permutación determinística en vez del orden de la lista.
 *
 * `rotationOrder(n)` ordena `[0..n-1]` por un hash entero: da una permutación
 * fija —igual en todos los TV, estable entre regeneraciones del PDF— pero que NO
 * es el orden de la lista, así la frase salta. Al ser permutación, una vuelta
 * completa muestra las `n` frases sin repetir y sin que dos pasos seguidos caigan
 * en la misma. Se recomputa desde `n`, así editar `QUOTES` no la desincroniza.
 */
function quoteHash(x: number): number {
  let h = Math.imul((x | 0) + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function rotationOrder(n: number): number[] {
  const idxs: number[] = [];
  for (let i = 0; i < n; i++) idxs.push(i);
  // Desempate por índice para que el orden sea totalmente determinístico aun si
  // dos hashes coincidieran.
  idxs.sort((a, b) => quoteHash(a) - quoteHash(b) || a - b);
  return idxs;
}

export function rotationIndex(step: number, n: number): number {
  if (n <= 0) return 0;
  const order = rotationOrder(n);
  const k = ((Math.floor(step) % n) + n) % n;
  return order[k];
}

/** Tanda vigente desde 2026-08 (reemplazó parte de la tanda de 2026-07). */
export const QUOTES: SessionQuote[] = [
  {
    segments: [
      { text: '\u201CLA FORTUNA FAVORECE A ' },
      { text: 'LOS AUDACES.\u201D', gold: true },
    ],
    author: 'Virgilio.',
  },
  {
    segments: [
      { text: '\u201CQUIEN MUEVE UNA MONTAÑA ' },
      { text: 'COMIENZA MOVIENDO PEQUEÑAS PIEDRAS.\u201D', gold: true },
    ],
    author: 'Confucio.',
  },
  {
    segments: [
      { text: '\u201CLA CREATIVIDAD REQUIERE TENER EL VALOR ' },
      { text: 'DE DESPRENDERSE DE LAS CERTEZAS.\u201D', gold: true },
    ],
    author: 'Erich Fromm.',
  },
  {
    segments: [
      { text: '\u201CHASTA QUE LO INCONSCIENTE SE HAGA CONSCIENTE, ' },
      { text: 'DIRIGIRÁ TU VIDA Y LO LLAMARÁS DESTINO.\u201D', gold: true },
    ],
    author: 'Carl Jung.',
  },
  {
    segments: [{ text: '\u201C¿ME ATREVO A ' }, { text: 'ALTERAR EL UNIVERSO?\u201D', gold: true }],
    author: 'T. S. Eliot.',
  },
  {
    segments: [
      { text: '\u201CINTENTA OTRA VEZ. FALLA OTRA VEZ. ' },
      { text: 'FALLA MEJOR.\u201D', gold: true },
    ],
    author: 'Samuel Beckett.',
  },
  {
    segments: [
      { text: '\u201CES EL CUERPO EL QUE SEÑALA Y ' },
      { text: 'EL CUERPO EL QUE COMPRENDE.\u201D', gold: true },
    ],
    author: 'Maurice Merleau-Ponty.',
  },
  {
    segments: [
      { text: '\u201CMI PROPÓSITO ERA BUSCAR ' },
      { text: 'UN LENGUAJE DEL CUERPO.\u201D', gold: true },
    ],
    author: 'Yukio Mishima.',
  },
  {
    segments: [
      { text: '\u201CREALIZA TUS ACCIONES ABANDONANDO EL APEGO, ' },
      { text: 'SERENO ANTE EL ÉXITO Y EL FRACASO.\u201D', gold: true },
    ],
    author: 'Bhagavad Gita.',
  },
  {
    segments: [
      { text: '\u201CQUIEN VENCE A LOS DEMÁS TIENE FUERZA; ' },
      { text: 'QUIEN SE VENCE A SÍ MISMO ES PODEROSO.\u201D', gold: true },
    ],
    author: 'Lao-Tsé.',
  },
];

/**
 * Tandas retiradas. Se guardan enteras (con su corte navy/oro original) para
 * poder volver a rotarlas sin reconstruir los cortes. No se importan desde
 * ningún lado a propósito: es un archivo, no una fuente activa. Para reponer
 * una, mové su entrada a QUOTES.
 */
export const RETIRED_QUOTES: SessionQuote[] = [
  // --- Retiradas en 2026-07 ---
  {
    segments: [
      { text: '\u201CLAS CADENAS DE LA DISCIPLINA SON LIGERAS COMPARADAS CON ' },
      { text: 'EL PESO DEL ARREPENTIMIENTO.\u201D', gold: true },
    ],
    author: 'Jim Rohn.',
  },
  {
    segments: [
      { text: '\u201CES UNA PENA ENVEJECER SIN NUNCA VER ' },
      { text: 'LA BELLEZA Y LA FUERZA DE LA QUE TU CUERPO ES CAPAZ.\u201D', gold: true },
    ],
    author: 'Sócrates.',
  },
  {
    segments: [
      { text: '\u201CLOS OBSTÁCULOS SON ESAS COSAS ESPANTOSAS QUE VES ' },
      { text: 'CUANDO APARTAS LOS OJOS DE TU META.\u201D', gold: true },
    ],
    author: 'Henry Ford.',
  },
  {
    segments: [{ text: '\u201CVENI, VIDI, VICI.\u201D' }],
    author: 'Julio César.',
  },
  {
    segments: [
      { text: '\u201CEL QUE TIENE UN PORQUÉ PARA VIVIR ' },
      { text: 'PUEDE SOPORTAR CASI CUALQUIER CÓMO.\u201D', gold: true },
    ],
    author: 'Friedrich Nietzsche.',
  },
  {
    segments: [
      { text: '\u201CNO EXPLIQUES TU FILOSOFÍA. ' },
      { text: 'ENCÁRNALA.\u201D', gold: true },
    ],
    author: 'Epicteto.',
  },
  {
    segments: [
      { text: '\u201CLA VERDADERA GENEROSIDAD HACIA EL FUTURO CONSISTE EN ' },
      { text: 'ENTREGARLO TODO AL PRESENTE.\u201D', gold: true },
    ],
    author: 'Albert Camus.',
  },
  {
    segments: [
      { text: '\u201CTODO LO QUE HACEMOS REPETIDAMENTE NOS DEFINE. ' },
      { text: 'LA EXCELENCIA ES UN HÁBITO.\u201D', gold: true },
    ],
    author: 'Aristóteles.',
  },
  {
    segments: [
      { text: '\u201CATREVERSE ES PERDER EL EQUILIBRIO MOMENTÁNEAMENTE; ' },
      { text: 'NO ATREVERSE ES PERDERSE A UNO MISMO.\u201D', gold: true },
    ],
    author: 'Søren Kierkegaard.',
  },
  {
    segments: [
      { text: '\u201CEL VERDADERO MÉTODO SIGUE ' },
      { text: 'LA NATURALEZA DE LAS COSAS.\u201D', gold: true },
    ],
    author: 'Edmund Husserl.',
  },
  // --- Retiradas en 2026-08 (salieron de QUOTES) ---
  {
    segments: [
      { text: '\u201CNO NOS ATREVEMOS A MUCHAS COSAS PORQUE SON DIFÍCILES, ' },
      { text: 'PERO SON DIFÍCILES PORQUE NO NOS ATREVEMOS A HACERLAS.\u201D', gold: true },
    ],
    author: 'Séneca.',
  },
  {
    segments: [
      { text: '\u201CLA VIDA SE CONTRAE O SE EXPANDE ' },
      { text: 'EN PROPORCIÓN A NUESTRO CORAJE.\u201D', gold: true },
    ],
    author: 'Anaïs Nin.',
  },
  {
    segments: [
      { text: '\u201CLA VIDA SOLO PUEDE SER COMPRENDIDA MIRANDO HACIA ATRÁS, ' },
      { text: 'PERO HA DE SER VIVIDA MIRANDO HACIA ADELANTE.\u201D', gold: true },
    ],
    author: 'Søren Kierkegaard.',
  },
  {
    segments: [
      { text: '\u201CEN CUALQUIER MOMENTO PODEMOS ELEGIR ENTRE ' },
      { text: 'AVANZAR HACIA EL CRECIMIENTO O RETROCEDER HACIA LA SEGURIDAD.\u201D', gold: true },
    ],
    author: 'Abraham Maslow.',
  },
  {
    segments: [
      { text: '\u201CLA BUENA VIDA ES UN PROCESO, NO UN ESTADO DEL SER. ' },
      { text: 'ES UNA DIRECCIÓN, NO UN DESTINO.\u201D', gold: true },
    ],
    author: 'Carl Rogers.',
  },
  {
    segments: [
      { text: '\u201CLA RAÍZ ES QUIZÁS ' },
      { text: 'LA NECESIDAD MÁS IMPORTANTE Y MÁS DESCONOCIDA DEL ALMA HUMANA.\u201D', gold: true },
    ],
    author: 'Simone Weil.',
  },
  // --- Retiradas en 2026-08 (segunda tanda: salieron de QUOTES) ---
  {
    segments: [
      { text: '\u201CSOY CREADO Y ' },
      { text: 'RECREADO CONTINUAMENTE.\u201D', gold: true },
    ],
    author: 'Virginia Woolf.',
  },
  {
    segments: [
      { text: '\u201CLOS LUGARES VERDADEROS ' },
      { text: 'NO ESTÁN EN NINGÚN MAPA.\u201D', gold: true },
    ],
    author: 'Herman Melville.',
  },
  {
    segments: [
      { text: '\u201CLO QUE VEMOS NO ES LO QUE VEMOS, ' },
      { text: 'SINO LO QUE SOMOS.\u201D', gold: true },
    ],
    author: 'Fernando Pessoa.',
  },
  // --- Retirada en 2026-08 (reemplazada por Merleau-Ponty) ---
  {
    segments: [
      { text: '\u201CMIRA CADA CAMINO DE CERCA Y CON INTENCIÓN. LUEGO HAZTE UNA PREGUNTA: ' },
      { text: '¿TIENE CORAZÓN ESTE CAMINO?\u201D', gold: true },
    ],
    author: 'Carlos Castaneda.',
  },
];
