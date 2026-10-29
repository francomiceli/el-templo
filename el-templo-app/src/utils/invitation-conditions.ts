/**
 * Condiciones del programa de invitaciones para "Mis invitados" (lista aprobada por Franco,
 * 2026-10-29, `.docs/mis-invitados-condiciones.md`).
 *
 * Ningún número está fijo acá: todos llegan de la configuración por `GET /members/referrals`
 * (bloque `invitations.conditions`). Si gestión cambia un valor, la lista cambia sin pasar por
 * las tiendas. Un valor que apaga una regla (ventana en 0, % en 0) saca o reescribe su punto en
 * vez de mostrar "0 días".
 */
import { formatPrice } from './format-price'
import { formatShortDate } from './invitation-view'

/** Contrato de `invitations.conditions` (API, `InvitationConditionsView`). */
export interface InvitationConditions {
  monthlyQuota: number
  quotaRenewsOn: string
  canInvite: boolean
  cannotInviteReason: 'inviter_not_member' | 'inviter_quota_exhausted' | null
  exMemberInactivityMonths: number
  reinviteWindowDays: number
  accessesPerInvitation: number | null
  accessBusinessDays: number
  latePurchaseWindowDays: number
  inviteePercent: number
  perInviteePercent: number
  maxPercentCap: number
  discountCapAmount: { amount: number; currency: string } | null
  cancelWindowMinutes: number
}

export interface ConditionGroup {
  title: string
  icon: string
  items: string[]
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function howToInvite(c: InvitationConditions): string[] {
  const quota =
    c.monthlyQuota === 1
      ? 'Tenés 1 invitación por mes. Se renueva el 1° de cada mes y no se acumula.'
      : `Tenés ${c.monthlyQuota} invitaciones por mes. Se renuevan el 1° de cada mes y no se acumulan.`
  return [
    quota,
    'Para invitar necesitás tener tu plan vigente.',
    'Compartís tu link por WhatsApp o por donde quieras. El link es siempre el mismo y no vence.',
    'La invitación se descuenta recién cuando tu invitado la activa.',
  ]
}

function whoCanBeInvited(c: InvitationConditions): string[] {
  const items = [
    c.exMemberInactivityMonths > 0
      ? `A alguien que nunca fue socio, o que lleva ${plural(c.exMemberInactivityMonths, 'mes', 'meses')} o más sin plan.`
      : 'A alguien que nunca fue socio, o que hoy no tiene plan.',
    'Si solo hizo una clase de prueba, también puede recibir tu invitación.',
  ]
  if (c.reinviteWindowDays > 0) {
    items.push(
      `Cada persona puede recibir una sola invitación cada ${plural(c.reinviteWindowDays, 'día', 'días')}, venga de quien venga.`,
    )
  }
  return items
}

function whatTheyGet(c: InvitationConditions): string[] {
  const classes =
    c.accessesPerInvitation === null
      ? 'Clases gratis'
      : plural(c.accessesPerInvitation, 'clase gratis', 'clases gratis')
  return [
    `${classes} para usar en ${plural(c.accessBusinessDays, 'día hábil', 'días hábiles')} (de lunes a sábado, sin feriados), contando desde el día siguiente a activarla.`,
    'Puede entrenar en cualquier sede del país y reserva como cualquier activo.',
    'No incluye las actividades que tienen pase aparte.',
    `Si reserva y no va, esa clase se descuenta igual. Puede cancelar hasta ${plural(c.cancelWindowMinutes, 'minuto', 'minutos')} antes.`,
  ]
}

/** "dentro de los 30 días posteriores" / "dentro del día posterior". */
function latePurchaseWindow(days: number): string {
  return days === 1 ? 'dentro del día posterior' : `dentro de los ${days} días posteriores`
}

function discounts(c: InvitationConditions): string[] {
  const items: string[] = []
  if (c.inviteePercent > 0) {
    items.push(
      c.latePurchaseWindowDays > 0
        ? `Si tu invitado compra un plan ${latePurchaseWindow(c.latePurchaseWindowDays)} al fin de sus clases gratis, paga ${c.inviteePercent}% menos.`
        : `Si tu invitado compra un plan antes de que terminen sus clases gratis, paga ${c.inviteePercent}% menos.`,
    )
  }
  if (c.perInviteePercent > 0) {
    items.push(
      `Vos bajás ${c.perInviteePercent}% tu cuota por cada invitado con plan vigente, hasta un máximo de ${c.maxPercentCap}%. Se aplica desde tu próxima renovación.`,
    )
  }
  items.push(
    'El descuento dura mientras los dos tengan el plan vigente. Si uno corta, deja de aplicarse, y vuelve cuando retoma.',
    'No se suma con otras promos: se aplica la que te dé más descuento.',
    'No aplica en planes especiales ni paquetes, ni en el primer cobro proporcional de fin de mes.',
  )
  if (c.discountCapAmount) {
    items.push(
      `El descuento por invitaciones tiene un tope de ${formatPrice(c.discountCapAmount.amount, c.discountCapAmount.currency)} por cobro.`,
    )
  }
  items.push('Un plan pausado no cuenta como vigente mientras está pausado.')
  return items
}

/** Los 4 bloques de "Cómo funciona", en el orden aprobado. */
export function conditionGroups(c: InvitationConditions): ConditionGroup[] {
  return [
    { title: 'Cómo invitar', icon: 'send', items: howToInvite(c) },
    { title: 'A quién podés invitar', icon: 'person_add', items: whoCanBeInvited(c) },
    { title: 'Qué recibe tu invitado', icon: 'redeem', items: whatTheyGet(c) },
    { title: 'Descuentos', icon: 'local_offer', items: discounts(c) },
  ]
}

/** "Se renuevan el 01/11" (singular si el cupo es 1). */
export function quotaRenewalText(
  c: Pick<InvitationConditions, 'monthlyQuota' | 'quotaRenewsOn'>,
): string {
  const verb = c.monthlyQuota === 1 ? 'Se renueva' : 'Se renuevan'
  return `${verb} el ${formatShortDate(c.quotaRenewsOn)}`
}

/** Por qué el botón "Invitar" está deshabilitado; '' si se puede invitar. */
export function cannotInviteText(
  c: Pick<InvitationConditions, 'canInvite' | 'cannotInviteReason'>,
): string {
  if (c.canInvite) return ''
  if (c.cannotInviteReason === 'inviter_not_member') {
    return 'Para invitar necesitás tener tu plan vigente.'
  }
  return ''
}
