import { describe, it, expect } from 'vitest'
import { DEV_LATENCY_MAX_MS, jitteredDelayMs, parseDevLatencyMs } from '../dev-latency'

describe('parseDevLatencyMs (fase 203, SC-6)', () => {
  it('en desarrollo, un número válido se devuelve tal cual', () => {
    expect(parseDevLatencyMs('800', true)).toBe(800)
    expect(parseDevLatencyMs('1', true)).toBe(1)
  })

  it('fuera de desarrollo SIEMPRE devuelve 0 (nunca en prod)', () => {
    expect(parseDevLatencyMs('800', false)).toBe(0)
    expect(parseDevLatencyMs('99999', false)).toBe(0)
  })

  it('sin la variable definida devuelve 0 (comportamiento por defecto intacto)', () => {
    expect(parseDevLatencyMs(undefined, true)).toBe(0)
    expect(parseDevLatencyMs('', true)).toBe(0)
    expect(parseDevLatencyMs('   ', true)).toBe(0)
  })

  it('un valor no numérico devuelve 0', () => {
    expect(parseDevLatencyMs('abc', true)).toBe(0)
    expect(parseDevLatencyMs('NaN', true)).toBe(0)
    expect(parseDevLatencyMs('Infinity', true)).toBe(0)
  })

  it('cero o negativo devuelve 0', () => {
    expect(parseDevLatencyMs('0', true)).toBe(0)
    expect(parseDevLatencyMs('-5', true)).toBe(0)
  })

  it('se limita al tope para no colgar la app en desarrollo', () => {
    expect(parseDevLatencyMs('99999', true)).toBe(DEV_LATENCY_MAX_MS)
    expect(parseDevLatencyMs('99999', true)).toBe(10000)
    expect(parseDevLatencyMs('10000', true)).toBe(10000)
  })
})

describe('jitteredDelayMs (fase 203, SC-6)', () => {
  it('rand 0 → 0.5x de la base', () => {
    expect(jitteredDelayMs(800, 0)).toBe(400)
  })

  it('rand 0.5 → 1x de la base', () => {
    expect(jitteredDelayMs(800, 0.5)).toBe(800)
  })

  it('rand cercano a 1 → casi 1.5x, redondeado', () => {
    expect(jitteredDelayMs(800, 0.999)).toBe(1199)
  })

  it('base 0 → 0 sin importar rand', () => {
    expect(jitteredDelayMs(0, 0)).toBe(0)
    expect(jitteredDelayMs(0, 0.7)).toBe(0)
  })

  it('base negativa → 0', () => {
    expect(jitteredDelayMs(-100, 0.5)).toBe(0)
  })

  it('el resultado siempre cae entre 0.5x y 1.5x de la base', () => {
    for (const rand of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999]) {
      const delay = jitteredDelayMs(600, rand)
      expect(delay).toBeGreaterThanOrEqual(300)
      expect(delay).toBeLessThanOrEqual(900)
    }
  })
})
