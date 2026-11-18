import { describe, expect, it } from 'vitest'
import { countUpSteps } from '../count-up'

describe('countUpSteps', () => {
  it('cuenta de a uno cuando la diferencia entra en los pasos disponibles', () => {
    expect(countUpSteps(315, 320, 90, 450)).toEqual([316, 317, 318, 319, 320])
  })

  it('con una diferencia grande usa como máximo maxMs / stepMs pasos, crecientes y termina en `to`', () => {
    const steps = countUpSteps(300, 320, 90, 450)
    expect(steps.length).toBeLessThanOrEqual(5)
    expect(steps[steps.length - 1]).toBe(320)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!).toBeGreaterThan(steps[i - 1]!)
    }
    expect(steps[0]!).toBeGreaterThan(300)
    expect(steps.every((n) => Number.isInteger(n))).toBe(true)
  })

  it('sin diferencia devuelve solo el valor final', () => {
    expect(countUpSteps(320, 320, 90, 450)).toEqual([320])
  })

  it('si el destino es menor que el origen devuelve solo el destino', () => {
    expect(countUpSteps(10, 5, 90, 450)).toEqual([5])
  })

  it('con un tope de tiempo menor que un paso igual termina en `to`', () => {
    expect(countUpSteps(0, 50, 90, 10)).toEqual([50])
  })
})
