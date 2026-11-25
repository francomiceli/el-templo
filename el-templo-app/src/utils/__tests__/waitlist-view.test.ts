import { describe, it, expect } from 'vitest'
import type { BookingStatus } from 'src/types/scheduling'
import {
  cancelPromptMessage,
  cancelSuccessMessage,
  countsAsNextClass,
  holdsSpot,
  isWaitlistStatus,
  waitlistChipLabel,
} from 'src/utils/waitlist-view'

const ALL: BookingStatus[] = [
  'reservado',
  'qr_escaneado',
  'confirmado',
  'cancelado',
  'lista_espera',
  'no_show',
]

describe('holdsSpot', () => {
  it.each<[BookingStatus, boolean]>([
    ['reservado', true],
    ['qr_escaneado', true],
    ['confirmado', true],
    ['lista_espera', false],
    ['cancelado', false],
    ['no_show', false],
  ])('%s → %s', (status, expected) => {
    expect(holdsSpot(status)).toBe(expected)
  })
})

describe('countsAsNextClass', () => {
  it('la lista de espera nunca es "Tu próxima clase"', () => {
    expect(countsAsNextClass('lista_espera')).toBe(false)
  })

  it('solo reservado y qr_escaneado cuentan', () => {
    expect(ALL.filter(countsAsNextClass)).toEqual(['reservado', 'qr_escaneado'])
  })
})

describe('isWaitlistStatus', () => {
  it('solo lista_espera', () => {
    expect(ALL.filter(isWaitlistStatus)).toEqual(['lista_espera'])
  })
})

describe('waitlistChipLabel', () => {
  it('con puesto', () => {
    expect(waitlistChipLabel(2)).toBe('Lista de espera · #2')
  })

  it('sin puesto (null o inválido) → solo el texto', () => {
    expect(waitlistChipLabel(null)).toBe('Lista de espera')
    expect(waitlistChipLabel(0)).toBe('Lista de espera')
  })
})

describe('textos de cancelar', () => {
  it('reserva normal', () => {
    expect(cancelPromptMessage('reservado', 'lunes', '18:00')).toBe(
      '¿Cancelar tu reserva del lunes a las 18:00?',
    )
    expect(cancelSuccessMessage('reservado')).toBe('Reserva cancelada')
  })

  it('lista de espera', () => {
    expect(cancelPromptMessage('lista_espera', 'lunes', '18:00')).toBe(
      '¿Salir de la lista de espera del lunes a las 18:00?',
    )
    expect(cancelSuccessMessage('lista_espera')).toBe('Saliste de la lista de espera')
  })
})
