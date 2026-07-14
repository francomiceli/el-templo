// A/B copy test de la card de referidos (v5.5 follow-up). Mismo bucketing que
// el-templo-api/src/modules/referrals/ab-variant.ts: par -> 'A', impar -> 'B'.
// La card elige el copy a mostrar según la variante del socio; el backend
// recomputa esta MISMA regla al registrar el clic y al armar el reporte —
// nunca se confía en la variante que manda el cliente. Cambiar ambos lados en
// el mismo commit si algún día se altera la función.
export type ReferralCopyVariant = 'A' | 'B'

export function referralCopyVariant(userId: number): ReferralCopyVariant {
  return userId % 2 === 0 ? 'A' : 'B'
}
