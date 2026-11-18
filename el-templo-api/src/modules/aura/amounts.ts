// Module: aura
/**
 * Tabla única de montos de Aura que acredita el servidor (fase 214, D-18 y D-19).
 *
 * D-18: la escala nueva fija que una clase vale 5 y ninguna fuente "por día"
 * paga más que una clase. D-19: valores por fuente.
 *
 * Por qué constantes de código y no `aura_config`: los tests vacían
 * `aura_config` (`cleanAllTestData`), y con config los tests seguirían
 * afirmando valores viejos. Una sola fuente en código evita que tests y
 * producción se desincronicen. `aura_config` se mantiene coherente por
 * migración (plan 04 de la fase 214).
 */

export const AURA_AMOUNTS = {
  attendance: 5,
  attendanceReversal: 5,
  onboarding: 5,
  training: 3,
  goalPlan: 3,
  extraBlock: 2,
  stretch: 1,
  profilePhoto: 5,
  // Decisión del planificador (discreción de CONTEXT): 15 -> 8 (7,5 redondeado
  // hacia arriba) y 100 -> 50 mantienen su peso en clases. Los programas con un
  // bonus personalizado distinto de 15/100 no se tocan.
  programWeekDefault: 8,
  programCompletionDefault: 50,
} as const;

/** Antigüedad: 3 meses, 6 meses y cada año desde el primero. */
export const AURA_TENURE = {
  3: 15,
  6: 25,
  yearly: 50,
} as const;

/** Rachas de días seguidos: clave = hito en días. */
export const AURA_STREAK = {
  7: 5,
  14: 10,
  30: 15,
  60: 25,
  100: 50,
} as const;

/** Aura del hito de antigüedad: 3 -> 15, 6 -> 25, 12/24/... -> 50. */
export function tenureAuraFor(months: number): number {
  if (months === 3) return AURA_TENURE[3];
  if (months === 6) return AURA_TENURE[6];
  return AURA_TENURE.yearly;
}
