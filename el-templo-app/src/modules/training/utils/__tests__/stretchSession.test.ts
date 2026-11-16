import { describe, it, expect } from 'vitest'
import type { StretchDose, StretchExercise } from '../../types/stretch'
import {
  isStretchExpiredMessage,
  STRETCH_AURA_MARGIN_SECONDS,
  STRETCH_AURA_SECONDS,
  STRETCH_CLOSING_PHRASES,
  stretchAuraReady,
  stretchClosingPhrase,
  stretchDoneMinutesLabel,
  stretchBadge,
  stretchFooter,
  stretchMinutesLabel,
  stretchPlateValue,
} from '../stretchSession'

/**
 * Fase 213-15: textos y reglas puras del estiramiento sin reloj por ejercicio
 * (dosis, aviso de AURA, pantalla final).
 */

function dose(unit: StretchDose['unit'], value: number, max: number | null = null): StretchDose {
  return { unit, value, max }
}

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

describe('stretchDoneMinutesLabel (pantalla final)', () => {
  it('con duración medida dice los minutos del servidor', () => {
    expect(stretchDoneMinutesLabel({ durationSeconds: 240, minutes: 4 })).toBe(
      '4 minutos de estiramiento',
    )
    expect(stretchDoneMinutesLabel({ durationSeconds: 40, minutes: 1 })).toBe(
      '1 minuto de estiramiento',
    )
  })

  it('sin duración (el started nunca llegó) no hay cifra: "Listo." a secas', () => {
    expect(stretchDoneMinutesLabel({ durationSeconds: null, minutes: 7 })).toBeNull()
  })

  it('una duración de 0 s es una duración medida', () => {
    expect(stretchDoneMinutesLabel({ durationSeconds: 0, minutes: 1 })).toBe(
      '1 minuto de estiramiento',
    )
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

describe('stretchPlateValue (cantidad grande del pie)', () => {
  it('repeticiones sin unidad y segundos con doble prima', () => {
    expect(stretchPlateValue(dose('reps', 10))).toBe('10')
    expect(stretchPlateValue(dose('seconds', 20))).toBe('20″')
  })

  it('con rango une con guion', () => {
    expect(stretchPlateValue(dose('reps', 8, 12))).toBe('8-12')
    expect(stretchPlateValue(dose('seconds', 30, 50))).toBe('30-50″')
  })

  it('un max igual o menor que el valor no es rango', () => {
    expect(stretchPlateValue(dose('seconds', 30, 30))).toBe('30″')
    expect(stretchPlateValue(dose('reps', 10, 8))).toBe('10')
  })
})

describe('stretchFooter (pie del video, como el player del día)', () => {
  function ex(over: Partial<StretchExercise> = {}): StretchExercise {
    return {
      exerciseId: 1,
      name: 'COUCH STRETCH',
      family: 'LS',
      dose: dose('reps', 10),
      effort: 'ISO',
      videoUrl: null,
      ...over,
    }
  }

  it('insignia de la contracción, nombre y cantidad grande, sin "Ejercicio x de y"', () => {
    expect(stretchFooter(ex())).toEqual({
      kind: 'exercise',
      badge: { label: 'ISO', kind: 'iso' },
      label: null,
      name: 'COUCH STRETCH',
      value: '10',
      valueSize: 'xl',
    })
  })

  it('CON y EXC con su color', () => {
    expect(stretchFooter(ex({ effort: 'CON' }))?.badge).toEqual({ label: 'CON', kind: 'con' })
    expect(stretchFooter(ex({ effort: 'exc' }))?.badge).toEqual({ label: 'EXC', kind: 'exc' })
  })

  it('sin contracción cargada va MOV, como el descanso activo', () => {
    expect(stretchFooter(ex({ effort: null }))?.badge).toEqual({ label: 'MOV', kind: 'mov' })
    expect(stretchFooter(ex({ effort: '  ' }))?.badge).toEqual({ label: 'MOV', kind: 'mov' })
  })

  it('la lista usa la misma insignia que el pie', () => {
    for (const effort of ['ISO', 'CON', 'EXC', null]) {
      const e = ex({ effort })
      expect(stretchBadge(e)).toEqual(stretchFooter(e)?.badge)
    }
  })

  it('valores largos achican la cantidad', () => {
    expect(stretchFooter(ex({ dose: dose('seconds', 30, 50) }))?.valueSize).toBe('md')
  })

  it('sin ejercicio o sin nombre no hay pie', () => {
    expect(stretchFooter(null)).toBeNull()
    expect(stretchFooter(ex({ name: '   ' }))).toBeNull()
  })
})
