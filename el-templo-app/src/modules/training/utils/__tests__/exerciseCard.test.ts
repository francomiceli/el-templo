import { describe, it, expect } from 'vitest'
import { SECONDS_MARK, plateValue } from '../exerciseCard'

describe('plateValue', () => {
  it('reps: solo el número, sin la unidad', () => {
    expect(plateValue('8 REPS')).toBe('8')
  })

  it('segundos: el número con ″', () => {
    expect(plateValue('30 SEG')).toBe(`30${SECONDS_MARK}`)
    expect(SECONDS_MARK).toBe('″')
  })

  it('rango con punto medio: el rango entero', () => {
    expect(plateValue('10 · 12 REPS')).toBe('10 · 12')
    expect(plateValue('20 · 30 SEG')).toBe('20 · 30″')
  })

  it('pirámide: la secuencia entera', () => {
    expect(plateValue('10-12-10 REPS')).toBe('10-12-10')
    expect(plateValue('2-4...10...4-2 SEG')).toBe('2-4...10...4-2″')
  })

  it('Death By compacto y PAUSA quedan como vienen', () => {
    expect(plateValue('5 - 6 - ...')).toBe('5 - 6 - ...')
    expect(plateValue('PAUSA')).toBe('PAUSA')
  })

  it('vacío (sin dosis) = cantidad vacía', () => {
    expect(plateValue('')).toBe('')
    expect(plateValue('   ')).toBe('')
  })

  it('solo corta la unidad del final (no una palabra que la contenga)', () => {
    expect(plateValue('REPSOL')).toBe('REPSOL')
    expect(plateValue('8REPS')).toBe('8REPS')
  })
})
