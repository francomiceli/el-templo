import { describe, it, expect } from 'vitest'
import {
  NON_MUSCLE_SLUGS,
  ZONE_GROUPS,
  ZONE_GROUP_LABELS,
  ZONE_GROUP_ORDER,
  groupOfSlug,
  groupsOfZones,
  isZoneSlug,
} from '../zones'

// Las 15 zonas de `TvZonaMuscular` del API (D-10).
const ALL_ZONES = [
  'chest',
  'deltoids',
  'triceps',
  'biceps',
  'forearm',
  'trapezius',
  'upper-back',
  'lower-back',
  'abs',
  'obliques',
  'gluteal',
  'quadriceps',
  'hamstring',
  'adductors',
  'calves',
]

describe('zones', () => {
  it('los 6 grupos cubren exactamente las 15 zonas sin repetir', () => {
    const flat = ZONE_GROUP_ORDER.flatMap((g) => [...ZONE_GROUPS[g]])
    expect(flat).toHaveLength(15)
    expect(new Set(flat).size).toBe(15)
    expect([...flat].sort()).toEqual([...ALL_ZONES].sort())
  })

  it('el orden y las etiquetas cubren los 6 grupos', () => {
    expect(ZONE_GROUP_ORDER).toHaveLength(6)
    expect(ZONE_GROUP_ORDER.map((g) => ZONE_GROUP_LABELS[g])).toEqual([
      'Hombros',
      'Pecho',
      'Espalda',
      'Core',
      'Piernas',
      'Brazos',
    ])
  })

  it('groupOfSlug devuelve el grupo de cada músculo', () => {
    expect(groupOfSlug('calves')).toBe('piernas')
    expect(groupOfSlug('trapezius')).toBe('espalda')
    expect(groupOfSlug('deltoids')).toBe('hombros')
    expect(groupOfSlug('forearm')).toBe('brazos')
  })

  it('groupOfSlug devuelve null para partes no musculares y desconocidas', () => {
    expect(groupOfSlug('head')).toBeNull()
    expect(groupOfSlug('hair')).toBeNull()
    expect(groupOfSlug('nada')).toBeNull()
  })

  it('groupsOfZones devuelve grupos únicos en el orden de ZONE_GROUP_ORDER', () => {
    expect(groupsOfZones(['triceps', 'deltoids'])).toEqual(['hombros', 'brazos'])
    expect(groupsOfZones(['calves', 'quadriceps', 'abs'])).toEqual(['core', 'piernas'])
    expect(groupsOfZones([])).toEqual([])
    expect(groupsOfZones(['head', 'chest'])).toEqual(['pecho'])
  })

  it('NON_MUSCLE_SLUGS tiene las 8 partes y ninguna es zona', () => {
    expect(NON_MUSCLE_SLUGS.size).toBe(8)
    for (const slug of NON_MUSCLE_SLUGS) expect(isZoneSlug(slug)).toBe(false)
  })

  it('isZoneSlug reconoce las 15 zonas', () => {
    for (const zone of ALL_ZONES) expect(isZoneSlug(zone)).toBe(true)
    expect(isZoneSlug('knees')).toBe(false)
  })
})
