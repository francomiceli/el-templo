import { describe, it, expect } from 'vitest'
import {
  conditionGroups,
  quotaRenewalText,
  cannotInviteText,
  type InvitationConditions,
} from '../invitation-conditions'

const DEFAULTS: InvitationConditions = {
  monthlyQuota: 2,
  quotaRenewsOn: '2026-11-01',
  canInvite: true,
  cannotInviteReason: null,
  exMemberInactivityMonths: 6,
  reinviteWindowDays: 90,
  accessesPerInvitation: 3,
  accessBusinessDays: 10,
  latePurchaseWindowDays: 30,
  inviteePercent: 10,
  perInviteePercent: 10,
  maxPercentCap: 40,
  discountCapAmount: null,
  cancelWindowMinutes: 20,
}

function itemsOf(c: InvitationConditions): string[][] {
  return conditionGroups(c).map((g) => g.items)
}

describe('invitation-conditions (lista aprobada 2026-10-29)', () => {
  it('con los valores por defecto arma los 4 bloques con el texto aprobado', () => {
    const groups = conditionGroups(DEFAULTS)
    expect(groups.map((g) => g.title)).toEqual([
      'Cómo invitar',
      'A quién podés invitar',
      'Qué recibe tu invitado',
      'Descuentos',
    ])
    expect(groups[0].items).toEqual([
      'Tenés 2 invitaciones por mes. Se renuevan el 1° de cada mes y no se acumulan.',
      'Para invitar necesitás tener tu plan vigente.',
      'Compartís tu link por WhatsApp o por donde quieras. El link es siempre el mismo y no vence.',
      'La invitación se descuenta recién cuando tu invitado la activa.',
    ])
    expect(groups[1].items).toEqual([
      'A alguien que nunca fue socio, o que lleva 6 meses o más sin plan.',
      'Si solo hizo una clase de prueba, también puede recibir tu invitación.',
      'Cada persona puede recibir una sola invitación cada 90 días, venga de quien venga.',
    ])
    expect(groups[2].items).toEqual([
      '3 clases gratis para usar en 10 días hábiles (de lunes a sábado, sin feriados), contando desde el día siguiente a activarla.',
      'Puede entrenar en cualquier sede del país y reserva como cualquier activo.',
      'No incluye las actividades que tienen pase aparte.',
      'Si reserva y no va, esa clase se descuenta igual. Puede cancelar hasta 20 minutos antes.',
    ])
    expect(groups[3].items).toEqual([
      'Si tu invitado compra un plan dentro de los 30 días posteriores al fin de sus clases gratis, paga 10% menos.',
      'Vos bajás 10% tu cuota por cada invitado con plan vigente, hasta un máximo de 40%. Se aplica desde tu próxima renovación.',
      'El descuento dura mientras los dos tengan el plan vigente. Si uno corta, deja de aplicarse, y vuelve cuando retoma.',
      'No se suma con otras promos: se aplica la que te dé más descuento.',
      'No aplica en planes especiales ni paquetes, ni en el primer cobro proporcional de fin de mes.',
      'Un plan pausado no cuenta como vigente mientras está pausado.',
    ])
  })

  it('los números salen de la configuración, no del texto', () => {
    const [invite, who, gets, disc] = itemsOf({
      ...DEFAULTS,
      monthlyQuota: 4,
      exMemberInactivityMonths: 3,
      reinviteWindowDays: 60,
      accessesPerInvitation: 5,
      accessBusinessDays: 15,
      latePurchaseWindowDays: 45,
      inviteePercent: 15,
      perInviteePercent: 5,
      maxPercentCap: 25,
      cancelWindowMinutes: 30,
    })
    expect(invite[0]).toContain('Tenés 4 invitaciones por mes')
    expect(who[0]).toContain('lleva 3 meses o más')
    expect(who[2]).toContain('cada 60 días')
    expect(gets[0]).toMatch(/^5 clases gratis para usar en 15 días hábiles/)
    expect(gets[3]).toContain('hasta 30 minutos antes')
    expect(disc[0]).toContain('dentro de los 45 días')
    expect(disc[0]).toContain('paga 15% menos')
    expect(disc[1]).toContain('Vos bajás 5% tu cuota')
    expect(disc[1]).toContain('máximo de 25%')
  })

  it('usa singular cuando el valor es 1', () => {
    const [invite, who, gets, disc] = itemsOf({
      ...DEFAULTS,
      monthlyQuota: 1,
      exMemberInactivityMonths: 1,
      reinviteWindowDays: 1,
      accessesPerInvitation: 1,
      accessBusinessDays: 1,
      latePurchaseWindowDays: 1,
      cancelWindowMinutes: 1,
    })
    expect(invite[0]).toBe(
      'Tenés 1 invitación por mes. Se renueva el 1° de cada mes y no se acumula.',
    )
    expect(who[0]).toContain('lleva 1 mes o más')
    expect(who[2]).toContain('cada 1 día,')
    expect(gets[0]).toMatch(/^1 clase gratis para usar en 1 día hábil /)
    expect(gets[3]).toContain('hasta 1 minuto antes')
    expect(disc[0]).toContain('compra un plan dentro del día posterior al fin de sus clases gratis')
  })

  it('un valor en 0 saca o reescribe su punto en vez de decir "0 días"', () => {
    const [, who, , disc] = itemsOf({
      ...DEFAULTS,
      exMemberInactivityMonths: 0,
      reinviteWindowDays: 0,
      latePurchaseWindowDays: 0,
    })
    expect(who).toEqual([
      'A alguien que nunca fue socio, o que hoy no tiene plan.',
      'Si solo hizo una clase de prueba, también puede recibir tu invitación.',
    ])
    expect(disc[0]).toBe(
      'Si tu invitado compra un plan antes de que terminen sus clases gratis, paga 10% menos.',
    )
    expect(itemsOf({ ...DEFAULTS, inviteePercent: 0 })[3][0]).toMatch(/^Vos bajás/)
    expect(itemsOf({ ...DEFAULTS, perInviteePercent: 0 })[3][1]).toMatch(/^El descuento dura/)
    for (const items of itemsOf({
      ...DEFAULTS,
      reinviteWindowDays: 0,
      latePurchaseWindowDays: 0,
    })) {
      for (const item of items) expect(item).not.toMatch(/\b0 (días|meses)/)
    }
  })

  it('sin plan Invitación para el país no inventa la cantidad de clases', () => {
    const gets = itemsOf({ ...DEFAULTS, accessesPerInvitation: null })[2]
    expect(gets[0]).toMatch(/^Clases gratis para usar en 10 días hábiles/)
  })

  it('el tope en dinero aparece solo si gestión lo cargó, con la moneda del país', () => {
    const sinTope = itemsOf(DEFAULTS)[3]
    expect(sinTope.some((i) => i.includes('tope de'))).toBe(false)

    const conTope = itemsOf({
      ...DEFAULTS,
      discountCapAmount: { amount: 15000, currency: 'ARS' },
    })[3]
    const capItem = conTope.find((i) => i.includes('tope de'))
    expect(capItem).toMatch(
      /^El descuento por invitaciones tiene un tope de \$\s?15\.000 por cobro\.$/,
    )
    // El pausado sigue siendo el último punto.
    expect(conTope[conTope.length - 1]).toBe(
      'Un plan pausado no cuenta como vigente mientras está pausado.',
    )
  })

  it('quotaRenewalText dice cuándo se renueva el cupo', () => {
    expect(quotaRenewalText({ monthlyQuota: 2, quotaRenewsOn: '2026-11-01' })).toBe(
      'Se renuevan el 01/11',
    )
    expect(quotaRenewalText({ monthlyQuota: 1, quotaRenewsOn: '2027-01-01' })).toBe(
      'Se renueva el 01/01',
    )
  })

  it('cannotInviteText explica solo la falta de plan (el cupo agotado ya lo dice el titular)', () => {
    expect(cannotInviteText({ canInvite: true, cannotInviteReason: null })).toBe('')
    expect(cannotInviteText({ canInvite: false, cannotInviteReason: 'inviter_not_member' })).toBe(
      'Para invitar necesitás tener tu plan vigente.',
    )
    expect(
      cannotInviteText({ canInvite: false, cannotInviteReason: 'inviter_quota_exhausted' }),
    ).toBe('')
  })
})
