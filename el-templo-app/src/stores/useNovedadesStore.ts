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
 *
 * Novedades es SOLO la tabla `novedades` (los pop-ups de Comunicaciones no se
 * espejan acá). `key` (`novedad:<id>`) es la identidad para dedupe, `:key` del
 * v-for y "NUEVO" de la card.
 */
export interface Novedad {
  /** Identidad única del feed: `novedad:${id}` (la calcula el server). */
  key: string
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

/** Lo que llega del server: `key` puede faltar con una API vieja. */
type NovedadFromServer = Omit<Novedad, 'key'> & {
  key?: unknown
}

interface NovedadesResponse {
  novedades: NovedadFromServer[]
}

/** Normaliza un ítem del server: con API vieja (sin `key`) cae a `novedad:<id>`. */
function normalize(item: NovedadFromServer): Novedad {
  const key = typeof item.key === 'string' ? item.key : `novedad:${item.id}`
  return { ...item, key }
}

type NovedadEventType = 'seen' | 'clicked'

/**
 * Novedades de Mi Templo (spec "Novedades en Mi Templo", D-10/D-12).
 *
 * - `load()` es fail-open (D-12): ante cualquier error deja la lista vacía y
 *   loguea; la UI nunca recibe una excepción, simplemente no muestra la sección.
 * - `markSeen()` deduplica por sesión con un `Set` de `key` (D-10: una vista
 *   por ítem por sesión de app) y es optimista: marca `seen = true` local sin
 *   esperar al server. Si el POST falla, se saca del `Set` para reintentar la
 *   próxima vez que la novedad esté en pantalla.
 * - `reset()` al desloguear (MainLayout, junto a `useAvisosStore.reset()`).
 */
export const useNovedadesStore = defineStore('novedades', () => {
  const novedades = ref<Novedad[]>([])
  const loading = ref(false)
  /** Keys (`novedad:<id>`) ya vistas en esta sesión (dedupe de `markSeen`). */
  const reportedSeen = new Set<string>()
  /**
   * Se incrementa en cada `load()` y en `reset()`. Una respuesta que vuelve
   * cuando ya cambió (logout a mitad de request, o un `load()` más nuevo) se
   * descarta: nunca repoblar con el feed del socio anterior.
   */
  let generation = 0

  async function load(): Promise<void> {
    const mine = ++generation
    loading.value = true
    try {
      const { data } = await api.get<NovedadesResponse>('/communications/me/novedades')
      if (mine !== generation) return
      novedades.value = Array.isArray(data?.novedades) ? data.novedades.map(normalize) : []
    } catch (err: unknown) {
      if (mine !== generation) return
      novedades.value = []
      log.warn('Failed to load novedades', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  function setSeenLocal(key: string): void {
    const item = novedades.value.find((n) => n.key === key)
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

  /** El ítem estuvo en pantalla (D-10). Una sola vez por ítem por sesión. */
  async function markSeen(item: Novedad): Promise<void> {
    if (reportedSeen.has(item.key)) return
    reportedSeen.add(item.key)
    setSeenLocal(item.key)
    const ok = await reportEvent(item.id, 'seen')
    if (!ok) reportedSeen.delete(item.key)
  }

  /** El socio tocó un ítem con destino (D-10). El server también crea la vista si faltaba. */
  async function markClicked(item: Novedad): Promise<void> {
    reportedSeen.add(item.key)
    setSeenLocal(item.key)
    await reportEvent(item.id, 'clicked')
  }

  /** Al desloguear: la próxima sesión (otro socio, quizá otra sede) arranca de cero. */
  function reset(): void {
    generation++
    novedades.value = []
    loading.value = false
    reportedSeen.clear()
  }

  return { novedades, loading, load, markSeen, markClicked, reset }
})
