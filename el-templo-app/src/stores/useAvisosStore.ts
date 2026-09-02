import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'

const log = createLogger('useAvisosStore')

export type PromptDestinationType = 'app_section' | 'whatsapp_sales'

export interface PromptDestination {
  type: PromptDestinationType
  section: string | null
  route: string
  whatsappText: string | null
}

export interface PromptAviso {
  id: number
  title: string
  body: string
  buttonText: string
  destination: PromptDestination
  whatsappNumber?: string | null
}

/** La clase pendiente de puntuar (D-A3): sin identidad del profe. */
export interface PendingRatingPrompt {
  sessionDate: string
  branchId: number
  scheduleId: number
  activityName: string
  dayOfWeek: number
}

/** Unión discriminada por `kind` — a lo sumo UN pop-up por apertura (D-06/D-07). */
export type PromptResult =
  | { kind: 'plan_expiry'; aviso: PromptAviso; daysRemaining: number }
  | { kind: 'aviso'; aviso: PromptAviso }
  | { kind: 'rating'; aviso: PromptAviso; pending: PendingRatingPrompt }
  | { kind: 'improvement'; aviso: PromptAviso }
  | null

interface PromptResponse {
  prompt: PromptResult
}

type AvisoEventType = 'shown' | 'dismissed' | 'clicked'

/**
 * Fase 193 (D-06/D-07/D-11): store del pop-up por apertura. La app deja de
 * arbitrar — `evaluate()` pide a `GET /communications/me/prompt` el ÚNICO
 * aviso que corresponde mostrar hoy (ya arbitrado server-side por prioridad,
 * frecuencia, alcance y vigencia) y los 4 diálogos globales de `MainLayout`
 * se alimentan de acá vía los getters `isPlanExpiry`/`isAviso`/`isRating`/
 * `isImprovement`. Un fallo de red nunca puede romper la pantalla: se traga
 * y se loguea, sin pop-up para esta apertura.
 */
export const useAvisosStore = defineStore('avisos', () => {
  const prompt = ref<PromptResult>(null)
  const evaluated = ref(false)
  const loading = ref(false)

  const isPlanExpiry = computed(() => prompt.value?.kind === 'plan_expiry')
  const isAviso = computed(() => prompt.value?.kind === 'aviso')
  const isRating = computed(() => prompt.value?.kind === 'rating')
  const isImprovement = computed(() => prompt.value?.kind === 'improvement')

  /**
   * Pide el pop-up que toca hoy. Solo llama al endpoint UNA vez por apertura
   * (marca `evaluated` de forma síncrona antes del primer `await`, así
   * llamadas concurrentes/repetidas dentro de la misma apertura no duplican
   * el fetch). Si vino un aviso, reporta `shown` de inmediato (L3: la
   * frecuencia `once`/`every_n_days` depende de que ese evento quede
   * registrado apenas se muestra, no al cerrarlo).
   */
  async function evaluate(): Promise<void> {
    if (evaluated.value) return
    evaluated.value = true
    loading.value = true
    try {
      const { data } = await api.get<PromptResponse>('/communications/me/prompt')
      prompt.value = data.prompt
      if (prompt.value) {
        await reportEvent(prompt.value.aviso.id, 'shown')
      }
    } catch (err: unknown) {
      prompt.value = null
      log.error('Failed to evaluate prompt', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
    }
  }

  async function reportEvent(avisoId: number, type: AvisoEventType): Promise<void> {
    try {
      await api.post(`/communications/me/avisos/${avisoId}/event`, { type })
    } catch (err: unknown) {
      log.error('Failed to report aviso event', {
        avisoId,
        type,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  function reportDismissed(avisoId: number): Promise<void> {
    return reportEvent(avisoId, 'dismissed')
  }

  function reportClicked(avisoId: number): Promise<void> {
    return reportEvent(avisoId, 'clicked')
  }

  /** Al desloguear: limpia todo para que la próxima sesión evalúe de cero. */
  function reset(): void {
    prompt.value = null
    evaluated.value = false
    loading.value = false
  }

  return {
    prompt,
    evaluated,
    loading,
    isPlanExpiry,
    isAviso,
    isRating,
    isImprovement,
    evaluate,
    reportDismissed,
    reportClicked,
    reset,
  }
})
