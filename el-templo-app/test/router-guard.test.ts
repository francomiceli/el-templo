import { describe, it, expect } from 'vitest'
import { resolveGuardRedirect, publicRoutes, authAgnosticRoutes } from 'src/router/guards'

// Función pura: sin pinia, sin router, sin mocks de Capacitor (mismo estilo
// que test/whatsapp.test.ts).

const BASE = {
  toPath: '/some-protected-path',
  fromName: 'home',
  isAuthenticated: false,
  role: undefined as string | undefined,
  onboardingCompleted: true,
  isFreemium: false,
  hasActiveBarAttempt: false,
}

describe('publicRoutes / authAgnosticRoutes', () => {
  it('magic-link NO está en publicRoutes', () => {
    expect(publicRoutes).not.toContain('magic-link')
    expect(authAgnosticRoutes).toContain('magic-link')
  })
})

describe('resolveGuardRedirect — auth', () => {
  it('no autenticado + ruta protegida ⇒ login', () => {
    const result = resolveGuardRedirect({ ...BASE, toName: 'reservas', isAuthenticated: false })
    expect(result).toEqual({ name: 'login' })
  })

  it('no autenticado + login/register ⇒ true', () => {
    expect(resolveGuardRedirect({ ...BASE, toName: 'login', isAuthenticated: false })).toBe(true)
    expect(resolveGuardRedirect({ ...BASE, toName: 'register', isAuthenticated: false })).toBe(true)
  })

  it('autenticado + login ⇒ home', () => {
    const result = resolveGuardRedirect({ ...BASE, toName: 'login', isAuthenticated: true })
    expect(result).toEqual({ name: 'home' })
  })
})

describe('resolveGuardRedirect — magic-link (authAgnosticRoutes, D-03/D-04)', () => {
  it('NO autenticado + ruta magic-link ⇒ true (no manda a login, el canje todavia no ocurrio)', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'magic-link',
      isAuthenticated: false,
    })
    expect(result).toBe(true)
  })

  it('autenticado + ruta magic-link ⇒ true (NO manda a home, caso D-04 "misma sesion")', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'magic-link',
      isAuthenticated: true,
    })
    expect(result).toBe(true)
  })
})

describe('resolveGuardRedirect — onboarding (D-15/D-17) y bypass D-21', () => {
  it('autenticado + member + onboarding incompleto ⇒ onboarding', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'reservas',
      isAuthenticated: true,
      role: 'member',
      onboardingCompleted: false,
      isFreemium: false,
    })
    expect(result).toEqual({ name: 'onboarding' })
  })

  it('autenticado + member + onboarding incompleto + freemium (D-21) ⇒ true, NO redirige', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'reservas',
      isAuthenticated: true,
      role: 'member',
      onboardingCompleted: false,
      isFreemium: true,
    })
    expect(result).toBe(true)
  })

  it('el bypass de D-21 NO se extiende a un socio regular (T-180-52): member NO freemium sin onboarding ⇒ onboarding', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'reservas',
      isAuthenticated: true,
      role: 'member',
      onboardingCompleted: false,
      isFreemium: false,
    })
    expect(result).toEqual({ name: 'onboarding' })
  })

  it('rol distinto de member sin onboarding ⇒ true', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'reservas',
      isAuthenticated: true,
      role: 'coach',
      onboardingCompleted: false,
      isFreemium: false,
    })
    expect(result).toBe(true)
  })

  it('ya en la propia ruta onboarding ⇒ true (no loop de redirect)', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'onboarding',
      isAuthenticated: true,
      role: 'member',
      onboardingCompleted: false,
      isFreemium: false,
    })
    expect(result).toBe(true)
  })
})

describe('resolveGuardRedirect — crash-recovery desafio-barra-timer', () => {
  it('navegacion inicial + home-bound + intento activo ⇒ desafio-barra-timer', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'home',
      toPath: '/',
      fromName: undefined,
      isAuthenticated: true,
      role: 'member',
      onboardingCompleted: true,
      hasActiveBarAttempt: true,
    })
    expect(result).toEqual({ name: 'desafio-barra-timer' })
  })

  it('navegacion NO inicial (from definido) ⇒ true, no intercepta', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'home',
      toPath: '/',
      fromName: 'reservas',
      isAuthenticated: true,
      role: 'member',
      onboardingCompleted: true,
      hasActiveBarAttempt: true,
    })
    expect(result).toBe(true)
  })

  it('navegacion inicial pero NO home-bound ⇒ true, no intercepta', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'reservas',
      toPath: '/reservas',
      fromName: undefined,
      isAuthenticated: true,
      role: 'member',
      onboardingCompleted: true,
      hasActiveBarAttempt: true,
    })
    expect(result).toBe(true)
  })

  it('navegacion inicial + home-bound + SIN intento activo ⇒ true', () => {
    const result = resolveGuardRedirect({
      ...BASE,
      toName: 'home',
      toPath: '/',
      fromName: undefined,
      isAuthenticated: true,
      role: 'member',
      onboardingCompleted: true,
      hasActiveBarAttempt: false,
    })
    expect(result).toBe(true)
  })
})
