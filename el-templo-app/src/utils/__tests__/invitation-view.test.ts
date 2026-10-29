import { describe, it, expect } from 'vitest'
import {
  inviteeStateLabel,
  inviteeStateTone,
  quotaText,
  accessesText,
  formatShortDate,
  formatLongDate,
  expiryText,
  discountText,
  invitedByStageLabel,
  invitedByStageTone,
  inviteeDiscountNote,
  activeInviteesText,
  shareMessage,
  inviterDisplayName,
  type InviteeState,
} from '../invitation-view'

const ALL_STATES: InviteeState[] = ['invitado', 'entrenando', 'vencido', 'socio_activo', 'inactivo']

describe('invitation-view (Fase 194-27)', () => {
  it('rotula los 5 estados derivados por el servidor', () => {
    expect(inviteeStateLabel('invitado')).toBe('Invitado')
    expect(inviteeStateLabel('entrenando')).toBe('Entrenando')
    expect(inviteeStateLabel('vencido')).toBe('Vencido')
    expect(inviteeStateLabel('socio_activo')).toBe('Socio activo')
    expect(inviteeStateLabel('inactivo')).toBe('Inactivo')
  })

  it('cada estado tiene su tono de pill del rework', () => {
    expect(ALL_STATES.map(inviteeStateTone)).toEqual(['neutral', 'terra', 'warn', 'ok', 'bad'])
  })

  it('rotula las 4 etapas de la propia invitación con colores cálidos', () => {
    expect(invitedByStageLabel('invitado')).toBe('Invitado')
    expect(invitedByStageLabel('entrenando')).toBe('Entrenando')
    expect(invitedByStageLabel('vencido')).toBe('Vencido')
    expect(invitedByStageLabel('convertido')).toBe('Ya sos socio')
    expect(invitedByStageTone('convertido')).toBe('ok')
    expect(invitedByStageTone('invitado')).toBe('neutral')
    expect(invitedByStageTone('entrenando')).toBe('terra')
    expect(invitedByStageTone('vencido')).toBe('warn')
  })

  it('quotaText con singular y plural', () => {
    expect(quotaText({ remaining: 1, limit: 2 })).toBe('Te queda 1 de 2 invitaciones este mes')
    expect(quotaText({ remaining: 2, limit: 2 })).toBe('Te quedan 2 de 2 invitaciones este mes')
    expect(quotaText({ remaining: 1, limit: 1 })).toBe('Te queda 1 de 1 invitación este mes')
  })

  it('quotaText sin cupo explica que ya se usó, con el límite del servidor', () => {
    expect(quotaText({ remaining: 0, limit: 2 })).toBe('Ya usaste tus 2 invitaciones de este mes')
    expect(quotaText({ remaining: 0, limit: 5 })).toBe('Ya usaste tus 5 invitaciones de este mes')
    expect(quotaText({ remaining: 0, limit: 1 })).toBe('Ya usaste tu invitación de este mes')
  })

  it('accessesText usa N del servidor y devuelve vacío sin accesos', () => {
    expect(accessesText(1, 3)).toBe('1 de 3 accesos usados')
    expect(accessesText(0, 4)).toBe('0 de 4 accesos usados')
    expect(accessesText(null, null)).toBe('')
    expect(accessesText(1, null)).toBe('')
  })

  it('formatShortDate y expiryText no dependen de la zona horaria', () => {
    expect(formatShortDate('2026-10-31')).toBe('31/10')
    expect(formatShortDate(null)).toBe('')
    expect(formatShortDate('basura')).toBe('basura')
    expect(expiryText('2026-01-05')).toBe('Vence 05/01')
    expect(expiryText(null)).toBe('')
  })

  it('formatLongDate arma el día calendario del servidor sin corrimientos', () => {
    expect(formatLongDate('2026-10-30')).toBe('viernes 30 de octubre')
    expect(formatLongDate('2026-01-01')).toBe('jueves 1 de enero')
    expect(formatLongDate('basura')).toBe('basura')
  })

  it('discountText con y sin descuento', () => {
    expect(discountText(10)).toBe('Estás pagando 10% menos')
    expect(discountText(0)).toBe('Todavía no tenés descuento activo')
  })

  it('activeInviteesText con singular, plural y sin invitados', () => {
    expect(activeInviteesText(1)).toBe('1 invitado activo suma a tu descuento')
    expect(activeInviteesText(3)).toBe('3 invitados activos suman a tu descuento')
    expect(activeInviteesText(0)).toBe('')
  })

  it('inviteeDiscountNote aclara quién suma y quién no', () => {
    const suma = { userId: 1, state: 'socio_activo' as const, sumaDescuento: true }
    const noSuma = { userId: 2, state: 'socio_activo' as const, sumaDescuento: false }
    const entrenando = { userId: 3, state: 'entrenando' as const, sumaDescuento: false }
    const all = [suma, noSuma, entrenando]
    expect(inviteeDiscountNote(suma, all)).toBe('Suma a tu descuento')
    expect(inviteeDiscountNote(noSuma, all)).toBe('No suma a tu descuento')
    expect(inviteeDiscountNote(entrenando, all)).toBe('')
  })

  it('inviteeDiscountNote no dice "No suma" en la fila vieja de alguien que ya suma', () => {
    const latest = { userId: 7, state: 'socio_activo' as const, sumaDescuento: true }
    const older = { userId: 7, state: 'socio_activo' as const, sumaDescuento: false }
    expect(inviteeDiscountNote(older, [latest, older])).toBe('')
  })

  it('shareMessage incluye la URL, personaliza con el nombre y nunca dice "referido"', () => {
    const url = 'https://app.eltemplo.org/invitacion/ABC123'
    const withName = shareMessage('Valen', url)
    expect(withName).toContain(url)
    expect(withName).toContain('Valen')
    expect(withName.toLowerCase()).not.toContain('referid')
    const anon = shareMessage(null, url)
    expect(anon).toContain(url)
    expect(anon).not.toContain('null')
    expect(anon.toLowerCase()).not.toContain('referid')
  })

  it('shareMessage no hardcodea cantidades de accesos ni de días', () => {
    const msg = shareMessage('Valen', 'https://x.test/invitacion/A')
    expect(msg).not.toMatch(/\b\d+ (accesos|días|dias)/)
  })

  it('inviterDisplayName muestra nombre + inicial del apellido (LO-05)', () => {
    expect(inviterDisplayName('María Pérez')).toBe('María P.')
    expect(inviterDisplayName('  juan   carlos   gómez ')).toBe('juan G.')
    expect(inviterDisplayName('Valen')).toBe('Valen')
    expect(inviterDisplayName('')).toBe('')
    expect(inviterDisplayName('   ')).toBe('')
  })
})
