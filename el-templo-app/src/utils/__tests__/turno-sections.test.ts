import { describe, it, expect } from 'vitest'
import { isEntreTurnosEspecial, splitDaySections } from 'src/utils/turno-sections'

const slot = (startTime: string, isSpecial = false) => ({ startTime, isSpecial })

describe('isEntreTurnosEspecial', () => {
  it('especial dentro de la franja 10:00–17:00 → true', () => {
    expect(isEntreTurnosEspecial(slot('10:00', true))).toBe(true)
    expect(isEntreTurnosEspecial(slot('13:30:00', true))).toBe(true)
    expect(isEntreTurnosEspecial(slot('16:59', true))).toBe(true)
  })

  it('bordes: 09:59 y 17:00 quedan afuera', () => {
    expect(isEntreTurnosEspecial(slot('09:59', true))).toBe(false)
    expect(isEntreTurnosEspecial(slot('17:00', true))).toBe(false)
    expect(isEntreTurnosEspecial(slot('17:00:00', true))).toBe(false)
  })

  it('una clase regular en la franja NO es especial', () => {
    expect(isEntreTurnosEspecial(slot('11:00'))).toBe(false)
  })
})

describe('splitDaySections', () => {
  it('sin slots → sin secciones', () => {
    expect(splitDaySections([])).toEqual([])
  })

  it('sin especiales en la franja → mañana y tarde como siempre (corte 12:00)', () => {
    const sections = splitDaySections([slot('08:00'), slot('11:30'), slot('12:00'), slot('19:00')])
    expect(sections.map((s) => s.turno)).toEqual(['morning', 'afternoon'])
    expect(sections[0]!.slots.map((s) => s.startTime)).toEqual(['08:00', '11:30'])
    expect(sections[1]!.slots.map((s) => s.startTime)).toEqual(['12:00', '19:00'])
  })

  it('yoga entre turnos → sección Especiales en el medio', () => {
    const sections = splitDaySections([
      slot('08:00'),
      slot('10:30', true),
      slot('14:00', true),
      slot('18:00'),
    ])
    expect(sections.map((s) => s.turno)).toEqual(['morning', 'especiales', 'afternoon'])
    expect(sections[1]!.slots.map((s) => s.startTime)).toEqual(['10:30', '14:00'])
  })

  it('especiales fuera de la franja quedan en su turno', () => {
    const sections = splitDaySections([slot('09:00', true), slot('18:00', true)])
    expect(sections.map((s) => s.turno)).toEqual(['morning', 'afternoon'])
  })

  it('omite secciones vacías: un día solo con especiales entre turnos', () => {
    const sections = splitDaySections([slot('11:00', true)])
    expect(sections).toEqual([{ turno: 'especiales', slots: [slot('11:00', true)] }])
  })

  it('conserva el orden de entrada dentro de cada sección', () => {
    const sections = splitDaySections([slot('07:00'), slot('08:00'), slot('09:00')])
    expect(sections[0]!.slots.map((s) => s.startTime)).toEqual(['07:00', '08:00', '09:00'])
  })
})
