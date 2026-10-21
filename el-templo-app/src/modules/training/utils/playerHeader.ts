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
 * Línea de formato bajo el player: "AMRAP · 10' · 3 rondas" (sin prefijo). Los nombres con guion
 * ("Buy-in / Cash-out") no se cortan en el guion.
 */
export function playerFormatLine(b: Pick<Block, 'format' | 'formatParams'>): string {
  return keepHyphenWords(formatLabel(b))
}
