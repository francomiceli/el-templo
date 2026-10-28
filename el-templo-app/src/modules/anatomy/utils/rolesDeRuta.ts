/**
 * Roles de la figura (`BodyFigure`) para una ruta: clave `slug@vista` → grupo de alumno. Lo usan la
 * ficha de ruta de Tu cuerpo y el cuerpo del player (sketch 027 D), así pintan igual.
 *
 * El API ya resuelve fuerte > sostiene por (zona, vista) y no manda `both` (WR-01); si llegara una,
 * se abre en frente y espalda. Si una misma clave llega con dos grupos, gana "fuerte".
 */
import type { RutaAlumno } from '../types'

export type RolFigura = RutaAlumno['zonas'][number]['grupo']

export function rolesDeRuta(ruta: Pick<RutaAlumno, 'zonas'> | null): Record<string, RolFigura> {
  const out: Record<string, RolFigura> = {}
  for (const z of ruta?.zonas ?? []) {
    const vistas = z.vista === 'both' ? (['front', 'back'] as const) : [z.vista]
    for (const v of vistas) {
      const clave = `${z.slug}@${v}`
      if (out[clave] !== 'fuerte') out[clave] = z.grupo
    }
  }
  return out
}
