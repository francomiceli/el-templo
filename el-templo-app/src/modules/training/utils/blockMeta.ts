/**
 * Metadatos de presentación de un bloque (fase 197 D-03, D-09, D-11). Funciones puras, sin Vue
 * ni stores: las usan Semana (chips + lista de ejercicios), Libre (cards) y el modo bloque libre.
 */
import { getRouteLabel } from 'src/constants/route-labels'
import { ROLE_LABELS } from 'src/constants/roleLabels'
import { ZONE_GROUP_LABELS, groupsOfZones, type ZoneGroup } from 'src/components/anatomy/zones'
import type { Block, Session } from '../types/session'

/** Segundos que se asumen por repetición cuando el ejercicio no declara tiempo (corpus §5). */
const SECONDS_PER_REP = 3

function positiveNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

function paramType(p: Block['formatParams']): string {
  const t = p?.type
  return typeof t === 'string' ? t : ''
}

/**
 * Nombre visible del bloque: INITIUM es "Entrada en calor"; ROM_* es "Movilidad · ROM" (gap 197-24,
 * hallazgo 9: antes repetía el rótulo del rol que el chip ya muestra arriba, "Tren Inferior" dos
 * veces; la zona la da el rol, y el nombre sigue el "Ruta · Formato" del título del API);
 * COMBOS/TECNICA/STRETCHING usan el rótulo del rol; el resto, la etiqueta de la ruta ("Planche").
 */
export function blockDisplayName(b: Pick<Block, 'role' | 'route'>): string {
  if (b.role === 'INITIUM') return 'Entrada en calor'
  if (b.role.startsWith('ROM_')) return 'Movilidad · ROM'
  if (
    b.role.startsWith('COMBOS_') ||
    b.role.startsWith('TECNICA_') ||
    b.role === 'STRETCHING'
  ) {
    return ROLE_LABELS[b.role]
  }
  return getRouteLabel(b.route)
}

/**
 * Título de la sesión: misma regla que `DayCard.getSessionRouteName` (D-03, no se inventa uno
 * derivado). Con bloques ROM_* es "Movilidad"; si no, la ruta del NUCLEUS (o del primer bloque).
 */
export function sessionTitle(s: Session): string {
  if (s.blocks.length === 0) return ''
  if (s.blocks.some((b) => b.role.startsWith('ROM_'))) return 'Movilidad'
  const main = s.blocks.find((b) => b.role === 'NUCLEUS') ?? s.blocks[0]
  return getRouteLabel(main.route)
}

/**
 * Minutos que el formato DECLARA (D-11), o `null` si el reloj corre libre.
 * `amrap_series {rounds 3, minutes 10}` son 3 rondas DENTRO de 10 minutos en total.
 */
export function declaredMinutes(p: Block['formatParams']): number | null {
  if (!p) return null
  switch (paramType(p)) {
    case 'amrap_series':
    case 'amrap':
    case 'open_style':
      return positiveNumber(p.minutes)
    case 'emom':
      return positiveNumber(p.totalMinutes)
    case 'for_time':
      return positiveNumber(p.timeCapMinutes)
    default:
      return null
  }
}

/**
 * Formato legible: "AMRAP · 10' · 3 rondas" (AMRAP Series), "EMOM · 3'", "Cluster",
 * "Buy-in / Cash-out" (lleva guion: el nombre no se corta).
 */
export function formatLabel(b: Pick<Block, 'format' | 'formatParams'>): string {
  const format = (b.format ?? '').trim()
  const isSeries = paramType(b.formatParams) === 'amrap_series' || /^amrap series$/i.test(format)
  const name = isSeries ? 'AMRAP' : format
  const minutes = declaredMinutes(b.formatParams)
  const parts: string[] = []
  if (name) parts.push(name)
  if (minutes !== null) parts.push(`${minutes}'`)
  if (isSeries) {
    const rounds = positiveNumber(b.formatParams?.rounds)
    if (rounds !== null) parts.push(`${rounds} ${rounds === 1 ? 'ronda' : 'rondas'}`)
  }
  return parts.join(' · ')
}

