/**
 * Motivational Quotes Data Module
 *
 * Brand-curated quotes for between-block transitions and celebration screens.
 * Follows the same structure as the PDF builder's QUOTES array.
 */

export interface Quote {
  /** Main quote text (may include opening quotation mark) */
  text: string
  /** Highlighted portion in Aged Gold color */
  goldText: string
  /** Quote attribution */
  author: string
}

/**
 * Brand-curated motivational quotes.
 * Sourced from the PDF builder — these are the canonical El Templo quotes.
 */
export const QUOTES: Quote[] = [
  {
    text: '\u201CLAS CADENAS DE LA DISCIPLINA SON LIGERAS COMPARADAS CON ',
    goldText: 'EL PESO DEL ARREPENTIMIENTO.\u201D',
    author: 'Jim Rohn',
  },
  {
    text: '\u201CES UNA PENA ENVEJECER SIN NUNCA VER ',
    goldText: 'LA BELLEZA Y LA FUERZA DE LA QUE TU CUERPO ES CAPAZ.\u201D',
    author: 'S\u00F3crates',
  },
  {
    text: '\u201CLOS OBST\u00C1CULOS SON ESAS COSAS ESPANTOSAS QUE VES ',
    goldText: 'CUANDO APARTAS LOS OJOS DE TU META.\u201D',
    author: 'Henry Ford',
  },
  {
    text: '\u201CVENI, VIDI, VICI.\u201D',
    goldText: '',
    author: 'Julio C\u00E9sar',
  },
  {
    text: '\u201CEL QUE TIENE UN PORQU\u00C9 PARA VIVIR ',
    goldText: 'PUEDE SOPORTAR CASI CUALQUIER C\u00D3MO.\u201D',
    author: 'Friedrich Nietzsche',
  },
  {
    text: '\u201CNO EXPLIQUES TU FILOSOF\u00CDA. ',
    goldText: 'ENC\u00C1RNALA.\u201D',
    author: 'Epicteto',
  },
  {
    text: '\u201CLA VERDADERA GENEROSIDAD HACIA EL FUTURO CONSISTE EN ',
    goldText: 'ENTREGARLO TODO AL PRESENTE.\u201D',
    author: 'Albert Camus',
  },
  {
    text: '\u201CTODO LO QUE HACEMOS REPETIDAMENTE NOS DEFINE. ',
    goldText: 'LA EXCELENCIA ES UN H\u00C1BITO.\u201D',
    author: 'Arist\u00F3teles',
  },
  {
    text: '\u201CATREVERSE ES PERDER EL EQUILIBRIO MOMENT\u00C1NEAMENTE; ',
    goldText: 'NO ATREVERSE ES PERDERSE A UNO MISMO.\u201D',
    author: 'S\u00F8ren Kierkegaard',
  },
  {
    text: '\u201CEL VERDADERO M\u00C9TODO SIGUE ',
    goldText: 'LA NATURALEZA DE LAS COSAS.\u201D',
    author: 'Edmund Husserl',
  },
]

/**
 * Deterministically select a quote for a block transition.
 *
 * Uses modulo arithmetic on blockIndex + dayOffset to provide variety
 * across different blocks and different days while remaining deterministic
 * (same inputs always return the same quote).
 *
 * @param blockIndex - 0-based index of the completed block
 * @param dayOffset - Optional offset for daily variety (e.g., day-of-week number)
 * @returns A Quote object
 */
export function getQuoteForBlock(blockIndex: number, dayOffset = 0): Quote {
  const index = (blockIndex + dayOffset * 3) % QUOTES.length
  return QUOTES[Math.abs(index)]
}
