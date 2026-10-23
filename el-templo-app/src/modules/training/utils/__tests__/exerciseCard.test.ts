import { describe, it, expect } from 'vitest'
import { exerciseCardState, splitDose } from '../exerciseCard'

describe('exerciseCardState', () => {
  it('activo y sin tildar = AHORA', () => {
    expect(exerciseCardState(true, false)).toBe('now')
  })

  it('tildado gana sobre activo: ya no es "ahora", es verde', () => {
    expect(exerciseCardState(true, true)).toBe('done')
  })

  it('tildado sin ser el activo = hecho', () => {
    expect(exerciseCardState(false, true)).toBe('done')
  })

  it('ni activo ni tildado = idle', () => {
    expect(exerciseCardState(false, false)).toBe('idle')
  })
})

describe('splitDose', () => {
  it('reps: valor y unidad por separado', () => {
    expect(splitDose('8 REPS')).toEqual({ value: '8', unit: 'REPS' })
  })

  it('segundos', () => {
    expect(splitDose('30 SEG')).toEqual({ value: '30', unit: 'SEG' })
  })

  it('rango con punto medio: el valor conserva el rango entero', () => {
    expect(splitDose('10 · 12 REPS')).toEqual({ value: '10 · 12', unit: 'REPS' })
  })

  it('pirámide: la secuencia queda entera como valor', () => {
    expect(splitDose('10-12-10 REPS')).toEqual({ value: '10-12-10', unit: 'REPS' })
    expect(splitDose('2-4...10...4-2 SEG')).toEqual({ value: '2-4...10...4-2', unit: 'SEG' })
  })

  it('Death By compacto, sin unidad', () => {
    expect(splitDose('5 - 6 - ...')).toEqual({ value: '5 - 6 - ...', unit: '' })
  })

  it('PAUSA no tiene unidad', () => {
    expect(splitDose('PAUSA')).toEqual({ value: 'PAUSA', unit: '' })
  })

  it('vacío (sin dosis) = placa vacía', () => {
    expect(splitDose('')).toEqual({ value: '', unit: '' })
    expect(splitDose('   ')).toEqual({ value: '', unit: '' })
  })

  it('solo corta la unidad del final (no una palabra que la contenga)', () => {
    expect(splitDose('REPSOL')).toEqual({ value: 'REPSOL', unit: '' })
    expect(splitDose('8REPS')).toEqual({ value: '8REPS', unit: '' })
  })
})
