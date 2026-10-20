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
    ...over,
  }
}

describe('resolveSemanaCta (D-03)', () => {
  it('hoy sin progreso: Empezar', () => {
    expect(resolveSemanaCta(input({}))).toEqual({
      label: 'Empezar',
      variant: 'primary',
      action: 'start',
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
  })

  it('hoy completada: Ver resumen secundario, chip Hecha y link a Libre', () => {
    const r = resolveSemanaCta(input({ completed: true, hasProgress: true }))
    expect(r.label).toBe('Ver resumen')
    expect(r.variant).toBe('secondary')
    expect(r.action).toBe('summary')
    expect(r.showDoneChip).toBe(true)
    expect(r.showLibreLink).toBe(true)
  })

  it('día pasado sin completar: Hacerla igual (start)', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-14' }))
    expect(r.label).toBe('Hacerla igual')
    expect(r.variant).toBe('primary')
    expect(r.action).toBe('start')
    expect(r.showDoneChip).toBe(false)
  })

  it('día pasado completado: Hacerla igual (redo) con chip y sin link', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-14', completed: true }))
    expect(r.label).toBe('Hacerla igual')
    expect(r.action).toBe('redo')
    expect(r.showDoneChip).toBe(true)
    expect(r.showLibreLink).toBe(false)
  })

  it('día futuro: "Disponible el sábado", no disponible y sin acción', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-17' }))
    expect(r.label).toBe('Disponible el sábado')
    expect(r.variant).toBe('unavailable')
    expect(r.action).toBeNull()
  })

  it('domingo sin plani: Elegir un bloque libre con el hint del domingo', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-18', hasSession: false, isSunday: true }))
    expect(r.label).toBe('Elegir un bloque libre')
    expect(r.action).toBe('libre')
    expect(r.hint).toContain('Domingo sin plani')
  })

  it('otro día sin plani: hint de plani no cargada', () => {
    const r = resolveSemanaCta(input({ hasSession: false }))
    expect(r.label).toBe('Elegir un bloque libre')
    expect(r.action).toBe('libre')
    expect(r.hint).toContain('Todavía no está la plani de este día')
  })

  it('sin plani gana sobre futuro: lleva a Libre', () => {
    const r = resolveSemanaCta(input({ date: '2026-10-17', hasSession: false }))
    expect(r.action).toBe('libre')
    expect(r.variant).toBe('primary')
  })
})
