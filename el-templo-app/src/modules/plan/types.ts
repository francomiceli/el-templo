/**
 * Espejo de `GET /members/subscription/me/plan-summary` (API `getMemberPlanSummary`).
 * Fechas "YYYY-MM-DD". Sin montos: el API nunca los manda.
 */
export interface PlanSummaryItem {
  id: number
  planId: number
  planName: string
  planCategory: string
  /** `scheduled` también puede venir como `current` cuando su inicio ya llegó. */
  status: 'active' | 'paused' | 'scheduled'
  startDate: string
  endDate: string | null
  pauseEndDate: string | null
  classesPerWeek: number | null
  classesRemaining: number | null
  classesBudget: number | null
  /** Cargada por el staff y todavía no vista por el socio. */
  isNew: boolean
}

export interface PlanHistoryItem {
  id: number
  planName: string
  startDate: string
  endDate: string | null
}

export interface PlanSummary {
  current: PlanSummaryItem | null
  next: PlanSummaryItem | null
  history: PlanHistoryItem[]
  hasUnseen: boolean
}
