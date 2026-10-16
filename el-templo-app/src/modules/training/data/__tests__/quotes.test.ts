import { describe, it, expect } from 'vitest'
import {
  QUOTES,
  SESSION_QUOTES,
  getQuoteForBlock,
  quoteOfTheDay,
  rotationIndex,
  segmentsToQuote,
} from '../quotes'

describe('tanda de frases (copia de las activas del TV)', () => {
  it('tiene 10 frases en ambos formatos', () => {
    expect(SESSION_QUOTES).toHaveLength(10)
    expect(QUOTES).toHaveLength(10)
  })

  it('cada frase adaptada tiene texto y autor', () => {
    for (const q of QUOTES) {
      expect(q.text.length + q.goldText.length).toBeGreaterThan(0)
      expect(q.author.length).toBeGreaterThan(0)
    }
  })

  it('cada frase del TV tiene al menos un tramo dorado y el adaptador lo respeta', () => {
    SESSION_QUOTES.forEach((s, i) => {
      expect(s.segments.some((seg) => seg.gold === true)).toBe(true)
      expect(QUOTES[i]!.goldText.length).toBeGreaterThan(0)
      expect(QUOTES[i]!.text + QUOTES[i]!.goldText).toBe(s.segments.map((seg) => seg.text).join(''))
    })
  })

  it('no incluye frases de las tandas viejas ni retiradas', () => {
    const all = SESSION_QUOTES.map((s) => s.segments.map((seg) => seg.text).join('')).join('|')
    expect(all).not.toContain('LAS CADENAS DE LA DISCIPLINA')
    expect(all).not.toContain('VENI, VIDI, VICI')
    expect(all).toContain('LA FORTUNA FAVORECE A LOS AUDACES.')
  })
})

describe('segmentsToQuote', () => {
  it('[normal, gold]', () => {
    expect(
      segmentsToQuote({
        segments: [{ text: 'A ' }, { text: 'B', gold: true }],
        author: 'X',
      }),
    ).toEqual({ text: 'A ', goldText: 'B', author: 'X' })
  })

  it('[gold]', () => {
    expect(segmentsToQuote({ segments: [{ text: 'B', gold: true }], author: 'X' })).toEqual({
      text: '',
      goldText: 'B',
      author: 'X',
    })
  })

  it('[normal] sin dorado: todo a text', () => {
    expect(segmentsToQuote({ segments: [{ text: 'A' }], author: 'X' })).toEqual({
      text: 'A',
      goldText: '',
      author: 'X',
    })
  })

  it('[normal, gold, normal]: goldText va desde el primer gold hasta el final', () => {
    expect(
      segmentsToQuote({
        segments: [{ text: 'A ' }, { text: 'B ', gold: true }, { text: 'C' }],
        author: 'X',
      }),
    ).toEqual({ text: 'A ', goldText: 'B C', author: 'X' })
  })
})

describe('rotationIndex', () => {
  it('es una permutación de 0..9 en 10 pasos', () => {
    const seen = new Set<number>()
    for (let step = 0; step < 10; step++) seen.add(rotationIndex(step, 10))
    expect(seen.size).toBe(10)
    for (const i of seen) {
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(10)
    }
  })

  it('es periódica y tolera pasos negativos y n <= 0', () => {
    expect(rotationIndex(13, 10)).toBe(rotationIndex(3, 10))
    expect(rotationIndex(-1, 10)).toBe(rotationIndex(9, 10))
    expect(rotationIndex(5, 0)).toBe(0)
  })

  it('no sigue el orden de la lista', () => {
    const order = Array.from({ length: 10 }, (_, s) => rotationIndex(s, 10))
    expect(order).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('quoteOfTheDay', () => {
  it('es determinística', () => {
    expect(quoteOfTheDay('2026-10-15')).toBe(quoteOfTheDay('2026-10-15'))
  })

  it('días consecutivos dan frases distintas', () => {
    expect(quoteOfTheDay('2026-10-15')).not.toBe(quoteOfTheDay('2026-10-16'))
  })

  it('en 10 días seguidos pasan las 10 frases (permutación)', () => {
    const seen = new Set<unknown>()
    for (let d = 1; d <= 10; d++) seen.add(quoteOfTheDay(`2026-11-${String(d).padStart(2, '0')}`))
    expect(seen.size).toBe(10)
  })

  it('cruza cambio de mes y año sin saltos (paso = días desde 1970)', () => {
    // 1970-01-01 es el paso 0
    expect(quoteOfTheDay('1970-01-01')).toBe(SESSION_QUOTES[rotationIndex(0, 10)])
    expect(quoteOfTheDay('1970-01-02')).toBe(SESSION_QUOTES[rotationIndex(1, 10)])
    expect(quoteOfTheDay('2026-12-31')).not.toBe(quoteOfTheDay('2027-01-01'))
  })
})

describe('getQuoteForBlock (reproductor)', () => {
  it('mantiene la firma y devuelve una Quote de la tanda', () => {
    const q = getQuoteForBlock(0)
    expect(QUOTES).toContain(q)
    expect(getQuoteForBlock(3, 2)).toBe(QUOTES[9])
  })
})
