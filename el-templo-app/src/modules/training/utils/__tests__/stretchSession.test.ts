import { describe, it, expect } from 'vitest'
import type { StretchDose } from '../../types/stretch'
import {
  isStretchExpiredMessage,
  STRETCH_AURA_MARGIN_SECONDS,
  STRETCH_AURA_SECONDS,
  STRETCH_CLOSING_PHRASES,
  stretchAuraReady,
  stretchClosingPhrase,
  stretchDoneMinutes,
  stretchDoseLabel,
  stretchMinutesLabel,
} from '../stretchSession'

/**
 * Fase 213-15: textos y reglas puras del estiramiento sin reloj por ejercicio
 * (dosis, aviso de AURA, pantalla final).
 */

function dose(unit: StretchDose['unit'], value: number, max: number | null = null): StretchDose {
  return { unit, value, max }
}

describe('stretchDoseLabel', () => {
  it('segundos con valor único', () => {
    expect(stretchDoseLabel(dose('seconds', 30))).toBe('30 s')
  })

  it('segundos con rango', () => {
    expect(stretchDoseLabel(dose('seconds', 20, 30))).toBe('20 a 30 s')
  })

  it('repeticiones con valor único, en plural', () => {
    expect(stretchDoseLabel(dose('reps', 10))).toBe('10 repeticiones')
  })

  it('una repetición va en singular', () => {
    expect(stretchDoseLabel(dose('reps', 1))).toBe('1 repetición')
  })

  it('repeticiones con rango', () => {
    expect(stretchDoseLabel(dose('reps', 8, 10))).toBe('8 a 10 repeticiones')
  })

  it('un max igual o menor al valor se ignora (no hay rango)', () => {
    expect(stretchDoseLabel(dose('seconds', 30, 30))).toBe('30 s')
    expect(stretchDoseLabel(dose('reps', 10, 5))).toBe('10 repeticiones')
  })
})

describe('stretchAuraReady', () => {
  const T0 = 1_700_000_000_000
  const NEEDED_MS = (STRETCH_AURA_SECONDS + STRETCH_AURA_MARGIN_SECONDS) * 1000

  it('los 180 s del servidor más 2 s de margen', () => {
    expect(STRETCH_AURA_SECONDS).toBe(180)
    expect(STRETCH_AURA_MARGIN_SECONDS).toBe(2)
  })

  it('sin started confirmado nunca está listo, pase el tiempo que pase', () => {
    expect(stretchAuraReady(null, T0 + NEEDED_MS * 10)).toBe(false)
  })

  it('a los 180 s justos todavía no (el servidor puede medir 179 s)', () => {
    expect(stretchAuraReady(T0, T0 + 180_000)).toBe(false)
  })

  it('un milisegundo antes del margen todavía no', () => {
    expect(stretchAuraReady(T0, T0 + NEEDED_MS - 1)).toBe(false)
  })

  it('a los 182 s en adelante sí', () => {
    expect(stretchAuraReady(T0, T0 + NEEDED_MS)).toBe(true)
    expect(stretchAuraReady(T0, T0 + NEEDED_MS + 60_000)).toBe(true)
  })

  it('un reloj que retrocede no da AURA', () => {
    expect(stretchAuraReady(T0, T0 - 5_000)).toBe(false)
  })
})

describe('stretchDoneMinutes (pantalla final)', () => {
  it('con duración medida usa los minutos del servidor', () => {
    expect(stretchDoneMinutes({ durationSeconds: 240, minutes: 4 })).toBe(4)
  })

  it('sin duración (el started nunca llegó) no hay cifra: "Listo." a secas', () => {
    expect(stretchDoneMinutes({ durationSeconds: null, minutes: 7 })).toBeNull()
  })

  it('una duración de 0 s es una duración medida', () => {
    expect(stretchDoneMinutes({ durationSeconds: 0, minutes: 1 })).toBe(1)
  })
})

describe('stretchMinutesLabel y stretchClosingPhrase', () => {
  it('pluraliza los minutos y nunca baja de 1', () => {
    expect(stretchMinutesLabel(7)).toBe('7 minutos de estiramiento')
    expect(stretchMinutesLabel(1)).toBe('1 minuto de estiramiento')
    expect(stretchMinutesLabel(0)).toBe('1 minuto de estiramiento')
    expect(stretchMinutesLabel(Number.NaN)).toBe('1 minuto de estiramiento')
  })

  it('la frase es estable para una fecha y rota entre días consecutivos', () => {
    expect(stretchClosingPhrase('2026-11-11')).toBe(stretchClosingPhrase('2026-11-11'))
    const tres = ['2026-11-11', '2026-11-12', '2026-11-13'].map(stretchClosingPhrase)
    expect(new Set(tres).size).toBe(3)
  })

  it('una fecha inválida cae en la primera frase', () => {
    expect(stretchClosingPhrase('')).toBe(STRETCH_CLOSING_PHRASES[0])
    expect(stretchClosingPhrase('ayer')).toBe(STRETCH_CLOSING_PHRASES[0])
  })

  it('ninguna frase promete salud ni usa los textos prohibidos', () => {
    for (const f of STRETCH_CLOSING_PHRASES) {
      expect(f).not.toMatch(/menos dolor|evitá lesiones|recuperate más rápido/i)
    }
  })
})

describe('isStretchExpiredMessage', () => {
  it('reconoce el mensaje de oferta vencida del servidor', () => {
    expect(isStretchExpiredMessage('Este estiramiento ya venció')).toBe(true)
  })

  it('una falla de red o ningún error no es una oferta vencida', () => {
    expect(isStretchExpiredMessage('No pudimos guardar el estiramiento')).toBe(false)
    expect(isStretchExpiredMessage('Network Error')).toBe(false)
    expect(isStretchExpiredMessage(null)).toBe(false)
  })
})
