/**
 * Lógica pura de la hoja de zona (sketch 024 b · C): qué músculo arranca elegido, cómo se titula la
 * hoja, el texto del globo y los ejercicios del músculo elegido por grupo. Sin Vue ni store: el
 * componente (`ZonaAlumno.vue`) le pasa los datos ya resueltos.
 */
import type { GrupoAlumno, GrupoAlumnoInfo, MusculoAlumno, RutaAlumno } from '../types'

/** Orden fijo de los grupos: primero lo que más trabaja. */
export const ORDEN_GRUPOS: readonly GrupoAlumno[] = ['fuerte', 'sostiene', 'estira']

/** Prefijo de la explicación de un músculo profundo en el globo. */
export const PREFIJO_ADENTRO = 'Más adentro · '

/** Ejercicios (rutas) de un grupo, con el rótulo y la definición que vienen del API. */
export interface GrupoEjercicios {
  id: GrupoAlumno
  frase: string
  definicion: string
  rutas: { slug: string; nombre: string }[]
}

/** Id del músculo que arranca elegido: el principal, el primero de la zona (los propios van antes que los de adentro). */
export function musculoPorDefecto(musculos: readonly MusculoAlumno[]): string | null {
  return musculos[0]?.id ?? null
}

/** Músculo elegido: el pedido si está en la zona; si no (o sin pedido), el principal. */
export function musculoElegido(
  musculos: readonly MusculoAlumno[],
  id: string | null,
): MusculoAlumno | null {
  return musculos.find((m) => m.id === id) ?? musculos[0] ?? null
}

/**
 * `scrollLeft` que deja la pill elegida al principio de la fila (respetando su padding), así queda bien
 * posicionada bajo el globo. Las medidas son de `getBoundingClientRect`; el navegador recorta el máximo.
 */
export function scrollParaPill(
  scrollLeft: number,
  pillLeft: number,
  filaLeft: number,
  paddingInicio: number,
): number {
  return Math.max(0, Math.round(scrollLeft + pillLeft - filaLeft - paddingInicio))
}

/** Texto del globo: lo que hace el músculo; los de adentro arrancan con "Más adentro ·". */
export function textoQueHace(m: Pick<MusculoAlumno, 'queHace' | 'adentro'>): string {
  return m.adentro ? `${PREFIJO_ADENTRO}${m.queHace}` : m.queHace
}

/**
 * Ejercicios de UN músculo agrupados en "Hace el movimiento en / Sostiene… / Se estira…" (en ese
 * orden). Un grupo sin rutas conocidas, o sin texto en `infos`, no sale. Una ruta repetida dentro de
 * un mismo grupo sale una sola vez.
 */
export function gruposDelMusculo(
  m: Pick<MusculoAlumno, 'grupos'>,
  infos: readonly GrupoAlumnoInfo[],
  resolverRuta: (slug: string) => RutaAlumno | null,
): GrupoEjercicios[] {
  const visibles: GrupoEjercicios[] = []
  for (const id of ORDEN_GRUPOS) {
    const info = infos.find((g) => g.id === id)
    if (!info) continue
    const vistos = new Set<string>()
    const rutas: { slug: string; nombre: string }[] = []
    for (const slug of m.grupos[id]) {
      if (vistos.has(slug)) continue
      const r = resolverRuta(slug)
      if (!r) continue
      vistos.add(slug)
      rutas.push({ slug: r.slug, nombre: r.nombre })
    }
    if (rutas.length > 0)
      visibles.push({ id, frase: info.frase, definicion: info.definicion, rutas })
  }
  return visibles
}

/** Margen (px) que la flecha del globo deja a cada borde. */
export const MARGEN_FLECHA = 18

/**
 * Posición horizontal (px, desde el borde izquierdo del globo) de la flecha para que apunte al centro
 * de la pill elegida, sin salirse del globo.
 */
export function posicionFlecha(
  pill: { left: number; width: number },
  globo: { left: number; width: number },
): number {
  const centro = pill.left + pill.width / 2 - globo.left
  return Math.min(
    Math.max(centro, MARGEN_FLECHA),
    Math.max(globo.width - MARGEN_FLECHA, MARGEN_FLECHA),
  )
}
