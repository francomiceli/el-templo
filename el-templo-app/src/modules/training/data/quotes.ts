/**
 * Frases del día (fase 199, D-12): copia de las 10 frases ACTIVAS del TV
 * (`el-templo-admin/src/utils/pdf/quotes.ts` `QUOTES`, tanda vigente desde 2026-08).
 * NO incluye `RETIRED_QUOTES`. Si cambian en el TV, copiar de nuevo (fuente única
 * vía API diferida).
 *
 * Cada frase es una lista de `segments` (tramo normal o `gold`); el espacio entre
 * tramos viaja dentro del `text`. Las comillas van como escapes \u201C / \u201D.
 *
 * Dos vistas sobre la misma tanda:
 * - `SESSION_QUOTES` + `quoteOfTheDay`: formato del TV, para la frase del día de Mi Templo.
 * - `QUOTES` / `getQuoteForBlock`: adaptador a la interfaz `Quote` vieja para el
 *   reproductor de sesión (SplashScreen, DayPlayer, GoalPlanSession,
 *   TransitionScreen y CelebrationScreen), que no se tocó.
 */
import { parseDateParts } from 'src/utils/tz'

export interface QuoteSegment {
  text: string
  gold?: boolean
}

export interface SessionQuote {
  segments: QuoteSegment[]
  author: string
}

/** Interfaz que consume el reproductor de sesión. */
export interface Quote {
  /** Texto antes del primer tramo dorado (incluye la comilla de apertura) */
  text: string
  /** Desde el primer tramo dorado hasta el final */
  goldText: string
  /** Autor de la frase */
  author: string
}

/** Tanda vigente del TV (copia literal, mismo orden). */
export const SESSION_QUOTES: SessionQuote[] = [
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
]

/*
 * Rotación: espejo del TV, mismo orden de rotación (permutación determinística
 * por hash, sin azar) para que la app y las pantallas de la sede muestren la
 * misma frase el mismo paso.
 */
function quoteHash(x: number): number {
  let h = Math.imul((x | 0) + 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function rotationOrder(n: number): number[] {
  const idxs: number[] = []
  for (let i = 0; i < n; i++) idxs.push(i)
  // Desempate por índice para que el orden sea totalmente determinístico aun si
  // dos hashes coincidieran.
  idxs.sort((a, b) => quoteHash(a) - quoteHash(b) || a - b)
  return idxs
}

export function rotationIndex(step: number, n: number): number {
  if (n <= 0) return 0
  const order = rotationOrder(n)
  const k = ((Math.floor(step) % n) + n) % n
  return order[k]
}

/**
 * Adaptador al formato `Quote` del reproductor de sesión: `text` = tramos antes
 * del primer `gold`, `goldText` = desde el primer `gold` hasta el final. Sin
 * ningún `gold`, todo va a `text`.
 */
export function segmentsToQuote(q: SessionQuote): Quote {
  const firstGold = q.segments.findIndex((s) => s.gold === true)
  if (firstGold === -1) {
    return { text: q.segments.map((s) => s.text).join(''), goldText: '', author: q.author }
  }
  return {
    text: q.segments
      .slice(0, firstGold)
      .map((s) => s.text)
      .join(''),
    goldText: q.segments
      .slice(firstGold)
      .map((s) => s.text)
      .join(''),
    author: q.author,
  }
}

/**
 * Adaptador para el reproductor de sesión: SplashScreen, DayPlayer, GoalPlanSession,
 * TransitionScreen y CelebrationScreen siguen leyendo `Quote`.
 */
export const QUOTES: Quote[] = SESSION_QUOTES.map(segmentsToQuote)

/** Días desde 1970-01-01 de un "YYYY-MM-DD" (aritmética UTC, sin zona local). */
function daysSinceEpoch(dateStr: string): number {
  const { y, m, d } = parseDateParts(dateStr)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

/**
 * Frase del día para una fecha "YYYY-MM-DD" (la del día en la zona de la sede).
 * Pura: no lee el reloj, así que es estable todo el día en esa zona.
 */
export function quoteOfTheDay(dateStr: string): SessionQuote {
  const step = daysSinceEpoch(dateStr)
  return SESSION_QUOTES[rotationIndex(step, SESSION_QUOTES.length)]!
}

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
  return QUOTES[Math.abs(index)]!
}
