// Fase 215 (#18): niveles del sello de antigüedad. Funciones puras para poder probar los umbrales
// sin montar el componente. Los umbrales (3, 6 y 12 meses) no cambian respecto de la fase 214.

/** Anillos terracota del sello: 0 a los 3 meses, 1 a los 6 y 2 al año o más. */
export type SealRings = 0 | 1 | 2

/** Meses de calendario completos desde el alta (día-aware, en UTC como el backend). */
export function monthsSince(since: string | null, now: Date = new Date()): number {
  if (!since) return 0
  const start = new Date(since)
  if (Number.isNaN(start.getTime())) return 0
  let months =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth())
  if (now.getUTCDate() < start.getUTCDate()) months -= 1
  return Math.max(0, months)
}

/** Anillos del sello según los meses de antigüedad; `null` por debajo de los 3 meses (sin sello). */
export function sealRings(months: number): SealRings | null {
  if (months >= 12) return 2
  if (months >= 6) return 1
  if (months >= 3) return 0
  return null
}

/** Texto del sello (tooltip y `aria-label`). Sin nivel o sin fecha, vacío. */
export function sealLabel(since: string | null, months: number): string {
  const rings = sealRings(months)
  if (!since || rings === null) return ''
  if (rings === 0) return '3 meses en El Templo'
  if (rings === 1) return '6 meses en El Templo'
  const sinceLabel = new Date(since).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  })
  const years = Math.floor(months / 12)
  return `Miembro del Templo desde ${sinceLabel} · ${years === 1 ? '1 año' : `${years} años`}`
}
