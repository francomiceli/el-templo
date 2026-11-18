import type { InboxItem } from 'src/types/notifications-inbox'
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

/** Ícono de Material para el tipo de aviso; `null` en los regalos (llevan avatar o chispa). */
export function iconForKind(kind: string): string | null {
  if (kind === GIFT_KIND) return null
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

/** Pastilla de la fila: "+1" para un regalo vigente, "Anulado" para uno anulado, nada si no es regalo. */
export function giftPill(item: InboxItem): GiftPill | null {
  if (!item.gift) return null
  if (item.gift.status === 'anulado') return { kind: 'voided', text: 'Anulado' }
  return { kind: 'amount', text: `+${formatAura(item.gift.amount)}` }
}

/**
 * `aria-label` del botón de la fila: "Sin leer. Sofía M. te dio Aura. 18:42, Motivo: Buena
 * energía. Más 1 de Aura." (sin "Sin leer." si ya está leído; sin el monto si no es un regalo
 * vigente). `time` es el resultado de `timeLabel`.
 */
export function rowAriaLabel(item: InboxItem, time: string): string {
  const parts: string[] = []
  if (item.readAt === null) parts.push('Sin leer.')
  const when = [time, item.body.trim()].filter((p) => p !== '').join(', ')
  const head = when !== '' ? `${item.title}. ${when}` : `${item.title}.`
  parts.push(head.endsWith('.') ? head : `${head}.`)
  if (item.gift && item.gift.status === 'vigente') {
    parts.push(`Más ${formatAura(item.gift.amount)} de Aura.`)
  }
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
