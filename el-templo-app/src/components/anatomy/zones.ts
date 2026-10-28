/**
 * Zonas musculares y grupos de la tab Libre (fase 197 D-10) y de Tu cuerpo (fase 200 D4).
 *
 * `ZoneSlug` y `ZONE_GROUPS` son espejo A PROPÓSITO de `REGIONES` y `GRUPOS_ZONA` de
 * `el-templo-api/src/modules/anatomy/` (verificado por `test/anatomy/sync-front.test.ts`): el API
 * calcula zonas y grupos de cada bloque, el app solo necesita agrupar los slugs que toca en la
 * figura. Sin imports de valor.
 */

/** Las 16 zonas (`REGIONES` del API): las 15 de la TV y `tibialis` al final (fase 200 D4). */
export type ZoneSlug =
  | 'chest'
  | 'deltoids'
  | 'triceps'
  | 'biceps'
  | 'forearm'
  | 'trapezius'
  | 'upper-back'
  | 'lower-back'
  | 'abs'
  | 'obliques'
  | 'gluteal'
  | 'quadriceps'
  | 'hamstring'
  | 'adductors'
  | 'calves'
  | 'tibialis'

export type ZoneGroup = 'hombros' | 'pecho' | 'espalda' | 'core' | 'piernas' | 'brazos'

/** Orden estable de los grupos (= orden de los chips de la tab Libre). */
export const ZONE_GROUP_ORDER: readonly ZoneGroup[] = [
  'hombros',
  'pecho',
  'espalda',
  'core',
  'piernas',
  'brazos',
]

/** Cada una de las 16 zonas está en exactamente un grupo. */
export const ZONE_GROUPS: Readonly<Record<ZoneGroup, readonly ZoneSlug[]>> = {
  hombros: ['deltoids'],
  pecho: ['chest'],
  espalda: ['upper-back', 'lower-back', 'trapezius'],
  core: ['abs', 'obliques'],
  piernas: ['quadriceps', 'hamstring', 'gluteal', 'calves', 'adductors', 'tibialis'],
  brazos: ['biceps', 'triceps', 'forearm'],
}

export const ZONE_GROUP_LABELS: Readonly<Record<ZoneGroup, string>> = {
  hombros: 'Hombros',
  pecho: 'Pecho',
  espalda: 'Espalda',
  core: 'Core',
  piernas: 'Piernas',
  brazos: 'Brazos',
}

/** Partes de la figura que no son músculo: se pintan como piel y no son tocables. */
export const NON_MUSCLE_SLUGS: ReadonlySet<string> = new Set([
  'hair',
  'head',
  'neck',
  'hands',
  'feet',
  'ankles',
  'knees',
])

const GROUP_BY_SLUG: ReadonlyMap<string, ZoneGroup> = new Map(
  ZONE_GROUP_ORDER.flatMap((group): [string, ZoneGroup][] =>
    ZONE_GROUPS[group].map((slug): [string, ZoneGroup] => [slug, group]),
  ),
)

export function isZoneSlug(s: string): s is ZoneSlug {
  return GROUP_BY_SLUG.has(s)
}

/** Grupo de un slug de la figura (gemelos → piernas). `null` si no es una zona muscular. */
export function groupOfSlug(slug: string): ZoneGroup | null {
  return GROUP_BY_SLUG.get(slug) ?? null
}

/** Grupos que tocan las zonas dadas, sin repetidos y en el orden `ZONE_GROUP_ORDER`. */
export function groupsOfZones(zones: readonly string[]): ZoneGroup[] {
  const found = new Set<ZoneGroup>()
  for (const zone of zones) {
    const group = GROUP_BY_SLUG.get(zone)
    if (group) found.add(group)
  }
  return ZONE_GROUP_ORDER.filter((group) => found.has(group))
}
