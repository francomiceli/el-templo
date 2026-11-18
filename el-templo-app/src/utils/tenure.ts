/**
 * Antigüedad del socio para el encabezado de Mi Templo (fase 214, UI-SPEC "Antigüedad").
 * Función pura: el reloj entra por parámetro.
 */

function pluralMonths(n: number): string {
  return n === 1 ? '1 mes' : `${n} meses`
}

/**
 * "Tu primer mes en El Templo", "5 meses en El Templo", "1 año y 2 meses en El Templo".
 * Cuenta meses completos de calendario (el día del mes se incluye). Devuelve `null` si no hay
 * `memberSince` (o no se puede leer): en ese caso no se dibuja la línea. Una fecha futura cuenta
 * como 0 meses.
 */
export function formatTenure(
  memberSince: string | undefined,
  now: Date = new Date(),
): string | null {
  if (!memberSince) return null
  const start = new Date(memberSince)
  if (Number.isNaN(start.getTime())) return null

  let months =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth())
  if (now.getUTCDate() < start.getUTCDate()) months -= 1
  if (months < 0) months = 0

  if (months === 0) return 'Tu primer mes en El Templo'
  if (months < 12) return `${pluralMonths(months)} en El Templo`

  const years = Math.floor(months / 12)
  const rest = months % 12
  const yearsText = years === 1 ? '1 año' : `${years} años`
  return rest > 0
    ? `${yearsText} y ${pluralMonths(rest)} en El Templo`
    : `${yearsText} en El Templo`
}
