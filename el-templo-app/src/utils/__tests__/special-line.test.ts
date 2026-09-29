import { describe, it, expect } from 'vitest'
import {
  sameSpecialLine,
  shortLineLabel,
  fullLineLabel,
  passHasBalance,
  specialSlotState,
  passChipLabel,
  passBalanceText,
} from 'src/utils/special-line'

describe('special-line — sameSpecialLine', () => {
  it('null solo matchea con null (y con vacío/blanco)', () => {
    expect(sameSpecialLine(null, null)).toBe(true)
    expect(sameSpecialLine(undefined, null)).toBe(true)
    expect(sameSpecialLine('', null)).toBe(true)
    expect(sameSpecialLine('  ', null)).toBe(true)
    expect(sameSpecialLine(null, 'Yoga')).toBe(false)
    expect(sameSpecialLine('Yoga', null)).toBe(false)
  })

  it('compara sin importar mayúsculas ni espacios', () => {
    expect(sameSpecialLine('Yoga', ' yoga ')).toBe(true)
    expect(sameSpecialLine('YOGA', 'yoga')).toBe(true)
    expect(sameSpecialLine('Yoga', 'Pilates')).toBe(false)
  })
})

describe('special-line — etiquetas', () => {
  it('shortLineLabel: Aura para null, la línea si no', () => {
    expect(shortLineLabel(null)).toBe('Aura')
    expect(shortLineLabel('')).toBe('Aura')
    expect(shortLineLabel('Yoga')).toBe('Yoga')
    expect(shortLineLabel(' Yoga ')).toBe('Yoga')
  })

  it('fullLineLabel: "Actividades con Aura" para null', () => {
    expect(fullLineLabel(null)).toBe('Actividades con Aura')
    expect(fullLineLabel('Yoga')).toBe('Yoga')
  })
})

describe('special-line — saldo y estado por línea', () => {
  it('passHasBalance: null = ilimitado, >0 con saldo, 0 agotado, sin pase false', () => {
    expect(passHasBalance({ classesRemaining: null })).toBe(true)
    expect(passHasBalance({ classesRemaining: 2 })).toBe(true)
    expect(passHasBalance({ classesRemaining: 0 })).toBe(false)
    expect(passHasBalance(null)).toBe(false)
  })

  const aura = { specialLine: null, classesRemaining: 0 }
  const yoga = { specialLine: 'Yoga', classesRemaining: 3 }

  it('specialSlotState resuelve contra el pase de la MISMA línea', () => {
    const passes = [aura, yoga]
    expect(specialSlotState(passes, null)).toBe('exhausted')
    expect(specialSlotState(passes, 'yoga')).toBe('reservable')
    expect(specialSlotState(passes, 'Pilates')).toBe('no-pass')
  })

  it('un pase de Yoga NO habilita una clase Aura (y viceversa)', () => {
    expect(specialSlotState([yoga], null)).toBe('no-pass')
    expect(specialSlotState([aura], 'Yoga')).toBe('no-pass')
  })

  it('sin pases → no-pass; pase ilimitado → reservable', () => {
    expect(specialSlotState([], null)).toBe('no-pass')
    expect(specialSlotState([{ specialLine: 'Yoga', classesRemaining: null }], 'Yoga')).toBe(
      'reservable',
    )
  })
})

describe('special-line — passChipLabel', () => {
  it('con saldo: <línea> · x/N', () => {
    expect(passChipLabel({ specialLine: null, classesRemaining: 1, classesBudget: 2 })).toBe(
      'Aura · 1/2',
    )
    expect(passChipLabel({ specialLine: 'Yoga', classesRemaining: 3, classesBudget: 4 })).toBe(
      'Yoga · 3/4',
    )
  })

  it('ilimitado: <línea> · Ilimitado', () => {
    expect(
      passChipLabel({ specialLine: 'Yoga', classesRemaining: null, classesBudget: null }),
    ).toBe('Yoga · Ilimitado')
  })

  it('agotado: 0/N con copy de renovación', () => {
    expect(passChipLabel({ specialLine: null, classesRemaining: 0, classesBudget: 2 })).toBe(
      'Aura · 0/2 · se renuevan el próximo mes',
    )
  })

  it('agotado en otra línea: sin copy de renovación (packs y clase suelta no se renuevan)', () => {
    expect(passChipLabel({ specialLine: 'Yoga', classesRemaining: 0, classesBudget: 4 })).toBe(
      'Yoga · 0/4 · sin clases',
    )
  })
})

describe('special-line — passBalanceText', () => {
  it('con cupo: "N de M clases" (sin "este mes")', () => {
    expect(passBalanceText({ specialLine: 'Yoga', classesRemaining: 3, classesBudget: 4 })).toBe(
      '3 de 4 clases',
    )
  })

  it('ilimitado: "Accesos ilimitados"', () => {
    expect(
      passBalanceText({ specialLine: null, classesRemaining: null, classesBudget: null }),
    ).toBe('Accesos ilimitados')
  })
})
