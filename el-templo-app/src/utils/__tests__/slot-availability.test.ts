import { describe, it, expect } from 'vitest'
import {
  availabilityLevel,
  availabilityText,
  slotIsFull,
  spotsLeft,
  type SlotAvailabilityInput,
} from 'src/utils/slot-availability'

const slot = (over: Partial<SlotAvailabilityInput> = {}): SlotAvailabilityInput => ({
  isFull: false,
  maxCapacity: 20,
  bookedCount: 0,
  trialSpotsRemaining: 3,
  ...over,
})

describe('availabilityLevel (cupo general)', () => {
  it.each([
    [0, 'available'],
    [10, 'available'],
    [15, 'available'], // quedan 5 → todavía 'available'
    [16, 'few'], // quedan 4
    [18, 'few'], // quedan 2
    [19, 'last'], // queda 1
    [20, 'full'],
    [25, 'full'], // sobrecupo nunca da negativo
  ])('bookedCount %i de 20 → %s', (bookedCount, level) => {
    expect(availabilityLevel(slot({ bookedCount }), false)).toBe(level)
  })

  it('isFull manda aunque los números digan que hay lugar', () => {
    expect(availabilityLevel(slot({ isFull: true, bookedCount: 3 }), false)).toBe('full')
  })
})

describe('availabilityText (cupo general)', () => {
  it('0 anotados → "Sé el primero"', () => {
    expect(availabilityText(slot({ bookedCount: 0 }), false)).toBe('Sé el primero')
  })

  it('1 anotado en singular', () => {
    expect(availabilityText(slot({ bookedCount: 1 }), false)).toBe('1 anotado')
  })

  it('N anotados en plural', () => {
    expect(availabilityText(slot({ bookedCount: 4 }), false)).toBe('4 anotados')
    expect(availabilityText(slot({ bookedCount: 15 }), false)).toBe('15 anotados')
  })

  it('pocos lugares muestra los restantes', () => {
    expect(availabilityText(slot({ bookedCount: 16 }), false)).toBe('Quedan 4 lugares')
    expect(availabilityText(slot({ bookedCount: 18 }), false)).toBe('Quedan 2 lugares')
  })

  it('queda uno en singular', () => {
    expect(availabilityText(slot({ bookedCount: 19 }), false)).toBe('Queda 1 lugar')
  })

  it('completo', () => {
    expect(availabilityText(slot({ bookedCount: 20 }), false)).toBe('Completo')
    expect(availabilityText(slot({ isFull: true }), false)).toBe('Completo')
  })

  it('bookedCount negativo (dato roto) no rompe el copy', () => {
    expect(availabilityText(slot({ bookedCount: -3, maxCapacity: 30 }), false)).toBe(
      'Sé el primero',
    )
  })
})

describe('bordes de capacidad', () => {
  it('maxCapacity 0 (horario sin cupo cargado) → completo, sin lugares', () => {
    const s = slot({ maxCapacity: 0, bookedCount: 0, isFull: false })
    expect(spotsLeft(s, false)).toBe(0)
    expect(availabilityLevel(s, false)).toBe('full')
    expect(availabilityText(s, false)).toBe('Completo')
  })
})

describe('copy del chip de cupo (no debe revertirse)', () => {
  it('prueba social con "anotados", sin "personas anotadas"', () => {
    const copies = [0, 1, 2, 7, 15].map((bookedCount) =>
      availabilityText(slot({ bookedCount }), false),
    )
    expect(copies).toEqual([
      'Sé el primero',
      '1 anotado',
      '2 anotados',
      '7 anotados',
      '15 anotados',
    ])
    for (const c of copies) expect(c).not.toMatch(/persona/i)
  })

  it('cambia a lugares restantes recién cuando quedan menos de 5', () => {
    expect(availabilityText(slot({ bookedCount: 15 }), false)).toBe('15 anotados') // quedan 5
    expect(availabilityText(slot({ bookedCount: 16 }), false)).toBe('Quedan 4 lugares')
  })
})

describe('modo prueba (cupo especial de SP)', () => {
  it('usa trialSpotsRemaining, no el cupo general', () => {
    const s = slot({ bookedCount: 0, trialSpotsRemaining: 2 })
    expect(spotsLeft(s, true)).toBe(2)
    expect(availabilityLevel(s, true)).toBe('few')
    expect(availabilityText(s, true)).toBe('Quedan 2 lugares')
  })

  it('queda 1 → "Queda 1 lugar"', () => {
    expect(availabilityText(slot({ trialSpotsRemaining: 1 }), true)).toBe('Queda 1 lugar')
  })

  it('sin cupo de prueba → completo aunque el general no lo esté', () => {
    const s = slot({ trialSpotsRemaining: 0, isFull: false })
    expect(slotIsFull(s, true)).toBe(true)
    expect(availabilityText(s, true)).toBe('Completo')
  })

  it('cupo de prueba negativo se trata como 0', () => {
    expect(spotsLeft(slot({ trialSpotsRemaining: -1 }), true)).toBe(0)
  })

  it('isFull general NO marca completo en modo prueba', () => {
    expect(slotIsFull(slot({ isFull: true, trialSpotsRemaining: 2 }), true)).toBe(false)
  })

  it('cupo de prueba >= 5 → "available" y el chip cuenta los anotados del cupo GENERAL', () => {
    // Hoy el tope de SP es 3, así que no pasa en producción; si el tope subiera, el copy cae en la
    // rama de prueba social con `bookedCount` (cupo general). Fijado a propósito.
    const s = slot({ bookedCount: 6, trialSpotsRemaining: 5 })
    expect(availabilityLevel(s, true)).toBe('available')
    expect(availabilityText(s, true)).toBe('6 anotados')
    expect(availabilityText(slot({ bookedCount: 0, trialSpotsRemaining: 8 }), true)).toBe(
      'Sé el primero',
    )
    expect(availabilityText(slot({ bookedCount: 1, trialSpotsRemaining: 5 }), true)).toBe(
      '1 anotado',
    )
  })

  it('el umbral de "few" también rige en modo prueba (4 → few, 5 → available)', () => {
    expect(availabilityLevel(slot({ trialSpotsRemaining: 4 }), true)).toBe('few')
    expect(availabilityLevel(slot({ trialSpotsRemaining: 5 }), true)).toBe('available')
  })
})
