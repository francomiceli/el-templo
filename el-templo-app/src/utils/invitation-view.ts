/**
 * Presentación pura de "Mis invitados" (Fase 194, plan 27).
 *
 * El estado de cada invitado, el cupo, los accesos y el link los DERIVA el servidor
 * (194-19): acá solo se rotulan. Ningún número (cupo, accesos, vigencia) está
 * hardcodeado: todo llega por parámetro.
 *
 * Paleta de marca (quasar.variables.scss), sin azul: `info` = Olive Stone,
 * `secondary` = Clay, `warning` = dorado oscuro, `positive` = verde cálido.
 */

export type InviteeState = 'socio_activo' | 'inactivo' | 'vencido' | 'entrenando' | 'invitado'

interface StateMeta {
  label: string
  color: string
}

const STATE_META: Record<InviteeState, StateMeta> = {
  invitado: { label: 'Invitado', color: 'info' },
  entrenando: { label: 'Entrenando', color: 'secondary' },
  vencido: { label: 'Vencido', color: 'warning' },
  socio_activo: { label: 'Socio activo', color: 'positive' },
  inactivo: { label: 'Inactivo', color: 'grey-7' },
}

export function inviteeStateLabel(state: InviteeState): string {
  return STATE_META[state].label
}

export function inviteeStateColor(state: InviteeState): string {
  return STATE_META[state].color
}

export type InvitedByStage = 'invitado' | 'entrenando' | 'vencido' | 'convertido'

const STAGE_META: Record<InvitedByStage, StateMeta> = {
  invitado: { label: 'Invitado', color: 'info' },
  entrenando: { label: 'Entrenando', color: 'secondary' },
  vencido: { label: 'Vencido', color: 'warning' },
  convertido: { label: 'Ya sos socio', color: 'positive' },
}

/** Etapa de MI invitación ("Te invitó ..."): la deriva el servidor, acá solo se rotula. */
export function invitedByStageLabel(stage: InvitedByStage): string {
  return STAGE_META[stage].label
}

export function invitedByStageColor(stage: InvitedByStage): string {
  return STAGE_META[stage].color
}

/**
 * Texto del cupo mensual. Singular/plural según `limit` y `remaining`.
 * `remaining` en 0 explica que ya se usó el cupo (el botón queda deshabilitado).
 */
export function quotaText(quota: { remaining: number; limit: number }): string {
  const { remaining, limit } = quota
  const noun = limit === 1 ? 'invitación' : 'invitaciones'
  if (remaining <= 0) {
    return limit === 1
      ? 'Ya usaste tu invitación de este mes'
      : `Ya usaste tus ${limit} invitaciones de este mes`
  }
  const verb = remaining === 1 ? 'Te queda' : 'Te quedan'
  return `${verb} ${remaining} de ${limit} ${noun} este mes`
}

/** "1 de 3 accesos usados"; sin accesos (vínculo heredado) devuelve ''. */
export function accessesText(used: number | null, budget: number | null): string {
  if (used === null || budget === null) return ''
  return `${used} de ${budget} ${budget === 1 ? 'acceso usado' : 'accesos usados'}`
}

/** 'YYYY-MM-DD' → '31/10' (sin pasar por Date: evita corrimientos por zona horaria). */
export function formatShortDate(ymd: string | null): string {
  if (!ymd) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!match) return ymd
  return `${match[3]}/${match[2]}`
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * 'YYYY-MM-DD' → 'viernes 31 de octubre'. Nombres armados a mano (no `toLocaleDateString`: el
 * formato de ICU cambia entre WebViews) y día calendario calculado en UTC: el día del servidor no
 * corre por la zona horaria del teléfono.
 */
export function formatLongDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!match) return ymd
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const weekday = new Date(Date.UTC(Number(match[1]), month, day, 12)).getUTCDay()
  return `${WEEKDAYS[weekday]} ${day} de ${MONTHS[month]}`
}

/** "Vence 31/10"; null → ''. */
export function expiryText(ymd: string | null): string {
  const short = formatShortDate(ymd)
  return short ? `Vence ${short}` : ''
}

/** Descuento vigente por invitaciones: "10% (2 invitados activos)". */
export function discountText(percent: number, activeInvitees: number): string {
  if (percent <= 0) return 'Todavía no tenés descuento activo'
  const who = activeInvitees === 1 ? '1 invitado activo' : `${activeInvitees} invitados activos`
  return `Estás pagando ${percent}% menos (${who})`
}

/** Mensaje para compartir (share sheet). Sin cantidades: el detalle lo muestra la app al activar. */
export function shareMessage(firstName: string | null, url: string): string {
  const intro = firstName ? `Soy ${firstName} y te invito` : 'Te invito'
  return `${intro} a entrenar en El Templo. Activá tu invitación y probá gratis: ${url}`
}

/**
 * Nombre de quien me invitó para mostrar en la app: "nombre de pila + inicial del apellido"
 * ("María Pérez" → "María P."), igual que la lista "Invitaste a" (T-194-63). El servidor manda el
 * nombre completo (lo usa también la ficha del admin): acá se toma la primera palabra como nombre
 * y la inicial de la última como apellido. Un solo nombre queda tal cual.
 */
export function inviterDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const initial = parts[parts.length - 1].charAt(0).toUpperCase()
  return `${parts[0]} ${initial}.`
}
