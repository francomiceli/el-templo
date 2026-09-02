// A/B copy test de la card de referidos (v5.5 follow-up). Mismo bucketing que
// el-templo-api/src/modules/referrals/ab-variant.ts: par -> 'A', impar -> 'B'.
// La card elige el copy a mostrar según la variante del socio; el backend
// recomputa esta MISMA regla al registrar el clic y al armar el reporte —
// nunca se confía en la variante que manda el cliente. Cambiar ambos lados en
// el mismo commit si algún día se altera la función.
//
// SIN USO DESDE LA FASE 193 (D-15): ReferralCtaCard.vue dejó de elegir el
// título por esta variante — el copy pasó a ser editable server-side
// (aviso de sistema `card_referral`, fallback = variante A). Se conserva el
// archivo sin borrar porque el backend (el-templo-api/src/modules/
// referrals/ab-variant.ts) SIGUE calculando y persistiendo la variante para
// el registro/atribución de clics de referidos — plan 193-15 no toca esa
// lógica. Confirmar con Franco en el UAT del plan 193-17 si el test A/B de
// copy queda formalmente cerrado o si conviene borrar este archivo del todo
// en un plan futuro.
export type ReferralCopyVariant = 'A' | 'B'

export function referralCopyVariant(userId: number): ReferralCopyVariant {
  return userId % 2 === 0 ? 'A' : 'B'
}
