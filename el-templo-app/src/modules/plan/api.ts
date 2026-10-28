import { api } from 'src/boot/axios'
import type { PlanSummary } from './types'

/** Resumen de Planes del socio: actual, próxima y anteriores (sin montos). */
export async function fetchPlanSummary(): Promise<PlanSummary> {
  const response = await api.get<PlanSummary>('/members/subscription/me/plan-summary')
  return response.data
}

/** El socio abrió Planes: apaga el "no visto" en el server (la pelotita de la tab). */
export async function markPlanSummarySeen(): Promise<void> {
  await api.post('/members/subscription/me/plan-summary/seen')
}
