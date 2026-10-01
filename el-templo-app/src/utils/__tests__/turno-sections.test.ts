import { describe, it, expect } from 'vitest'
import { splitDaySections } from 'src/utils/turno-sections'

const slot = (startTime: string, isSpecial = false) => ({ startTime, isSpecial })
const reg = (...times: string[]) => times.map((t) => slot(t))
const esp = (t: string) => slot(t, true)
const byTime = (a: { startTime: string }, b: { startTime: string }) =>
  a.startTime.localeCompare(b.startTime)

function layout(slots: { startTime: string; isSpecial: boolean }[]) {
  return splitDaySections([...slots].sort(byTime)).map((s) => ({
    turno: s.turno,
    times: s.slots.map((x) => `${x.startTime}${x.isSpecial ? '*' : ''}`),
  }))
}

describe('splitDaySections', () => {
  it('sin slots → sin secciones', () => {
    expect(splitDaySections([])).toEqual([])
  })

  it('sin especiales → mañana y tarde como siempre (corte 12:00)', () => {
    expect(layout(reg('08:00', '11:30', '12:00', '19:00'))).toEqual([
      { turno: 'morning', times: ['08:00', '11:30'] },
      { turno: 'afternoon', times: ['12:00', '19:00'] },
    ])
  })

  it('Moreno entre semana: yoga 11:00 y 16:00 entre turnos 7-10 / 17-20 → Especiales', () => {
    const weekday = reg('07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00')
    expect(layout([...weekday, esp('11:00')])).toEqual([
      { turno: 'morning', times: ['07:00', '08:00', '09:00', '10:00'] },
      { turno: 'especiales', times: ['11:00*'] },
      { turno: 'afternoon', times: ['17:00', '18:00', '19:00', '20:00'] },
    ])
    expect(layout([...weekday, esp('16:00')])[1]).toEqual({
      turno: 'especiales',
      times: ['16:00*'],
    })
  })

  it('sábado: especial 10:00 intercalada con ROM 9/10/11 → se queda en Turno Mañana, en orden', () => {
    expect(layout([...reg('09:00', '10:00', '11:00'), esp('10:00')])).toEqual([
      { turno: 'morning', times: ['09:00', '10:00', '10:00*', '11:00'] },
    ])
  })

  it('especial justo a la hora de la última regular de la mañana → turno mañana', () => {
    expect(layout([...reg('09:00', '10:00'), esp('10:00')])).toEqual([
      { turno: 'morning', times: ['09:00', '10:00', '10:00*'] },
    ])
  })

  it('especial que arranca a la hora de la primera regular de la tarde → turno tarde', () => {
    expect(layout([...reg('09:00', '16:00'), esp('16:00')])).toEqual([
      { turno: 'morning', times: ['09:00'] },
      { turno: 'afternoon', times: ['16:00', '16:00*'] },
    ])
  })

  it('bordes de la franja: 09:59 y 17:00 nunca son Especiales', () => {
    expect(layout([esp('09:59'), esp('17:00')])).toEqual([
      { turno: 'morning', times: ['09:59*'] },
      { turno: 'afternoon', times: ['17:00*'] },
    ])
    expect(layout([esp('17:00:00')])).toEqual([{ turno: 'afternoon', times: ['17:00:00*'] }])
  })

  it('formato HH:MM:SS del server', () => {
    expect(layout([...reg('09:00:00', '18:00:00'), esp('13:30:00')])[1]).toEqual({
      turno: 'especiales',
      times: ['13:30:00*'],
    })
  })

  it('día solo con especiales dentro de la franja → solo Especiales', () => {
    expect(layout([esp('11:00')])).toEqual([{ turno: 'especiales', times: ['11:00*'] }])
  })

  it('una clase regular dentro de la franja no va a Especiales', () => {
    expect(layout(reg('11:00', '13:00'))).toEqual([
      { turno: 'morning', times: ['11:00'] },
      { turno: 'afternoon', times: ['13:00'] },
    ])
  })

  it('las secciones salen siempre en orden cronológico', () => {
    const day = [...reg('07:00', '09:00', '18:00'), esp('08:00'), esp('12:30'), esp('19:00')]
    const flat = layout(day).flatMap((s) => s.times.map((t) => t.replace('*', '')))
    expect(flat).toEqual([...flat].sort())
  })
})
