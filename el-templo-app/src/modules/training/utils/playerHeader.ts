/**
 * Textos del encabezado del player y de la línea de formato (fase 197). Funciones puras, sin Vue:
 * las usa BlockProgressionView en los dos modos (sesión completa y bloque libre), que comparten
 * el mismo tratamiento tipográfico: kicker chico en mayúsculas + nombre en Montserrat.
 */
import { ROLE_LABELS } from 'src/constants/roleLabels'
import type { Block, BlockRole } from '../types/session'
import { blockDisplayName, formatLabel, keepHyphenWords } from './blockMeta'
import { getRouteName } from './routeNames'

// Override intencional (confirmado con Franco, fase 160-05): el player históricamente rotula
// INITIUM como 'Pyros'; el resto del app usa el canónico 'Initium' del diccionario centralizado
// (roleLabels.ts). NO propagar este override a otras superficies.
const LABEL_OVERRIDES: Partial<Record<BlockRole, string>> = { INITIUM: 'Pyros' }

/** Rótulo del rol dentro del player de sesión ('Pyros' por INITIUM) */
export function playerRoleLabel(role: BlockRole): string {
  return LABEL_OVERRIDES[role] ?? ROLE_LABELS[role] ?? role
}

export interface PlayerHeaderLines {
  /** Línea 1: kicker de 11 px en mayúsculas */
  kicker: string
  /** Línea 2: nombre del bloque en Montserrat 16 */
  name: string
}

/**
 * Las dos líneas del encabezado.
 * - `free`: "Bloque libre · {ROL}" y el nombre visible del bloque.
 * - `session`: el rol ('Pyros' por INITIUM) y la ruta del bloque ('ROM' para los ROM_*).
 */
export function playerHeaderLines(
  block: Pick<Block, 'role' | 'route'>,
  mode: 'session' | 'free',
): PlayerHeaderLines {
  if (mode === 'free') {
    return {
      kicker: `Bloque libre · ${ROLE_LABELS[block.role] ?? block.role}`,
      name: blockDisplayName(block),
    }
  }
  return {
    kicker: playerRoleLabel(block.role),
    name: block.role.startsWith('ROM_') ? 'ROM' : getRouteName(block.route),
  }
}

/**
 * Detalle de los parámetros del formato en la sesión completa: "cada 60s", "40s/20s", tempo, cap,
 * objetivo y, en ROM, rondas + descanso. Es lo que mostraba "Formato: X · …" antes de unificar el
 * encabezado: el socio lo necesita para entrenar, así que la sesión no se queda con la línea corta
 * del modo libre (D-11).
 */
function sessionParamsDetail(format: string, p: Block['formatParams']): string {
  if (!p || !('type' in p) || p.type === 'standard') {
    // Sin parámetros tipados: el detalle sale del slug ("amrap-series" → "series")
    return isFormatSlug(format) ? format.slice(format.indexOf('-') + 1) : ''
  }
  const parts: string[] = []
  if (p.type === 'rom') {
    if (typeof p.rounds === 'number') parts.push(`${p.rounds} rondas`)
    if (typeof p.restSeconds === 'number') parts.push(`descanso ${p.restSeconds}s`)
    return parts.join(' · ')
  }
  if (typeof p.minutes === 'number') parts.push(`${p.minutes} min`)
  if (typeof p.rounds === 'number') parts.push(`${p.rounds} rondas`)
  if (typeof p.totalMinutes === 'number') parts.push(`${p.totalMinutes} min`)
  if (typeof p.intervalSeconds === 'number') parts.push(`cada ${p.intervalSeconds}s`)
  if (typeof p.workSeconds === 'number' && typeof p.restSeconds === 'number')
    parts.push(`${p.workSeconds}s/${p.restSeconds}s`)
  if (typeof p.totalRounds === 'number') parts.push(`${p.totalRounds} rondas`)
  if (typeof p.tempo === 'string') parts.push(p.tempo)
  if (typeof p.timeCapMinutes === 'number') parts.push(`cap ${p.timeCapMinutes} min`)
  if (typeof p.target === 'number' && typeof p.unit === 'string') {
    parts.push(`${p.target} ${p.unit}`)
  }
  return parts.join(' · ')
}

/** "amrap-series" sí; "Buy-in / Cash-out" no (tiene espacios: es un nombre, no un slug). */
function isFormatSlug(format: string): boolean {
  return /^[a-z0-9_]+-[a-z0-9_-]+$/i.test(format)
}

/**
 * Línea de formato bajo el player, sin el prefijo "Formato:". Los nombres con guion
 * ("Buy-in / Cash-out") no se cortan en el guion.
 * - `free`: la línea corta D-11, "AMRAP · 10' · 3 rondas".
 * - `session`: nombre del formato + todos sus parámetros ("EMOM · 12 min · cada 60s").
 */
export function playerFormatLine(
  b: Pick<Block, 'format' | 'formatParams'>,
  mode: 'session' | 'free',
): string {
  if (mode === 'free') return keepHyphenWords(formatLabel(b))
  const format = (b.format ?? '').trim()
  const name = isFormatSlug(format) ? format.slice(0, format.indexOf('-')) : format
  const detail = sessionParamsDetail(format, b.formatParams)
  return keepHyphenWords([name, detail].filter(Boolean).join(' · '))
}
