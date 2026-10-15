import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import type { PromptDestination } from 'src/stores/useAvisosStore'

const log = createLogger('useNovedadesStore')

/**
 * Una novedad del feed de Mi Templo (`GET /communications/me/novedades`).
 * `destination` tiene el MISMO shape que el de los avisos (el server ya
 * resuelve `route` y `whatsappText`), así `navigateToAvisoDestination` lo
 * recibe tal cual.
 */
export interface Novedad {
  id: number
  text: string
  /** `null` si la novedad es global; si no, el nombre de la sede del socio (D-6). */
  branchLabel: string | null
  /** ISO 8601 (UTC). El "hace N días" se calcula en la app (D-7). */
  publishedAt: string
  /** `null` = solo informa (sin chevron ni tap). */
  destination: PromptDestination | null
  /** `true` si el socio ya la vio: apaga el "NUEVO" (D-5). */
  seen: boolean
}

interface NovedadesResponse {
  novedades: Novedad[]
}

type NovedadEventType = 'seen' | 'clicked'

/**
 * Novedades de Mi Templo (spec "Novedades en Mi Templo", D-10/D-12).
 *
 * - `load()` es fail-open (D-12): ante cualquier error deja la lista vacía y
 *   loguea; la UI nunca recibe una excepción, simplemente no muestra la sección.
 * - `markSeen()` deduplica por sesión con un `Set` (D-10: una vista por
 *   novedad por sesión de app) y es optimista: marca `seen = true` local sin
 *   esperar al server. Si el POST falla, se saca del `Set` para reintentar la
 *   próxima vez que la novedad esté en pantalla.
 * - `reset()` al desloguear (MainLayout, junto a `useAvisosStore.reset()`).
 */
export const useNovedadesStore = defineStore('novedades', () => {
  const novedades = ref<Novedad[]>([])
  const loading = ref(false)
  /** Ids ya reportados como vistos en esta sesión (dedupe de `markSeen`). */
  const reportedSeen = new Set<number>()

  async function load(): Promise<void> {
    loading.value = true
    try {
      const { data } = await api.get<NovedadesResponse>('/communications/me/novedades')
      novedades.value = Array.isArray(data?.novedades) ? data.novedades : []
    } catch (err: unknown) {
      novedades.value = []
      log.warn('Failed to load novedades', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
    }
  }

  function setSeenLocal(id: number): void {
    const item = novedades.value.find((n) => n.id === id)
    if (item) item.seen = true
  }

  async function reportEvent(id: number, type: NovedadEventType): Promise<boolean> {
    try {
      await api.post(`/communications/me/novedades/${id}/event`, { type })
      return true
    } catch (err: unknown) {
      log.warn('Failed to report novedad event', {
        novedadId: id,
        type,
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  /** La novedad estuvo en pantalla (D-10). Una sola vez por novedad por sesión. */
  async function markSeen(id: number): Promise<void> {
    if (reportedSeen.has(id)) return
    reportedSeen.add(id)
    setSeenLocal(id)
    const ok = await reportEvent(id, 'seen')
    if (!ok) reportedSeen.delete(id)
  }

  /** El socio tocó una novedad con destino (D-10). El server también crea la vista si faltaba. */
  async function markClicked(id: number): Promise<void> {
    reportedSeen.add(id)
    setSeenLocal(id)
    await reportEvent(id, 'clicked')
  }

  /** Al desloguear: la próxima sesión (otro socio, quizá otra sede) arranca de cero. */
  function reset(): void {
    novedades.value = []
    loading.value = false
    reportedSeen.clear()
  }

  return { novedades, loading, load, markSeen, markClicked, reset }
})
