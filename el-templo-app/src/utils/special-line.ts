/**
 * Línea del pase especial (2026-09-29). Un pase especial solo habilita las
 * actividades de SU línea: `null` = "Actividades con Aura", cualquier otro
 * texto es una línea propia (ej. "Yoga"). Espeja
 * el-templo-api/src/modules/scheduling/special-line.ts.
 */

/** Normaliza una línea para compararla: recorte + minúsculas, vacío → null. */
export function normalizeSpecialLine(line: string | null | undefined): string | null {
  const trimmed = line?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

/** Misma línea (sin importar mayúsculas/espacios). `null` solo matchea `null`. */
export function sameSpecialLine(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeSpecialLine(a) === normalizeSpecialLine(b)
}

/** Etiqueta corta para chips/badges: 'Aura' para la línea por defecto. */
export function shortLineLabel(line: string | null | undefined): string {
  return line?.trim() || 'Aura'
}

/** Etiqueta larga (dialog / card): la línea Aura conserva "Actividades con Aura". */
export function fullLineLabel(line: string | null | undefined): string {
  return line?.trim() || 'Actividades con Aura'
}

/** Saldo de un pase para decidir si se puede reservar con él. */
export interface PassBalance {
  classesRemaining: number | null
}

/** Pase ilimitado (saldo NULL) o con clases restantes. */
export function passHasBalance(pass: PassBalance | null | undefined): boolean {
  if (!pass) return false
  return pass.classesRemaining == null || pass.classesRemaining > 0
}

/**
 * Estado de una clase especial para el socio, según el pase de SU línea:
 * - `reservable`: hay pase de la línea con saldo (E1/E4).
 * - `exhausted`: hay pase de la línea pero sin saldo (E2).
 * - `no-pass`: no tiene pase de esa línea (E3).
 */
export type SpecialSlotState = 'reservable' | 'exhausted' | 'no-pass'

export function specialSlotState(
  passes: readonly (PassBalance & { specialLine: string | null })[],
  line: string | null | undefined,
): SpecialSlotState {
  const pass = passes.find((p) => sameSpecialLine(p.specialLine, line))
  if (!pass) return 'no-pass'
  return passHasBalance(pass) ? 'reservable' : 'exhausted'
}

/**
 * ¿Se le ofrece "Probá una clase gratis" al socio para una clase de esta línea?
 * Solo líneas propias (la clase de prueba no existe para Aura: `null`) y solo si
 * el server la marcó elegible en `trialLines`. La elegibilidad real la decide el
 * server; esto solo evita mostrar un botón que seguro fallaría.
 */
export function canClaimTrial(
  trialLines: readonly string[] | null | undefined,
  line: string | null | undefined,
): boolean {
  if (normalizeSpecialLine(line) == null) return false
  return (trialLines ?? []).some((l) => sameSpecialLine(l, line))
}

/** Datos mínimos de un pase para armar el texto del chip. */
export interface PassChipData extends PassBalance {
  specialLine: string | null
  classesBudget: number | null
}

/**
 * Texto del chip contador de un pase: `Aura · 1/2`, `Yoga · Ilimitado` o, agotado,
 * `Aura · 0/2 · se renuevan el próximo mes`.
 */
export function passChipLabel(pass: PassChipData): string {
  const name = shortLineLabel(pass.specialLine)
  if (pass.classesRemaining == null) return `${name} · Ilimitado`
  const budget = pass.classesBudget ?? 0
  if (pass.classesRemaining > 0) return `${name} · ${pass.classesRemaining}/${budget}`
  // Solo el pase mensual de Aura se renueva: los de otras líneas son packs o
  // clase suelta que vencen y se vuelven a comprar.
  return pass.specialLine == null
    ? `${name} · 0/${budget} · se renuevan el próximo mes`
    : `${name} · 0/${budget} · sin clases`
}

/**
 * Saldo de un pase para la card de Mi Templo: `N de M clases` o
 * `Accesos ilimitados`. Sin "este mes": no todos los pases son mensuales
 * (clase suelta, packs) — el vencimiento va aparte.
 */
export function passBalanceText(pass: PassChipData): string {
  if (pass.classesRemaining == null) return 'Accesos ilimitados'
  return `${pass.classesRemaining} de ${pass.classesBudget ?? 0} clases`
}
