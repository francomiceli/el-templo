import { describe, it, expect } from 'vitest'
import { resolveSemanaCta, type SemanaCtaInput } from '../semanaCta'

// Viernes 16 de octubre de 2026 es "hoy" de la sede (cálculo puro: no usa el reloj).
const TODAY = '2026-10-16'

function input(over: Partial<SemanaCtaInput>): SemanaCtaInput {
  return {
    date: TODAY,
    today: TODAY,
    hasSession: true,
    isSunday: false,
    completed: false,
    hasProgress: false,
    libreEnabled: true,
    ...over,
  }
}

describe('resolveSemanaCta (D-03)', () => {
  it('hoy sin progreso: Empezar', () => {
    expect(resolveSemanaCta(input({}))).toEqual({
      showButton: true,
      label: 'Empezar',
      variant: 'primary',
      action: 'start',
      startsTraining: true,
      showDoneChip: false,
      showLibreLink: false,
      hint: null,
    })
  })

  it('hoy con progreso guardado: Continuar', () => {
    const r = resolveSemanaCta(input({ hasProgress: true }))
    expect(r.label).toBe('Continuar')
    expect(r.variant).toBe('primary')
    expect(r.action).toBe('start')
    expect(r.startsTraining).toBe(true)
  })

  it('hoy completada: Ver resumen secundario, chip Hecha y link a Libre', () => {
    const r = resolveSemanaCta(input({ completed: true, hasProgress: true }))
    expect(r.label).toBe('Ver resumen')
    expect(r.variant).toBe('secondary')
    expect(r.action).toBe('summary')
    expect(r.startsTraining).toBe(false)
    expect(r.showDoneChip).toBe(true)
    expect(r.showLibreLink).toBe(true)
  })

  it('día pasado sin completar: sin botón (solo se entrena el día de hoy)', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-14' }))
    expect(r.showButton).toBe(false)
    expect(r.action).toBeNull()
    expect(r.startsTraining).toBe(false)
    expect(r.showDoneChip).toBe(false)
    expect(r.showLibreLink).toBe(false)
    expect(r.hint).toBeNull()
  })

  it('día pasado completado: sin botón ni link a Libre, pero con el chip Hecha', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-14', completed: true }))
    expect(r.showButton).toBe(false)
    expect(r.action).toBeNull()
    expect(r.showDoneChip).toBe(true)
    expect(r.showLibreLink).toBe(false)
  })

  it('día pasado sin plani: sin botón ni hint', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-14', hasSession: false }))
    expect(r.showButton).toBe(false)
    expect(r.action).toBeNull()
    expect(r.hint).toBeNull()
  })

  it('hoy y días futuros siguen con botón', () => {
    expect(resolveSemanaCta(input({})).showButton).toBe(true)
    expect(resolveSemanaCta(input({ date: '2026-10-17' })).showButton).toBe(true)
  })

  it('día futuro: "Disponible el sábado", no disponible y sin acción', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-17' }))
    expect(r.label).toBe('Disponible el sábado')
    expect(r.variant).toBe('unavailable')
    expect(r.action).toBeNull()
    expect(r.startsTraining).toBe(false)
  })

  it('domingo sin plani: Elegir un bloque libre con el hint del domingo', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-18', hasSession: false, isSunday: true }))
    expect(r.label).toBe('Elegir un bloque libre')
    expect(r.action).toBe('libre')
    expect(r.startsTraining).toBe(false)
    expect(r.hint).toContain('Domingo sin plani')
  })

  it('otro día sin plani: hint de plani no cargada', () => {
    const r = resolveSemanaCta(input({ hasSession: false }))
    expect(r.label).toBe('Elegir un bloque libre')
    expect(r.action).toBe('libre')
    expect(r.startsTraining).toBe(false)
    expect(r.hint).toContain('Todavía no está la plani de este día')
  })

  it('sin plani gana sobre futuro: lleva a Libre', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-17', hasSession: false }))
    expect(r.action).toBe('libre')
    expect(r.variant).toBe('primary')
  })
})

describe('resolveSemanaCta — Libre apagado (FREE_BLOCKS_ENABLED en false)', () => {
  it('domingo sin plani: "Día de descanso", deshabilitado, sin acción ni hint', () => {
    const r = resolveSemanaCta(
      input({ date: '2026-10-18', hasSession: false, isSunday: true, libreEnabled: false }),
    )
    expect(r).toEqual({
      showButton: true,
      label: 'Día de descanso',
      variant: 'unavailable',
      action: null,
      startsTraining: false,
      showDoneChip: false,
      showLibreLink: false,
      hint: null,
    })
  })

  it('otro día sin plani: "Todavía sin plani", deshabilitado, sin acción ni hint', () => {
    const r = resolveSemanaCta(input({ hasSession: false, libreEnabled: false }))
    expect(r.label).toBe('Todavía sin plani')
    expect(r.variant).toBe('unavailable')
    expect(r.action).toBeNull()
    expect(r.hint).toBeNull()
  })

  it('completada hoy: "Ver resumen" sin el link a bloque libre', () => {
    const r = resolveSemanaCta(input({ completed: true, libreEnabled: false }))
    expect(r.action).toBe('summary')
    expect(r.showDoneChip).toBe(true)
    expect(r.showLibreLink).toBe(false)
  })

  it('ningún estado lleva a Libre ni la menciona', () => {
    const cases: Partial<SemanaCtaInput>[] = [
      {},
      { hasProgress: true },
      { completed: true },
      { date: '2026-10-14' },
      { date: '2026-10-14', completed: true },
      { date: '2026-10-17' },
      { hasSession: false },
      { date: '2026-10-18', hasSession: false, isSunday: true },
      { date: '2026-10-17', hasSession: false },
    ]
    for (const c of cases) {
      const r = resolveSemanaCta(input({ ...c, libreEnabled: false }))
      expect(r.action).not.toBe('libre')
      expect(r.showLibreLink).toBe(false)
      expect(`${r.label} ${r.hint ?? ''}`.toLowerCase()).not.toContain('libre')
    }
  })
})
