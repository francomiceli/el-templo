import { describe, it, expect } from 'vitest'
import { resolveTrainingIndexView, type TrainingIndexViewInput } from '../training-index-view'

// Todo llegado, sin fallas, sin con qué entrenar, tope sin vencer: la vidriera "de verdad".
function input(over: Partial<TrainingIndexViewInput> = {}): TrainingIndexViewInput {
  return {
    profileLoaded: true,
    memberStateLoaded: true,
    subscriptionFailed: false,
    programFailed: false,
    canEnterTraining: false,
    deadlinePassed: false,
    ...over,
  }
}

describe('resolveTrainingIndexView', () => {
  it('sin perfil y sin tope -> loading', () => {
    expect(resolveTrainingIndexView(input({ profileLoaded: false }))).toBe('loading')
  })

  it("sin perfil y con el tope vencido -> 'loading' (D-08 manda sobre D-07)", () => {
    expect(resolveTrainingIndexView(input({ profileLoaded: false, deadlinePassed: true }))).toBe(
      'loading',
    )
  })

  it('sin perfil -> loading aunque el estado del socio ya haya llegado y entre', () => {
    expect(resolveTrainingIndexView(input({ profileLoaded: false, canEnterTraining: true }))).toBe(
      'loading',
    )
  })

  it('con perfil y estado del socio sin llegar, sin tope -> loading (nunca la vidriera)', () => {
    expect(resolveTrainingIndexView(input({ memberStateLoaded: false }))).toBe('loading')
  })

  it('con perfil y estado del socio sin llegar, con tope vencido -> entrenar (no la vidriera)', () => {
    expect(
      resolveTrainingIndexView(input({ memberStateLoaded: false, deadlinePassed: true })),
    ).toBe('entrenar')
  })

  it('todo llegado y canEnterTraining -> entrenar', () => {
    expect(resolveTrainingIndexView(input({ canEnterTraining: true }))).toBe('entrenar')
  })

  it('todo llegado, sin con qué entrar y sin fallas -> vidriera', () => {
    expect(resolveTrainingIndexView(input())).toBe('vidriera')
  })

  it('la vidriera no depende del tope: con el tope vencido y todo llegado sigue siendo vidriera', () => {
    expect(resolveTrainingIndexView(input({ deadlinePassed: true }))).toBe('vidriera')
  })

  it('subscriptionFailed sin tope y sin con qué entrar -> entrenar al instante (no "sin plan")', () => {
    expect(resolveTrainingIndexView(input({ subscriptionFailed: true }))).toBe('entrenar')
  })

  it('subscriptionFailed con tope vencido -> entrenar', () => {
    expect(
      resolveTrainingIndexView(input({ subscriptionFailed: true, deadlinePassed: true })),
    ).toBe('entrenar')
  })

  it('programFailed sin tope y sin con qué entrar -> entrenar al instante (solo-online con inscripciones caídas)', () => {
    expect(resolveTrainingIndexView(input({ programFailed: true }))).toBe('entrenar')
  })

  it('programFailed con tope vencido -> entrenar', () => {
    expect(resolveTrainingIndexView(input({ programFailed: true, deadlinePassed: true }))).toBe(
      'entrenar',
    )
  })

  it('una falla con el dato previo que alcanza (canEnterTraining) -> entrenar', () => {
    expect(
      resolveTrainingIndexView(
        input({ programFailed: true, subscriptionFailed: true, canEnterTraining: true }),
      ),
    ).toBe('entrenar')
  })

  it('una falla no salta la espera del perfil: sin perfil y programFailed -> loading', () => {
    expect(resolveTrainingIndexView(input({ profileLoaded: false, programFailed: true }))).toBe(
      'loading',
    )
  })

  it('una falla de red nunca produce vidriera (ninguna combinación con falla la devuelve)', () => {
    for (const subscriptionFailed of [true, false]) {
      for (const programFailed of [true, false]) {
        if (!subscriptionFailed && !programFailed) continue
        for (const deadlinePassed of [true, false]) {
          for (const canEnterTraining of [true, false]) {
            for (const memberStateLoaded of [true, false]) {
              for (const profileLoaded of [true, false]) {
                const view = resolveTrainingIndexView({
                  profileLoaded,
                  memberStateLoaded,
                  subscriptionFailed,
                  programFailed,
                  canEnterTraining,
                  deadlinePassed,
                })
                expect(view).not.toBe('vidriera')
              }
            }
          }
        }
      }
    }
  })
})
