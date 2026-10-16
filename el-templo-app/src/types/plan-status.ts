/**
 * Fase 199 (D-05): estado de plan del propio socio.
 * Espejo de la respuesta de `GET /members/subscription/me/plan-status` (plan 199-05).
 * Vive en `types/` (y no en el store) para que utilidades puras como
 * `today-card.ts` lo usen sin importar nada de Pinia.
 */
export interface MemberPlanStatus {
  hasActivePlan: boolean
  hasScheduledPlan: boolean
  scheduledStartDate: string | null
  hadPlan: boolean
  lastPlan: { planName: string; endDate: string | null; status: string } | null
}
