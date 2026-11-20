import type { InboxGift, InboxItem } from 'src/types/notifications-inbox'
import { formatAura, formatMovementDate } from 'src/utils/aura-format'
import { DEFAULT_BRANCH_TZ, todayInTz } from 'src/utils/tz'

/**
 * Vista de la bandeja de notificaciones (fase 215, plan 17, UI-SPEC Pantallas 3 y 4).
 * Todo es puro: el reloj y la zona de la sede entran por parámetro. Los componentes (campana y
 * pantalla, planes 18 y 19) solo pintan lo que devuelven estas funciones.
 */

/** Un día de la lista: `key` es la fecha local de la sede (YYYY-MM-DD). */
export interface InboxDaySection {
  key: string
  label: string
  items: InboxItem[]
}

/**
 * Agrupa los avisos por día local de la sede, en el orden en que llegan (la API ya los manda del
 * más nuevo al más viejo): una sección nueva cada vez que cambia el día, sin reordenar nada.
 * La etiqueta sale del mismo formateador que el detalle de Aura ("Hoy", "Ayer", "Lun 10 nov").
 */
export function groupByDay(
  items: InboxItem[],
  tz: string,
  now: Date = new Date(),
): InboxDaySection[] {
  const sections: InboxDaySection[] = []
  for (const item of items) {
    const created = new Date(item.createdAt)
    const valid = !Number.isNaN(created.getTime())
    const key = valid ? todayInTz(tz, created) : ''
    const last = sections[sections.length - 1]
    if (last && last.key === key) {
      last.items.push(item)
      continue
    }
    sections.push({
      key,
      label: valid ? formatMovementDate(item.createdAt, tz, now) : '',
      items: [item],
    })
  }
  return sections
}

/** "18:42": hora de la sede en 24 h con cero a la izquierda; zona inválida cae en Buenos Aires. */
export function timeLabel(createdAt: string, tz: string): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date)
  try {
    return format(tz)
  } catch {
    return format(DEFAULT_BRANCH_TZ)
  }
}

// Map y no objeto: un tipo llamado `constructor` no tiene que devolver una función.
const KIND_ICONS = new Map<string, string>([
  ['entrenamiento', 'event_available'],
  ['programas', 'school'],
  ['motivacion', 'self_improvement'],
  ['anuncios', 'campaign'],
  ['planes', 'card_membership'],
  ['referidos', 'group_add'],
])

const GIFT_KIND = 'aura_gift'
/** Aura celebrada en pantalla que queda en la bandeja (foto de perfil, rachas, programas...). */
const AURA_KIND = 'aura'

/**
 * Ícono de Material para el tipo de aviso; `null` en los de Aura (regalos y Aura celebrada), que
 * llevan la chispa ✦ (o la cara de quien regaló).
 */
export function iconForKind(kind: string): string | null {
  if (kind === GIFT_KIND || kind === AURA_KIND) return null
  return KIND_ICONS.get(kind) ?? 'notifications'
}

/** Texto del badge de la campana: nada con 0, el número hasta 9 y "9+" de 10 en adelante. */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count >= 10 ? '9+' : String(Math.trunc(count))
}

/** `aria-label` de la campana ("Notificaciones, 3 sin leer"). */
export function bellAriaLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return 'Notificaciones'
  return `Notificaciones, ${Math.trunc(count)} sin leer`
}

export interface GiftPill {
  kind: 'amount' | 'voided'
  text: string
}

/**
 * Ids de los avisos que eran nuevos (sin leer) al entrar a la pantalla (#35). Al abrir Notificaciones
 * se marcan todos como leídos, así que el resaltado se calcula una sola vez con lo que llegó sin leer.
 */
export function unreadIds(items: readonly InboxItem[]): Set<number> {
  return new Set(items.filter((item) => item.readAt === null).map((item) => item.id))
}

/**
 * Texto de un regalo anulado con su motivo (#28, #37): "Anulado: la asistencia se corrigió" si se
 * deshizo o anuló la asistencia, "Anulado por el staff" si lo anuló el staff y "Anulado" sin causa
 * (dato viejo).
 */
export function voidedText(cause: InboxGift['voidCause'] | undefined): string {
  if (cause === 'asistencia') return 'Anulado: la asistencia se corrigió'
  if (cause === 'staff') return 'Anulado por el staff'
  return 'Anulado'
}

/**
 * Pastilla de la fila: "+1" para un regalo vigente, "Anulado" con su motivo para uno anulado, nada
 * si no es regalo.
 */
export function giftPill(item: InboxItem): GiftPill | null {
  if (!item.gift) return null
  if (item.gift.status === 'anulado') {
    return { kind: 'voided', text: voidedText(item.gift.voidCause) }
  }
  return { kind: 'amount', text: `+${formatAura(item.gift.amount)}` }
}

/**
 * `aria-label` del botón de la fila: "Sin leer. Sofía M. te dio Aura. 18:42, Motivo: Buena
 * energía. Más 1 de Aura." (sin "Sin leer." si ya está leído; sin el monto si no es un regalo
 * vigente). `time` es el resultado de `timeLabel`.
 */
export function rowAriaLabel(
  item: InboxItem,
  time: string,
  isUnread: boolean = item.readAt === null,
): string {
  const parts: string[] = []
  if (isUnread) parts.push('Sin leer.')
  const when = [time, item.body.trim()].filter((p) => p !== '').join(', ')
  const head = when !== '' ? `${item.title}. ${when}` : `${item.title}.`
  parts.push(head.endsWith('.') ? head : `${head}.`)
  if (item.gift && item.gift.status === 'vigente') {
    parts.push(`Más ${formatAura(item.gift.amount)} de Aura.`)
  }
  if (item.gift && item.gift.status === 'anulado') parts.push(`${voidedText(item.gift.voidCause)}.`)
  return parts.join(' ')
}

/**
 * Arma el mismo `Record<string, string>` que trae una push para que `resolveTapRoute` decida el
 * destino con la misma regla (misma lista de secciones, nunca un 404). Omite los campos nulos o
 * vacíos.
 */
export function tapData(item: InboxItem): Record<string, string> {
  const data: Record<string, string> = {}
  if (item.route) data.route = item.route
  if (item.destination) data.destination = item.destination
  if (item.destinationSection) data.destinationSection = item.destinationSection
  if (item.whatsappText) data.whatsappText = item.whatsappText
  return data
}
