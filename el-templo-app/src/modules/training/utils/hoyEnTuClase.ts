/**
 * "Hoy en tu clase" (sketch 024 a · B, sin pills): qué hace la zona tocada en la clase, dicho con
 * nombres de RUTA y agregado sobre TODOS los bloques del día. Lógica pura: lee `block.zoneHits` (que
 * calcula el API) y no sabe de Vue ni del store; los rótulos de grupo se los pasa quien llama
 * (salen de `vista.grupos[].frase`, así el texto sigue al API).
 */
import { getRouteLabel } from 'src/constants/route-labels'
import type { ZoneSlug } from 'src/components/anatomy/zones'
import type { GrupoAlumno } from 'src/modules/anatomy/types'
import type { Block } from '../types/session'
import { blockDisplayName } from './blockMeta'

/** Rótulo de cada grupo ("Hace el movimiento en"...), de `vista.grupos[].frase`. */
export type FrasesGrupo = Readonly<Record<GrupoAlumno, string>>

/** Orden fijo de los grupos: primero lo que más trabaja. */
const ORDEN_GRUPOS: readonly GrupoAlumno[] = ['fuerte', 'sostiene', 'estira']

export const ROTULO_MOVILIDAD = 'Movilidad en'
export const ROTULO_SIN_DETALLE = 'También la trabaja'

export interface LineaHoy {
  /** Grupo de ruta, o las dos líneas sueltas de los bloques sin ruta. */
  id: GrupoAlumno | 'movilidad' | 'sinDetalle'
  /** "Hace el movimiento en" (sin los dos puntos). */
  rotulo: string
  /** Nombres ya deduplicados, en orden de aparición. */
  nombres: string[]
}

/** Arma `FrasesGrupo` desde la lista del API; `null` si falta alguno de los tres grupos. */
export function frasesDeGrupos(
  grupos: readonly { id: GrupoAlumno; frase: string }[] | undefined,
): FrasesGrupo | null {
  if (!grupos) return null
  const fuerte = grupos.find((g) => g.id === 'fuerte')?.frase
  const sostiene = grupos.find((g) => g.id === 'sostiene')?.frase
  const estira = grupos.find((g) => g.id === 'estira')?.frase
  if (!fuerte || !sostiene || !estira) return null
  return { fuerte, sostiene, estira }
}

function pushUnico(lista: string[], nombre: string): void {
  if (nombre !== '' && !lista.includes(nombre)) lista.push(nombre)
}

/**
 * Líneas de "Hoy en tu clase" para una zona, en este orden: hace el movimiento · sostiene el
 * movimiento · se estira · movilidad · también la trabaja. Una ruta sale UNA vez, en su grupo más
 * fuerte de todos los bloques (fuerte > sostiene > estira). Un grupo sin rutas no sale. Vacío = la
 * clase no trabaja la zona.
 */
export function resumenHoyEnTuClase(
  blocks: readonly Block[],
  zona: ZoneSlug,
  frases: FrasesGrupo,
): LineaHoy[] {
  // código de ruta → su grupo más fuerte; el Map conserva el orden de primera aparición.
  const porRuta = new Map<string, GrupoAlumno>()
  const movilidad: string[] = []
  const sinDetalle: string[] = []

  for (const block of blocks) {
    const hit = block.zoneHits?.[zona]
    if (!hit) continue
    for (const r of hit.rutas ?? []) {
      const actual = porRuta.get(r.ruta)
      if (actual === undefined || ORDEN_GRUPOS.indexOf(r.grupo) < ORDEN_GRUPOS.indexOf(actual)) {
        porRuta.set(r.ruta, r.grupo)
      }
    }
    if (hit.movilidad) pushUnico(movilidad, blockDisplayName(block))
    if (hit.sinDetalle) pushUnico(sinDetalle, blockDisplayName(block))
  }

  const lineas: LineaHoy[] = []
  for (const id of ORDEN_GRUPOS) {
    const nombres: string[] = []
    for (const [codigo, grupo] of porRuta) {
      if (grupo === id) pushUnico(nombres, getRouteLabel(codigo))
    }
    if (nombres.length > 0) lineas.push({ id, rotulo: frases[id], nombres })
  }
  if (movilidad.length > 0)
    lineas.push({ id: 'movilidad', rotulo: ROTULO_MOVILIDAD, nombres: movilidad })
  if (sinDetalle.length > 0) {
    lineas.push({ id: 'sinDetalle', rotulo: ROTULO_SIN_DETALLE, nombres: sinDetalle })
  }
  return lineas
}

/** Separador de nombres dentro de una línea. */
export const SEPARADOR_NOMBRES = ' · '

/** Texto plano de una línea: "Hace el movimiento en: Front Lever · Muscle Up". */
export function textoLinea(linea: LineaHoy): string {
  return `${linea.rotulo}: ${linea.nombres.join(SEPARADOR_NOMBRES)}`
}
