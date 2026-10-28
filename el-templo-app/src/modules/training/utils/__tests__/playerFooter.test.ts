import { describe, it, expect } from 'vitest'
import {
  MOBILITY_LABEL,
  footerValueSize,
  playerFooter,
  type PlayerFooterInput,
} from '../playerFooter'
import { SECONDS_MARK } from '../exerciseCard'

const base: PlayerFooterInput = {
  isMobilitySlide: false,
  exercise: { name: 'Dominada estricta', contraction: 'CON', quickDose: '8 REPS' },
  mobility: { name: 'Movilidad de hombros', contraction: null, quickDose: '40 SEG' },
  blockDone: false,
}

describe('playerFooter', () => {
  it('ejercicio con video: insignia, nombre y cantidad sin unidad', () => {
    expect(playerFooter(base)).toEqual({
      kind: 'exercise',
      badge: { label: 'CON', kind: 'con' },
      label: null,
      name: 'Dominada estricta',
      value: '8',
      valueSize: 'xl',
    })
  })

  it('segundos: la cantidad lleva ″ y la insignia es la de ISO', () => {
    const f = playerFooter({
      ...base,
      exercise: { name: 'Colgado activo', contraction: 'ISO', quickDose: '30 SEG' },
    })
    expect(f?.value).toBe(`30${SECONDS_MARK}`)
    expect(f?.badge).toEqual({ label: 'ISO', kind: 'iso' })
  })

  it('sin contracción cargada no hay insignia', () => {
    const f = playerFooter({
      ...base,
      exercise: { name: 'Remo', contraction: '', quickDose: '10 REPS' },
    })
    expect(f?.badge).toBeNull()
  })

  it('movilidad: mismo pie, con el rótulo de descanso activo y MOV si no tiene contracción', () => {
    const f = playerFooter({ ...base, isMobilitySlide: true })
    expect(f).toEqual({
      kind: 'mobility',
      badge: { label: 'MOV', kind: 'mov' },
      label: MOBILITY_LABEL,
      name: 'Movilidad de hombros',
      value: `40${SECONDS_MARK}`,
      valueSize: 'xl',
    })
  })

  it('movilidad con contracción: usa la insignia de la contracción', () => {
    const f = playerFooter({
      ...base,
      isMobilitySlide: true,
      mobility: { name: 'Colgado pasivo', contraction: 'ISO', quickDose: '20 SEG' },
    })
    expect(f?.badge).toEqual({ label: 'ISO', kind: 'iso' })
  })

  it('el slide de movilidad no usa el ejercicio (ni al revés)', () => {
    expect(playerFooter({ ...base, isMobilitySlide: true })?.name).toBe('Movilidad de hombros')
    expect(playerFooter(base)?.name).toBe('Dominada estricta')
  })

  it('con el bloque completo no se muestra', () => {
    expect(playerFooter({ ...base, blockDone: true })).toBeNull()
  })

  it('sin ejercicio, sin movilidad o con nombre vacío no hay pie', () => {
    expect(playerFooter({ ...base, exercise: null })).toBeNull()
    expect(playerFooter({ ...base, isMobilitySlide: true, mobility: null })).toBeNull()
    expect(
      playerFooter({ ...base, exercise: { name: '   ', contraction: 'CON', quickDose: '8 REPS' } }),
    ).toBeNull()
  })

  it('sin dosis queda la cantidad vacía (el pie igual muestra el nombre)', () => {
    const f = playerFooter({
      ...base,
      exercise: { name: 'Remo', contraction: 'CON', quickDose: '' },
    })
    expect(f?.value).toBe('')
    expect(f?.name).toBe('Remo')
  })

  it('PAUSA y pirámides pasan como vienen y achican la cantidad', () => {
    const pausa = playerFooter({
      ...base,
      exercise: { name: 'Pausa', contraction: 'CON', quickDose: 'PAUSA' },
    })
    expect(pausa?.value).toBe('PAUSA')
    expect(pausa?.valueSize).toBe('lg')
    const piramide = playerFooter({
      ...base,
      exercise: { name: 'Sentadilla', contraction: 'CON', quickDose: '10-12-10 REPS' },
    })
    expect(piramide?.value).toBe('10-12-10')
    expect(piramide?.valueSize).toBe('md')
  })
})

describe('footerValueSize', () => {
  it('escala por largo: 3 / 5 / 8 / más', () => {
    expect(footerValueSize('')).toBe('xl')
    expect(footerValueSize('12″')).toBe('xl')
    expect(footerValueSize('10 · 12')).toBe('md')
    expect(footerValueSize('PAUSA')).toBe('lg')
    expect(footerValueSize('10-12-10')).toBe('md')
    expect(footerValueSize('2-4...10...4-2″')).toBe('sm')
  })
})
