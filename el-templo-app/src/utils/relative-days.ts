// Etiqueta relativa de una novedad de Mi Templo (D-7): "hoy", "ayer",
// "hace N días" (2-6), "hace 1 semana", "hace N semanas" y, desde 60 días,
// "hace N meses". Util PURO: `now` se inyecta (nada de `Date.now()` adentro) así
// el test usa fechas fijas. Réplica de `relativeDaysLabel` del admin
// (`el-templo-admin/src/utils/novedades.ts`) — la app no importa del admin.

const MS_PER_DAY = 86_400_000

/** Medianoche local del día de `d` (los días se cuentan de calendario, no en bloques de 24h). */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function relativeDaysLabel(publishedAtIso: string, now: Date): string {
  const published = new Date(publishedAtIso)
  if (Number.isNaN(published.getTime())) return 'hoy'
  // `round` y no `floor`: un cambio de horario (DST) hace días de 23/25h.
  // Una fecha futura (reloj del celular atrasado) se trata como "hoy".
  const days = Math.max(
    0,
    Math.round((startOfLocalDay(now) - startOfLocalDay(published)) / MS_PER_DAY),
  )
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days >= 60) return `hace ${Math.floor(days / 30)} meses`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? 'hace 1 semana' : `hace ${weeks} semanas`
}
