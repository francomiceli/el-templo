import { describe, it, expect } from 'vitest'
import { resolveSlot } from '../load-slot'

describe('resolveSlot (D-01/D-02/D-07)', () => {
  describe("reserve: 'always' (card que siempre tiene contenido)", () => {
    it("sin resolver y sin tope vencido → 'skeleton'", () => {
      expect(resolveSlot({ reserve: 'always', settled: false, deadlinePassed: false })).toBe(
        'skeleton',
      )
    })

    it("sin resolver y sin dato de tope (undefined) → 'skeleton'", () => {
      expect(resolveSlot({ reserve: 'always', settled: false })).toBe('skeleton')
    })

    it("sin resolver con el tope vencido → 'hidden' (no se inventa nada)", () => {
      expect(resolveSlot({ reserve: 'always', settled: false, deadlinePassed: true })).toBe(
        'hidden',
      )
    })

    it("resuelta con contenido → 'content'", () => {
      expect(resolveSlot({ reserve: 'always', settled: true, hasContent: true })).toBe('content')
    })

    it("resuelta sin contenido → 'hidden'", () => {
      expect(resolveSlot({ reserve: 'always', settled: true, hasContent: false })).toBe('hidden')
    })

    it("resuelta con hasContent undefined → 'hidden' (sin afirmación explícita no se dibuja)", () => {
      expect(resolveSlot({ reserve: 'always', settled: true })).toBe('hidden')
    })

    it("resuelta con contenido y el tope ya vencido → 'content' (llegó el dato, se completa sola)", () => {
      expect(
        resolveSlot({ reserve: 'always', settled: true, hasContent: true, deadlinePassed: true }),
      ).toBe('content')
    })

    it("resuelta sin contenido y el tope vencido → 'hidden'", () => {
      expect(
        resolveSlot({ reserve: 'always', settled: true, hasContent: false, deadlinePassed: true }),
      ).toBe('hidden')
    })
  })

  describe("reserve: 'if-had-content' (card que puede terminar vacía)", () => {
    it("sin resolver y tuvo contenido la última vez → 'skeleton'", () => {
      expect(
        resolveSlot({
          reserve: 'if-had-content',
          settled: false,
          hadContentLastTime: true,
          deadlinePassed: false,
        }),
      ).toBe('skeleton')
    })

    it("sin resolver y NO tuvo contenido la última vez → 'hidden'", () => {
      expect(
        resolveSlot({ reserve: 'if-had-content', settled: false, hadContentLastTime: false }),
      ).toBe('hidden')
    })

    it("sin resolver y sin flag (undefined) → 'hidden' (default seguro: no reservar lugar)", () => {
      expect(resolveSlot({ reserve: 'if-had-content', settled: false })).toBe('hidden')
    })

    it("sin resolver, tuvo contenido pero el tope venció → 'hidden'", () => {
      expect(
        resolveSlot({
          reserve: 'if-had-content',
          settled: false,
          hadContentLastTime: true,
          deadlinePassed: true,
        }),
      ).toBe('hidden')
    })

    it("resuelta con contenido → 'content' aunque no hubiera tenido antes", () => {
      expect(
        resolveSlot({
          reserve: 'if-had-content',
          settled: true,
          hasContent: true,
          hadContentLastTime: false,
        }),
      ).toBe('content')
    })

    it("resuelta sin contenido → 'hidden' aunque hubiera tenido antes", () => {
      expect(
        resolveSlot({
          reserve: 'if-had-content',
          settled: true,
          hasContent: false,
          hadContentLastTime: true,
        }),
      ).toBe('hidden')
    })

    it("resuelta con hasContent undefined → 'hidden' (sin afirmación explícita no se dibuja)", () => {
      expect(
        resolveSlot({ reserve: 'if-had-content', settled: true, hadContentLastTime: true }),
      ).toBe('hidden')
    })

    it("resuelta con hasContent undefined y el tope vencido → 'hidden'", () => {
      expect(resolveSlot({ reserve: 'if-had-content', settled: true, deadlinePassed: true })).toBe(
        'hidden',
      )
    })
  })
})
