import { describe, it, expect } from 'vitest'
import {
  attendeeAriaLabel,
  attendeeName,
  sheetFooterAction,
  sheetTitle,
  type SheetFooterInput,
} from 'src/utils/attendees-view'

const person = (
  over: Partial<{ firstName: string; lastInitial: string | null; isMe: boolean }>,
) => ({
  firstName: 'Sofía',
  lastInitial: 'M' as string | null,
  isMe: false,
  ...over,
})

describe('attendeeName', () => {
  it('nombre de pila e inicial con punto', () => {
    expect(attendeeName(person({}))).toBe('Sofía M.')
  })

  it('sin inicial, solo el nombre', () => {
    expect(attendeeName(person({ lastInitial: null }))).toBe('Sofía')
  })

  it('inicial vacía se trata como ausente', () => {
    expect(attendeeName(person({ lastInitial: '' }))).toBe('Sofía')
  })

  it('uno mismo dice "Vos"', () => {
    expect(attendeeName(person({ isMe: true }))).toBe('Vos')
  })
})

describe('attendeeAriaLabel', () => {
  it('con Aura', () => {
    expect(attendeeAriaLabel({ ...person({}), aura: 320 })).toBe('Sofía M., 320 de Aura')
  })

  it('sin Aura (null) solo el nombre', () => {
    expect(attendeeAriaLabel({ ...person({}), aura: null })).toBe('Sofía M.')
  })

  it('con miles', () => {
    expect(attendeeAriaLabel({ ...person({}), aura: 1240 })).toBe('Sofía M., 1.240 de Aura')
  })

  it('uno mismo con Aura', () => {
    expect(attendeeAriaLabel({ ...person({ isMe: true }), aura: 50 })).toBe('Vos, 50 de Aura')
  })
})

describe('sheetTitle', () => {
  it('día de la semana con mayúscula, número y hora', () => {
    expect(sheetTitle('2026-11-20', '18:00')).toBe('Viernes 20 · 18:00')
  })

  it('la hora con segundos y cero a la izquierda se muestra como en la card', () => {
    expect(sheetTitle('2026-11-23', '08:30:00')).toBe('Lunes 23 · 8:30')
  })

  it('domingo y fin de mes', () => {
    expect(sheetTitle('2026-11-01', '10:00')).toBe('Domingo 1 · 10:00')
  })
})

describe('sheetFooterAction', () => {
  const base: SheetFooterInput = {
    startTime: '18:00:00',
    isBooked: false,
    isPast: false,
    isHoliday: false,
    isFull: false,
    canJoinWaitlist: true,
    specialBlocked: false,
  }

  it('reservable', () => {
    expect(sheetFooterAction(base)).toEqual({ kind: 'reserve', label: 'Reservar 18:00' })
  })

  it('completo con lista de espera', () => {
    expect(sheetFooterAction({ ...base, isFull: true })).toEqual({
      kind: 'waitlist',
      label: 'Anotarme en la lista de espera',
    })
  })

  it('completo sin lista de espera cierra', () => {
    expect(sheetFooterAction({ ...base, isFull: true, canJoinWaitlist: false })).toEqual({
      kind: 'close',
      label: 'Cerrar',
    })
  })

  it.each([
    ['reservado', { isBooked: true }],
    ['pasado', { isPast: true }],
    ['feriado', { isHoliday: true }],
    ['especial bloqueado', { specialBlocked: true }],
  ])('%s cierra', (_name, over) => {
    expect(sheetFooterAction({ ...base, ...over })).toEqual({ kind: 'close', label: 'Cerrar' })
  })

  it('reservado manda sobre completo', () => {
    expect(sheetFooterAction({ ...base, isBooked: true, isFull: true })).toEqual({
      kind: 'close',
      label: 'Cerrar',
    })
  })
})
