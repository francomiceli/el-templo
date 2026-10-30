import type { TodayPresencial, TodaySession } from 'src/modules/progression/types'

/** Lo que muestra la pantalla de resumen de hoy (solo lectura). */
export interface SummarySource {
  presencial: boolean
  branchName: string | null
  blocksCompleted: string[]
  durationMinutes: number | null
  rpe: number | null
  notes: string | null
}

/**
 * La sesión hecha en la app manda; si no hubo, la clase presencial de hoy (el check-in QR la espeja
 * y Semana ofrece "Ver resumen" también para ese día). Sin ninguna de las dos → null (estado vacío).
 */
export function resolveSummarySource(
  session: TodaySession | null,
  presencial: TodayPresencial | null,
): SummarySource | null {
  if (session) {
    return {
      presencial: false,
      branchName: null,
      blocksCompleted: session.blocksCompleted,
      durationMinutes: session.durationMinutes,
      rpe: session.rpe,
      notes: session.notes,
    }
  }
  if (!presencial) return null
  return {
    presencial: true,
    branchName: presencial.branchName,
    blocksCompleted: presencial.blocksCompleted,
    durationMinutes: null,
    rpe: null,
    notes: null,
  }
}
