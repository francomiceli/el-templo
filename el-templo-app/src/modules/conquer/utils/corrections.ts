import type { CorrectionLimits, CorrectionTarget, CorrectionView } from '../types'

// Fase 202 DA-47: agrupar y rotular las correcciones del alumno. Puro (solo tipos).

export interface GroupedCorrections {
  pending: CorrectionView[]
  answered: CorrectionView[]
}

export type CorrectionChipTone = 'espera' | 'nueva' | 'hecha'

export interface CorrectionChip {
  label: string
  tone: CorrectionChipTone
}

export interface TargetGroup {
  group: string
  options: { key: string; label: string }[]
}

function time(iso: string): number {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Fase 202 DA-47: día de calendario LOCAL (YYYY-MM-DD) de un instante ISO, listo para `shortDate`.
 * El API manda instantes UTC: a la noche el día UTC ya es el siguiente al del alumno. '' si no es
 * una fecha válida.
 */
export function localDayOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Fase 202 DA-47: pendientes por alta DESC; respondidas por fecha de respuesta DESC. */
export function groupCorrections(items: readonly CorrectionView[]): GroupedCorrections {
  const pending = items
    .filter((c) => c.status === 'pendiente')
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
  const answered = items
    .filter((c) => c.status === 'respondida')
    .sort(
      (a, b) => time(b.reply?.repliedAt ?? b.createdAt) - time(a.reply?.repliedAt ?? a.createdAt),
    )
  return { pending, answered }
}

/** Fase 202 DA-47: rótulo de la tarjeta. Una pendiente siempre espera, aunque venga `replyUnseen`. */
export function correctionChip(item: CorrectionView): CorrectionChip {
  if (item.status === 'pendiente') return { label: 'Esperando respuesta', tone: 'espera' }
  if (item.replyUnseen) return { label: 'Nueva respuesta', tone: 'nueva' }
  return { label: 'Respondida', tone: 'hecha' }
}

/** Cuántos videos más puede mandar antes de llegar al tope de pendientes (DA-39). */
export function remainingSlots(limits: Pick<CorrectionLimits, 'pending' | 'pendingMax'>): number {
  return Math.max(0, limits.pendingMax - limits.pending)
}

/**
 * Opciones del selector agrupadas por ejercicio, en el orden en que llegan (los combos van al
 * final, como los manda el API). Un grupo no se repite.
 */
export function targetGroups(targets: readonly CorrectionTarget[]): TargetGroup[] {
  const byGroup = new Map<string, TargetGroup>()
  for (const t of targets) {
    let entry = byGroup.get(t.group)
    if (!entry) {
      entry = { group: t.group, options: [] }
      byGroup.set(t.group, entry)
    }
    entry.options.push({ key: t.key, label: t.label })
  }
  return [...byGroup.values()]
}
