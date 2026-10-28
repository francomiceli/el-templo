import { describe, it, expect } from 'vitest'
import {
  resolveProfileSubscriptionView,
  type ProfileSubscriptionViewInput,
} from '../profile-subscription-view'

// Suscripción llegada, sin falla, sin plan activo, tope sin vencer.
function input(over: Partial<ProfileSubscriptionViewInput> = {}): ProfileSubscriptionViewInput {
  return {
    subscriptionLoaded: true,
    subscriptionFailed: false,
    hasActivePlan: false,
    deadlinePassed: false,
    ...over,
  }
}

describe('resolveProfileSubscriptionView', () => {
  it('con plan activo -> content', () => {
    expect(resolveProfileSubscriptionView(input({ hasActivePlan: true }))).toBe('content')
  })

  it('con plan activo y un refresco que falló -> content (último dato bueno)', () => {
    expect(
      resolveProfileSubscriptionView(input({ hasActivePlan: true, subscriptionFailed: true })),
    ).toBe('content')
  })

  it('suscripción sin llegar y sin tope -> skeleton (nunca "Sin plan activo")', () => {
    expect(resolveProfileSubscriptionView(input({ subscriptionLoaded: false }))).toBe('skeleton')
  })

  it('suscripción sin llegar y con tope vencido -> unknown', () => {
    expect(
      resolveProfileSubscriptionView(input({ subscriptionLoaded: false, deadlinePassed: true })),
    ).toBe('unknown')
  })

  it('subscriptionFailed sin suscripción, deadlinePassed false -> unknown al instante', () => {
    expect(resolveProfileSubscriptionView(input({ subscriptionFailed: true }))).toBe('unknown')
  })

  it('subscriptionFailed sin suscripción y con tope vencido -> unknown (nunca none)', () => {
    expect(
      resolveProfileSubscriptionView(input({ subscriptionFailed: true, deadlinePassed: true })),
    ).toBe('unknown')
  })

  it('llegó sin plan activo y sin falla -> none', () => {
    expect(resolveProfileSubscriptionView(input())).toBe('none')
  })

  it('"none" tampoco depende del tope: con el tope vencido y todo llegado sigue en none', () => {
    expect(resolveProfileSubscriptionView(input({ deadlinePassed: true }))).toBe('none')
  })

  it('una falla de red nunca produce none (ninguna combinación sin plan con falla la devuelve)', () => {
    for (const subscriptionLoaded of [true, false]) {
      for (const deadlinePassed of [true, false]) {
        const view = resolveProfileSubscriptionView({
          subscriptionLoaded,
          subscriptionFailed: true,
          hasActivePlan: false,
          deadlinePassed,
        })
        expect(view).not.toBe('none')
      }
    }
  })
})