/**
 * Gap 197-24 (hallazgo 6): "Buy-in" / "Cash-out" no se parten en el guion ("Buy-" / "in"). Pone un
 * WORD JOINER (U+2060, ancho cero, sin glifo) después del guion: el navegador no ofrece ahí un punto
 * de corte, y el resto del texto sigue cortando normal en los espacios. Solo para MOSTRAR: la
 * búsqueda, los aria-label y los datos siguen con el texto original.
 */
export function keepHyphenWords(text: string): string {
  return text.replace(/\b(buy|cash)-(in|out)\b/gi, '$1-\u2060$2')
}

/**
 * Minutos estimados de UNA pasada del bloque (D-04 `≈N'`): por ejercicio los `seconds` o
 * `reps × 3`, más el descanso; × rondas (`rounds` / `totalRounds` si son número); redondeado y
 * con mínimo 1.
 */
export function estimatedMinutes(b: Pick<Block, 'exercises' | 'formatParams'>): number {
  let seconds = 0
  for (const ex of b.exercises) {
    const hasSeconds = ex.seconds !== null && ex.seconds > 0
    const work = hasSeconds ? (ex.seconds ?? 0) : (ex.reps ?? 0) * SECONDS_PER_REP
    seconds += work + (ex.rest > 0 ? ex.rest : 0)
  }
  const rounds =
    positiveNumber(b.formatParams?.rounds) ?? positiveNumber(b.formatParams?.totalRounds)
  const total = seconds * (rounds ?? 1)
  return Math.max(1, Math.round(total / 60))
}

function groupsOfBlock(b: Block): ZoneGroup[] {
  if (b.groups && b.groups.length > 0) return b.groups
  return b.zones ? groupsOfZones(b.zones) : []
}

/**
 * Línea de meta de un bloque: "AMRAP · 10' · 3 rondas · 4 ejercicios · Hombros, Brazos".
 * Con `withEstimate` y sin minutos declarados suma "≈6'" (Libre):
 * "Cluster · ≈6' · 3 ejercicios · Piernas".
 */
export function blockMetaLine(b: Block, opts: { withEstimate: boolean }): string {
  const parts: string[] = []
  const label = formatLabel(b)
  if (label) parts.push(label)
  if (opts.withEstimate && declaredMinutes(b.formatParams) === null) {
    parts.push(`≈${estimatedMinutes(b)}'`)
  }
  const n = b.exercises.length
  parts.push(`${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`)
  const groups = groupsOfBlock(b)
  if (groups.length > 0) parts.push(groups.map((g) => ZONE_GROUP_LABELS[g]).join(', '))
  return parts.join(' · ')
}

/**
 * Bloque elegido por defecto en Semana (D-03): el NUCLEUS; si no hay, el primero que no sea
 * INITIUM; si no, el 0.
 */
export function defaultBlockIndex(blocks: Block[]): number {
  const nucleus = blocks.findIndex((b) => b.role === 'NUCLEUS')
  if (nucleus >= 0) return nucleus
  const other = blocks.findIndex((b) => b.role !== 'INITIUM')
  return other >= 0 ? other : 0
}

/**
 * Zonas de la figura de Semana (D-03): `lit` = las del bloque elegido (terracota fuerte);
 * `lit2` = las de los otros bloques de la sesión SIN las del elegido (tono medio).
 */
export function figureZones(blocks: Block[], selected: number): { lit: string[]; lit2: string[] } {
  const lit = new Set<string>(blocks[selected]?.zones ?? [])
  const lit2 = new Set<string>()
  blocks.forEach((b, i) => {
    if (i === selected) return
    for (const zone of b.zones ?? []) {
      if (!lit.has(zone)) lit2.add(zone)
    }
  })
  return { lit: [...lit], lit2: [...lit2] }
}
