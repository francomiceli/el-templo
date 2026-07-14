// A/B test del copy de la card de referidos (v5.5 follow-up).
// Bucketing determinístico y estable por user.id: par -> 'A', impar -> 'B'.
// Los dos grupos son de tamaño parejo por construcción, así que la comparación
// de clics/conversiones entre variantes es justa sin trackear impresiones.
//
// La MISMA regla vive en el-templo-app/src/utils/ab-variant.ts (la card elige el
// copy a mostrar) y se RECOMPUTA server-side acá en el click y en el reporte
// admin — nunca se confía en la variante que manda el cliente. Si algún día se
// cambia esta función, hay que cambiar ambos lados en el mismo commit.
export type ReferralCopyVariant = "A" | "B";

export function referralCopyVariant(userId: number): ReferralCopyVariant {
  return userId % 2 === 0 ? "A" : "B";
}
